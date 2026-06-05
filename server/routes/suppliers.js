// ── routes/suppliers.js ─────────────────────────────────────────────────────
const express = require('express');
const router = express.Router();
const db = require('../db');

// ── GET /api/suppliers ── Lấy danh sách nhà cung cấp
router.get('/', async (req, res) => {
    try {
        const { category, certified, search } = req.query;
        let sql = `
      SELECT s.*,
             COUNT(DISTINCT po.id)       AS total_orders,
             COALESCE(SUM(po.total_amount),0) AS total_spent,
             MAX(po.order_date)          AS last_order_date
      FROM suppliers s
      LEFT JOIN purchase_orders po ON po.supplier_id = s.id
      WHERE s.is_active = 1
    `;
        const params = [];
        if (category) { sql += ' AND s.category = ?'; params.push(category); }
        if (certified !== undefined) { sql += ' AND s.is_certified = ?'; params.push(certified === 'true' ? 1 : 0); }
        if (search) { sql += ' AND (s.name LIKE ? OR s.contact_person LIKE ?)'; params.push(`%${search}%`, `%${search}%`); }
        sql += ' GROUP BY s.id ORDER BY s.rating DESC, s.name ASC';

        const [rows] = await db.query(sql, params);
        res.json({ success: true, data: rows, total: rows.length });
    } catch (err) {
        console.error('GET /suppliers error:', err);
        res.status(500).json({ success: false, error: 'Lỗi truy vấn dữ liệu nhà cung cấp' });
    }
});

// ── GET /api/suppliers/:id ── Chi tiết + lịch sử đơn nhập
router.get('/:id', async (req, res) => {
    try {
        const [[supplier]] = await db.query(
            'SELECT * FROM suppliers WHERE id = ? AND is_active = 1', [req.params.id]
        );
        if (!supplier) return res.status(404).json({ success: false, error: 'Không tìm thấy nhà cung cấp' });

        const [orders] = await db.query(`
      SELECT po.*, GROUP_CONCAT(poi.ingredient_name ORDER BY poi.id SEPARATOR ', ') AS items
      FROM purchase_orders po
      LEFT JOIN purchase_order_items poi ON poi.purchase_order_id = po.id
      WHERE po.supplier_id = ?
      GROUP BY po.id
      ORDER BY po.order_date DESC
      LIMIT 20
    `, [req.params.id]);

        const [ingredients] = await db.query(`
      SELECT DISTINCT i.name, i.category, i.unit
      FROM ingredients i
      WHERE i.supplier_id = ? AND i.is_active = 1
      ORDER BY i.name
    `, [req.params.id]);

        res.json({ success: true, data: { ...supplier, recent_orders: orders, supplied_ingredients: ingredients } });
    } catch (err) {
        console.error('GET /suppliers/:id error:', err);
        res.status(500).json({ success: false, error: 'Lỗi truy vấn chi tiết nhà cung cấp' });
    }
});

// ── POST /api/suppliers ── Tạo nhà cung cấp mới
router.post('/', async (req, res) => {
    try {
        const {
            name, category, contact_person, phone, email,
            address, is_certified, certifications, rating, notes
        } = req.body;

        if (!name || !category || !phone) {
            return res.status(400).json({ success: false, error: 'Thiếu thông tin bắt buộc: name, category, phone' });
        }

        const [result] = await db.query(`
      INSERT INTO suppliers
        (name, category, contact_person, phone, email, address,
         is_certified, certifications, rating, notes, is_active, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, NOW())
    `, [
            name, category, contact_person || null, phone, email || null,
            address || null, is_certified ? 1 : 0,
            certifications ? JSON.stringify(certifications) : null,
            rating || 5.0, notes || null
        ]);

        res.status(201).json({ success: true, message: 'Thêm nhà cung cấp thành công', id: result.insertId });
    } catch (err) {
        console.error('POST /suppliers error:', err);
        res.status(500).json({ success: false, error: 'Lỗi thêm nhà cung cấp' });
    }
});

