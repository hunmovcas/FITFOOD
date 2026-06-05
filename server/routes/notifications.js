/* ============================================================
   NOTIFICATIONS.JS - API thông báo hệ thống
   ============================================================ */

const express = require('express');
const db = require('../db');

const router = express.Router();

/* --- GET /api/notifications - Lấy thông báo của user --- */
router.get('/', async (req, res) => {
    try {
        if (!db.isConnected) return res.json({ success: true, data: [], unread: 0 });

        const result = await db.query(`
      SELECT TOP 20 *
      FROM Notifications
      WHERE (target_role = @role OR target_user = @uid)
      ORDER BY created_at DESC`,
            {
                role: { type: db.sql.NVarChar(20), value: req.user.role },
                uid: { type: db.sql.Int, value: req.user.user_id },
            }
        );

        const unread = result.recordset.filter(n => !n.is_read).length;
        res.json({ success: true, data: result.recordset, unread });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

/* --- PATCH /api/notifications/:id/read - Đánh dấu đã đọc --- */
router.patch('/:id/read', async (req, res) => {
    try {
        if (db.isConnected) {
            await db.query(`
        UPDATE Notifications SET is_read = 1
        WHERE notif_id = @id`,
                { id: { type: db.sql.Int, value: parseInt(req.params.id) } }
            );
        }
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

module.exports = router;