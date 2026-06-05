/* ============================================================
   TRACKING.JS - API vị trí shipper realtime
   ============================================================ */

const express = require('express');
const db = require('../db');

const router = express.Router();

/* --- GET /api/tracking/:orderId - Lấy vị trí shipper của đơn --- */
router.get('/:orderId', async (req, res) => {
    try {
        if (!db.isConnected) {
            return res.json({ success: true, data: null });
        }

        const result = await db.query(`
      SELECT TOP 1 ST.latitude AS lat, ST.longitude AS lng, ST.recorded_at,
             U.full_name AS shipper_name, U.phone AS shipper_phone
      FROM ShipperTracking ST
      JOIN Shippers SH ON SH.shipper_id = ST.shipper_id
      JOIN Users U ON U.user_id = SH.user_id
      WHERE ST.order_id = @oid
      ORDER BY ST.recorded_at DESC`,
            { oid: { type: db.sql.Int, value: parseInt(req.params.orderId) || 0 } }
        );

        res.json({ success: true, data: result.recordset[0] || null });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

/* --- POST /api/tracking/update - Shipper cập nhật vị trí --- */
router.post('/update', async (req, res) => {
    const { order_id, lat, lng } = req.body;

    try {
        if (db.isConnected) {
            // Lấy shipper_id từ user đang đăng nhập
            const shipperResult = await db.query(`
        SELECT shipper_id FROM Shippers WHERE user_id = @uid`,
                { uid: { type: db.sql.Int, value: req.user.user_id } }
            );

            if (shipperResult.recordset[0]) {
                const shipperId = shipperResult.recordset[0].shipper_id;
                await db.query(`
          INSERT INTO ShipperTracking (order_id, shipper_id, latitude, longitude)
          VALUES (@oid, @sid, @lat, @lng);
          UPDATE Shippers SET last_lat = @lat, last_lng = @lng, last_location_at = GETDATE()
          WHERE shipper_id = @sid`,
                    {
                        oid: { type: db.sql.Int, value: parseInt(order_id) },
                        sid: { type: db.sql.Int, value: shipperId },
                        lat: { type: db.sql.Decimal(10, 7), value: parseFloat(lat) },
                        lng: { type: db.sql.Decimal(10, 7), value: parseFloat(lng) },
                    }
                );
            }
        }

        // Broadcast qua WebSocket
        if (typeof global.emitToRoom === 'function') {
            global.emitToRoom(`order-${order_id}`, 'shipper_location', { order_id, lat, lng, timestamp: Date.now() });
        }

        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

module.exports = router;