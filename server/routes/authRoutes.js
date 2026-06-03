// ============================================================
// routes/auth.js - API xác thực người dùng
// POST /api/auth/login    → Đăng nhập
// POST /api/auth/register → Đăng ký khách hàng mới
// GET  /api/auth/me       → Lấy thông tin user hiện tại
// ============================================================

const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { sql, executeQuery } = require('../db');
const { authenticateToken } = require('../middleware/jwtAuth');

const JWT_SECRET = process.env.JWT_SECRET || 'greenbite_secret_key_2024';
const JWT_EXPIRES = '7d'; // Token hết hạn sau 7 ngày

// ============================================================
// POST /api/auth/login - Đăng nhập
// Body: { email, password }
// ============================================================
router.post('/login', async (req, res) => {
    const { email, password } = req.body;

    // Validate đầu vào
    if (!email || !password) {
        return res.status(400).json({ success: false, message: 'Vui lòng nhập email và mật khẩu' });
    }

    try {
        // Truy vấn user kèm thông tin role
        const result = await executeQuery(`
      SELECT u.UserID, u.Email, u.PasswordHash, u.FullName, u.IsActive,
             r.RoleID, r.RoleName
      FROM Users u
      INNER JOIN Roles r ON u.RoleID = r.RoleID
      WHERE u.Email = @email
    `, {
            email: { type: sql.NVarChar(255), value: email },
        });

        if (result.recordset.length === 0) {
            return res.status(401).json({ success: false, message: 'Email hoặc mật khẩu không đúng' });
        }

        const user = result.recordset[0];

        // Kiểm tra tài khoản có bị khóa không
        if (!user.IsActive) {
            return res.status(403).json({ success: false, message: 'Tài khoản đã bị khóa. Vui lòng liên hệ admin.' });
        }

        // So sánh mật khẩu với hash trong DB
        const isMatch = await bcrypt.compare(password, user.PasswordHash);
        if (!isMatch) {
            return res.status(401).json({ success: false, message: 'Email hoặc mật khẩu không đúng' });
        }

        // Tạo JWT token
        const payload = {
            userId: user.UserID,
            email: user.Email,
            roleId: user.RoleID,
            roleName: user.RoleName,
            fullName: user.FullName,
        };

        const token = jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES });

        // Cập nhật thời gian đăng nhập cuối
        await executeQuery(
            'UPDATE Users SET LastLoginAt = GETDATE() WHERE UserID = @userId',
            { userId: { type: sql.Int, value: user.UserID } }
        );

        res.json({
            success: true,
            message: 'Đăng nhập thành công',
            token,
            user: {
                userId: user.UserID,
                email: user.Email,
                fullName: user.FullName,
                roleName: user.RoleName,
            },
        });
    } catch (err) {
        console.error('Lỗi đăng nhập:', err);
        res.status(500).json({ success: false, message: 'Lỗi server khi đăng nhập' });
    }
});

// ============================================================
// POST /api/auth/register - Đăng ký tài khoản khách hàng
// Body: { email, password, fullName, phone }
// ============================================================
router.post('/register', async (req, res) => {
    const { email, password, fullName, phone } = req.body;

    // Validate đầu vào
    if (!email || !password || !fullName) {
        return res.status(400).json({ success: false, message: 'Vui lòng điền đầy đủ thông tin bắt buộc' });
    }

    if (password.length < 6) {
        return res.status(400).json({ success: false, message: 'Mật khẩu phải có ít nhất 6 ký tự' });
    }

    try {
        // Kiểm tra email đã tồn tại chưa
        const existing = await executeQuery(
            'SELECT UserID FROM Users WHERE Email = @email',
            { email: { type: sql.NVarChar(255), value: email } }
        );

        if (existing.recordset.length > 0) {
            return res.status(409).json({ success: false, message: 'Email này đã được đăng ký' });
        }

        // Mã hóa mật khẩu (salt rounds = 12)
        const passwordHash = await bcrypt.hash(password, 12);

        // Lấy RoleID của role 'customer'
        const roleResult = await executeQuery(
            "SELECT RoleID FROM Roles WHERE RoleName = 'customer'",
            {}
        );
        const customerRoleId = roleResult.recordset[0]?.RoleID || 4;

        // Thêm user mới vào DB
        const insertResult = await executeQuery(`
      INSERT INTO Users (Email, PasswordHash, FullName, Phone, RoleID, IsActive, CreatedAt)
      OUTPUT INSERTED.UserID
      VALUES (@email, @passwordHash, @fullName, @phone, @roleId, 1, GETDATE())
    `, {
            email: { type: sql.NVarChar(255), value: email },
            passwordHash: { type: sql.NVarChar(255), value: passwordHash },
            fullName: { type: sql.NVarChar(255), value: fullName },
            phone: { type: sql.NVarChar(20), value: phone || null },
            roleId: { type: sql.Int, value: customerRoleId },
        });

        const newUserId = insertResult.recordset[0].UserID;

        // Tạo hồ sơ khách hàng mặc định (bảng CustomerProfiles)
        await executeQuery(`
      INSERT INTO CustomerProfiles (UserID, LoyaltyPoints, TotalSpent)
      VALUES (@userId, 0, 0)
    `, { userId: { type: sql.Int, value: newUserId } });

        res.status(201).json({
            success: true,
            message: 'Đăng ký thành công! Chào mừng bạn đến với GreenBite 🥗',
        });
    } catch (err) {
        console.error('Lỗi đăng ký:', err);
        res.status(500).json({ success: false, message: 'Lỗi server khi đăng ký' });
    }
});

// ============================================================
// GET /api/auth/me - Lấy thông tin user đang đăng nhập
// Header: Authorization: Bearer <token>
// ============================================================
router.get('/me', authenticateToken, async (req, res) => {
    try {
        const result = await executeQuery(`
      SELECT u.UserID, u.Email, u.FullName, u.Phone, u.Avatar,
             u.CreatedAt, r.RoleName,
             cp.LoyaltyPoints, cp.TotalSpent, cp.CalorieGoal
      FROM Users u
      INNER JOIN Roles r ON u.RoleID = r.RoleID
      LEFT JOIN CustomerProfiles cp ON cp.UserID = u.UserID
      WHERE u.UserID = @userId
    `, {
            userId: { type: sql.Int, value: req.user.userId },
        });

        if (result.recordset.length === 0) {
            return res.status(404).json({ success: false, message: 'Không tìm thấy user' });
        }

        res.json({ success: true, user: result.recordset[0] });
    } catch (err) {
        console.error('Lỗi lấy thông tin user:', err);
        res.status(500).json({ success: false, message: 'Lỗi server' });
    }
});

module.exports = router;