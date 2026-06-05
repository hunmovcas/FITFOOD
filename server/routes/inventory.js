/* ============================================================
   INVENTORY.JS - API quản lý kho nguyên liệu
   ============================================================ */

const express = require('express');
const db = require('../db');
const { kitchenOnly } = require('../middleware/roleGuard');

const router = express.Router();

/* --- GET /api/inventory - Lấy danh sách kho --- */
router.get('/', async (req, res) => {
    try {
        if (!db.isConnected) {
            // Trả mock data
            return res.json({
                success: true,
                data: [
                    { id: '#01234', category: 'Rau củ', name: 'Củ cải trắng', qty: 5, unit: 'kg', import_date: '17/05', expiry: '20/05', status: 'warning' },
                    { id: '#01235', category: 'Thịt', name: 'Ức gà', qty: 12, unit: 'kg', import_date: '17/05', expiry: '19/05', status: 'critical' },
                    { id: '#01236', category: 'Rau củ', name: 'Bông cải xanh', qty: 8, unit: 'kg', import_date: '17/05', expiry: '21/05', status: 'ok' },
                ]
            });
        }

        const result = await db.query(`
      SELECT inventory_code AS id, category, name, quantity AS qty, unit,
             FORMAT(import_date, 'dd/MM') AS import_date,
             FORMAT(expiry_date, 'dd/MM') AS expiry,
             expiry_status AS status, stock_status, days_until_expiry, supplier_name
      FROM vw_InventoryStatus
      ORDER BY days_until_expiry ASC, quantity ASC`);

        res.json({ success: true, data: result.recordset });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

/* --- POST /api/inventory - Nhập hàng mới --- */
router.post('/', kitchenOnly, async (req, res) => {
    const { supplier_id, name, category, unit, quantity, import_date, expiry_date, unit_cost } = req.body;

    if (!name || !quantity || !expiry_date) {
        return res.status(400).json({ success: false, message: 'Thiếu thông tin bắt buộc' });
    }

    try {
        const code = `#${String(Date.now()).slice(-5)}`;

        if (db.isConnected) {
            await db.query(`
        INSERT INTO Inventory (inventory_code, supplier_id, name, category, unit, quantity, import_date, expiry_date, unit_cost)
        VALUES (@code, @sup, @name, @cat, @unit, @qty, @imp, @exp, @cost)`,
                {
                    code: { type: db.sql.NVarChar(20), value: code },
                    sup: { type: db.sql.Int, value: supplier_id || null },
                    name: { type: db.sql.NVarChar(200), value: name },
                    cat: { type: db.sql.NVarChar(100), value: category },
                    unit: { type: db.sql.NVarChar(20), value: unit || 'kg' },
                    qty: { type: db.sql.Decimal(10, 2), value: parseFloat(quantity) },
                    imp: { type: db.sql.Date, value: import_date || new Date() },
                    exp: { type: db.sql.Date, value: new Date(expiry_date) },
                    cost: { type: db.sql.Decimal(10, 0), value: unit_cost || null },
                }
            );

            // Ghi log nhập kho
            await db.query(`
        INSERT INTO InventoryLogs (inventory_id, action_type, quantity_change, quantity_after, reason, performed_by)
        SELECT inventory_id, 'import', @qty, @qty, N'Nhập hàng mới', @uid
        FROM Inventory WHERE inventory_code = @code`,
                {
                    qty: { type: db.sql.Decimal(10, 2), value: parseFloat(quantity) },
                    uid: { type: db.sql.Int, value: req.user.user_id },
                    code: { type: db.sql.NVarChar(20), value: code },
                }
            );
        }

        // Thông báo dashboard nếu là mặt hàng đang cần
        if (typeof global.emitToRoom === 'function') {
            global.emitToRoom('admin', 'inventory_updated', { code, name, quantity, unit });
        }

        res.status(201).json({ success: true, message: 'Nhập kho thành công', data: { code, name } });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

/* --- PATCH /api/inventory/:id - Cập nhật số lượng --- */
router.patch('/:id', kitchenOnly, async (req, res) => {
    const { id } = req.params;
    const { quantity, reason } = req.body;

    try {
        if (db.isConnected) {
            await db.query(`
        UPDATE Inventory SET quantity = @qty, updated_at = GETDATE()
        WHERE inventory_code = @code`,
                {
                    qty: { type: db.sql.Decimal(10, 2), value: parseFloat(quantity) },
                    code: { type: db.sql.NVarChar(20), value: id },
                }
            );
        }
        res.json({ success: true, message: 'Cập nhật kho thành công' });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

module.exports = router;