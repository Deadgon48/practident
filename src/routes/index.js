import { Router } from "express";
import { Usuario } from '../models/usuarioModel.js';
import { Practica } from '../models/practicaModel.js';
import { Cita } from '../models/citaModel.js';
import pool from '../config/database.js';

const router = Router();

// Middleware para procesar la sesión
router.use((req, res, next) => {
    if (req.session && req.session.userId) {
        res.locals.userId = req.session.userId;
        res.locals.user = req.session.user;
    }
    next();
});

// Check session status
router.get('/api/check-session', (req, res) => {
    if (req.session && req.session.userId) {
        res.json({
            success: true,
            isLoggedIn: true,
            user: req.session.user
        });
    } else {
        res.json({
            success: false,
            isLoggedIn: false
        });
    }
});

// Funciones auxiliares
async function getDatosFormularios() {
    try {
        const [especialidades] = await pool.query(`
            SELECT id, nombre 
            FROM especialidades 
            WHERE activo = true 
            ORDER BY nombre
        `);

        const [semestres] = await pool.query(`
            SELECT id, nombre 
            FROM semestres 
            WHERE activo = true 
            ORDER BY fecha_inicio
        `);

        const [grupos] = await pool.query(`
            SELECT id, nombre 
            FROM grupos 
            WHERE activo = true 
            ORDER BY nombre
        `);

        return {
            especialidades,
            semestres,
            grupos
        };
    } catch (error) {
        console.error('Error al obtener datos de formularios:', error);
        throw error;
    }
}

// Rutas de autenticación
router.get('/', (req, res) => {
    res.render('index', {
        title: 'Iniciar Sesión',
        error: null
    });
});

router.post('/login', async (req, res) => {
    try {
        const { usuario, contrasena } = req.body;
        
        if (!usuario || !contrasena) {
            return res.status(400).json({
                success: false,
                message: 'Usuario y contraseña son requeridos'
            });
        }

        const userData = await Usuario.login(usuario, contrasena);
        
        if (userData) {
            req.session.userId = userData.id;
            req.session.user = {
                id: userData.id,
                nombre: userData.nombre,
                apellido: userData.apellido,
                rol_id: userData.rol_id,
                rol_nombre: userData.rol_nombre
            };

            // Guardar la sesión de forma síncrona
            req.session.save((err) => {
                if (err) {
                    console.error('Error al guardar la sesión:', err);
                    return res.status(500).json({
                        success: false,
                        message: 'Error al iniciar sesión'
                    });
                }
                
                res.json({
                    success: true,
                    user: userData
                });
            });
        } else {
            res.status(401).json({
                success: false,
                message: 'Usuario o contraseña incorrectos'
            });
        }
    } catch (error) {
        console.error('Error en login:', error);
        res.status(500).json({
            success: false,
            message: 'Error al procesar el inicio de sesión'
        });
    }
});
// Rutas de registro
router.get('/R', async (req, res) => {
    try {
        const datos = await getDatosFormularios();
        res.render('R', {
            title: 'Registro',
            ...datos,
            error: null
        });
    } catch (error) {
        console.error('Error al cargar página de registro:', error);
        res.render('R', {
            title: 'Registro',
            especialidades: [],
            grupos: [],
            semestres: [],
            error: 'Error al cargar datos necesarios para el registro'
        });
    }
});
router.post('/register', async (req, res) => {
    try {
        // Verificar si el usuario ya existe
        const usuarioExiste = await Usuario.verificarUsuarioExistente(req.body.usuario);
        if (usuarioExiste) {
            return res.json({
                success: false,
                error: 'El nombre de usuario ya está en uso'
            });
        }

        const resultado = await Usuario.crear(req.body);
        if (resultado.success) {
            return res.json({ 
                success: true, 
                id: resultado.id,
                message: 'Usuario registrado exitosamente'
            });
        } else {
            return res.json({ 
                success: false, 
                error: resultado.error || 'Error al crear usuario' 
            });
        }
    } catch (error) {
        console.error('Error al registrar usuario:', error);
        return res.json({ 
            success: false, 
            error: error.message || 'Error en el registro' 
        });
    }
});

// Verificar estado de sesión
router.get('/checkSession', (req, res) => {
    if (req.session && req.session.userId) {
        res.json({
            success: true,
            isLoggedIn: true,
            user: req.session.user
        });
    } else {
        res.json({
            success: true,
            isLoggedIn: false
        });
    }
});

// Cerrar sesión
router.post('/logout', (req, res) => {
    if (req.session) {
        req.session.destroy(err => {
            if (err) {
                res.status(500).json({
                    success: false,
                    error: 'Error al cerrar sesión'
                });
            } else {
                res.json({
                    success: true,
                    message: 'Sesión cerrada correctamente'
                });
            }
        });
    } else {
        res.json({
            success: true,
            message: 'No hay sesión activa'
        });
    }
});

