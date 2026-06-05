/* ============================================================
   SUPPLIERS.JS - API quản lý nhà cung cấp
   ============================================================ */

const express = require('express');
const db = require('../db');
const { adminOnly } = require('../middleware/roleGuard');

const router = express.Router();

/* --- GET /api/suppliers --- */
router.get('/', async (req, res) => {
    try {
        if (!db.isConnected) {
            return res.json({
                success: true, data: [
                    { supplier_id: 1, name: 'Nông trại Organic Đà Lạt', category: 'Rau củ hữu cơ', phone: '0263123456' },
                    { supplier_id: 2, name: 'Thịt sạch Farm Bình Dương', category: 'Thịt tươi', phone: '0274987654' },
                    { supplier_id: 3, name: 'Hải sản tươi Vũng Tàu', category: 'Hải sản', phone: '0254345678' },
                ]
            });
        }
        const result = await db.query(`SELECT * FROM Suppliers WHERE is_active = 1 ORDER BY name`);
        res.json({ success: true, data: result.recordset });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

/* --- POST /api/suppliers - Thêm nhà cung cấp (admin) --- */
router.post('/', adminOnly, async (req, res) => {
    const { name, contact_name, phone, email, address, category, notes } = req.body;

    if (!name) return res.status(400).json({ success: false, message: 'Tên nhà cung cấp là bắt buộc' });

    try {
        if (db.isConnected) {
            await db.query(`
        INSERT INTO Suppliers (name, contact_name, phone, email, address, category, notes)
        VALUES (@name, @contact, @phone, @email, @addr, @cat, @notes)`,
                {
                    name: { type: db.sql.NVarChar(200), value: name },
                    contact: { type: db.sql.NVarChar(100), value: contact_name || null },
                    phone: { type: db.sql.NVarChar(20), value: phone || null },
                    email: { type: db.sql.NVarChar(150), value: email || null },
                    addr: { type: db.sql.NVarChar(500), value: address || null },
                    cat: { type: db.sql.NVarChar(100), value: category || null },
                    notes: { type: db.sql.NVarChar(500), value: notes || null },
                }
            );
        }
        res.status(201).json({ success: true, message: 'Đã thêm nhà cung cấp' });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

module.exports = router;