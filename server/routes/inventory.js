/**
 * routes/inventory.js
 * GreenBite — API endpoint quản lý kho nguyên liệu
 *
 * Endpoints:
 *   GET   /api/inventory                  – Danh sách kho (có lọc, cảnh báo)
 *   GET   /api/inventory/alerts           – Chỉ lấy mục cần chú ý
 *   GET   /api/inventory/:id              – Chi tiết 1 nguyên liệu
 *   POST  /api/inventory                  – Thêm nguyên liệu mới
 *   PUT   /api/inventory/:id              – Cập nhật thông tin
 *   POST  /api/inventory/:id/receive      – Nhập thêm hàng vào kho
 *   POST  /api/inventory/:id/adjust       – Điều chỉnh tồn kho (kiểm kê)
 *   GET   /api/inventory/:id/transactions – Lịch sử nhập/xuất
 */

const express = require('express');
const router = express.Router();
const sql = require('mssql');
const { getPool, handleError } = require('../db');
const { authMiddleware, requireRole } = require('./auth');

/* Tất cả endpoints đều yêu cầu đăng nhập */
router.use(authMiddleware);

/* ─────────────────────────────────────────
   GET /api/inventory
   Query: category, status (ok|low|critical|out|expiring), search
───────────────────────────────────────── */
router.get('/', async (req, res) => {
    try {
        const pool = await getPool();
        const { category, status, search } = req.query;

        let query = `
            SELECT
                ia.InventoryID    AS id,
                ia.ItemName       AS name,
                ia.Category       AS category,
                ia.Unit           AS unit,
                ia.CurrentQty     AS qty,
                ia.MinQty         AS minQty,
                ia.ExpiryDate     AS expire,
                ia.CostPerUnit    AS cost,
                ia.SupplierName   AS supplier,
                ia.ContactPhone   AS supplierPhone,
                ia.StockPercent,
                ia.StockStatus    AS stockStatus,
                ia.DaysUntilExpiry,
                ia.ExpiryStatus
            FROM vw_InventoryAlert ia
            WHERE 1=1
        `;

        const req2 = pool.request();

        if (category) {
            query += ` AND ia.Category = @category`;
            req2.input('category', sql.NVarChar, category);
        }

        if (status === 'expiring') {
            query += ` AND ia.ExpiryStatus IN ('expiring_today','expiring_soon','expired')`;
        } else if (status && status !== 'all') {
            query += ` AND ia.StockStatus = @status`;
            req2.input('status', sql.NVarChar, status);
        }

        if (search) {
            query += ` AND ia.ItemName LIKE @search`;
            req2.input('search', sql.NVarChar, `%${search}%`);
        }

        query += ` ORDER BY ia.ExpiryDate ASC, ia.StockPercent ASC`;

        const result = await req2.query(query);
        res.json({ success: true, data: result.recordset, total: result.recordset.length });
    } catch (err) {
        handleError(res, err, 'Lỗi lấy danh sách kho');
    }
});

/* ─────────────────────────────────────────
   GET /api/inventory/alerts
   Trả về các mục cần hành động ngay
───────────────────────────────────────── */
router.get('/alerts', async (req, res) => {
    try {
        const pool = await getPool();
        const result = await pool.request().query(`
            SELECT
                InventoryID AS id, ItemName AS name, Category AS category,
                CurrentQty AS qty, MinQty AS minQty, Unit AS unit,
                ExpiryDate AS expire, StockStatus, ExpiryStatus, DaysUntilExpiry,
                SupplierName AS supplier, ContactPhone AS supplierPhone
            FROM vw_InventoryAlert
            WHERE StockStatus IN ('out','critical','low')
               OR ExpiryStatus IN ('expired','expiring_today','expiring_soon')
            ORDER BY
                CASE StockStatus
                    WHEN 'out'      THEN 1
                    WHEN 'critical' THEN 2
                    WHEN 'low'      THEN 3
                    ELSE 9
                END,
                ExpiryDate ASC
        `);

        res.json({
            success: true,
            data: result.recordset,
            count: result.recordset.length
        });
    } catch (err) {
        handleError(res, err, 'Lỗi lấy cảnh báo kho');
    }
});

