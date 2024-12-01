import express from 'express';
import session from 'express-session';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { testConnection } from './config/database.js';
import routes from './routes/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();

// Configuración detallada de las sesiones
app.use(session({
    name: 'practicdent.sid',
    secret: 'practicdent-super-secret-key',
    resave: true, // Cambiado a true
    saveUninitialized: true, // Cambiado a true
    cookie: {
        secure: false,
        httpOnly: true,
        maxAge: 24 * 60 * 60 * 1000, // 24 horas
        sameSite: 'lax'
    },
    store: new session.MemoryStore() // Añadir store explícito
}));

/// Middleware para procesar JSON y formularios
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Middleware para verificar sesión globalmente
app.use((req, res, next) => {
    // Rutas que no requieren sesión
    const publicRoutes = ['/', '/login', '/register', '/R'];
    
    if (publicRoutes.includes(req.path)) {
        return next();
    }

    // Para rutas API
    if (req.path.startsWith('/api/')) {
        if (!req.session?.userId) {
            return res.status(401).json({
                success: false,
                error: 'Sesión no válida'
            });
        }
        return next();
    }

    // Para rutas normales
    if (!req.session?.userId) {
        return res.redirect('/?error=session');
    }

    next();
});


app.set('view engine', 'ejs');
app.set('views', join(__dirname, 'views'));

app.use('/', routes);

app.use((req, res, next) => {
    res.status(404).render('error', {
        message: 'Página no encontrada',
        error: null
    });
});

app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(err.status || 500).render('error', {
        message: err.message || 'Ha ocurrido un error en el servidor',
        error: process.env.NODE_ENV === 'development' ? err : {}
    });
});

testConnection()
    .then(success => {
        if (success) {
            console.log('✅ Servidor listo para manejar conexiones a la base de datos');
        } else {
            console.log('⚠️ El servidor se inició pero hay problemas con la base de datos');
        }
    });

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🚀 Servidor corriendo en http://localhost:${PORT}`);
});

export default app;