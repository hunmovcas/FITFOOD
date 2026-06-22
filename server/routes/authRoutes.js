const express = require('express');
const jwt = require('jsonwebtoken');
const db = require('../db');
const { jwtAuth } = require('../middleware/jwtAuth');

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || 'fitfood-jwt-secret-change-in-production';

// Hàm ký JWT Token
function signToken(payload, expiresIn = '24h') {
    return jwt.sign(payload, JWT_SECRET, { expiresIn });
}

/* --- POST /api/auth/login - Gọi Stored Procedure kiểm tra đăng nhập DB --- */
router.post('/login', async (req, res) => {
    const { email, password } = req.body;

    if (!email || !password) {
        return res.status(400).json({
            success: false,
            message: 'Vui lòng nhập đầy đủ email và mật khẩu'
        });
    }

    try {
        if (!db.isConnected) {
            return res.status(500).json({
                success: false,
                message: 'Không có kết nối đến Cơ sở dữ liệu'
            });
        }

        // Gọi Stored Procedure sp_KiemTraDangNhap qua db.executeProc()
        const result = await db.executeProc('sp_KiemTraDangNhap', {
            email: { type: db.sql.NVarChar(150), value: email },
            password: { type: db.sql.NVarChar(255), value: password }
        });

        // Lấy bản ghi người dùng trả về (nếu khớp)
        const user = result?.recordset?.[0];

        if (!user) {
            return res.status(401).json({
                success: false,
                message: 'Email hoặc mật khẩu không đúng, hoặc tài khoản đang bị khóa'
            });
        }

        // Tạo payload chuẩn gửi về client và ký JWT
        const tokenPayload = {
            user_id: user.user_id,
            email: user.email,
            full_name: user.full_name,
            role: user.role
        };

        const token = signToken(tokenPayload, '24h');

        res.json({
            success: true,
            token,
            expiresIn: 86400,
            user: tokenPayload
        });

    } catch (err) {
        console.error('[Auth Login DB Error]', err);
        res.status(500).json({
            success: false,
            message: 'Lỗi hệ thống khi kiểm tra đăng nhập'
        });
    }
});

/* --- POST /api/auth/register - Đăng ký tài khoản (Lưu Plain-text thô) --- */
router.post('/register', async (req, res) => {
    const { email, password, full_name, phone } = req.body;

    if (!email || !password || !full_name) {
        return res.status(400).json({
            success: false,
            message: 'Thiếu thông tin bắt buộc (email, mật khẩu, họ tên)'
        });
    }

    if (password.length < 6) {
        return res.status(400).json({
            success: false,
            message: 'Mật khẩu phải có ít nhất 6 ký tự'
        });
    }

    try {
        if (!db.isConnected) {
            return res.status(500).json({
                success: false,
                message: 'Không có kết nối CSDL'
            });
        }

        // Insert trực tiếp chuỗi mật khẩu thô vào password_hash
        const result = await db.query(`
            INSERT INTO Users (email, password_hash, full_name, role, is_active)
            OUTPUT INSERTED.user_id, INSERTED.email, INSERTED.full_name, INSERTED.role
            VALUES (@email, @pass, @name, 'customer', 1)
        `, {
            email: { type: db.sql.NVarChar(150), value: email },
            pass: { type: db.sql.NVarChar(255), value: password },
            name: { type: db.sql.NVarChar(100), value: full_name }
        });

        const newUser = result.recordset[0];

        const tokenPayload = {
            user_id: newUser.user_id,
            email: newUser.email,
            full_name: newUser.full_name,
            role: newUser.role
        };

        const token = signToken(tokenPayload, '24h');

        res.status(201).json({
            success: true,
            token,
            expiresIn: 86400,
            user: tokenPayload
        });

    } catch (err) {
        if (err.number === 2627) { // Vi phạm ràng buộc UNIQUE email
            return res.status(409).json({
                success: false,
                message: 'Email này đã được đăng ký'
            });
        }
        console.error('[Auth Register Error]', err);
        res.status(500).json({
            success: false,
            message: 'Lỗi hệ thống khi đăng ký tài khoản'
        });
    }
});

/* --- POST /api/auth/change-password - Đổi mật khẩu (Đối chiếu thô) --- */
router.post('/change-password', jwtAuth, async (req, res) => {
    const { old_password, new_password } = req.body;
    const userId = req.user.user_id;

    if (!old_password || !new_password) {
        return res.status(400).json({
            success: false,
            message: 'Vui lòng nhập đầy đủ mật khẩu cũ và mật khẩu mới'
        });
    }

    try {
        if (!db.isConnected) {
            return res.status(500).json({
                success: false,
                message: 'Không có kết nối CSDL'
            });
        }

        // Lấy mật khẩu thô hiện tại trong DB
        const result = await db.query(
            'SELECT password_hash FROM Users WHERE user_id = @uid',
            { uid: { type: db.sql.Int, value: userId } }
        );

        const user = result.recordset[0];

        // So sánh chuỗi thô
        if (!user || user.password_hash !== old_password) {
            return res.status(401).json({
                success: false,
                message: 'Mật khẩu cũ không chính xác'
            });
        }

        // Cập nhật mật khẩu thô mới
        await db.query(
            'UPDATE Users SET password_hash = @hash WHERE user_id = @uid',
            {
                hash: { type: db.sql.NVarChar(255), value: new_password },
                uid: { type: db.sql.Int, value: userId }
            }
        );

        res.json({
            success: true,
            message: 'Đổi mật khẩu thành công'
        });

    } catch (err) {
        console.error('[Auth Change Pass Error]', err);
        res.status(500).json({
            success: false,
            message: 'Lỗi hệ thống khi đổi mật khẩu'
        });
    }
});

module.exports = router;