/* ─────────────────────────────────────────
   GET /api/inventory/:id
───────────────────────────────────────── */
router.get('/:id', async (req, res) => {
    try {
        const pool = await getPool();
        const result = await pool.request()
            .input('id', sql.Int, req.params.id)
            .query(`SELECT * FROM Inventory WHERE InventoryID = @id`);

        if (!result.recordset.length) {
            return res.status(404).json({ success: false, error: 'Không tìm thấy nguyên liệu' });
        }

        res.json({ success: true, data: result.recordset[0] });
    } catch (err) {
        handleError(res, err, 'Lỗi lấy chi tiết nguyên liệu');
    }
});

/* ─────────────────────────────────────────
   POST /api/inventory   [admin/kitchen]
───────────────────────────────────────── */
router.post('/', requireRole(['admin', 'kitchen']), async (req, res) => {
    try {
        const { name, category, unit, qty, minQty, expiryDate, supplierId, costPerUnit } = req.body;

        if (!name || !category || !unit) {
            return res.status(400).json({ success: false, error: 'Thiếu thông tin bắt buộc' });
        }

        const pool = await getPool();
        const result = await pool.request()
            .input('name', sql.NVarChar(200), name)
            .input('category', sql.NVarChar(50), category)
            .input('unit', sql.NVarChar(20), unit)
            .input('qty', sql.Decimal(10, 2), qty || 0)
            .input('minQty', sql.Decimal(10, 2), minQty || 0)
            .input('expiryDate', sql.Date, expiryDate || null)
            .input('supplierId', sql.Int, supplierId || null)
            .input('costPerUnit', sql.Decimal(10, 0), costPerUnit || 0)
            .query(`
                INSERT INTO Inventory
                    (ItemName, Category, Unit, CurrentQty, MinQty, ExpiryDate,
                     SupplierID, CostPerUnit, CreatedAt, UpdatedAt)
                OUTPUT INSERTED.InventoryID
                VALUES
                    (@name, @category, @unit, @qty, @minQty, @expiryDate,
                     @supplierId, @costPerUnit, GETDATE(), GETDATE())
            `);

        res.status(201).json({
            success: true,
            data: { id: result.recordset[0].InventoryID },
            message: 'Thêm nguyên liệu thành công'
        });
    } catch (err) {
        handleError(res, err, 'Lỗi thêm nguyên liệu');
    }
});

/* ─────────────────────────────────────────
   PUT /api/inventory/:id   [admin/kitchen]
───────────────────────────────────────── */
router.put('/:id', requireRole(['admin', 'kitchen']), async (req, res) => {
    try {
        const { name, category, unit, minQty, expiryDate, supplierId, costPerUnit } = req.body;
        const pool = await getPool();

        await pool.request()
            .input('id', sql.Int, req.params.id)
            .input('name', sql.NVarChar(200), name)
            .input('category', sql.NVarChar(50), category)
            .input('unit', sql.NVarChar(20), unit)
            .input('minQty', sql.Decimal(10, 2), minQty)
            .input('expiryDate', sql.Date, expiryDate || null)
            .input('supplierId', sql.Int, supplierId || null)
            .input('costPerUnit', sql.Decimal(10, 0), costPerUnit)
            .query(`
                UPDATE Inventory SET
                    ItemName    = @name,     Category   = @category,
                    Unit        = @unit,     MinQty     = @minQty,
                    ExpiryDate  = @expiryDate, SupplierID = @supplierId,
                    CostPerUnit = @costPerUnit, UpdatedAt = GETDATE()
                WHERE InventoryID = @id
            `);

        res.json({ success: true, message: 'Cập nhật nguyên liệu thành công' });
    } catch (err) {
        handleError(res, err, 'Lỗi cập nhật nguyên liệu');
    }
});

