/**
 * routes/orders.js
 * GreenBite — API endpoint quản lý đơn hàng
 *
 * Endpoints:
 *   GET  /api/orders                 – Danh sách (admin/kitchen xem tất cả, customer xem của mình)
 *   GET  /api/orders/:id             – Chi tiết đơn hàng
 *   POST /api/orders                 – Tạo đơn mới (customer)
 *   PATCH /api/orders/:id/status     – Cập nhật trạng thái (kitchen/admin)
 *   GET  /api/orders/stats/today     – Thống kê đơn hàng hôm nay (admin)
 */

const express = require('express');
const router = express.Router();
const sql = require('mssql');
const { getPool, handleError } = require('../db');
const { authMiddleware, requireRole } = require('./auth');

/* ─────────────────────────────────────────
   GET /api/orders
   - customer : chỉ xem đơn của chính mình
   - kitchen/admin : xem tất cả, lọc theo status/date
───────────────────────────────────────── */
router.get('/', authMiddleware, async (req, res) => {
    try {
        const pool = await getPool();
        const { status, date, limit = 50, offset = 0 } = req.query;
        const { id: userId, role } = req.user;

        let query = `
            SELECT
                o.OrderID       AS id,
                o.OrderCode,
                u.FullName      AS customer,
                u.Phone         AS customerPhone,
                o.TotalAmount   AS total,
                o.Status        AS status,
                o.PaymentMethod AS payment,
                o.DeliveryAddress AS address,
                o.Note,
                o.CreatedAt,
                o.UpdatedAt,
                /* Danh sách món (JSON string) */
                (
                    SELECT od.Quantity AS qty,
                           p.ProductName AS name,
                           p.Emoji AS emoji,
                           od.UnitPrice AS price,
                           od.SpecialRequest AS note
                    FROM   OrderDetails od
                    JOIN   Products p ON od.ProductID = p.ProductID
                    WHERE  od.OrderID = o.OrderID
                    FOR JSON PATH
                ) AS itemsJson
            FROM Orders o
            JOIN Users u ON o.CustomerID = u.UserID
            WHERE 1=1
        `;

        const req2 = pool.request()
            .input('limit', sql.Int, parseInt(limit))
            .input('offset', sql.Int, parseInt(offset));

        /* Khách hàng chỉ xem đơn của mình */
        if (role === 'customer') {
            query += ` AND o.CustomerID = @userId`;
            req2.input('userId', sql.Int, userId);
        }

        /* Lọc trạng thái */
        if (status && status !== 'all') {
            query += ` AND o.Status = @status`;
            req2.input('status', sql.NVarChar, status);
        }

        /* Lọc ngày */
        if (date) {
            query += ` AND CAST(o.CreatedAt AS DATE) = @date`;
            req2.input('date', sql.Date, date);
        }

        query += ` ORDER BY o.CreatedAt DESC OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY`;

        const result = await req2.query(query);

        /* Parse itemsJson từ string sang array */
        const orders = result.recordset.map(o => ({
            ...o,
            items: o.itemsJson ? JSON.parse(o.itemsJson) : [],
            itemsJson: undefined,
        }));

        res.json({ success: true, data: orders, total: orders.length });
    } catch (err) {
        handleError(res, err, 'Lỗi lấy danh sách đơn hàng');
    }
});

/* ─────────────────────────────────────────
   GET /api/orders/stats/today   [admin/kitchen]
───────────────────────────────────────── */
router.get('/stats/today', authMiddleware, requireRole(['admin', 'kitchen', 'cashier']), async (req, res) => {
    try {
        const pool = await getPool();
        const result = await pool.request().query(`
            SELECT
                COUNT(*)                                                  AS totalOrders,
                SUM(TotalAmount)                                          AS totalRevenue,
                COUNT(CASE WHEN Status = 'pending'    THEN 1 END)        AS pending,
                COUNT(CASE WHEN Status = 'preparing'  THEN 1 END)        AS preparing,
                COUNT(CASE WHEN Status = 'ready'      THEN 1 END)        AS ready,
                COUNT(CASE WHEN Status = 'delivering' THEN 1 END)        AS delivering,
                COUNT(CASE WHEN Status = 'completed'  THEN 1 END)        AS completed,
                COUNT(CASE WHEN Status = 'cancelled'  THEN 1 END)        AS cancelled,
                AVG(DATEDIFF(MINUTE, CreatedAt,
                    CASE WHEN Status IN ('ready','completed') THEN UpdatedAt END))
                                                                          AS avgPrepMins
            FROM Orders
            WHERE CAST(CreatedAt AS DATE) = CAST(GETDATE() AS DATE)
        `);

        res.json({ success: true, data: result.recordset[0] });
    } catch (err) {
        handleError(res, err, 'Lỗi lấy thống kê đơn hàng');
    }
});

