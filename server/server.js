/* ============================================================
   SERVER.JS - Entry point ứng dụng Node.js
   Khởi tạo Express, mount routes, cấu hình CORS, Socket.io
   ============================================================ */

const express = require('express');
const http = require('http');
const cors = require('cors');
const helmet = require('helmet');
const path = require('path');

const db = require('./db');
const socketInit = require('./socket');
const { jwtAuth } = require('./middleware/jwtAuth');
const { rateLimiter } = require('./middleware/rateLimiter');

/* --- Import routes --- */
const authRoutes = require('./routes/authRoutes');
const productsRoutes = require('./routes/products');
const ordersRoutes = require('./routes/orders');
const subscriptionsRoutes = require('./routes/subscriptions');
const inventoryRoutes = require('./routes/inventory');
const usersRoutes = require('./routes/users');
const suppliersRoutes = require('./routes/suppliers');
const marketingRoutes = require('./routes/marketing');
const trackingRoutes = require('./routes/tracking');
const notificationsRoutes = require('./routes/notifications');

const app = express();
const server = http.createServer(app);

/* === MIDDLEWARE === */

/* Bảo mật HTTP headers */
app.use(helmet({
    contentSecurityPolicy: false, // Cho phép inline scripts trong dev
}));

/* CORS - cho phép frontend truy cập */
const allowedOrigins = [
    'http://localhost:5500',
    'http://localhost:3000',
    'http://127.0.0.1:5500',
    process.env.FRONTEND_URL,   // GitHub Pages URL khi deploy
].filter(Boolean);

app.use(cors({
    origin: (origin, callback) => {
        if (!origin || allowedOrigins.includes(origin)) return callback(null, true);
        callback(new Error(`CORS không cho phép origin: ${origin}`));
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
}));

/* Parse JSON body */
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

/* Serve static files (frontend) */
app.use(express.static(path.join(__dirname, '..')));

/* === ROUTES === */

/* Health check endpoint */
app.get('/health', (req, res) => {
    res.json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        version: require('./package.json').version,
    });
});

/* API routes - public */
app.use('/api/auth', rateLimiter({ windowMs: 15 * 60000, max: 20 }), authRoutes);

/* API routes - yêu cầu xác thực JWT */
app.use('/api/products', productsRoutes);       // Public: GET, Protected: POST/PUT/DELETE
app.use('/api/orders', jwtAuth, ordersRoutes);
app.use('/api/subscriptions', jwtAuth, subscriptionsRoutes);
app.use('/api/inventory', jwtAuth, inventoryRoutes);
app.use('/api/users', jwtAuth, usersRoutes);
app.use('/api/suppliers', jwtAuth, suppliersRoutes);
app.use('/api/marketing', marketingRoutes);       // Validate voucher public, create protected
app.use('/api/tracking', jwtAuth, trackingRoutes);
app.use('/api/notifications', jwtAuth, notificationsRoutes);

/* Admin KPI endpoint */
app.get('/api/admin/kpi', jwtAuth, async (req, res) => {
    try {
        const result = await db.query(`SELECT * FROM vw_DashboardKPI`);
        const kpi = result.recordset[0] || {};
        res.json({ success: true, data: kpi });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

/* Polling endpoint cho fallback realtime */
app.get('/api/realtime/poll', jwtAuth, async (req, res) => {
    // Trả về các sự kiện mới trong 30 giây qua
    res.json({ events: [] });
});

/* Fallback 404 cho API */
app.use('/api/*', (req, res) => {
    res.status(404).json({ success: false, message: 'Endpoint không tồn tại' });
});

/* Fallback: serve index.html cho mọi route (SPA) */
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'index.html'));
});

/* === XỬ LÝ LỖI TOÀN CỤC === */
app.use((err, req, res, next) => {
    console.error('[Error]', err.stack);
    const status = err.status || 500;
    const message = process.env.NODE_ENV === 'production'
        ? 'Lỗi hệ thống, vui lòng thử lại sau'
        : err.message;
    res.status(status).json({ success: false, message });
});

/* === KHỞI ĐỘNG SERVER === */
const PORT = process.env.PORT || 3000;

server.listen(PORT, async () => {
    console.log(`\n🚀 FitFood Server chạy tại http://localhost:${PORT}`);
    console.log(`📊 Admin: http://localhost:${PORT}/src/admin/dashboard.html`);
    console.log(`🛒 Customer: http://localhost:${PORT}/src/customer/home.html`);
    console.log(`👨‍🍳 Kitchen: http://localhost:${PORT}/src/kitchen/kds.html\n`);

    // Khởi tạo WebSocket
    socketInit(server);
    console.log('🔄 WebSocket (Socket.io) đã khởi động');

    // Kiểm tra kết nối database
    try {
        await db.connect();
        console.log('🗄 Database kết nối thành công');
    } catch (err) {
        console.warn('⚠️ Không kết nối được database - chạy ở chế độ mock:', err.message);
    }
});

module.exports = { app, server };