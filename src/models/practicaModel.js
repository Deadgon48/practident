import pool from '../config/database.js';

export const Practica = {
    // Obtener prácticas por practicante
    obtenerPorPracticante: async (practicanteId) => {
        try {
            const [rows] = await pool.query(`
                SELECT 
                    p.*,
                    tp.nombre as tipo_practica,
                    m.nombre as materia_nombre,
                    m.codigo as materia_codigo,
                    tp.duracion_estimada,
                    CONCAT(u.nombre, ' ', u.apellido) as supervisor_nombre,
                    e.nombre as estado_nombre,
                    e.color as estado_color
                FROM practicas p
                JOIN tipos_practica tp ON p.tipo_practica_id = tp.id
                JOIN materias m ON tp.materia_id = m.id
                JOIN maestros ma ON p.maestro_id = ma.id
                JOIN usuarios u ON ma.usuario_id = u.id
                JOIN estados e ON p.estado_id = e.id
                JOIN practica_progreso pp ON p.id = pp.practica_id
                WHERE pp.practicante_id = ?
                ORDER BY p.fecha_asignacion DESC
            `, [practicanteId]);
            return rows;
        } catch (error) {
            console.error('Error al obtener prácticas:', error);
            throw error;
        }
    },

    // Crear nueva práctica
    crear: async (practicaData) => {
        const connection = await pool.getConnection();
        try {
            await connection.beginTransaction();

            // Generar código único
            const fecha = new Date();
            const codigoBase = `PR${fecha.getFullYear()}${(fecha.getMonth() + 1).toString().padStart(2, '0')}`;
            const [maxCodigo] = await connection.query(
                'SELECT MAX(codigo) as ultimo FROM practicas WHERE codigo LIKE ?',
                [`${codigoBase}%`]
            );
            const numSecuencia = maxCodigo[0].ultimo ? 
                parseInt(maxCodigo[0].ultimo.substring(8)) + 1 : 1;
            const codigo = `${codigoBase}${numSecuencia.toString().padStart(4, '0')}`;

            // Insertar práctica
            const [result] = await connection.query(
                `INSERT INTO practicas (
                    codigo,
                    tipo_practica_id,
                    grupo_id,
                    maestro_id,
                    estado_id,
                    fecha_asignacion,
                    fecha_limite,
                    descripcion
                ) VALUES (?, ?, ?, ?, 
                    (SELECT id FROM estados WHERE nombre = 'Pendiente'),
                    ?, ?, ?
                )`,
                [
                    codigo,
                    practicaData.tipo_practica_id,
                    practicaData.grupo_id,
                    practicaData.maestro_id,
                    practicaData.fecha_asignacion || new Date(),
                    practicaData.fecha_limite,
                    practicaData.descripcion
                ]
            );

            // Asignar práctica a todos los practicantes del grupo
            const [practicantes] = await connection.query(`
                SELECT pr.id 
                FROM practicantes pr
                JOIN grupo_practicante gp ON pr.id = gp.practicante_id
                WHERE gp.grupo_id = ?
            `, [practicaData.grupo_id]);

            for (const practicante of practicantes) {
                await connection.query(`
                    INSERT INTO practica_progreso (
                        practica_id,
                        practicante_id,
                        estado_id
                    ) VALUES (?, ?, 
                        (SELECT id FROM estados WHERE nombre = 'Pendiente')
                    )
                `, [result.insertId, practicante.id]);
            }

            await connection.commit();
            return { 
                success: true, 
                id: result.insertId,
                codigo: codigo 
            };
        } catch (error) {
            await connection.rollback();
            console.error('Error al crear práctica:', error);
            throw error;
        } finally {
            connection.release();
        }
    },

    // Obtener detalles de una práctica
    obtenerDetalle: async (practicaId) => {
        try {
            const [rows] = await pool.query(`
                SELECT 
                    p.*,
                    tp.nombre as tipo_practica,
                    tp.duracion_estimada,
                    m.nombre as materia_nombre,
                    m.codigo as materia_codigo,
                    CONCAT(u.nombre, ' ', u.apellido) as maestro_nombre,
                    g.nombre as grupo_nombre,
                    e.nombre as estado_nombre,
                    e.color as estado_color
                FROM practicas p
                JOIN tipos_practica tp ON p.tipo_practica_id = tp.id
                JOIN materias m ON tp.materia_id = m.id
                JOIN maestros ma ON p.maestro_id = ma.id
                JOIN usuarios u ON ma.usuario_id = u.id
                JOIN grupos g ON p.grupo_id = g.id
                JOIN estados e ON p.estado_id = e.id
                WHERE p.id = ?
            `, [practicaId]);

            if (rows.length === 0) return null;

            // Obtener progreso de los practicantes
            const [progreso] = await pool.query(`
                SELECT 
                    pp.*,
                    CONCAT(u.nombre, ' ', u.apellido) as practicante_nombre,
                    pr.matricula,
                    e.nombre as estado_nombre,
                    e.color as estado_color
                FROM practica_progreso pp
                JOIN practicantes pr ON pp.practicante_id = pr.id
                JOIN usuarios u ON pr.usuario_id = u.id
                JOIN estados e ON pp.estado_id = e.id
                WHERE pp.practica_id = ?
                ORDER BY u.nombre, u.apellido
            `, [practicaId]);

            return {
                ...rows[0],
                progreso
            };
        } catch (error) {
            console.error('Error al obtener detalle de práctica:', error);
            throw error;
        }
    },

    // Actualizar estado de una práctica
    actualizarEstado: async (practicaId, estadoId, notas = null) => {
        const connection = await pool.getConnection();
        try {
            await connection.beginTransaction();

            await connection.query(
                `UPDATE practicas 
                 SET estado_id = ?
                 WHERE id = ?`,
                [estadoId, practicaId]
            );

            if (notas) {
                await connection.query(
                    `UPDATE practica_progreso 
                     SET notas = ?
                     WHERE practica_id = ?`,
                    [notas, practicaId]
                );
            }

            await connection.commit();
            return { success: true };
        } catch (error) {
            await connection.rollback();
            console.error('Error al actualizar estado:', error);
            throw error;
        } finally {
            connection.release();
        }
    },

    // Calificar progreso de practicante
    calificarProgreso: async (progresoId, calificacion, retroalimentacion) => {
        const connection = await pool.getConnection();
        try {
            await connection.beginTransaction();

            await connection.query(
                `UPDATE practica_progreso 
                 SET calificacion = ?,
                     retroalimentacion = ?,
                     estado_id = (SELECT id FROM estados WHERE nombre = 'Completada')
                 WHERE id = ?`,
                [calificacion, retroalimentacion, progresoId]
            );

            await connection.commit();
            return { success: true };
        } catch (error) {
            await connection.rollback();
            console.error('Error al calificar progreso:', error);
            throw error;
        } finally {
            connection.release();
        }
    }
};