router.post('/deleteProfile', async (req, res) => {
    try {
        const { userId, rolId } = req.body;
        
        if (!userId || !rolId) {
            return res.json({
                success: false,
                error: 'Datos de usuario incompletos'
            });
        }

        const resultado = await Usuario.eliminar(userId, rolId);
        
        if (resultado.success) {
            // Destruir la sesión si existe
            if (req.session) {
                req.session.destroy();
            }
            
            return res.json({
                success: true,
                message: 'Usuario eliminado exitosamente'
            });
        } else {
            return res.json({
                success: false,
                error: 'No se pudo eliminar el usuario'
            });
        }
    } catch (error) {
        console.error('Error al eliminar usuario:', error);
        return res.json({
            success: false,
            error: error.message || 'Error al eliminar el usuario'
        });
    }
});

router.get('/S', async (req, res) => {
    try {
        // Obtener datos necesarios para la página de supervisión
        const datos = await getDatosFormularios();
        res.render('S', { 
            title: 'Supervisión',
            ...datos,
            error: null
        });
    } catch (error) {
        console.error('Error al cargar página de supervisión:', error);
        res.render('S', { 
            title: 'Supervisión',
            error: 'Error al cargar datos necesarios'
        });
    }
});

router.get('/getUserData/:id', async (req, res) => {
    try {
        const userId = req.params.id;
        const [userData] = await pool.query(`
            SELECT 
                u.*,
                m.especialidad_id,
                e.nombre as especialidad_nombre
            FROM usuarios u
            LEFT JOIN maestros m ON u.id = m.usuario_id
            LEFT JOIN especialidades e ON m.especialidad_id = e.id
            WHERE u.id = ?
        `, [userId]);

        if (!userData.length) {
            return res.status(404).json({
                success: false,
                error: 'Usuario no encontrado'
            });
        }

        // Obtener datos adicionales
        const datos = await getDatosFormularios();

        res.json({
            success: true,
            userData: userData[0],
            ...datos
        });
    } catch (error) {
        console.error('Error al obtener datos del usuario:', error);
        res.status(500).json({
            success: false,
            error: 'Error al obtener datos del usuario'
        });
    }
});

router.post('/updateProfile', async (req, res) => {
    try {
        const { userId, ...updateData } = req.body;
        
        if (!userId) {
            return res.status(400).json({
                success: false,
                error: 'ID de usuario requerido'
            });
        }

        // Verificar si el usuario existe
        const userExists = await Usuario.obtenerPorId(userId);
        if (!userExists) {
            return res.status(404).json({
                success: false,
                error: 'Usuario no encontrado'
            });
        }

        const resultado = await Usuario.actualizar(userId, updateData);
        
        if (resultado.success) {
            // Obtener datos actualizados
            const datosActualizados = await Usuario.obtenerDatosCompletos(userId);
            
            // Actualizar sesión si es necesario
            if (req.session && req.session.userId === userId) {
                req.session.user = {
                    ...req.session.user,
                    nombre: datosActualizados.nombre,
                    apellido: datosActualizados.apellido,
                    email: datosActualizados.email
                };
            }

            res.json({
                success: true,
                message: 'Datos actualizados correctamente',
                userData: datosActualizados
            });
        } else {
            throw new Error('Error al actualizar los datos');
        }
    } catch (error) {
        console.error('Error al actualizar perfil:', error);
        res.status(500).json({
            success: false,
            error: error.message || 'Error al actualizar el perfil'
        });
    }
});

// API - Materias
router.get('/api/materias', async (req, res) => {
    try {
        const [materias] = await pool.query(`
            SELECT DISTINCT m.id, m.codigo, m.nombre
            FROM materias m
            WHERE m.activo = true
            ORDER BY m.nombre
        `);
        
        res.json({
            success: true,
            materias
        });
    } catch (error) {
        console.error('Error:', error);
        res.status(500).json({
            success: false,
            error: 'Error al obtener materias'
        });
    }
});

router.get('/api/supervisores', async (req, res) => {
    try {
        const [supervisores] = await pool.query(`
            SELECT 
                m.id,
                CONCAT(u.nombre, ' ', u.apellido) as nombre_completo,
                e.nombre as especialidad
            FROM maestros m
            JOIN usuarios u ON m.usuario_id = u.id
            JOIN especialidades e ON m.especialidad_id = e.id
            WHERE u.activo = true
            ORDER BY u.nombre, u.apellido
        `);
        
        res.json({
            success: true,
            supervisores
        });
    } catch (error) {
        console.error('Error:', error);
        res.status(500).json({
            success: false,
            error: 'Error al obtener supervisores'
        });
    }
});

