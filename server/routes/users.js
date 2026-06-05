/**
 * routes/users.js
 * GreenBite — API endpoint quản lý người dùng & nhân sự
 *
 * Endpoints:
 *   GET    /api/users              – Danh sách nhân viên [admin]
 *   GET    /api/users/me           – Thông tin bản thân [all]
 *   GET    /api/users/:id          – Chi tiết user [admin]
 *   PUT    /api/users/me           – Cập nhật hồ sơ bản thân
 *   PUT    /api/users/:id          – Admin sửa user bất kỳ [admin]
 *   PATCH  /api/users/:id/status   – Kích hoạt/khoá tài khoản [admin]
 *   POST   /api/users              – Tạo nhân viên mới [admin]
 *   GET    /api/users/me/calorie-history – Lịch sử calo 7 ngày [customer]
 *   GET    /api/users/me/points-log      – Lịch sử điểm thưởng [customer]
 */

const express = require('express');
const router = express.Router();
const sql = require('mssql');
const bcrypt = require('bcryptjs');
const { getPool, handleError } = require('../db');
const { authMiddleware, requireRole } = require('./auth');

router.use(authMiddleware);

/* ─────────────────────────────────────────
   GET /api/users   [admin only]
   Danh sách nhân viên (không bao gồm customer)
───────────────────────────────────────── */
router.get('/', requireRole(['admin']), async (req, res) => {
    try {
        const pool = await getPool();
        const { role, status, search } = req.query;

        let query = `
            SELECT
                UserID AS id, FullName AS name, Email AS email,
                Phone AS phone, Role AS role, Shift AS shift,
                Status AS status, Salary AS salary,
                CreatedAt AS startDate, LastLoginAt AS lastLogin
            FROM Users
            WHERE Role <> 'customer'
        `;

        const req2 = pool.request();

        if (role) { query += ` AND Role   = @role`; req2.input('role', sql.NVarChar, role); }
        if (status) { query += ` AND Status = @status`; req2.input('status', sql.NVarChar, status); }
        if (search) {
            query += ` AND (FullName LIKE @search OR Email LIKE @search)`;
            req2.input('search', sql.NVarChar, `%${search}%`);
        }

        query += ` ORDER BY Role, FullName`;
        const result = await req2.query(query);

        res.json({ success: true, data: result.recordset });
    } catch (err) {
        handleError(res, err, 'Lỗi lấy danh sách nhân viên');
    }
});

/* ─────────────────────────────────────────
   GET /api/users/me   [all roles]
───────────────────────────────────────── */
router.get('/me', async (req, res) => {
    try {
        const pool = await getPool();
        const result = await pool.request()
            .input('id', sql.Int, req.user.id)
            .query(`
                SELECT
                    UserID AS id, FullName AS name, Email AS email,
                    Phone AS phone, Role AS role, LoyaltyPoints AS points,
                    Avatar AS avatar, HealthGoal AS goal,
                    CalorieTarget AS calorieTarget, WeightKg AS weight,
                    HeightCm AS height, Allergies AS allergies,
                    DefaultAddress AS address, CreatedAt
                FROM Users
                WHERE UserID = @id
            `);

        if (!result.recordset.length) {
            return res.status(404).json({ success: false, error: 'Không tìm thấy tài khoản' });
        }
        res.json({ success: true, data: result.recordset[0] });
    } catch (err) {
        handleError(res, err, 'Lỗi lấy thông tin cá nhân');
    }
});

