/* ============================================================
   ORDERS.JS - API quản lý đơn hàng
   ============================================================ */

const express = require('express');
const db = require('../db');
const { requireRole } = require('../middleware/roleGuard');
const { rateLimiter } = require('../middleware/rateLimiter');

const router = express.Router();

/* --- GET /api/orders - Lấy danh sách đơn hàng --- */
router.get('/', async (req, res) => {
    try {
        const { status, limit = 50, type } = req.query;
        const isAdmin = ['admin', 'kitchen'].includes(req.user.role);

        let data;

        if (db.isConnected) {
            const conditions = [];
            const params = {};

            if (!isAdmin) {
                conditions.push('O.user_id = @userId');
                params.userId = { type: db.sql.Int, value: req.user.user_id };
            }

            if (status) {
                const statusList = status.split(',').map(s => s.trim()).filter(Boolean);
                const statusParamNames = statusList.map((s, idx) => {
                    const paramName = `status${idx}`;
                    params[paramName] = { type: db.sql.NVarChar(20), value: s };
                    return `@${paramName}`;
                });
                if (statusParamNames.length > 0) {
                    conditions.push(`O.status IN (${statusParamNames.join(',')})`);
                }
            }

            if (type) {
                conditions.push('O.order_type = @orderType');
                params.orderType = { type: db.sql.NVarChar(10), value: type };
            }

            const safeLimit = Math.min(Math.max(parseInt(limit) || 50, 1), 200);
            const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

            const result = await db.query(`
        SELECT TOP ${safeLimit}
          O.order_id, O.order_code, O.status, O.order_type,
          O.delivery_name, O.delivery_phone, O.delivery_timeslot,
          O.subtotal, O.total, O.payment_method, O.created_at,
          U.full_name AS customer_name
        FROM Orders O
        LEFT JOIN Users U ON U.user_id = O.user_id
        ${whereClause}
        ORDER BY O.created_at DESC`, params);
            data = result.recordset;
        } else {
            // Trả dữ liệu mock khi không có DB
            data = [];
        }

        res.json({ success: true, data, total: data.length });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

/* --- GET /api/orders/my - Đơn hàng của user đang đăng nhập --- */
router.get('/my', async (req, res) => {
    try {
        if (!db.isConnected) {
            return res.json({ success: true, data: [] });
        }

        const result = await db.query(`
      SELECT O.order_id, O.order_code, O.status, O.order_type,
             O.total, O.created_at,
             (SELECT COUNT(*) FROM OrderItems WHERE order_id = O.order_id) AS item_count
      FROM Orders O
      WHERE O.user_id = @uid
      ORDER BY O.created_at DESC`,
            { uid: { type: db.sql.Int, value: req.user.user_id } }
        );

        res.json({ success: true, data: result.recordset });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

/* --- POST /api/orders - Tạo đơn hàng mới --- */
router.post('/', rateLimiter({ windowMs: 60000, max: 10, message: 'Đặt hàng quá nhanh, vui lòng chờ' }), async (req, res) => {
    const { items, delivery, payment_method, voucher_code, type = 'online', notes } = req.body;

    if (!items || items.length === 0) {
        return res.status(400).json({ success: false, message: 'Giỏ hàng trống' });
    }

    try {
        let orderId, orderCode;

        if (db.isConnected) {
            // Gọi stored procedure tạo đơn
            const result = await db.executeProc('sp_CreateOrder', {
                user_id: { type: db.sql.Int, value: req.user.user_id || null },
                order_type: { type: db.sql.NVarChar(10), value: type },
                payment_method: { type: db.sql.NVarChar(20), value: payment_method || 'cod' },
                delivery_name: { type: db.sql.NVarChar(100), value: delivery?.name || null },
                delivery_phone: { type: db.sql.NVarChar(20), value: delivery?.phone || null },
                delivery_address: { type: db.sql.NVarChar(500), value: delivery?.address || null },
                delivery_timeslot: { type: db.sql.NVarChar(50), value: delivery?.timeslot || null },
                voucher_code: { type: db.sql.NVarChar(50), value: voucher_code || null },
                items_json: { type: db.sql.NVarChar(db.sql.MAX), value: JSON.stringify(items) },
                notes: { type: db.sql.NVarChar(500), value: notes || null },
                new_order_id: { type: db.sql.Int, isOutput: true },
            });
            orderId = result.output.new_order_id;
            orderCode = `FF-${orderId}`;
        } else {
            // Mock order
            orderId = Date.now();
            orderCode = `FF-${Date.now().toString().slice(-6)}`;
        }

        // Thông báo realtime cho bếp
        if (typeof global.emitToRoom === 'function') {
            global.emitToRoom('kitchen', 'new_order', {
                id: orderCode, items, type,
                customer: req.user.full_name || 'Khách',
                arrivedAt: Date.now(),
                status: 'pending',
            });
        }

        res.status(201).json({
            success: true,
            message: 'Đặt hàng thành công',
            data: { id: orderCode, order_id: orderId, status: 'pending' }
        });
    } catch (err) {
        console.error('[Create Order Error]', err);
        res.status(500).json({ success: false, message: 'Lỗi tạo đơn hàng' });
    }
});

/* --- PATCH /api/orders/:id/status - Cập nhật trạng thái --- */
router.patch('/:id/status', requireRole('kitchen', 'admin'), async (req, res) => {
    const { id } = req.params;
    const { status } = req.body;

    const validStatuses = ['confirmed', 'preparing', 'ready', 'delivering', 'done', 'cancelled'];
    if (!validStatuses.includes(status)) {
        return res.status(400).json({ success: false, message: 'Trạng thái không hợp lệ' });
    }

    try {
        if (db.isConnected) {
            await db.executeProc('sp_UpdateOrderStatus', {
                order_id: { type: db.sql.Int, value: parseInt(id) || 0 },
                new_status: { type: db.sql.NVarChar(20), value: status },
                updated_by: { type: db.sql.Int, value: req.user.user_id },
            });
        }

        // Thông báo realtime
        if (typeof global.emitToRoom === 'function') {
            global.emitToRoom('customer', 'order_status_update', { id, status });
            global.emitToRoom(`order-${id}`, 'order_status_update', { id, status });
        }

        res.json({ success: true, message: `Đã cập nhật trạng thái: ${status}`, data: { id, status } });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

module.exports = router;