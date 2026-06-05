/* ============================================================
   DB.JS - Kết nối và quản lý connection pool SQL Server
   ============================================================ */

const sql = require('mssql');

/* --- Cấu hình kết nối SQL Server --- */
const config = {
    server: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '1433'),
    database: process.env.DB_NAME || 'FitFoodDB',
    user: process.env.DB_USER || 'sa',
    password: process.env.DB_PASSWORD || 'YourStrongPassword123!',
    options: {
        encrypt: process.env.DB_ENCRYPT === 'true',
        trustServerCertificate: true,     // Bật cho dev/localhost
        enableArithAbort: true,
        requestTimeout: 30000,
    },
    pool: {
        max: 10,      // Số kết nối tối đa trong pool
        min: 2,       // Số kết nối tối thiểu giữ warm
        idleTimeoutMillis: 30000,
    },
};

let pool = null;
let isConnected = false;

/* --- Khởi tạo connection pool --- */
async function connect() {
    if (pool) return pool;

    try {
        pool = await sql.connect(config);
        isConnected = true;

        pool.on('error', (err) => {
            console.error('[DB Pool Error]', err);
            isConnected = false;
            pool = null;
        });

        return pool;
    } catch (err) {
        isConnected = false;
        throw err;
    }
}

/* --- Thực thi query an toàn --- */
async function query(queryString, params = {}) {
    if (!pool) await connect();

    const request = pool.request();

    // Bind parameters để tránh SQL Injection
    Object.entries(params).forEach(([key, { type, value }]) => {
        request.input(key, type, value);
    });

    return await request.query(queryString);
}

/* --- Thực thi stored procedure --- */
async function executeProc(procName, params = {}) {
    if (!pool) await connect();

    const request = pool.request();

    Object.entries(params).forEach(([key, { type, value, isOutput }]) => {
        if (isOutput) {
            request.output(key, type);
        } else {
            request.input(key, type, value);
        }
    });

    return await request.execute(procName);
}

/* --- Transaction helper --- */
async function transaction(callback) {
    if (!pool) await connect();
    const trans = new sql.Transaction(pool);

    try {
        await trans.begin();
        const result = await callback(trans);
        await trans.commit();
        return result;
    } catch (err) {
        await trans.rollback();
        throw err;
    }
}

/* --- Đóng kết nối (dùng khi tắt server) --- */
async function close() {
    if (pool) {
        await pool.close();
        pool = null;
        isConnected = false;
    }
}

/* Xử lý graceful shutdown */
process.on('SIGTERM', close);
process.on('SIGINT', close);

module.exports = {
    connect, query, executeProc, transaction, close,
    get isConnected() { return isConnected; },
    sql: sql.TYPES,   // Export SQL types để dùng trong routes
};