/* ─────────────────────────────────────────
   GET /api/users/me/calorie-history   [customer]
   Lịch sử calo 7 ngày gần nhất
───────────────────────────────────────── */
router.get('/me/calorie-history', requireRole(['customer']), async (req, res) => {
    try {
        const pool = await getPool();
        const result = await pool.request()
            .input('userId', sql.Int, req.user.id)
            .query(`
                SELECT
                    CAST(o.CreatedAt AS DATE)              AS orderDate,
                    SUM(p.Calories * od.Quantity)          AS totalCalories,
                    SUM(p.Protein  * od.Quantity)          AS totalProtein,
                    SUM(p.Carbs    * od.Quantity)          AS totalCarbs,
                    SUM(p.Fat      * od.Quantity)          AS totalFat,
                    COUNT(DISTINCT o.OrderID)              AS mealsCount
                FROM Orders o
                JOIN OrderDetails od ON o.OrderID  = od.OrderID
                JOIN Products     p  ON od.ProductID = p.ProductID
                WHERE o.CustomerID = @userId
                  AND o.Status     = 'completed'
                  AND o.CreatedAt >= DATEADD(DAY, -7, GETDATE())
                GROUP BY CAST(o.CreatedAt AS DATE)
                ORDER BY orderDate DESC
            `);

        res.json({ success: true, data: result.recordset });
    } catch (err) {
        handleError(res, err, 'Lỗi lấy lịch sử calo');
    }
});

/* ─────────────────────────────────────────
   GET /api/users/me/points-log   [customer]
───────────────────────────────────────── */
router.get('/me/points-log', requireRole(['customer']), async (req, res) => {
    try {
        const pool = await getPool();
        const result = await pool.request()
            .input('userId', sql.Int, req.user.id)
            .query(`
                SELECT TOP 20
                    lpl.Points, lpl.Reason, lpl.CreatedAt,
                    o.OrderCode, o.TotalAmount
                FROM LoyaltyPointsLog lpl
                LEFT JOIN Orders o ON lpl.OrderID = o.OrderID
                WHERE lpl.UserID = @userId
                ORDER BY lpl.CreatedAt DESC
            `);

        /* Tính tổng điểm hiện tại */
        const total = await pool.request()
            .input('userId', sql.Int, req.user.id)
            .query(`SELECT LoyaltyPoints AS points FROM Users WHERE UserID=@userId`);

        res.json({
            success: true,
            data: result.recordset,
            total: total.recordset[0]?.points || 0
        });
    } catch (err) {
        handleError(res, err, 'Lỗi lấy lịch sử điểm');
    }
});

/* ─────────────────────────────────────────
   PUT /api/users/me   [all roles]
───────────────────────────────────────── */
router.put('/me', async (req, res) => {
    try {
        const {
            name, phone, goal, calorieTarget,
            weight, height, allergies, address, password
        } = req.body;

        const pool = await getPool();
        const req2 = pool.request().input('id', sql.Int, req.user.id);

        let query = `
            UPDATE Users SET
                FullName       = @name,
                Phone          = @phone,
                HealthGoal     = @goal,
                CalorieTarget  = @calorieTarget,
                WeightKg       = @weight,
                HeightCm       = @height,
                Allergies      = @allergies,
                DefaultAddress = @address,
                UpdatedAt      = GETDATE()
        `;

        req2.input('name', sql.NVarChar(100), name)
            .input('phone', sql.NVarChar(20), phone)
            .input('goal', sql.NVarChar(50), goal)
            .input('calorieTarget', sql.Int, calorieTarget || 1800)
            .input('weight', sql.Decimal(5, 1), weight)
            .input('height', sql.Int, height)
            .input('allergies', sql.NVarChar(200), allergies || '')
            .input('address', sql.NVarChar(300), address || '');

        /* Đổi mật khẩu nếu có */
        if (password && password.length >= 6) {
            const hash = await bcrypt.hash(password, 10);
            query += `, PasswordHash = @pwHash`;
            req2.input('pwHash', sql.NVarChar(200), hash);
        }

        query += ` WHERE UserID = @id`;
        await req2.query(query);

        res.json({ success: true, message: 'Cập nhật thông tin thành công' });
    } catch (err) {
        handleError(res, err, 'Lỗi cập nhật thông tin cá nhân');
    }
});

/* ─────────────────────────────────────────
   GET /api/users/:id   [admin]
───────────────────────────────────────── */
router.get('/:id', requireRole(['admin']), async (req, res) => {
    try {
        const pool = await getPool();
        const result = await pool.request()
            .input('id', sql.Int, req.params.id)
            .query(`SELECT UserID AS id, FullName AS name, Email, Phone, Role, Shift, Status, Salary, CreatedAt FROM Users WHERE UserID=@id`);

        if (!result.recordset.length) {
            return res.status(404).json({ success: false, error: 'Không tìm thấy nhân viên' });
        }
        res.json({ success: true, data: result.recordset[0] });
    } catch (err) {
        handleError(res, err, 'Lỗi lấy thông tin nhân viên');
    }
});