router.get('/api/grupos', async (req, res) => {
    try {
        const [grupos] = await pool.query(`
            SELECT g.id, g.nombre
            FROM grupos g
            WHERE g.activo = true 
            ORDER BY g.nombre
        `);
        
        res.json({
            success: true,
            grupos
        });
    } catch (error) {
        console.error('Error:', error);
        res.status(500).json({
            success: false,
            error: 'Error al obtener grupos'
        });
    }
});

router.get('/api/practicas/historial/:maestroId', async (req, res) => {
    try {
        const [practicas] = await pool.query(`
            SELECT 
                p.*,
                m.nombre as materia_nombre,
                tp.nombre as tipo_nombre,
                g.nombre as grupo_nombre,
                e.nombre as estado_nombre,
                e.color as estado_color
            FROM practicas p
            JOIN tipos_practica tp ON p.tipo_practica_id = tp.id
            JOIN materias m ON tp.materia_id = m.id
            JOIN grupos g ON p.grupo_id = g.id
            JOIN estados e ON p.estado_id = e.id
            WHERE p.maestro_id = (
                SELECT id FROM maestros WHERE usuario_id = ?
            )
            ORDER BY p.fecha_asignacion DESC
        `, [req.params.maestroId]);

        res.json({
            success: true,
            practicas
        });
    } catch (error) {
        console.error('Error:', error);
        res.status(500).json({
            success: false,
            error: 'Error al obtener historial de prácticas'
        });
    }
});

// API - Tipos de práctica
router.get('/api/materias/:materiaId/tipos-practica', async (req, res) => {
    try {
        const [tipos] = await pool.query(`
            SELECT tp.*
            FROM tipos_practica tp
            WHERE tp.materia_id = ? AND tp.activo = true
            ORDER BY tp.nombre
        `, [req.params.materiaId]);

        res.json({
            success: true,
            tipos
        });
    } catch (error) {
        console.error('Error:', error);
        res.status(500).json({
            success: false,
            error: 'Error al obtener tipos de práctica'
        });
    }
});

// API - Prácticas disponibles
router.get('/api/practicas/disponibles', async (req, res) => {
    try {
        console.log('Consultando prácticas disponibles');
        const [practicas] = await pool.query(`
            SELECT DISTINCT
                p.id,
                p.codigo,
                p.descripcion,
                p.fecha_limite,
                p.fecha_asignacion,
                m.nombre as materia_nombre,
                tp.nombre as tipo_nombre,
                tp.id as tipo_practica_id,
                g.nombre as grupo_nombre,
                g.id as grupo_id,
                e.nombre as estado_nombre,
                e.color as estado_color,
                CONCAT(u.nombre, ' ', u.apellido) as maestro_nombre
            FROM practicas p
            JOIN tipos_practica tp ON p.tipo_practica_id = tp.id
            JOIN materias m ON tp.materia_id = m.id
            JOIN grupos g ON p.grupo_id = g.id
            JOIN estados e ON p.estado_id = e.id
            JOIN maestros ma ON p.maestro_id = ma.id
            JOIN usuarios u ON ma.usuario_id = u.id
            JOIN practicantes pr ON pr.grupo_id = g.id
            JOIN usuarios u2 ON pr.usuario_id = u2.id
            LEFT JOIN practica_progreso pp ON p.id = pp.practica_id AND pp.practicante_id = pr.id
            WHERE e.nombre = 'Pendiente'
            AND p.fecha_limite >= CURDATE()
            AND u2.activo = true
            AND (pp.id IS NULL OR pp.estado_id != (SELECT id FROM estados WHERE nombre = 'Completada'))
            ORDER BY p.fecha_asignacion DESC
        `);

        console.log('Prácticas encontradas:', practicas.length);
        console.log('Datos de prácticas:', practicas); // Para debugging

        res.json({
            success: true,
            practicas
        });
    } catch (error) {
        console.error('Error al obtener prácticas disponibles:', error);
        res.status(500).json({
            success: false,
            error: 'Error al obtener prácticas disponibles'
        });
    }
});

router.use('/api/practicas', verifySession); 

router.get('/api/practicas/test', (req, res) => {
    res.json({
        success: true,
        message: 'API de prácticas funcionando correctamente'
    });
});