/* ─────────────────────────────────────────
   GET /api/orders/:id
───────────────────────────────────────── */
router.get('/:id', authMiddleware, async (req, res) => {
    try {
        const pool = await getPool();
        const { id: userId, role } = req.user;

        const result = await pool.request()
            .input('id', sql.Int, req.params.id)
            .query(`
                SELECT o.*, u.FullName AS customerName, u.Phone AS customerPhone,
                       v.VoucherCode, v.DiscountValue,
                       sh.FullName AS shipperName, sh.Phone AS shipperPhone
                FROM   Orders o
                JOIN   Users u  ON o.CustomerID = u.UserID
                LEFT JOIN Vouchers v ON o.VoucherID = v.VoucherID
                LEFT JOIN Users sh ON o.ShipperID = sh.UserID
                WHERE  o.OrderID = @id
            `);

        if (!result.recordset.length) {
            return res.status(404).json({ success: false, error: 'Không tìm thấy đơn hàng' });
        }

        const order = result.recordset[0];

        /* Kiểm tra quyền: customer chỉ xem đơn của mình */
        if (role === 'customer' && order.CustomerID !== userId) {
            return res.status(403).json({ success: false, error: 'Không có quyền xem đơn này' });
        }

        /* Lấy chi tiết từng món */
        const items = await pool.request()
            .input('id', sql.Int, req.params.id)
            .query(`
                SELECT od.OrderDetailID, od.Quantity AS qty, od.UnitPrice AS price,
                       od.SpecialRequest AS note,
                       p.ProductName AS name, p.Emoji AS emoji,
                       p.Calories AS calories, p.Category AS category
                FROM   OrderDetails od
                JOIN   Products p ON od.ProductID = p.ProductID
                WHERE  od.OrderID = @id
            `);

        /* Lấy lịch sử trạng thái */
        const history = await pool.request()
            .input('id', sql.Int, req.params.id)
            .query(`
                SELECT OldStatus, NewStatus, ChangedAt
                FROM   OrderStatusHistory
                WHERE  OrderID = @id
                ORDER BY ChangedAt ASC
            `);

        res.json({
            success: true,
            data: { ...order, items: items.recordset, statusHistory: history.recordset }
        });
    } catch (err) {
        handleError(res, err, 'Lỗi lấy chi tiết đơn hàng');
    }
});