/* ─────────────────────────────────────────
   POST /api/users   [admin — tạo nhân viên mới]
───────────────────────────────────────── */
router.post('/', requireRole(['admin']), async (req, res) => {
    try {
        const { name, email, phone, role, shift, salary, password = '123456' } = req.body;

        if (!name || !email || !role) {
            return res.status(400).json({ success: false, error: 'Thiếu thông tin bắt buộc' });
        }

        /* Kiểm tra email trùng */
        const pool = await getPool();
        const check = await pool.request()
            .input('email', sql.NVarChar, email)
            .query(`SELECT COUNT(*) AS cnt FROM Users WHERE Email=@email`);

        if (check.recordset[0].cnt > 0) {
            return res.status(400).json({ success: false, error: 'Email đã tồn tại trong hệ thống' });
        }

        const hash = await bcrypt.hash(password, 10);
        const result = await pool.request()
            .input('name', sql.NVarChar(100), name)
            .input('email', sql.NVarChar(150), email)
            .input('phone', sql.NVarChar(20), phone || '')
            .input('role', sql.NVarChar(20), role)
            .input('shift', sql.NVarChar(50), shift || '')
            .input('salary', sql.Decimal(12, 0), salary || 0)
            .input('pwHash', sql.NVarChar(200), hash)
            .query(`
                INSERT INTO Users
                    (FullName, Email, Phone, Role, Shift, Salary, PasswordHash, Status, CreatedAt, UpdatedAt)
                OUTPUT INSERTED.UserID
                VALUES
                    (@name, @email, @phone, @role, @shift, @salary, @pwHash, 'active', GETDATE(), GETDATE())
            `);

        res.status(201).json({
            success: true,
            data: { id: result.recordset[0].UserID },
            message: `Tạo tài khoản ${role} thành công`
        });
    } catch (err) {
        handleError(res, err, 'Lỗi tạo tài khoản nhân viên');
    }
});

/* ─────────────────────────────────────────
   PUT /api/users/:id   [admin]
───────────────────────────────────────── */
router.put('/:id', requireRole(['admin']), async (req, res) => {
    try {
        const { name, phone, role, shift, salary } = req.body;
        const pool = await getPool();

        await pool.request()
            .input('id', sql.Int, req.params.id)
            .input('name', sql.NVarChar(100), name)
            .input('phone', sql.NVarChar(20), phone)
            .input('role', sql.NVarChar(20), role)
            .input('shift', sql.NVarChar(50), shift)
            .input('salary', sql.Decimal(12, 0), salary)
            .query(`
                UPDATE Users SET
                    FullName=@name, Phone=@phone, Role=@role,
                    Shift=@shift, Salary=@salary, UpdatedAt=GETDATE()
                WHERE UserID=@id
            `);

        res.json({ success: true, message: 'Cập nhật nhân viên thành công' });
    } catch (err) {
        handleError(res, err, 'Lỗi cập nhật nhân viên');
    }
});

/* ─────────────────────────────────────────
   PATCH /api/users/:id/status   [admin]
───────────────────────────────────────── */
router.patch('/:id/status', requireRole(['admin']), async (req, res) => {
    try {
        const { status } = req.body; // 'active' | 'inactive'
        if (!['active', 'inactive'].includes(status)) {
            return res.status(400).json({ success: false, error: 'Trạng thái không hợp lệ' });
        }

        const pool = await getPool();
        await pool.request()
            .input('id', sql.Int, req.params.id)
            .input('status', sql.NVarChar, status)
            .query(`UPDATE Users SET Status=@status, UpdatedAt=GETDATE() WHERE UserID=@id`);

        res.json({ success: true, message: status === 'active' ? 'Đã kích hoạt tài khoản' : 'Đã khoá tài khoản' });
    } catch (err) {
        handleError(res, err, 'Lỗi thay đổi trạng thái tài khoản');
    }
});

module.exports = router;