// API - Practicantes disponibles para una práctica
router.get('/api/practicas/:practicaId/practicantes', async (req, res) => {
    try {
        console.log('Buscando practicantes para práctica:', req.params.practicaId);
        
        const [practicantes] = await pool.query(`
            SELECT DISTINCT
                pr.id,
                pr.matricula,
                u.nombre,
                u.apellido,
                CONCAT(u.nombre, ' ', u.apellido) as nombre_completo
            FROM practicas p
            JOIN grupos g ON p.grupo_id = g.id
            JOIN practicantes pr ON pr.grupo_id = g.id
            JOIN usuarios u ON pr.usuario_id = u.id 
            WHERE p.id = ?
            AND u.activo = true
            AND NOT EXISTS (
                SELECT 1 
                FROM practica_progreso pp 
                WHERE pp.practica_id = p.id 
                AND pp.practicante_id = pr.id
            )
        `, [req.params.practicaId]);

        console.log('Practicantes encontrados:', practicantes);

        res.json({
            success: true,
            practicantes
        });
    } catch (error) {
        console.error('Error al obtener practicantes:', error);
        res.status(500).json({
            success: false,
            error: 'Error al obtener practicantes disponibles'
        });
    }
});

// API - Gestión de citas
router.post('/api/citas/crear', async (req, res) => {
    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();

        // Primero obtener el ID del paciente
        const [pacienteResult] = await connection.query(
            'SELECT id FROM pacientes WHERE usuario_id = ?',
            [req.body.usuario_id]
        );

        if (!pacienteResult.length) {
            throw new Error('Paciente no encontrado');
        }

        const paciente_id = pacienteResult[0].id;
        const {
            practica_id,
            practicante_id,
            fecha_hora,
            notas
        } = req.body;

        // Verificar disponibilidad
        const [existingCitas] = await connection.query(`
            SELECT COUNT(*) as count
            FROM citas c
            JOIN practica_progreso pp ON c.practica_progreso_id = pp.id
            WHERE pp.practicante_id = ?
            AND DATE(c.fecha_hora) = DATE(?)
            AND c.estado_id IN (SELECT id FROM estados WHERE nombre IN ('Pendiente', 'En Proceso'))
        `, [practicante_id, fecha_hora]);

        if (existingCitas[0].count >= 8) {
            throw new Error('El practicante ya tiene el máximo de citas para ese día');
        }

        // Obtener o crear practica_progreso
        let practica_progreso_id;
        const [existingProgreso] = await connection.query(`
            SELECT id 
            FROM practica_progreso 
            WHERE practica_id = ? AND practicante_id = ?
        `, [practica_id, practicante_id]);

        if (existingProgreso.length > 0) {
            practica_progreso_id = existingProgreso[0].id;
        } else {
            const [progresoResult] = await connection.query(`
                INSERT INTO practica_progreso (
                    practica_id, 
                    practicante_id, 
                    estado_id
                ) VALUES (?, ?, (SELECT id FROM estados WHERE nombre = 'En Proceso'))
            `, [practica_id, practicante_id]);
            practica_progreso_id = progresoResult.insertId;
        }

        // Generar código único para la cita
        const fecha = new Date(fecha_hora);
        const codigoBase = `CT${fecha.getFullYear()}${(fecha.getMonth() + 1).toString().padStart(2, '0')}`;
        const [maxCodigo] = await connection.query(
            'SELECT MAX(codigo) as ultimo FROM citas WHERE codigo LIKE ?',
            [`${codigoBase}%`]
        );
        const numSecuencia = maxCodigo[0].ultimo ?
            parseInt(maxCodigo[0].ultimo.substring(8)) + 1 : 1;
        const codigo = `${codigoBase}${numSecuencia.toString().padStart(4, '0')}`;

        // Insertar cita
        const [citaResult] = await connection.query(`
            INSERT INTO citas (
                codigo,
                practica_progreso_id,
                paciente_id,
                fecha_hora,
                estado_id,
                notas
            ) VALUES (?, ?, ?, ?, 
                (SELECT id FROM estados WHERE nombre = 'Pendiente'),
                ?
            )
        `, [codigo, practica_progreso_id, paciente_id, fecha_hora, notas]);

        // Actualizar estado de la práctica si es necesario
        await connection.query(`
            UPDATE practicas p
            SET p.estado_id = (SELECT id FROM estados WHERE nombre = 'En Proceso')
            WHERE p.id = ?
            AND p.estado_id = (SELECT id FROM estados WHERE nombre = 'Pendiente')
        `, [practica_id]);

        await connection.commit();

        res.json({
            success: true,
            citaId: citaResult.insertId,
            message: 'Cita creada exitosamente'
        });
    } catch (error) {
        await connection.rollback();
        console.error('Error al crear cita:', error);
        res.status(500).json({
            success: false,
            error: error.message || 'Error al crear la cita'
        });
    } finally {
        connection.release();
    }
});

