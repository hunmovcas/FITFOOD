/* ============================================================
   USERS.JS - API quản lý người dùng
   ============================================================ */

const express = require('express');
const db = require('../db');
const { adminOnly } = require('../middleware/roleGuard');

const router = express.Router();

/* --- GET /api/users/me - Hồ sơ cá nhân --- */
router.get('/me', async (req, res) => {
    try {
        if (!db.isConnected) {
            return res.json({ success: true, data: req.user });
        }
        const result = await db.query(`
      SELECT user_id, email, full_name, phone, role, loyalty_points, created_at
      FROM Users WHERE user_id = @uid`,
            { uid: { type: db.sql.Int, value: req.user.user_id } }
        );
        res.json({ success: true, data: result.recordset[0] });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

/* --- PUT /api/users/me - Cập nhật hồ sơ --- */
router.put('/me', async (req, res) => {
    const { full_name, phone } = req.body;
    try {
        if (db.isConnected) {
            await db.query(`
        UPDATE Users SET full_name = @name, phone = @phone, updated_at = GETDATE()
        WHERE user_id = @uid`,
                {
                    name: { type: db.sql.NVarChar(100), value: full_name },
                    phone: { type: db.sql.NVarChar(20), value: phone || null },
                    uid: { type: db.sql.Int, value: req.user.user_id },
                }
            );
        }
        res.json({ success: true, message: 'Cập nhật thành công' });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

/* --- GET /api/users - Danh sách users (admin) --- */
router.get('/', adminOnly, async (req, res) => {
    try {
        if (!db.isConnected) return res.json({ success: true, data: [] });
        const result = await db.query(`
      SELECT user_id, email, full_name, phone, role, loyalty_points, is_active, created_at
      FROM Users ORDER BY created_at DESC`);
        res.json({ success: true, data: result.recordset });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

module.exports = router;