/* ─────────────────────────────────────────
   POST /api/orders   [customer]
   Body: { items: [{productId, qty, note}], address, timeSlot, payment, voucherCode, note }
───────────────────────────────────────── */
router.post('/', authMiddleware, requireRole(['customer', 'cashier', 'admin']), async (req, res) => {
    const pool = await getPool();
    const transaction = new sql.Transaction(pool);

    try {
        await transaction.begin();

        const { items, address, timeSlot, payment = 'online', voucherCode, note } = req.body;
        const customerId = req.user.id;

        if (!items?.length) {
            return res.status(400).json({ success: false, error: 'Giỏ hàng trống' });
        }

        /* Tính tổng tiền */
        let subTotal = 0;
        const productIds = items.map(i => i.productId);

        const products = await transaction.request()
            .query(`SELECT ProductID, Price, IsAvailable FROM Products WHERE ProductID IN (${productIds.join(',')})`);

        const productMap = {};
        products.recordset.forEach(p => { productMap[p.ProductID] = p; });

        for (const item of items) {
            const p = productMap[item.productId];
            if (!p) throw new Error(`Sản phẩm #${item.productId} không tồn tại`);
            if (!p.IsAvailable) throw new Error(`Sản phẩm #${item.productId} hiện không phục vụ`);
            subTotal += p.Price * item.qty;
        }

        /* Xử lý voucher */
        let voucherId = null;
        let discountAmt = 0;

        if (voucherCode) {
            const vResult = await transaction.request()
                .input('code', sql.NVarChar, voucherCode)
                .query(`SELECT * FROM Vouchers WHERE VoucherCode=@code AND Status='active' AND ExpiryDate >= GETDATE()`);

            if (vResult.recordset.length) {
                const v = vResult.recordset[0];
                if (subTotal >= v.MinOrderValue) {
                    voucherId = v.VoucherID;
                    discountAmt = v.DiscountType === 'percent'
                        ? Math.round(subTotal * v.DiscountValue / 100)
                        : v.DiscountValue;
                }
            }
        }

        const deliveryFee = 25000;
        const totalAmount = subTotal + deliveryFee - discountAmt;

        /* Tạo mã đơn hàng */
        const orderCode = `GB${Date.now().toString().slice(-6)}`;

        /* Insert đơn hàng */
        const orderResult = await transaction.request()
            .input('customerId', sql.Int, customerId)
            .input('orderCode', sql.NVarChar(20), orderCode)
            .input('subTotal', sql.Decimal(12, 0), subTotal)
            .input('deliveryFee', sql.Decimal(12, 0), deliveryFee)
            .input('discountAmt', sql.Decimal(12, 0), discountAmt)
            .input('totalAmount', sql.Decimal(12, 0), totalAmount)
            .input('voucherId', sql.Int, voucherId)
            .input('payment', sql.NVarChar(20), payment)
            .input('address', sql.NVarChar(300), address)
            .input('timeSlot', sql.NVarChar(50), timeSlot || '')
            .input('note', sql.NVarChar(500), note || '')
            .query(`
                INSERT INTO Orders
                    (CustomerID, OrderCode, SubTotal, DeliveryFee, DiscountAmount,
                     TotalAmount, VoucherID, PaymentMethod, DeliveryAddress,
                     DeliveryTimeSlot, Note, Status, CreatedAt, UpdatedAt)
                OUTPUT INSERTED.OrderID
                VALUES
                    (@customerId, @orderCode, @subTotal, @deliveryFee, @discountAmt,
                     @totalAmount, @voucherId, @payment, @address,
                     @timeSlot, @note, 'pending', GETDATE(), GETDATE())
            `);

        const orderId = orderResult.recordset[0].OrderID;

        /* Insert từng sản phẩm trong đơn */
        for (const item of items) {
            const p = productMap[item.productId];
            await transaction.request()
                .input('orderId', sql.Int, orderId)
                .input('productId', sql.Int, item.productId)
                .input('qty', sql.Int, item.qty)
                .input('unitPrice', sql.Decimal(10, 0), p.Price)
                .input('note', sql.NVarChar(200), item.note || '')
                .query(`
                    INSERT INTO OrderDetails (OrderID, ProductID, Quantity, UnitPrice, SpecialRequest)
                    VALUES (@orderId, @productId, @qty, @unitPrice, @note)
                `);
        }

        await transaction.commit();

        res.status(201).json({
            success: true,
            data: { orderId, orderCode, totalAmount },
            message: 'Đặt hàng thành công!'
        });
    } catch (err) {
        await transaction.rollback();
        handleError(res, err, 'Lỗi tạo đơn hàng');
    }
});

/* ─────────────────────────────────────────
   PATCH /api/orders/:id/status   [kitchen/admin]
   Body: { status } — pending → preparing → ready → delivering → completed
───────────────────────────────────────── */
router.patch('/:id/status', authMiddleware, requireRole(['kitchen', 'cashier', 'admin']), async (req, res) => {
    try {
        const { status } = req.body;
        const VALID_STATUSES = ['pending', 'preparing', 'ready', 'delivering', 'completed', 'cancelled'];

        if (!VALID_STATUSES.includes(status)) {
            return res.status(400).json({ success: false, error: 'Trạng thái không hợp lệ' });
        }

        const pool = await getPool();
        await pool.request()
            .input('id', sql.Int, req.params.id)
            .input('status', sql.NVarChar, status)
            .query(`
                UPDATE Orders
                SET    Status    = @status,
                       UpdatedAt = GETDATE()
                WHERE  OrderID   = @id
            `);
        /* Trigger trg_DeductInventory và trg_UpdateLoyaltyPoints
           sẽ tự chạy khi status = 'ready'/'completed' */

        res.json({ success: true, message: `Đã cập nhật trạng thái: ${status}` });
    } catch (err) {
        handleError(res, err, 'Lỗi cập nhật trạng thái đơn');
    }
});

module.exports = router;