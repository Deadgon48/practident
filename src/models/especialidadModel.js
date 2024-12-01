import pool from '../config/database.js';

export const Especialidad = {
    // Obtener todas las especialidades activas
    obtenerTodas: async () => {
        try {
            const [rows] = await pool.query(`
                SELECT 
                    id,
                    nombre,
                    descripcion,
                    activo
                FROM especialidades
                WHERE activo = true
                ORDER BY nombre
            `);
            return rows;
        } catch (error) {
            console.error('Error al obtener especialidades:', error);
            throw error;
        }
    },

    // Obtener una especialidad específica
    obtenerPorId: async (id) => {
        try {
            const [rows] = await pool.query(`
                SELECT *
                FROM especialidades
                WHERE id = ? AND activo = true
            `, [id]);
            return rows[0];
        } catch (error) {
            console.error('Error al obtener especialidad:', error);
            throw error;
        }
    },

    // Obtener materias por especialidad
    obtenerMaterias: async (especialidadId) => {
        try {
            const [rows] = await pool.query(`
                SELECT 
                    m.id,
                    m.codigo,
                    m.nombre,
                    m.descripcion
                FROM materias m
                WHERE m.especialidad_id = ? 
                AND m.activo = true
                ORDER BY m.nombre
            `, [especialidadId]);
            return rows;
        } catch (error) {
            console.error('Error al obtener materias:', error);
            throw error;
        }
    },

    // Obtener maestros por especialidad
    obtenerMaestros: async (especialidadId) => {
        try {
            const [rows] = await pool.query(`
                SELECT 
                    m.id,
                    m.cedula_profesional,
                    u.nombre,
                    u.apellido,
                    u.email
                FROM maestros m
                JOIN usuarios u ON m.usuario_id = u.id
                WHERE m.especialidad_id = ?
                AND u.activo = true
                ORDER BY u.nombre, u.apellido
            `, [especialidadId]);
            return rows;
        } catch (error) {
            console.error('Error al obtener maestros:', error);
            throw error;
        }
    },

    // Obtener tipos de práctica por especialidad
    obtenerTiposPractica: async (especialidadId) => {
        try {
            const [rows] = await pool.query(`
                SELECT tp.*
                FROM tipos_practica tp
                JOIN materias m ON tp.materia_id = m.id
                WHERE m.especialidad_id = ? 
                AND tp.activo = true
                ORDER BY tp.nombre
            `, [especialidadId]);
            return rows;
        } catch (error) {
            console.error('Error al obtener tipos de práctica:', error);
            throw error;
        }
    },

    // Obtener estadísticas de la especialidad
    obtenerEstadisticas: async (especialidadId) => {
        try {
            const [stats] = await pool.query(`
                SELECT 
                    (SELECT COUNT(*) 
                     FROM maestros 
                     WHERE especialidad_id = ? AND usuario_id IN (
                         SELECT id FROM usuarios WHERE activo = true
                     )) as total_maestros,
                    
                    (SELECT COUNT(*) 
                     FROM materias 
                     WHERE especialidad_id = ? AND activo = true) as total_materias,
                    
                    (SELECT COUNT(DISTINCT p.id)
                     FROM practicas p
                     JOIN tipos_practica tp ON p.tipo_practica_id = tp.id
                     JOIN materias m ON tp.materia_id = m.id
                     WHERE m.especialidad_id = ?) as total_practicas,
                    
                    (SELECT COUNT(DISTINCT p.id)
                     FROM practicas p
                     JOIN tipos_practica tp ON p.tipo_practica_id = tp.id
                     JOIN materias m ON tp.materia_id = m.id
                     JOIN estados e ON p.estado_id = e.id
                     WHERE m.especialidad_id = ? 
                     AND e.nombre = 'Completada') as practicas_completadas,
                    
                    (SELECT ROUND(AVG(c.calificacion), 2)
                     FROM citas c
                     JOIN practica_progreso pp ON c.practica_progreso_id = pp.id
                     JOIN practicas p ON pp.practica_id = p.id
                     JOIN tipos_practica tp ON p.tipo_practica_id = tp.id
                     JOIN materias m ON tp.materia_id = m.id
                     WHERE m.especialidad_id = ?
                     AND c.calificacion IS NOT NULL) as promedio_calificacion
            `, [especialidadId, especialidadId, especialidadId, especialidadId, especialidadId]);

            return stats[0];
        } catch (error) {
            console.error('Error al obtener estadísticas:', error);
            throw error;
        }
    },

    // Verificar actividad en la especialidad
    verificarActividad: async (id) => {
        try {
            const [rows] = await pool.query(`
                SELECT 
                    (SELECT COUNT(DISTINCT p.id)
                     FROM practicas p
                     JOIN tipos_practica tp ON p.tipo_practica_id = tp.id
                     JOIN materias m ON tp.materia_id = m.id
                     JOIN estados e ON p.estado_id = e.id
                     WHERE m.especialidad_id = ? 
                     AND e.nombre = 'Pendiente') as practicas_pendientes,
                    
                    (SELECT COUNT(*) 
                     FROM maestros 
                     WHERE especialidad_id = ? 
                     AND usuario_id IN (
                         SELECT id FROM usuarios WHERE activo = true
                     )) as maestros_activos
            `, [id, id]);

            return {
                tienePracticasPendientes: rows[0].practicas_pendientes > 0,
                tieneMaestrosActivos: rows[0].maestros_activos > 0
            };
        } catch (error) {
            console.error('Error al verificar actividad:', error);
            throw error;
        }
    }
};