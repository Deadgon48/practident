import pool from '../config/database.js';

export const Cita = {
    // Crear nueva cita
    crear: async (citaData) => {
        const connection = await pool.getConnection();
        try {
            await connection.beginTransaction();

            // Verificar disponibilidad del practicante
            const disponible = await Cita.verificarDisponibilidad(
                citaData.practicante_id,
                citaData.fecha_hora
            );

            if (!disponible) {
                throw new Error('No hay disponibilidad para la fecha y hora seleccionada');
            }

            // Verificar o crear practica_progreso
            const [practicaProgresoResult] = await connection.query(`
                INSERT INTO practica_progreso (
                    practica_id,
                    practicante_id,
                    estado_id
                ) VALUES (?, ?, 
                    (SELECT id FROM estados WHERE nombre = 'En Proceso')
                )
                ON DUPLICATE KEY UPDATE id = LAST_INSERT_ID(id)
            `, [citaData.practica_id, citaData.practicante_id]);

            const practicaProgresoId = practicaProgresoResult.insertId;

            // Generar código único para la cita
            const fecha = new Date();
            const codigoBase = `CT${fecha.getFullYear()}${(fecha.getMonth() + 1).toString().padStart(2, '0')}`;
            const [maxCodigo] = await connection.query(
                'SELECT MAX(codigo) as ultimo FROM citas WHERE codigo LIKE ?',
                [`${codigoBase}%`]
            );
            const numSecuencia = maxCodigo[0].ultimo ? 
                parseInt(maxCodigo[0].ultimo.substring(8)) + 1 : 1;
            const codigo = `${codigoBase}${numSecuencia.toString().padStart(4, '0')}`;

            // Insertar la cita
            const [result] = await connection.query(
                `INSERT INTO citas (
                    codigo,
                    practica_progreso_id,
                    paciente_id,
                    fecha_hora,
                    estado_id,
                    notas,
                    motivo
                ) VALUES (?, ?, ?, ?, 
                    (SELECT id FROM estados WHERE nombre = 'Pendiente'),
                    ?, ?
                )`,
                [
                    codigo,
                    practicaProgresoId,
                    citaData.paciente_id,
                    citaData.fecha_hora,
                    citaData.notas || null,
                    citaData.motivo || 'Cita programada'
                ]
            );

            await connection.commit();
            return { success: true, id: result.insertId, codigo };
        } catch (error) {
            await connection.rollback();
            console.error('Error al crear cita:', error);
            throw error;
        } finally {
            connection.release();
        }
    },

    // Verificar disponibilidad del practicante
    verificarDisponibilidad: async (practicanteId, fecha) => {
        try {
            const fechaInicio = new Date(fecha);
            fechaInicio.setHours(0, 0, 0, 0);
            
            const fechaFin = new Date(fecha);
            fechaFin.setHours(23, 59, 59, 999);

            const [rows] = await pool.query(`
                SELECT COUNT(*) as citas_existentes
                FROM citas c
                JOIN practica_progreso pp ON c.practica_progreso_id = pp.id
                WHERE pp.practicante_id = ?
                AND c.fecha_hora BETWEEN ? AND ?
                AND c.estado_id IN (
                    SELECT id FROM estados 
                    WHERE nombre IN ('Pendiente', 'En Proceso')
                )
            `, [practicanteId, fechaInicio, fechaFin]);

            return rows[0].citas_existentes < 8; // Máximo 8 citas por día
        } catch (error) {
            console.error('Error al verificar disponibilidad:', error);
            throw error;
        }
    },

    // Obtener citas del paciente
    obtenerCitasPaciente: async (pacienteId) => {
        try {
            const [citas] = await pool.query(`
                SELECT 
                    c.*,
                    CONCAT(u.nombre, ' ', u.apellido) as practicante_nombre,
                    tp.nombre as tipo_practica,
                    m.nombre as materia_nombre,
                    e.nombre as estado_nombre,
                    e.color as estado_color
                FROM citas c
                JOIN practica_progreso pp ON c.practica_progreso_id = pp.id
                JOIN practicas p ON pp.practica_id = p.id
                JOIN tipos_practica tp ON p.tipo_practica_id = tp.id
                JOIN materias m ON tp.materia_id = m.id
                JOIN practicantes pr ON pp.practicante_id = pr.id
                JOIN usuarios u ON pr.usuario_id = u.id
                JOIN estados e ON c.estado_id = e.id
                WHERE c.paciente_id = ?
                ORDER BY c.fecha_hora DESC
            `, [pacienteId]);

            const [resumen] = await pool.query(`
                SELECT 
                    COUNT(*) as total_citas,
                    SUM(CASE WHEN estado_id = (SELECT id FROM estados WHERE nombre = 'Completada') THEN 1 ELSE 0 END) as completadas,
                    SUM(CASE WHEN estado_id = (SELECT id FROM estados WHERE nombre = 'Pendiente') THEN 1 ELSE 0 END) as pendientes,
                    MIN(CASE 
                        WHEN fecha_hora > NOW() 
                        AND estado_id = (SELECT id FROM estados WHERE nombre = 'Pendiente') 
                        THEN fecha_hora 
                    END) as proxima_cita
                FROM citas 
                WHERE paciente_id = ?
            `, [pacienteId]);

            return {
                citas,
                resumen: resumen[0]
            };
        } catch (error) {
            console.error('Error al obtener citas:', error);
            throw error;
        }
    },

    // Obtener citas del practicante
    obtenerCitasPracticante: async (practicanteId) => {
        try {
            const [citas] = await pool.query(`
                SELECT 
                    c.*,
                    CONCAT(up.nombre, ' ', up.apellido) as paciente_nombre,
                    tp.nombre as tipo_practica,
                    m.nombre as materia_nombre,
                    e.nombre as estado_nombre,
                    e.color as estado_color
                FROM citas c
                JOIN practica_progreso pp ON c.practica_progreso_id = pp.id
                JOIN practicas p ON pp.practica_id = p.id
                JOIN tipos_practica tp ON p.tipo_practica_id = tp.id
                JOIN materias m ON tp.materia_id = m.id
                JOIN pacientes pa ON c.paciente_id = pa.id
                JOIN usuarios up ON pa.usuario_id = up.id
                JOIN estados e ON c.estado_id = e.id
                WHERE pp.practicante_id = ?
                ORDER BY c.fecha_hora DESC
            `, [practicanteId]);

            return citas;
        } catch (error) {
            console.error('Error al obtener citas:', error);
            throw error;
        }
    },

    // Completar cita
    completar: async (citaId, notas) => {
        const connection = await pool.getConnection();
        try {
            await connection.beginTransaction();

            // Actualizar estado de la cita
            await connection.query(`
                UPDATE citas 
                SET estado_id = (SELECT id FROM estados WHERE nombre = 'Completada'),
                    notas = COALESCE(?, notas)
                WHERE id = ?
            `, [notas, citaId]);

            await connection.commit();
            return { success: true };
        } catch (error) {
            await connection.rollback();
            console.error('Error al completar cita:', error);
            throw error;
        } finally {
            connection.release();
        }
    },

    // Cancelar cita
    cancelar: async (citaId, motivo) => {
        const connection = await pool.getConnection();
        try {
            await connection.beginTransaction();

            await connection.query(`
                UPDATE citas 
                SET estado_id = (SELECT id FROM estados WHERE nombre = 'Cancelada'),
                    motivo = ?
                WHERE id = ?
            `, [motivo, citaId]);

            await connection.commit();
            return { success: true };
        } catch (error) {
            await connection.rollback();
            console.error('Error al cancelar cita:', error);
            throw error;
        } finally {
            connection.release();
        }
    },

    // Calificar cita
    calificar: async (citaId, calificacion, comentario) => {
        const connection = await pool.getConnection();
        try {
            await connection.beginTransaction();

            await connection.query(`
                UPDATE citas 
                SET calificacion = ?,
                    comentario = ?
                WHERE id = ?
            `, [calificacion, comentario, citaId]);

            await connection.commit();
            return { success: true };
        } catch (error) {
            await connection.rollback();
            console.error('Error al calificar cita:', error);
            throw error;
        } finally {
            connection.release();
        }
    }
};