// API - Obtener citas del paciente
router.get('/api/citas/paciente/:id', async (req, res) => {
    try {
        // Obtener datos básicos de las citas
        const [citas] = await pool.query(`
            SELECT 
                c.*,
                CONCAT(up.nombre, ' ', up.apellido) as practicante_nombre,
                tp.nombre as tipo_practica,
                m.nombre as materia_nombre,
                e.nombre as estado_nombre,
                e.color as estado_color
            FROM citas c
            JOIN practica_progreso pp ON c.practica_progreso_id = pp.id
            JOIN practicantes pr ON pp.practicante_id = pr.id
            JOIN usuarios up ON pr.usuario_id = up.id
            JOIN practicas p ON pp.practica_id = p.id
            JOIN tipos_practica tp ON p.tipo_practica_id = tp.id
            JOIN materias m ON tp.materia_id = m.id
            JOIN estados e ON c.estado_id = e.id
            WHERE c.paciente_id = (
                SELECT id FROM pacientes WHERE usuario_id = ?
            )
            ORDER BY c.fecha_hora DESC
        `, [req.params.id]);

        // Obtener resumen
        const [resumen] = await pool.query(`
            SELECT 
                COUNT(*) as total,
                SUM(CASE WHEN estado_id = (SELECT id FROM estados WHERE nombre = 'Completada') THEN 1 ELSE 0 END) as completadas,
                SUM(CASE WHEN estado_id = (SELECT id FROM estados WHERE nombre = 'Pendiente') THEN 1 ELSE 0 END) as pendientes,
                MIN(CASE 
                    WHEN fecha_hora > NOW() 
                    AND estado_id = (SELECT id FROM estados WHERE nombre = 'Pendiente') 
                    THEN fecha_hora 
                END) as proxima_cita
            FROM citas
            WHERE paciente_id = (
                SELECT id FROM pacientes WHERE usuario_id = ?
            )
        `, [req.params.id]);

        res.json({
            success: true,
            citas,
            resumen: resumen[0]
        });
    } catch (error) {
        console.error('Error al obtener citas:', error);
        res.status(500).json({
            success: false,
            error: 'Error al cargar las citas'
        });
    }
});

// API - Citas del practicante
router.get('/api/citas/practicante/:id', async (req, res) => {
    try {
        const [citas] = await pool.query(`
            SELECT 
                c.*,
                CONCAT(up.nombre, ' ', up.apellido) as paciente_nombre,
                tp.nombre as tipo_practica,
                m.nombre as materia_nombre,
                e.nombre as estado_nombre,
                e.color as estado_color,
                pr.matricula as practicante_matricula,
                p.codigo as practica_codigo,
                p.descripcion as practica_descripcion
            FROM citas c
            JOIN practica_progreso pp ON c.practica_progreso_id = pp.id
            JOIN practicas p ON pp.practica_id = p.id
            JOIN tipos_practica tp ON p.tipo_practica_id = tp.id
            JOIN materias m ON tp.materia_id = m.id
            JOIN pacientes pa ON c.paciente_id = pa.id
            JOIN usuarios up ON pa.usuario_id = up.id
            JOIN estados e ON c.estado_id = e.id
            JOIN practicantes pr ON pp.practicante_id = pr.id
            WHERE pr.usuario_id = ?
            ORDER BY c.fecha_hora DESC
        `, [req.params.id]);

        // Obtener resumen de citas
        const [resumen] = await pool.query(`
            SELECT 
                COUNT(*) as total,
                SUM(CASE WHEN c.estado_id = (SELECT id FROM estados WHERE nombre = 'Completada') THEN 1 ELSE 0 END) as completadas,
                SUM(CASE WHEN c.estado_id = (SELECT id FROM estados WHERE nombre = 'Pendiente') THEN 1 ELSE 0 END) as pendientes,
                MIN(CASE 
                    WHEN c.fecha_hora > NOW() 
                    AND c.estado_id = (SELECT id FROM estados WHERE nombre = 'Pendiente') 
                    THEN c.fecha_hora 
                END) as proxima_cita,
                ROUND(AVG(c.calificacion), 1) as satisfaccion_promedio
            FROM citas c
            JOIN practica_progreso pp ON c.practica_progreso_id = pp.id
            JOIN practicantes pr ON pp.practicante_id = pr.id
            WHERE pr.usuario_id = ?
        `, [req.params.id]);

        res.json({
            success: true,
            citas,
            resumen: resumen[0]
        });
    } catch (error) {
        console.error('Error al obtener citas:', error);
        res.status(500).json({
            success: false,
            error: 'Error al cargar las citas'
        });
    }
});

// API - Completar cita
router.post('/api/citas/:id/completar', async (req, res) => {
    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();

        const { notas } = req.body;
        const citaId = req.params.id;

        // Quitamos updated_at de la consulta
        await connection.query(`
            UPDATE citas 
            SET estado_id = (SELECT id FROM estados WHERE nombre = 'Completada'),
                notas = COALESCE(?, notas)
            WHERE id = ?
        `, [notas, citaId]);

        await connection.commit();
        res.json({
            success: true,
            message: 'Cita completada exitosamente'
        });
    } catch (error) {
        await connection.rollback();
        console.error('Error al completar cita:', error);
        res.status(500).json({
            success: false,
            error: error.message || 'Error al completar la cita'
        });
    } finally {
        connection.release();
    }
});


