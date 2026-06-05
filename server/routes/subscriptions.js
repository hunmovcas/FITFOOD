/* ============================================================
   SUBSCRIPTIONS.JS - API gói ăn định kỳ
   ============================================================ */

const express = require('express');
const db = require('../db');

const router = express.Router();

/* --- GET /api/subscriptions/plans - Danh sách gói --- */
router.get('/plans', async (req, res) => {
    try {
        if (!db.isConnected) {
            return res.json({
                success: true, data: [
                    { plan_id: 1, name: 'Starter Clean', price_weekly: 490000, price_monthly: 1750000 },
                    { plan_id: 2, name: 'Full Day', price_weekly: 820000, price_monthly: 2950000 },
                    { plan_id: 3, name: 'Total Wellness', price_weekly: 1150000, price_monthly: 4200000 },
                ]
            });
        }
        const result = await db.query(`SELECT * FROM SubscriptionPlans WHERE is_active = 1`);
        res.json({ success: true, data: result.recordset });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

/* --- GET /api/subscriptions/my - Gói hiện tại của user --- */
router.get('/my', async (req, res) => {
    try {
        if (!db.isConnected) return res.json({ success: true, data: null });

        const result = await db.query(`
      SELECT S.*, P.name AS plan_name, P.meals_per_day, P.days_per_week
      FROM Subscriptions S
      JOIN SubscriptionPlans P ON P.plan_id = S.plan_id
      WHERE S.user_id = @uid AND S.status = 'active'
      ORDER BY S.created_at DESC`,
            { uid: { type: db.sql.Int, value: req.user.user_id } }
        );
        res.json({ success: true, data: result.recordset[0] || null });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

/* --- POST /api/subscriptions - Đăng ký gói ăn --- */
router.post('/', async (req, res) => {
    const { plan, period_type = 'weekly', goal, timeslot, address } = req.body;

    if (!plan) {
        return res.status(400).json({ success: false, message: 'Vui lòng chọn gói ăn' });
    }

    try {
        const planMap = { basic: 1, standard: 2, premium: 3 };
        const planId = planMap[plan] || 1;

        const startDate = new Date();
        const endDate = new Date();
        endDate.setDate(endDate.getDate() + (period_type === 'weekly' ? 7 : 30));

        let priceMap = { 1: 490000, 2: 820000, 3: 1150000 };
        if (period_type === 'monthly') priceMap = { 1: 1750000, 2: 2950000, 3: 4200000 };

        if (db.isConnected) {
            // Hủy gói cũ nếu có
            await db.query(`
        UPDATE Subscriptions SET status = 'cancelled'
        WHERE user_id = @uid AND status = 'active'`,
                { uid: { type: db.sql.Int, value: req.user.user_id } }
            );

            await db.query(`
        INSERT INTO Subscriptions (user_id, plan_id, start_date, end_date,
          health_goal, delivery_address, timeslot, status, period_type, total_price)
        VALUES (@uid, @pid, @start, @end, @goal, @addr, @time, 'active', @period, @price)`,
                {
                    uid: { type: db.sql.Int, value: req.user.user_id },
                    pid: { type: db.sql.Int, value: planId },
                    start: { type: db.sql.Date, value: startDate },
                    end: { type: db.sql.Date, value: endDate },
                    goal: { type: db.sql.NVarChar(50), value: goal || 'eat-clean' },
                    addr: { type: db.sql.NVarChar(500), value: address || '' },
                    time: { type: db.sql.NVarChar(50), value: timeslot || '' },
                    period: { type: db.sql.NVarChar(10), value: period_type },
                    price: { type: db.sql.Decimal(10, 0), value: priceMap[planId] },
                }
            );
        }

        res.status(201).json({
            success: true,
            message: 'Đăng ký gói ăn thành công',
            data: { plan_id: planId, start_date: startDate, end_date: endDate, status: 'active' }
        });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

/* --- PATCH /api/subscriptions/:id/pause - Tạm dừng gói --- */
router.patch('/:id/pause', async (req, res) => {
    try {
        if (db.isConnected) {
            await db.query(`
        UPDATE Subscriptions SET status = 'paused'
        WHERE subscription_id = @id AND user_id = @uid`,
                {
                    id: { type: db.sql.Int, value: parseInt(req.params.id) },
                    uid: { type: db.sql.Int, value: req.user.user_id },
                }
            );
        }
        res.json({ success: true, message: 'Đã tạm dừng gói ăn' });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

module.exports = router;