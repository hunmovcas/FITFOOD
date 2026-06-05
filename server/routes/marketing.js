/* ============================================================
   MARKETING.JS - API voucher và chiến dịch
   ============================================================ */

const express = require('express');
const db = require('../db');
const { jwtAuth } = require('../middleware/jwtAuth');
const { adminOnly } = require('../middleware/roleGuard');
const { rateLimiter } = require('../middleware/rateLimiter');

const router = express.Router();

/* --- POST /api/marketing/vouchers/validate - Kiểm tra voucher (public) --- */
router.post('/vouchers/validate',
    rateLimiter({ windowMs: 60000, max: 20, message: 'Thử lại sau 1 phút' }),
    async (req, res) => {
        const { code, total, user_id } = req.body;

        if (!code) {
            return res.status(400).json({ success: false, message: 'Vui lòng nhập mã voucher' });
        }

        try {
            let voucher = null;

            if (db.isConnected) {
                const result = await db.query(`
          SELECT voucher_id, code, discount_type, discount_value, max_discount,
                 min_order, max_uses, used_count, condition_type, expires_at
          FROM Vouchers
          WHERE code = @code AND is_active = 1
            AND (expires_at IS NULL OR expires_at > GETDATE())
            AND (max_uses IS NULL OR used_count < max_uses)`,
                    { code: { type: db.sql.NVarChar(50), value: code.toUpperCase() } }
                );
                voucher = result.recordset[0];
            } else {
                // Mock vouchers
                const mocks = {
                    'HEALTHY20': { discount_type: 'percent', discount_value: 20, min_order: 150000 },
                    'NEWUSER50K': { discount_type: 'fixed', discount_value: 50000, min_order: 200000 },
                };
                voucher = mocks[code.toUpperCase()];
            }

            if (!voucher) {
                return res.status(404).json({ success: false, message: 'Mã voucher không hợp lệ hoặc đã hết hạn' });
            }

            if (total && total < voucher.min_order) {
                return res.status(400).json({
                    success: false,
                    message: `Đơn hàng tối thiểu ${new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(voucher.min_order)} để áp dụng voucher này`
                });
            }

            // Tính số tiền giảm
            let discount = 0;
            if (voucher.discount_type === 'percent') {
                discount = (total || 0) * voucher.discount_value / 100;
                if (voucher.max_discount) discount = Math.min(discount, voucher.max_discount);
            } else {
                discount = voucher.discount_value;
            }

            res.json({
                success: true,
                message: `Áp dụng thành công! Giảm ${voucher.discount_type === 'percent' ? voucher.discount_value + '%' : ''}`,
                discount: Math.round(discount),
                voucher_id: voucher.voucher_id,
            });
        } catch (err) {
            res.status(500).json({ success: false, message: err.message });
        }
    }
);

/* --- GET /api/marketing/vouchers - Danh sách voucher (admin) --- */
router.get('/vouchers', jwtAuth, adminOnly, async (req, res) => {
    try {
        if (!db.isConnected) {
            return res.json({ success: true, data: [] });
        }
        const result = await db.query(`
      SELECT * FROM Vouchers ORDER BY created_at DESC`);
        res.json({ success: true, data: result.recordset });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

/* --- POST /api/marketing/vouchers - Tạo voucher mới --- */
router.post('/vouchers', jwtAuth, adminOnly, async (req, res) => {
    const { code, discount_type, discount_value, min_order, max_uses,
        condition_type, starts_at, expires_at } = req.body;

    if (!code || !discount_type || !discount_value) {
        return res.status(400).json({ success: false, message: 'Thiếu thông tin voucher' });
    }

    try {
        if (db.isConnected) {
            await db.query(`
        INSERT INTO Vouchers (code, discount_type, discount_value, min_order, max_uses,
          condition_type, starts_at, expires_at, created_by)
        VALUES (@code, @type, @val, @min, @max, @cond, @start, @exp, @uid)`,
                {
                    code: { type: db.sql.NVarChar(50), value: code.toUpperCase() },
                    type: { type: db.sql.NVarChar(10), value: discount_type },
                    val: { type: db.sql.Decimal(10, 2), value: parseFloat(discount_value) },
                    min: { type: db.sql.Decimal(10, 0), value: min_order || 0 },
                    max: { type: db.sql.Int, value: max_uses || null },
                    cond: { type: db.sql.NVarChar(30), value: condition_type || 'all' },
                    start: { type: db.sql.DateTime, value: starts_at ? new Date(starts_at) : null },
                    exp: { type: db.sql.DateTime, value: expires_at ? new Date(expires_at) : null },
                    uid: { type: db.sql.Int, value: req.user.user_id },
                }
            );
        }
        res.status(201).json({ success: true, message: `Đã tạo voucher ${code.toUpperCase()}` });
    } catch (err) {
        if (err.number === 2627) {
            return res.status(409).json({ success: false, message: 'Mã voucher đã tồn tại' });
        }
        res.status(500).json({ success: false, message: err.message });
    }
});

module.exports = router;