// API - Calificar cita
router.post('/api/citas/:id/calificar', async (req, res) => {
    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();

        const { calificacion, comentario } = req.body;
        const citaId = req.params.id;

        if (calificacion < 1 || calificacion > 5) {
            throw new Error('La calificación debe estar entre 1 y 5');
        }

        await connection.query(`
            UPDATE citas 
            SET calificacion = ?,
                comentario = ?,
                updated_at = NOW()
            WHERE id = ?
        `, [calificacion, comentario, citaId]);

        await connection.commit();
        res.json({
            success: true,
            message: 'Cita calificada exitosamente'
        });
    } catch (error) {
        await connection.rollback();
        console.error('Error al calificar cita:', error);
        res.status(500).json({
            success: false,
            error: 'Error al calificar la cita'
        });
    } finally {
        connection.release();
    }
});

// API - Cancelar cita
router.post('/api/citas/:id/cancelar', async (req, res) => {
    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();

        const { motivo } = req.body;
        const citaId = req.params.id;

        // Quitamos updated_at de la consulta
        await connection.query(`
            UPDATE citas 
            SET estado_id = (SELECT id FROM estados WHERE nombre = 'Cancelada'),
                motivo = ?
            WHERE id = ?
        `, [motivo, citaId]);

        await connection.commit();
        res.json({
            success: true,
            message: 'Cita cancelada exitosamente'
        });
    } catch (error) {
        await connection.rollback();
        console.error('Error al cancelar cita:', error);
        res.status(500).json({
            success: false,
            error: error.message || 'Error al cancelar la cita'
        });
    } finally {
        connection.release();
    }
});

// API - Prácticas
router.get('/api/practicas/maestro/:id', async (req, res) => {
    try {
        const [practicas] = await pool.query(`
            SELECT 
                p.*, 
                m.nombre as materia_nombre,
                m.codigo as materia_codigo,
                tp.nombre as tipo_nombre,
                g.nombre as grupo_nombre,
                e.nombre as estado_nombre,
                e.color as estado_color
            FROM practicas p
            JOIN tipos_practica tp ON p.tipo_practica_id = tp.id
            JOIN materias m ON tp.materia_id = m.id
            JOIN grupos g ON p.grupo_id = g.id
            JOIN estados e ON p.estado_id = e.id
            WHERE p.maestro_id = (
                SELECT id FROM maestros WHERE usuario_id = ?
            )
            ORDER BY p.fecha_asignacion DESC
        `, [req.params.id]);

        res.json({
            success: true,
            practicas
        });
    } catch (error) {
        console.error('Error:', error);
        res.status(500).json({
            success: false,
            error: 'Error al obtener prácticas'
        });
    }
});

// API - Prácticas por grupo
router.get('/api/practicas/grupo/:id', async (req, res) => {
    try {
        const [practicas] = await pool.query(`
            SELECT 
                p.*, 
                m.nombre as materia_nombre,
                m.codigo as materia_codigo,
                tp.nombre as tipo_nombre,
                CONCAT(u.nombre, ' ', u.apellido) as maestro_nombre,
                e.nombre as estado_nombre,
                e.color as estado_color
            FROM practicas p
            JOIN tipos_practica tp ON p.tipo_practica_id = tp.id
            JOIN materias m ON tp.materia_id = m.id
            JOIN maestros ma ON p.maestro_id = ma.id
            JOIN usuarios u ON ma.usuario_id = u.id
            JOIN estados e ON p.estado_id = e.id
            WHERE p.grupo_id = ?
            ORDER BY p.fecha_asignacion DESC
        `, [req.params.id]);

        res.json({
            success: true,
            practicas
        });
    } catch (error) {
        console.error('Error:', error);
        res.status(500).json({
            success: false,
            error: 'Error al obtener prácticas del grupo'
        });
    }
});

async function generarCodigoUnico(connection) {
    try {
        const fecha = new Date();
        const año = fecha.getFullYear();
        const mes = (fecha.getMonth() + 1).toString().padStart(2, '0');
        
        // Consulta el último código del mes actual
        const [maxCodigo] = await connection.query(`
            SELECT MAX(SUBSTRING(codigo, 9)) as ultimo 
            FROM practicas 
            WHERE codigo LIKE ?
        `, [`PR${año}${mes}%`]);

        let numSecuencia;
        if (maxCodigo[0].ultimo) {
            numSecuencia = parseInt(maxCodigo[0].ultimo) + 1;
        } else {
            numSecuencia = 1;
        }

        // Genera el nuevo código
        const nuevoCodigo = `PR${año}${mes}${numSecuencia.toString().padStart(4, '0')}`;

        // Verifica que el código no exista
        const [existente] = await connection.query(
            'SELECT id FROM practicas WHERE codigo = ?',
            [nuevoCodigo]
        );

        // Si existe, recursivamente genera otro código
        if (existente.length > 0) {
            return generarCodigoUnico(connection);
        }

        return nuevoCodigo;
    } catch (error) {
        console.error('Error generando código:', error);
        throw error;
    }
}

