import pool from '../config/database.js';

export const Usuario = {
    // Verificar si existe un usuario
    verificarUsuarioExistente: async (usuario) => {
        try {
            const [rows] = await pool.query(
                'SELECT COUNT(*) as count FROM usuarios WHERE usuario = ?',
                [usuario]
            );
            return rows[0].count > 0;
        } catch (error) {
            console.error('Error al verificar usuario:', error);
            throw error;
        }
    },

    // Login de usuario
    login: async (usuario, contrasena) => {
        try {
            const [rows] = await pool.query(`
                SELECT 
                    u.id,
                    u.nombre,
                    u.apellido,
                    u.usuario,
                    u.email,
                    u.rol_id,
                    r.nombre as rol_nombre
                FROM usuarios u 
                JOIN roles r ON u.rol_id = r.id 
                WHERE u.usuario = ? AND u.contrasena = ? AND u.activo = true`,
                [usuario, contrasena]
            );

            if (rows.length > 0) {
                await pool.query(
                    'UPDATE usuarios SET ultima_sesion = NOW() WHERE id = ?',
                    [rows[0].id]
                );
                return rows[0];
            }
            return null;
        } catch (error) {
            console.error('Error en login:', error);
            throw error;
        }
    },

    // Crear nuevo usuario
    crear: async (userData) => {
        const connection = await pool.getConnection();
        try {
            await connection.beginTransaction();

            // Verificar si el usuario ya existe
            const [existingUser] = await connection.query(
                'SELECT id FROM usuarios WHERE usuario = ?',
                [userData.usuario]
            );

            if (existingUser.length > 0) {
                throw new Error('El nombre de usuario ya está en uso');
            }

            // Insertar usuario base
            const [userResult] = await connection.query(
                `INSERT INTO usuarios (
                    nombre, apellido, sexo, fecha_nacimiento, telefono,
                    email, usuario, contrasena, rol_id, activo
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, true)`,
                [
                    userData.nombre,
                    userData.apellido,
                    userData.sexo,
                    userData.fecha_nacimiento,
                    userData.telefono,
                    userData.email,
                    userData.usuario,
                    userData.contrasena,
                    userData.rol_id
                ]
            );

            const userId = userResult.insertId;

            // Insertar datos específicos según rol
            switch (parseInt(userData.rol_id)) {
                case 1: // Maestro
                    // Verificar si ya existe un maestro con la cédula profesional
                    const [existingMaestro] = await connection.query(
                        'SELECT id FROM maestros WHERE cedula_profesional = ?',
                        [userData.cedula_profesional]
                    );

                    if (existingMaestro.length > 0) {
                        throw new Error('La cédula profesional ya está registrada');
                    }

                    await connection.query(
                        `INSERT INTO maestros (
                            usuario_id,
                            cedula_profesional,
                            especialidad_id
                        ) VALUES (?, ?, ?)`,
                        [userId, userData.cedula_profesional, userData.especialidad_id]
                    );
                    break;

                case 2: // Practicante
                    // Verificar si ya existe un practicante con la matrícula
                    const [existingPracticante] = await connection.query(
                        'SELECT id FROM practicantes WHERE matricula = ?',
                        [userData.matricula]
                    );

                    if (existingPracticante.length > 0) {
                        throw new Error('La matrícula ya está registrada');
                    }

                    await connection.query(
                        `INSERT INTO practicantes (
                            usuario_id,
                            matricula,
                            semestre_actual,
                            grupo_id
                        ) VALUES (?, ?, ?, ?)`,
                        [userId, userData.matricula, userData.semestre_actual, userData.grupo_id]
                    );
                    break;

                case 3: // Paciente
                    await connection.query(
                        `INSERT INTO pacientes (
                            usuario_id,
                            tipo_sangre,
                            alergias,
                            enfermedades_cronicas,
                            contacto_emergencia,
                            telefono_emergencia
                        ) VALUES (?, ?, ?, ?, ?, ?)`,
                        [
                            userId,
                            userData.tipo_sangre || null,
                            userData.alergias || null,
                            userData.enfermedades_cronicas || null,
                            userData.contacto_emergencia || null,
                            userData.telefono_emergencia || null
                        ]
                    );
                    break;
            }

            await connection.commit();
            return { success: true, id: userId };
        } catch (error) {
            await connection.rollback();
            throw error;
        } finally {
            connection.release();
        }
    },

    // Obtener usuario por ID
    obtenerPorId: async (id) => {
        try {
            const [rows] = await pool.query(
                `SELECT 
                    u.*, 
                    r.nombre as rol_nombre 
                FROM usuarios u 
                JOIN roles r ON u.rol_id = r.id 
                WHERE u.id = ?`,
                [id]
            );
            return rows[0];
        } catch (error) {
            console.error('Error al obtener usuario:', error);
            throw error;
        }
    },

    // Obtener datos completos del usuario
    obtenerDatosCompletos: async (userId) => {
        try {
            const [userRows] = await pool.query(
                `SELECT 
                    u.*, 
                    r.nombre as rol_nombre 
                FROM usuarios u 
                JOIN roles r ON u.rol_id = r.id 
                WHERE u.id = ?`,
                [userId]
            );

            if (!userRows.length) return null;

            const userData = userRows[0];
            
            switch (parseInt(userData.rol_id)) {
                case 1: // Maestro
                    const [maestroRows] = await pool.query(`
                        SELECT 
                            m.*,
                            e.nombre as especialidad_nombre
                        FROM maestros m
                        LEFT JOIN especialidades e ON m.especialidad_id = e.id 
                        WHERE m.usuario_id = ?`,
                        [userId]
                    );
                    return { ...userData, ...maestroRows[0] };

                case 2: // Practicante
                    const [practicanteRows] = await pool.query(`
                        SELECT 
                            p.*,
                            g.nombre as grupo_nombre
                        FROM practicantes p
                        LEFT JOIN grupos g ON p.grupo_id = g.id
                        WHERE p.usuario_id = ?`,
                        [userId]
                    );
                    return { ...userData, ...practicanteRows[0] };

                case 3: // Paciente
                    const [pacienteRows] = await pool.query(
                        'SELECT * FROM pacientes WHERE usuario_id = ?',
                        [userId]
                    );
                    return { ...userData, ...pacienteRows[0] };

                default:
                    return userData;
            }
        } catch (error) {
            console.error('Error al obtener datos completos:', error);
            throw error;
        }
    },

    // Actualizar datos del usuario
    actualizar: async (userId, userData) => {
        const connection = await pool.getConnection();
        try {
            await connection.beginTransaction();

            // Actualizar datos básicos del usuario
            await connection.query(
                `UPDATE usuarios 
                SET 
                    telefono = COALESCE(?, telefono),
                    email = COALESCE(?, email),
                    usuario = COALESCE(?, usuario),
                    contrasena = CASE 
                        WHEN ? IS NOT NULL AND ? != '' THEN ?
                        ELSE contrasena 
                    END,
                    updated_at = NOW()
                WHERE id = ?`,
                [
                    userData.telefono || null,
                    userData.email || null,
                    userData.usuario || null,
                    userData.contrasena,
                    userData.contrasena,
                    userData.contrasena,
                    userId
                ]
            );

            // Actualizar datos específicos según rol
            const [user] = await connection.query(
                'SELECT rol_id FROM usuarios WHERE id = ?',
                [userId]
            );

            if (user.length > 0) {
                switch (parseInt(user[0].rol_id)) {
                    case 1: // Maestro
                        if (userData.cedula_profesional || userData.especialidad_id) {
                            await connection.query(
                                `UPDATE maestros 
                                SET 
                                    cedula_profesional = COALESCE(?, cedula_profesional),
                                    especialidad_id = COALESCE(?, especialidad_id)
                                WHERE usuario_id = ?`,
                                [
                                    userData.cedula_profesional || null,
                                    userData.especialidad_id || null,
                                    userId
                                ]
                            );
                        }
                        break;

                    case 2: // Practicante
                        if (userData.matricula || userData.semestre_actual || userData.grupo_id) {
                            await connection.query(
                                `UPDATE practicantes 
                                SET 
                                    matricula = COALESCE(?, matricula),
                                    semestre_actual = COALESCE(?, semestre_actual),
                                    grupo_id = COALESCE(?, grupo_id)
                                WHERE usuario_id = ?`,
                                [
                                    userData.matricula || null,
                                    userData.semestre_actual || null,
                                    userData.grupo_id || null,
                                    userId
                                ]
                            );
                        }
                        break;

                    case 3: // Paciente
                        await connection.query(
                            `UPDATE pacientes 
                            SET 
                                tipo_sangre = COALESCE(?, tipo_sangre),
                                alergias = COALESCE(?, alergias),
                                enfermedades_cronicas = COALESCE(?, enfermedades_cronicas),
                                contacto_emergencia = COALESCE(?, contacto_emergencia),
                                telefono_emergencia = COALESCE(?, telefono_emergencia)
                            WHERE usuario_id = ?`,
                            [
                                userData.tipo_sangre || null,
                                userData.alergias || null,
                                userData.enfermedades_cronicas || null,
                                userData.contacto_emergencia || null,
                                userData.telefono_emergencia || null,
                                userId
                            ]
                        );
                        break;
                }
            }

            await connection.commit();
            return { success: true };
        } catch (error) {
            await connection.rollback();
            console.error('Error al actualizar usuario:', error);
            throw error;
        } finally {
            connection.release();
        }
    },

    // Eliminar usuario
    eliminar: async (userId, rolId) => {
        const connection = await pool.getConnection();
        try {
            await connection.beginTransaction();

            // Eliminar registros relacionados según el rol
            switch (parseInt(rolId)) {
                case 1: // Maestro
                    await connection.query(
                        'DELETE FROM maestros WHERE usuario_id = ?', 
                        [userId]
                    );
                    break;

                case 2: // Practicante
                    // Primero obtener el ID del practicante
                    const [practicante] = await connection.query(
                        'SELECT id FROM practicantes WHERE usuario_id = ?',
                        [userId]
                    );
                    
                    if (practicante.length > 0) {
                        // Obtener y eliminar prácticas relacionadas
                        const [practicasProgreso] = await connection.query(
                            'SELECT id FROM practica_progreso WHERE practicante_id = ?',
                            [practicante[0].id]
                        );

                        if (practicasProgreso.length > 0) {
                            // Eliminar citas relacionadas
                            await connection.query(
                                'DELETE FROM citas WHERE practica_progreso_id IN (?)',
                                [practicasProgreso.map(p => p.id)]
                            );
                            
                            // Eliminar progreso de prácticas
                            await connection.query(
                                'DELETE FROM practica_progreso WHERE practicante_id = ?',
                                [practicante[0].id]
                            );
                        }

                        // Eliminar practicante
                        await connection.query(
                            'DELETE FROM practicantes WHERE id = ?',
                            [practicante[0].id]
                        );
                    }
                    break;

                case 3: // Paciente
                    // Primero obtener el ID del paciente
                    const [paciente] = await connection.query(
                        'SELECT id FROM pacientes WHERE usuario_id = ?',
                        [userId]
                    );

                    if (paciente.length > 0) {
                        // Eliminar citas relacionadas
                        await connection.query(
                            'DELETE FROM citas WHERE paciente_id = ?',
                            [paciente[0].id]
                        );
                        
                        // Eliminar paciente
                        await connection.query(
                            'DELETE FROM pacientes WHERE id = ?',
                            [paciente[0].id]
                        );
                    }
                    break;
            }

            // Finalmente, eliminar el usuario base
            await connection.query(
                'DELETE FROM usuarios WHERE id = ?',
                [userId]
            );

            await connection.commit();
            return { success: true };
        } catch (error) {
            await connection.rollback();
            console.error('Error al eliminar usuario:', error);
            throw error;
        } finally {
            connection.release();
        }
    }
};