/**
 * routes/products.js
 * GreenBite — API endpoint quản lý sản phẩm / thực đơn
 *
 * Endpoints:
 *   GET    /api/products            – Lấy danh sách (có lọc/tìm kiếm)
 *   GET    /api/products/:id        – Lấy chi tiết 1 sản phẩm
 *   POST   /api/products            – Tạo sản phẩm mới  [admin]
 *   PUT    /api/products/:id        – Cập nhật sản phẩm [admin]
 *   DELETE /api/products/:id        – Xoá sản phẩm      [admin]
 *   PATCH  /api/products/:id/toggle – Bật/tắt hiển thị  [admin]
 */

const express = require('express');
const router = express.Router();
const sql = require('mssql');
const { getPool, handleError } = require('../db');
const { authMiddleware, requireRole } = require('./auth');

/* ─────────────────────────────────────────
   GET /api/products
   Query params: category, search, available, sort
───────────────────────────────────────── */
router.get('/', async (req, res) => {
    try {
        const pool = await getPool();
        const { category, search, available, sort = 'default' } = req.query;

        let query = `
            SELECT
                p.ProductID,
                p.ProductName   AS name,
                p.Emoji         AS emoji,
                p.Description   AS desc,
                p.Price         AS price,
                p.Calories      AS calories,
                p.Protein       AS protein,
                p.Fat           AS fat,
                p.Carbs         AS carb,
                p.Category      AS category,
                p.Tags          AS tags,
                p.IsAvailable   AS available,
                p.CreatedAt,
                ISNULL(sr.TotalSold, 0) AS totalSold,
                ISNULL(sr.AvgRating, 0) AS avgRating
            FROM Products p
            LEFT JOIN vw_ProductSalesRanking sr ON p.ProductID = sr.ProductID
            WHERE 1=1
        `;

        const req2 = pool.request();

        /* Lọc theo danh mục */
        if (category && category !== 'all') {
            query += ` AND p.Category = @category`;
            req2.input('category', sql.NVarChar, category);
        }

        /* Tìm kiếm theo tên */
        if (search) {
            query += ` AND (p.ProductName LIKE @search OR p.Tags LIKE @search)`;
            req2.input('search', sql.NVarChar, `%${search}%`);
        }

        /* Lọc trạng thái hiển thị */
        if (available !== undefined) {
            query += ` AND p.IsAvailable = @available`;
            req2.input('available', sql.Bit, available === 'true' ? 1 : 0);
        }

        /* Sắp xếp */
        const sortMap = {
            'cal-asc': 'p.Calories ASC',
            'cal-desc': 'p.Calories DESC',
            'price-asc': 'p.Price ASC',
            'price-desc': 'p.Price DESC',
            'popular': 'sr.TotalSold DESC',
            'default': 'p.ProductID ASC',
        };
        query += ` ORDER BY ${sortMap[sort] || sortMap.default}`;

        const result = await req2.query(query);

        /* Parse tags từ chuỗi CSV sang array */
        const products = result.recordset.map(p => ({
            ...p,
            tags: p.tags ? p.tags.split(',').map(t => t.trim()) : [],
        }));

        res.json({ success: true, data: products, total: products.length });
    } catch (err) {
        handleError(res, err, 'Lỗi lấy danh sách sản phẩm');
    }
});

/* ─────────────────────────────────────────
   GET /api/products/:id
───────────────────────────────────────── */
router.get('/:id', async (req, res) => {
    try {
        const pool = await getPool();
        const result = await pool.request()
            .input('id', sql.Int, req.params.id)
            .query(`
                SELECT
                    p.*,
                    ISNULL(sr.TotalSold,  0) AS totalSold,
                    ISNULL(sr.AvgRating,  0) AS avgRating,
                    ISNULL(sr.SalesRank,  0) AS salesRank
                FROM Products p
                LEFT JOIN vw_ProductSalesRanking sr ON p.ProductID = sr.ProductID
                WHERE p.ProductID = @id
            `);

        if (!result.recordset.length) {
            return res.status(404).json({ success: false, error: 'Không tìm thấy sản phẩm' });
        }

        /* Lấy thêm nguyên liệu của món */
        const ingredients = await pool.request()
            .input('id', sql.Int, req.params.id)
            .query(`
                SELECT i.ItemName, ri.QtyRequired, i.Unit
                FROM   RecipeIngredients ri
                JOIN   Inventory i ON ri.InventoryID = i.InventoryID
                WHERE  ri.ProductID = @id
            `);

        const product = {
            ...result.recordset[0],
            tags: result.recordset[0].Tags?.split(',').map(t => t.trim()) || [],
            ingredients: ingredients.recordset,
        };

        res.json({ success: true, data: product });
    } catch (err) {
        handleError(res, err, 'Lỗi lấy chi tiết sản phẩm');
    }
});