// API - Asignar práctica
router.post('/api/practicas/asignar', async (req, res) => {
    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();

        // Genera un código único para la práctica
        const codigo = await generarCodigoUnico(connection);

        const {
            tipo_practica_id,
            grupo_id,
            maestro_id,
            fecha_asignacion,
            fecha_limite,
            descripcion
        } = req.body;

        // Inserta la práctica con el código generado
        const [result] = await connection.query(`
            INSERT INTO practicas (
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
            )
        `, [
            codigo,
            tipo_practica_id,
            grupo_id,
            maestro_id,
            fecha_asignacion,
            fecha_limite,
            descripcion
        ]);

        // Obtiene los detalles de la práctica creada
        const [practica] = await connection.query(`
            SELECT 
                p.*,
                m.nombre as materia_nombre,
                tp.nombre as tipo_nombre,
                g.nombre as grupo_nombre,
                CONCAT(u.nombre, ' ', u.apellido) as maestro_nombre
            FROM practicas p
            JOIN tipos_practica tp ON p.tipo_practica_id = tp.id
            JOIN materias m ON tp.materia_id = m.id
            JOIN grupos g ON p.grupo_id = g.id
            JOIN maestros ma ON p.maestro_id = ma.id
            JOIN usuarios u ON ma.usuario_id = u.id
            WHERE p.id = ?
        `, [result.insertId]);

        await connection.commit();
        res.json({
            success: true,
            practica: practica[0]
        });
    } catch (error) {
        await connection.rollback();
        console.error('Error al asignar práctica:', error);
        res.status(500).json({
            success: false,
            error: error.message || 'Error al asignar práctica'
        });
    } finally {
        connection.release();
    }
});

router.get('/api/practicas/practicante/:id', async (req, res) => {
    try {
        // Primero obtener el ID y grupo del practicante
        const [practicante] = await pool.query(`
            SELECT pr.id, pr.grupo_id 
            FROM practicantes pr 
            WHERE pr.usuario_id = ?
        `, [req.params.id]);

        if (!practicante.length) {
            return res.status(404).json({
                success: false,
                error: 'Practicante no encontrado'
            });
        }

        // Obtener las prácticas asignadas al grupo del practicante
        const [practicas] = await pool.query(`
            SELECT 
                p.*,
                m.nombre as materia_nombre,
                m.codigo as materia_codigo,
                tp.nombre as tipo_nombre,
                tp.duracion_estimada,
                g.nombre as grupo_nombre,
                CONCAT(u.nombre, ' ', u.apellido) as supervisor_nombre,
                e.nombre as estado_nombre,
                e.color as estado_color,
                COALESCE(pp.calificacion, 0) as calificacion,
                pp.retroalimentacion
            FROM practicas p
            JOIN tipos_practica tp ON p.tipo_practica_id = tp.id
            JOIN materias m ON tp.materia_id = m.id
            JOIN grupos g ON p.grupo_id = g.id
            JOIN maestros ma ON p.maestro_id = ma.id
            JOIN usuarios u ON ma.usuario_id = u.id
            JOIN estados e ON p.estado_id = e.id
            LEFT JOIN practica_progreso pp ON p.id = pp.practica_id 
                AND pp.practicante_id = ?
            WHERE p.grupo_id = ?
            ORDER BY p.fecha_asignacion DESC
        `, [practicante[0].id, practicante[0].grupo_id]);

        // Obtener resumen
        const [resumenPracticas] = await pool.query(`
            SELECT 
                COUNT(p.id) as total,
                SUM(CASE WHEN e.nombre = 'Completada' THEN 1 ELSE 0 END) as completadas,
                ROUND(AVG(NULLIF(pp.calificacion, 0)), 2) as promedio
            FROM practicas p
            JOIN estados e ON p.estado_id = e.id
            LEFT JOIN practica_progreso pp ON p.id = pp.practica_id 
                AND pp.practicante_id = ?
            WHERE p.grupo_id = ?
        `, [practicante[0].id, practicante[0].grupo_id]);

        // Obtener satisfacción de pacientes
        const [satisfaccion] = await pool.query(`
            SELECT ROUND(AVG(NULLIF(c.calificacion, 0)), 2) as satisfaccion_pacientes
            FROM citas c
            JOIN practica_progreso pp ON c.practica_progreso_id = pp.id
            WHERE pp.practicante_id = ?
            AND c.calificacion IS NOT NULL
        `, [practicante[0].id]);

        const resumen = {
            ...resumenPracticas[0],
            satisfaccion_pacientes: satisfaccion[0].satisfaccion_pacientes || 0
        };

        console.log('Prácticas encontradas:', practicas.length);

        res.json({
            success: true,
            practicas,
            resumen
        });
    } catch (error) {
        console.error('Error al obtener prácticas del practicante:', error);
        res.status(500).json({
            success: false,
            error: 'Error al obtener prácticas'
        });
    }
});

