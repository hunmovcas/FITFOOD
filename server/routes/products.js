/* ============================================================
   PRODUCTS.JS - API CRUD thực đơn
   ============================================================ */

const express = require('express');
const db = require('../db');
const { optionalAuth } = require('../middleware/jwtAuth');
const { adminOnly } = require('../middleware/roleGuard');

const router = express.Router();

/* --- GET /api/products - Danh sách món ăn --- */
router.get('/', optionalAuth, async (req, res) => {
    const { available, category, tags, limit = 100 } = req.query;

    try {
        if (!db.isConnected) {
            // Trả mock data khi không có DB
            const { MOCK } = require('../../assets/js/api');
            return res.json({ success: true, data: [], total: 0 }); // MOCK không access được từ server
        }

        let whereClause = 'WHERE 1=1';
        if (available === 'true') whereClause += ' AND is_available = 1';
        if (category) whereClause += ` AND slug = '${category}'`;

        const result = await db.query(`
      SELECT TOP ${parseInt(limit)}
        P.product_id AS id, P.name, P.description, P.price,
        P.calories, P.protein_g AS protein, P.carbs_g AS carbs, P.fat_g AS fat,
        P.health_tags AS tags, P.image_url, P.is_available AS available,
        P.prep_time_min, C.name AS category_name, C.slug AS category
      FROM Products P
      LEFT JOIN Categories C ON C.category_id = P.category_id
      ${whereClause}
      ORDER BY P.product_id ASC`);

        res.json({ success: true, data: result.recordset, total: result.recordset.length });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

/* --- POST /api/products - Thêm món mới (admin) --- */
router.post('/', adminOnly, async (req, res) => {
    const { name, description, price, calories, protein_g, carbs_g, fat_g,
        category_id, health_tags, prep_time_min } = req.body;

    if (!name || !price || !calories) {
        return res.status(400).json({ success: false, message: 'Thiếu thông tin bắt buộc' });
    }

    try {
        if (db.isConnected) {
            const result = await db.query(`
        INSERT INTO Products (name, description, price, calories, protein_g, carbs_g, fat_g,
          category_id, health_tags, prep_time_min)
        OUTPUT INSERTED.product_id AS id
        VALUES (@name, @desc, @price, @cal, @pro, @carb, @fat, @cat, @tags, @prep)`,
                {
                    name: { type: db.sql.NVarChar(200), value: name },
                    desc: { type: db.sql.NVarChar(1000), value: description || '' },
                    price: { type: db.sql.Decimal(10, 0), value: price },
                    cal: { type: db.sql.Int, value: calories },
                    pro: { type: db.sql.Decimal(5, 1), value: protein_g || 0 },
                    carb: { type: db.sql.Decimal(5, 1), value: carbs_g || 0 },
                    fat: { type: db.sql.Decimal(5, 1), value: fat_g || 0 },
                    cat: { type: db.sql.Int, value: category_id || null },
                    tags: { type: db.sql.NVarChar(200), value: JSON.stringify(health_tags || []) },
                    prep: { type: db.sql.Int, value: prep_time_min || 15 },
                }
            );
            return res.status(201).json({ success: true, data: result.recordset[0] });
        }

        res.status(201).json({ success: true, data: { id: Date.now(), name } });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

/* --- PUT /api/products/:id - Cập nhật món ăn --- */
router.put('/:id', adminOnly, async (req, res) => {
    const { id } = req.params;
    const fields = req.body;

    try {
        if (db.isConnected) {
            await db.query(`
        UPDATE Products
        SET name = @name, price = @price, calories = @cal, is_available = @avail,
            updated_at = GETDATE()
        WHERE product_id = @id`,
                {
                    name: { type: db.sql.NVarChar(200), value: fields.name },
                    price: { type: db.sql.Decimal(10, 0), value: fields.price },
                    cal: { type: db.sql.Int, value: fields.calories },
                    avail: { type: db.sql.Bit, value: fields.is_available ? 1 : 0 },
                    id: { type: db.sql.Int, value: parseInt(id) },
                }
            );
        }
        res.json({ success: true, message: 'Cập nhật thành công' });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

module.exports = router;