// ============================================================
// db.js - Kết nối SQL Server qua mssql
// Dùng connection pool để tái sử dụng kết nối hiệu quả
// Cấu hình đọc từ biến môi trường (.env)
// ============================================================

const sql = require('mssql');

// Cấu hình kết nối SQL Server (Railway)
const config = {
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    server: process.env.DB_SERVER,       // ví dụ: containers-us-west-xxx.railway.app
    port: parseInt(process.env.DB_PORT) || 1433,
    database: process.env.DB_NAME || 'GreenBite',
    options: {
        encrypt: true,                      // Bắt buộc cho Railway/Azure
        trustServerCertificate: true,       // Cho phép self-signed cert
        enableArithAbort: true,
    },
    pool: {
        max: 10,                            // Tối đa 10 kết nối đồng thời
        min: 0,
        idleTimeoutMillis: 30000,           // Đóng kết nối nhàn rỗi sau 30s
    },
    connectionTimeout: 30000,            // Timeout kết nối 30s
    requestTimeout: 30000,               // Timeout query 30s
};

// Biến lưu pool kết nối (singleton)
let pool = null;

/**
 * Khởi tạo và trả về connection pool
 * Nếu pool đã tồn tại thì trả về luôn (tái sử dụng)
 */
async function getPool() {
    if (pool) return pool;

    try {
        pool = await sql.connect(config);
        console.log('✅ Kết nối SQL Server thành công');

        // Xử lý lỗi pool sau khi kết nối
        pool.on('error', (err) => {
            console.error('❌ Lỗi SQL pool:', err);
            pool = null; // Reset để kết nối lại lần sau
        });

        return pool;
    } catch (err) {
        console.error('❌ Không thể kết nối SQL Server:', err.message);
        throw err;
    }
}

/**
 * Thực thi câu lệnh SQL với tham số
 * @param {string} query - Câu lệnh SQL (dùng @param thay vì string concat)
 * @param {Object} params - Object chứa tham số { tenParam: { type, value } }
 * @returns {Promise<sql.IResult>} Kết quả truy vấn
 */
async function executeQuery(query, params = {}) {
    const pool = await getPool();
    const request = pool.request();

    // Gắn tham số vào request để tránh SQL Injection
    for (const [key, { type, value }] of Object.entries(params)) {
        request.input(key, type, value);
    }

    return await request.query(query);
}

/**
 * Gọi Stored Procedure
 * @param {string} procedureName - Tên stored procedure
 * @param {Object} params - Tham số đầu vào
 * @returns {Promise<sql.IResult>} Kết quả
 */
async function executeProcedure(procedureName, params = {}) {
    const pool = await getPool();
    const request = pool.request();

    for (const [key, { type, value }] of Object.entries(params)) {
        request.input(key, type, value);
    }

    return await request.execute(procedureName);
}

/**
 * Đóng tất cả kết nối (dùng khi tắt server)
 */
async function closePool() {
    if (pool) {
        await pool.close();
        pool = null;
        console.log('🔌 Đã đóng kết nối SQL Server');
    }
}

module.exports = { sql, getPool, executeQuery, executeProcedure, closePool };