router.get('/api/practicantes/:id/info', async (req, res) => {
    try {
        const [practicante] = await pool.query(`
            SELECT 
                pr.*,
                g.nombre as grupo_nombre,
                s.nombre as semestre_nombre
            FROM practicantes pr
            JOIN grupos g ON pr.grupo_id = g.id
            JOIN semestres s ON g.semestre_id = s.id
            WHERE pr.usuario_id = ?
        `, [req.params.id]);

        if (!practicante.length) {
            return res.status(404).json({
                success: false,
                error: 'Practicante no encontrado'
            });
        }

        res.json({
            success: true,
            ...practicante[0]
        });
    } catch (error) {
        console.error('Error al obtener información del practicante:', error);
        res.status(500).json({
            success: false,
            error: 'Error al obtener información'
        });
    }
});

router.get('/api/tipos-practica', async (req, res) => {
    try {
        const [tipos] = await pool.query(`
            SELECT DISTINCT tp.id, tp.nombre
            FROM tipos_practica tp
            JOIN practicas p ON tp.id = p.tipo_practica_id
            JOIN practica_progreso pp ON p.id = pp.practica_id
            WHERE pp.practicante_id = (
                SELECT id FROM practicantes WHERE usuario_id = ?
            )
            ORDER BY tp.nombre
        `, [req.session.userId]);

        res.json({
            success: true,
            tipos
        });
    } catch (error) {
        console.error('Error:', error);
        res.status(500).json({
            success: false,
            error: 'Error al obtener tipos de práctica'
        });
    }
});

// Rutas de navegación básicas con verificación de sesión
router.get('/P', verifySession, (req, res) => res.render('P', { title: 'Perfil' }));
router.get('/MD', verifySession, async (req, res) => {
    try {
        const datos = await getDatosFormularios();
        res.render('MD', { title: 'Modificar Datos', ...datos });
    } catch (error) {
        res.render('MD', {
            title: 'Modificar Datos',
            error: 'Error al cargar datos necesarios'
        });
    }
});
router.get('/EP', verifySession, (req, res) => res.render('EP', { title: 'Eliminar Perfil' }));
router.get('/AP', verifyRolMaestro, (req, res) => res.render('AP', { title: 'Asignar Práctica' }));
router.get('/CPAC', verifyRolPaciente, (req, res) => res.render('CPAC', { title: 'Citas Paciente' }));
router.get('/CPRA', verifyRolPracticante, (req, res) => res.render('CPRA', { title: 'Citas Practicante' }));
router.get('/PP', verifyRolPracticante, (req, res) => res.render('PP', { title: 'Prácticas' }));

// Middleware de verificación de sesión y roles
function verifySession(req, res, next) {
    // Evitar verificación en rutas públicas
    if (req.path === '/' || req.path === '/login' || req.path === '/register') {
        return next();
    }

    if (!req.session || !req.session.userId) {
        if (req.xhr || req.headers.accept?.indexOf('json') > -1) {
            return res.status(401).json({
                success: false,
                error: 'Sesión no válida'
            });
        }
        return res.redirect('/?error=session');
    }
    next();
}
function verifyRolMaestro(req, res, next) {
    if (req.session?.user?.rol_id !== 1) { // Cambiado el operador de comparación
        if (req.xhr || req.headers.accept?.indexOf('json') > -1) {
            return res.status(403).json({
                success: false,
                error: 'Acceso no autorizado'
            });
        }
        return res.redirect('/?error=unauthorized');
    }
    next();
}

function verifyRolPracticante(req, res, next) {
    if (req.session?.user?.rol_id !== 2) { // Cambiado el operador de comparación
        if (req.xhr || req.headers.accept?.indexOf('json') > -1) {
            return res.status(403).json({
                success: false,
                error: 'Acceso no autorizado'
            });
        }
        return res.redirect('/?error=unauthorized');
    }
    next();
}

function verifyRolPaciente(req, res, next) {
    if (req.session?.user?.rol_id !== 3) { // Cambiado el operador de comparación
        if (req.xhr || req.headers.accept?.indexOf('json') > -1) {
            return res.status(403).json({
                success: false,
                error: 'Acceso no autorizado'
            });
        }
        return res.redirect('/?error=unauthorized');
    }
    next();
}

export default router;