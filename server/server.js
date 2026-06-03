// ============================================================
// server.js - Entry point của GreenBite Backend API
// Framework: Express.js
// Hosting: Render.com
// Database: SQL Server trên Railway
// ============================================================

require('dotenv').config(); // Nạp biến môi trường từ file .env

const express = require('express');
const cors = require('cors');
const { closePool } = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;

// ============================================================
// MIDDLEWARE
// ============================================================

// Cho phép CORS từ GitHub Pages và localhost (dev)
app.use(cors({
    origin: [
        'https://<your-username>.github.io', // Thay bằng GitHub Pages URL thực tế
        'http://localhost:5500',              // Live Server (VSCode)
        'http://127.0.0.1:5500',
        'http://localhost:3000',
    ],
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
    allowedHeaders: ['Content-Type', 'Authorization'],
}));

// Parse JSON body từ request
app.use(express.json());

// Log mỗi request (hữu ích khi debug)
app.use((req, res, next) => {
    const time = new Date().toISOString();
    console.log(`[${time}] ${req.method} ${req.path}`);
    next();
});

// ============================================================
// ROUTES - Nạp các router từ thư mục routes/
// ============================================================

const authRoutes = require('./routes/authRoutes');
const productRoutes = require('./routes/products');
const orderRoutes = require('./routes/orders');
const inventoryRoutes = require('./routes/inventory');
const userRoutes = require('./routes/users');
const supplierRoutes = require('./routes/suppliers');

app.use('/api/auth', authRoutes);       // Đăng nhập, đăng ký
app.use('/api/products', productRoutes);    // Thực đơn, danh mục
app.use('/api/orders', orderRoutes);      // Đơn hàng
app.use('/api/inventory', inventoryRoutes);  // Kho nguyên liệu
app.use('/api/users', userRoutes);       // Người dùng, hồ sơ
app.use('/api/suppliers', supplierRoutes);   // Nhà cung cấp

// ============================================================
// ROUTE KIỂM TRA SERVER (Health Check)
// Render.com dùng endpoint này để biết server còn sống không
// ============================================================
app.get('/health', (req, res) => {
    res.json({
        status: 'ok',
        message: 'GreenBite API đang hoạt động',
        timestamp: new Date().toISOString(),
    });
});

// Route mặc định
app.get('/', (req, res) => {
    res.json({ message: '🥗 GreenBite Healthy Food Platform API v1.0' });
});

// ============================================================
// XỬ LÝ LỖI TOÀN CỤC
// ============================================================

// Xử lý route không tồn tại (404)
app.use((req, res) => {
    res.status(404).json({ success: false, message: 'Endpoint không tồn tại' });
});

// Xử lý lỗi server (500)
app.use((err, req, res, next) => {
    console.error('❌ Lỗi server:', err.stack);
    res.status(500).json({
        success: false,
        message: 'Lỗi server nội bộ',
        error: process.env.NODE_ENV === 'development' ? err.message : undefined,
    });
});

// ============================================================
// KHỞI ĐỘNG SERVER
// ============================================================
const server = app.listen(PORT, () => {
    console.log(`🚀 GreenBite Server đang chạy tại port ${PORT}`);
    console.log(`📊 Môi trường: ${process.env.NODE_ENV || 'development'}`);
});

// Xử lý tắt server gracefully (không mất dữ liệu đang xử lý)
process.on('SIGTERM', async () => {
    console.log('🛑 Nhận tín hiệu SIGTERM, đang tắt server...');
    server.close(async () => {
        await closePool(); // Đóng kết nối DB
        process.exit(0);
    });
});

process.on('SIGINT', async () => {
    console.log('🛑 Nhận tín hiệu SIGINT (Ctrl+C), đang tắt...');
    await closePool();
    process.exit(0);
});

module.exports = app;