// ── PUT /api/suppliers/:id ── Cập nhật nhà cung cấp
router.put('/:id', async (req, res) => {
    try {
        const {
            name, category, contact_person, phone, email,
            address, is_certified, certifications, rating, notes
        } = req.body;

        const [check] = await db.query('SELECT id FROM suppliers WHERE id = ? AND is_active = 1', [req.params.id]);
        if (!check.length) return res.status(404).json({ success: false, error: 'Không tìm thấy nhà cung cấp' });

        await db.query(`
      UPDATE suppliers SET
        name = ?, category = ?, contact_person = ?, phone = ?, email = ?,
        address = ?, is_certified = ?, certifications = ?, rating = ?, notes = ?,
        updated_at = NOW()
      WHERE id = ?
    `, [
            name, category, contact_person, phone, email, address,
            is_certified ? 1 : 0, certifications ? JSON.stringify(certifications) : null,
            rating, notes, req.params.id
        ]);

        res.json({ success: true, message: 'Cập nhật nhà cung cấp thành công' });
    } catch (err) {
        console.error('PUT /suppliers/:id error:', err);
        res.status(500).json({ success: false, error: 'Lỗi cập nhật nhà cung cấp' });
    }
});

// ── DELETE /api/suppliers/:id ── Vô hiệu hóa (soft delete)
router.delete('/:id', async (req, res) => {
    try {
        const [check] = await db.query('SELECT id FROM suppliers WHERE id = ? AND is_active = 1', [req.params.id]);
        if (!check.length) return res.status(404).json({ success: false, error: 'Không tìm thấy nhà cung cấp' });

        // Kiểm tra còn nguyên liệu đang dùng không
        const [inUse] = await db.query(
            'SELECT COUNT(*) AS cnt FROM ingredients WHERE supplier_id = ? AND is_active = 1', [req.params.id]
        );
        if (inUse[0].cnt > 0) {
            return res.status(409).json({
                success: false,
                error: `Không thể xoá: còn ${inUse[0].cnt} nguyên liệu đang dùng từ nhà cung cấp này`
            });
        }

        await db.query('UPDATE suppliers SET is_active = 0, updated_at = NOW() WHERE id = ?', [req.params.id]);
        res.json({ success: true, message: 'Đã vô hiệu hoá nhà cung cấp' });
    } catch (err) {
        console.error('DELETE /suppliers/:id error:', err);
        res.status(500).json({ success: false, error: 'Lỗi xoá nhà cung cấp' });
    }
});

// ── POST /api/suppliers/:id/purchase-order ── Tạo đơn nhập hàng
router.post('/:id/purchase-order', async (req, res) => {
    const conn = await db.getConnection();
    try {
        await conn.beginTransaction();
        const { items, expected_delivery, notes } = req.body;
        // items: [{ ingredient_id, ingredient_name, quantity, unit, unit_price }]
        if (!items || !items.length) {
            return res.status(400).json({ success: false, error: 'Đơn nhập phải có ít nhất 1 sản phẩm' });
        }

        const totalAmount = items.reduce((s, i) => s + i.quantity * i.unit_price, 0);

        const [po] = await conn.query(`
      INSERT INTO purchase_orders
        (supplier_id, total_amount, status, expected_delivery, notes, created_by, order_date)
      VALUES (?, ?, 'pending', ?, ?, ?, NOW())
    `, [req.params.id, totalAmount, expected_delivery || null, notes || null, req.user?.id || 1]);

        for (const item of items) {
            await conn.query(`
        INSERT INTO purchase_order_items
          (purchase_order_id, ingredient_id, ingredient_name, quantity, unit, unit_price, total_price)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `, [po.insertId, item.ingredient_id || null, item.ingredient_name,
            item.quantity, item.unit, item.unit_price, item.quantity * item.unit_price]);
        }

        await conn.commit();
        res.status(201).json({ success: true, message: 'Tạo đơn nhập hàng thành công', purchase_order_id: po.insertId });
    } catch (err) {
        await conn.rollback();
        console.error('POST /suppliers/:id/purchase-order error:', err);
        res.status(500).json({ success: false, error: 'Lỗi tạo đơn nhập hàng' });
    } finally {
        conn.release();
    }
});

// ── GET /api/suppliers/categories ── Lấy danh mục
router.get('/meta/categories', async (req, res) => {
    try {
        const [rows] = await db.query(
            'SELECT DISTINCT category, COUNT(*) AS count FROM suppliers WHERE is_active=1 GROUP BY category ORDER BY count DESC'
        );
        res.json({ success: true, data: rows });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

module.exports = router;