/* ─────────────────────────────────────────
   POST /api/inventory/:id/receive
   Nhập thêm hàng vào kho
   Body: { qty, expiryDate, reason }
   → Trigger trg_CheckExpiryOnReceive sẽ kiểm tra hạn dùng
───────────────────────────────────────── */
router.post('/:id/receive', requireRole(['admin', 'kitchen']), async (req, res) => {
    try {
        const { qty, expiryDate, reason = 'Nhập hàng định kỳ' } = req.body;

        if (!qty || qty <= 0) {
            return res.status(400).json({ success: false, error: 'Số lượng không hợp lệ' });
        }

        const pool = await getPool();

        /* Cập nhật ngày hết hạn nếu có */
        if (expiryDate) {
            await pool.request()
                .input('id', sql.Int, req.params.id)
                .input('expiryDate', sql.Date, expiryDate)
                .query(`UPDATE Inventory SET ExpiryDate=@expiryDate, UpdatedAt=GETDATE() WHERE InventoryID=@id`);
        }

        /* Insert vào InventoryTransactions (Trigger sẽ cập nhật CurrentQty) */
        await pool.request()
            .input('id', sql.Int, req.params.id)
            .input('qty', sql.Decimal(10, 2), qty)
            .input('reason', sql.NVarChar(200), reason)
            .input('createdBy', sql.Int, req.user.id)
            .query(`
                INSERT INTO InventoryTransactions
                    (InventoryID, TxType, Quantity, Reason, TransactionDate, CreatedBy)
                VALUES (@id, 'in', @qty, @reason, GETDATE(), @createdBy)
            `);

        res.json({ success: true, message: `Đã nhập ${qty} đơn vị vào kho` });
    } catch (err) {
        /* Trigger sẽ ném lỗi nếu hàng đã hết hạn */
        if (err.message?.includes('hết hạn')) {
            return res.status(400).json({ success: false, error: err.message });
        }
        handleError(res, err, 'Lỗi nhập hàng');
    }
});

/* ─────────────────────────────────────────
   POST /api/inventory/:id/adjust
   Điều chỉnh tồn kho sau kiểm kê
   Body: { actualQty, reason }
───────────────────────────────────────── */
router.post('/:id/adjust', requireRole(['admin']), async (req, res) => {
    try {
        const { actualQty, reason = 'Điều chỉnh sau kiểm kê' } = req.body;
        const pool = await getPool();

        /* Lấy số lượng hiện tại */
        const current = await pool.request()
            .input('id', sql.Int, req.params.id)
            .query(`SELECT CurrentQty FROM Inventory WHERE InventoryID = @id`);

        if (!current.recordset.length) {
            return res.status(404).json({ success: false, error: 'Không tìm thấy nguyên liệu' });
        }

        const diff = actualQty - current.recordset[0].CurrentQty;

        await pool.request()
            .input('id', sql.Int, req.params.id)
            .input('diff', sql.Decimal(10, 2), diff)
            .input('reason', sql.NVarChar(200), reason)
            .input('userId', sql.Int, req.user.id)
            .query(`
                INSERT INTO InventoryTransactions
                    (InventoryID, TxType, Quantity, Reason, TransactionDate, CreatedBy)
                VALUES (@id, 'adjust', @diff, @reason, GETDATE(), @userId);

                UPDATE Inventory
                SET    CurrentQty = @id, UpdatedAt = GETDATE()  -- Trigger sẽ cập nhật
                WHERE  InventoryID = @id;
            `);

        /* Cập nhật trực tiếp (adjust có thể âm) */
        await pool.request()
            .input('id', sql.Int, req.params.id)
            .input('qty', sql.Decimal(10, 2), actualQty)
            .query(`UPDATE Inventory SET CurrentQty=@qty, UpdatedAt=GETDATE() WHERE InventoryID=@id`);

        res.json({ success: true, message: `Đã điều chỉnh tồn kho: ${diff > 0 ? '+' : ''}${diff}` });
    } catch (err) {
        handleError(res, err, 'Lỗi điều chỉnh kho');
    }
});

/* ─────────────────────────────────────────
   GET /api/inventory/:id/transactions
   Lịch sử nhập/xuất nguyên liệu
───────────────────────────────────────── */
router.get('/:id/transactions', async (req, res) => {
    try {
        const pool = await getPool();
        const result = await pool.request()
            .input('id', sql.Int, req.params.id)
            .query(`
                SELECT
                    t.TxID, t.TxType, t.Quantity, t.Reason,
                    t.TransactionDate, t.OrderID,
                    u.FullName AS createdBy
                FROM   InventoryTransactions t
                LEFT JOIN Users u ON t.CreatedBy = u.UserID
                WHERE  t.InventoryID = @id
                ORDER BY t.TransactionDate DESC
            `);

        res.json({ success: true, data: result.recordset });
    } catch (err) {
        handleError(res, err, 'Lỗi lấy lịch sử giao dịch kho');
    }
});

module.exports = router;