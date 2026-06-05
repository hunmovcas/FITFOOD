/* ============================================================
   AUTHROUTES.JS - API đăng nhập, đăng ký, đổi mật khẩu
   ============================================================ */

const express = require('express');
const bcrypt = require('bcrypt');
const db = require('../db');
const { signToken, jwtAuth } = require('../middleware/jwtAuth');

const router = express.Router();
const SALT_ROUNDS = 10;

/* --- POST /api/auth/login --- */
router.post('/login', async (req, res) => {
    const { email, password } = req.body;

    if (!email || !password) {
        return res.status(400).json({ success: false, message: 'Vui lòng nhập email và mật khẩu' });
    }

    try {
        let user = null;

        if (db.isConnected) {
            const result = await db.query(
                `SELECT user_id, email, password_hash, full_name, role, is_active, loyalty_points
         FROM Users WHERE email = @email`,
                { email: { type: db.sql.NVarChar(150), value: email } }
            );
            user = result.recordset[0];
        } else {
            // Mock users cho dev
            const mockUsers = {
                'admin@fitfood.vn': { user_id: 1, email, full_name: 'FitFood Admin', role: 'admin', password_hash: await bcrypt.hash('Admin@123', SALT_ROUNDS) },
                'kitchen@fitfood.vn': { user_id: 2, email, full_name: 'Bếp trưởng', role: 'kitchen', password_hash: await bcrypt.hash('Kitchen@123', SALT_ROUNDS) },
                'user@fitfood.vn': { user_id: 3, email, full_name: 'Demo User', role: 'customer', password_hash: await bcrypt.hash('User@123', SALT_ROUNDS) },
            };
            user = mockUsers[email];
            if (user) user.is_active = 1;
        }

        if (!user) {
            return res.status(401).json({ success: false, message: 'Email không tồn tại' });
        }

        if (!user.is_active) {
            return res.status(403).json({ success: false, message: 'Tài khoản đã bị khóa' });
        }

        // So sánh password
        let passwordMatch = false;
        try {
            passwordMatch = await bcrypt.compare(password, user.password_hash);
        } catch {
            // Mock: cho phép login bằng password đơn giản khi dev
            passwordMatch = password === 'Admin@123' || password === 'Kitchen@123' || password === 'User@123';
        }

        if (!passwordMatch) {
            return res.status(401).json({ success: false, message: 'Mật khẩu không đúng' });
        }

        const tokenPayload = {
            user_id: user.user_id,
            email: user.email,
            full_name: user.full_name,
            role: user.role,
        };

        const token = signToken(tokenPayload, '24h');

        res.json({
            success: true,
            token,
            expiresIn: 86400,
            user: tokenPayload
        });

    } catch (err) {
        console.error('[Auth Login Error]', err);
        res.status(500).json({ success: false, message: 'Lỗi hệ thống' });
    }
});

/* --- POST /api/auth/register --- */
router.post('/register', async (req, res) => {
    const { email, password, full_name, phone } = req.body;

    if (!email || !password || !full_name) {
        return res.status(400).json({ success: false, message: 'Thiếu thông tin bắt buộc' });
    }

    if (password.length < 6) {
        return res.status(400).json({ success: false, message: 'Mật khẩu phải có ít nhất 6 ký tự' });
    }

    try {
        const password_hash = await bcrypt.hash(password, SALT_ROUNDS);

        let newUser = { user_id: Date.now(), email, full_name, role: 'customer' };

        if (db.isConnected) {
            const result = await db.query(`
        INSERT INTO Users (email, password_hash, full_name, phone, role)
        OUTPUT INSERTED.user_id, INSERTED.email, INSERTED.full_name, INSERTED.role
        VALUES (@email, @hash, @name, @phone, 'customer')`,
                {
                    email: { type: db.sql.NVarChar(150), value: email },
                    hash: { type: db.sql.NVarChar(255), value: password_hash },
                    name: { type: db.sql.NVarChar(100), value: full_name },
                    phone: { type: db.sql.NVarChar(20), value: phone || null },
                }
            );
            newUser = result.recordset[0];
        }

        const token = signToken({ user_id: newUser.user_id, email, full_name, role: 'customer' }, '24h');

        res.status(201).json({ success: true, token, expiresIn: 86400, user: newUser });

    } catch (err) {
        if (err.number === 2627) { // Duplicate key SQL Server
            return res.status(409).json({ success: false, message: 'Email đã được đăng ký' });
        }
        res.status(500).json({ success: false, message: 'Lỗi đăng ký' });
    }
});

/* --- POST /api/auth/change-password --- */
router.post('/change-password', jwtAuth, async (req, res) => {
    const { old_password, new_password } = req.body;
    const userId = req.user.user_id;

    if (!old_password || !new_password) {
        return res.status(400).json({ success: false, message: 'Vui lòng nhập đầy đủ thông tin' });
    }

    try {
        const result = await db.query(
            'SELECT password_hash FROM Users WHERE user_id = @uid',
            { uid: { type: db.sql.Int, value: userId } }
        );

        const user = result.recordset[0];
        if (!user || !await bcrypt.compare(old_password, user.password_hash)) {
            return res.status(401).json({ success: false, message: 'Mật khẩu cũ không đúng' });
        }

        const new_hash = await bcrypt.hash(new_password, SALT_ROUNDS);
        await db.query(
            'UPDATE Users SET password_hash = @hash, updated_at = GETDATE() WHERE user_id = @uid',
            {
                hash: { type: db.sql.NVarChar(255), value: new_hash },
                uid: { type: db.sql.Int, value: userId }
            }
        );

        res.json({ success: true, message: 'Đổi mật khẩu thành công' });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Lỗi đổi mật khẩu' });
    }
});

module.exports = router;