/* ─────────────────────────────────────────
   POST /api/products   [admin only]
───────────────────────────────────────── */
router.post('/', authMiddleware, requireRole(['admin']), async (req, res) => {
    try {
        const {
            name, emoji = '🍽', description = '', price,
            calories, protein, fat, carbs, category, tags = [], isAvailable = true
        } = req.body;

        /* Validation cơ bản */
        if (!name || !price || !calories || !category) {
            return res.status(400).json({
                success: false,
                error: 'Thiếu thông tin bắt buộc: name, price, calories, category'
            });
        }

        const pool = await getPool();
        const result = await pool.request()
            .input('name', sql.NVarChar(200), name)
            .input('emoji', sql.NVarChar(10), emoji)
            .input('description', sql.NVarChar(500), description)
            .input('price', sql.Decimal(10, 0), price)
            .input('calories', sql.Int, calories)
            .input('protein', sql.Decimal(5, 1), protein || 0)
            .input('fat', sql.Decimal(5, 1), fat || 0)
            .input('carbs', sql.Decimal(5, 1), carbs || 0)
            .input('category', sql.NVarChar(50), category)
            .input('tags', sql.NVarChar(200), tags.join(', '))
            .input('available', sql.Bit, isAvailable ? 1 : 0)
            .query(`
                INSERT INTO Products
                    (ProductName, Emoji, Description, Price, Calories, Protein, Fat, Carbs,
                     Category, Tags, IsAvailable, CreatedAt, UpdatedAt)
                OUTPUT INSERTED.ProductID
                VALUES
                    (@name, @emoji, @description, @price, @calories, @protein, @fat, @carbs,
                     @category, @tags, @available, GETDATE(), GETDATE())
            `);

        const newId = result.recordset[0].ProductID;
        res.status(201).json({ success: true, data: { id: newId }, message: 'Tạo sản phẩm thành công' });
    } catch (err) {
        handleError(res, err, 'Lỗi tạo sản phẩm');
    }
});

/* ─────────────────────────────────────────
   PUT /api/products/:id   [admin only]
───────────────────────────────────────── */
router.put('/:id', authMiddleware, requireRole(['admin']), async (req, res) => {
    try {
        const {
            name, emoji, description, price,
            calories, protein, fat, carbs, category, tags, isAvailable
        } = req.body;

        const pool = await getPool();
        await pool.request()
            .input('id', sql.Int, req.params.id)
            .input('name', sql.NVarChar(200), name)
            .input('emoji', sql.NVarChar(10), emoji)
            .input('description', sql.NVarChar(500), description)
            .input('price', sql.Decimal(10, 0), price)
            .input('calories', sql.Int, calories)
            .input('protein', sql.Decimal(5, 1), protein)
            .input('fat', sql.Decimal(5, 1), fat)
            .input('carbs', sql.Decimal(5, 1), carbs)
            .input('category', sql.NVarChar(50), category)
            .input('tags', sql.NVarChar(200), Array.isArray(tags) ? tags.join(', ') : tags)
            .input('available', sql.Bit, isAvailable ? 1 : 0)
            .query(`
                UPDATE Products SET
                    ProductName = @name,   Emoji       = @emoji,
                    Description = @description, Price  = @price,
                    Calories    = @calories,    Protein = @protein,
                    Fat         = @fat,         Carbs   = @carbs,
                    Category    = @category,    Tags    = @tags,
                    IsAvailable = @available,   UpdatedAt = GETDATE()
                WHERE ProductID = @id
            `);

        res.json({ success: true, message: 'Cập nhật sản phẩm thành công' });
    } catch (err) {
        handleError(res, err, 'Lỗi cập nhật sản phẩm');
    }
});

/* ─────────────────────────────────────────
   PATCH /api/products/:id/toggle   [admin]
   Bật/tắt trạng thái hiển thị sản phẩm
───────────────────────────────────────── */
router.patch('/:id/toggle', authMiddleware, requireRole(['admin']), async (req, res) => {
    try {
        const pool = await getPool();
        const result = await pool.request()
            .input('id', sql.Int, req.params.id)
            .query(`
                UPDATE Products
                SET    IsAvailable = CASE WHEN IsAvailable = 1 THEN 0 ELSE 1 END,
                       UpdatedAt   = GETDATE()
                OUTPUT INSERTED.IsAvailable AS newStatus
                WHERE  ProductID = @id
            `);

        const newStatus = result.recordset[0]?.newStatus;
        res.json({
            success: true,
            data: { isAvailable: !!newStatus },
            message: newStatus ? 'Đã bật hiển thị sản phẩm' : 'Đã ẩn sản phẩm'
        });
    } catch (err) {
        handleError(res, err, 'Lỗi thay đổi trạng thái');
    }
});

/* ─────────────────────────────────────────
   DELETE /api/products/:id   [admin only]
───────────────────────────────────────── */
router.delete('/:id', authMiddleware, requireRole(['admin']), async (req, res) => {
    try {
        const pool = await getPool();

        /* Kiểm tra đang có trong đơn hàng chưa hoàn thành */
        const check = await pool.request()
            .input('id', sql.Int, req.params.id)
            .query(`
                SELECT COUNT(*) AS cnt
                FROM   OrderDetails od
                JOIN   Orders o ON od.OrderID = o.OrderID
                WHERE  od.ProductID = @id AND o.Status NOT IN ('completed','cancelled')
            `);

        if (check.recordset[0].cnt > 0) {
            return res.status(400).json({
                success: false,
                error: 'Không thể xoá: sản phẩm đang có trong đơn hàng chưa hoàn thành'
            });
        }

        await pool.request()
            .input('id', sql.Int, req.params.id)
            .query(`DELETE FROM Products WHERE ProductID = @id`);

        res.json({ success: true, message: 'Đã xoá sản phẩm' });
    } catch (err) {
        handleError(res, err, 'Lỗi xoá sản phẩm');
    }
});

module.exports = router;