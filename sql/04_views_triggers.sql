-- ============================================================
-- FITFOOD - VIEWS & TRIGGERS
-- ============================================================
USE FitFoodDB;
GO

-- ============================================================
-- VIEW: Tóm tắt đơn hàng đầy đủ thông tin
-- ============================================================
CREATE OR ALTER VIEW vw_OrderSummary AS
SELECT
    O.order_id,
    O.order_code,
    O.order_type,
    O.status,
    U.full_name     AS customer_name,
    U.email         AS customer_email,
    O.delivery_name,
    O.delivery_phone,
    O.delivery_address,
    O.delivery_timeslot,
    O.subtotal,
    O.discount_amount,
    O.total,
    O.payment_method,
    O.payment_status,
    O.voucher_code,
    O.created_at,
    O.delivered_at,
    -- Số món trong đơn
    (SELECT COUNT(*) FROM OrderItems OI WHERE OI.order_id = O.order_id) AS item_count,
    -- Tổng calo đơn hàng
    (SELECT SUM(OI.quantity * OI.calories_snapshot)
     FROM OrderItems OI WHERE OI.order_id = O.order_id) AS total_calories
FROM Orders O
LEFT JOIN Users U ON U.user_id = O.user_id;
GO

-- ============================================================
-- VIEW: Trạng thái kho nguyên liệu + cảnh báo hạn
-- ============================================================
CREATE OR ALTER VIEW vw_InventoryStatus AS
SELECT
    I.*,
    S.name          AS supplier_name,
    DATEDIFF(day, CAST(GETDATE() AS DATE), I.expiry_date) AS days_until_expiry,
    CASE
        WHEN DATEDIFF(day, CAST(GETDATE() AS DATE), I.expiry_date) <= 1 THEN 'critical'
        WHEN DATEDIFF(day, CAST(GETDATE() AS DATE), I.expiry_date) <= 3 THEN 'warning'
        ELSE 'ok'
    END AS expiry_status,
    CASE
        WHEN I.quantity <= 0           THEN 'out_of_stock'
        WHEN I.quantity <= I.min_quantity THEN 'low_stock'
        ELSE 'in_stock'
    END AS stock_status
FROM Inventory I
LEFT JOIN Suppliers S ON S.supplier_id = I.supplier_id;
GO

-- ============================================================
-- VIEW: Dashboard KPI tổng hợp (hôm nay)
-- ============================================================
CREATE OR ALTER VIEW vw_DashboardKPI AS
SELECT
    -- Doanh thu hôm nay
    (SELECT ISNULL(SUM(total), 0) FROM Orders
     WHERE CAST(created_at AS DATE) = CAST(GETDATE() AS DATE)
       AND status != 'cancelled') AS revenue_today,

    -- Số đơn hôm nay
    (SELECT COUNT(*) FROM Orders
     WHERE CAST(created_at AS DATE) = CAST(GETDATE() AS DATE)
       AND status != 'cancelled') AS orders_today,

    -- Số gói đang hoạt động
    (SELECT COUNT(*) FROM Subscriptions
     WHERE status = 'active'
       AND CAST(GETDATE() AS DATE) BETWEEN start_date AND end_date) AS active_subscriptions,

    -- Số nguyên liệu sắp hết hạn (critical)
    (SELECT COUNT(*) FROM vw_InventoryStatus
     WHERE expiry_status = 'critical') AS critical_inventory,

    -- Số nguyên liệu sắp hết kho
    (SELECT COUNT(*) FROM vw_InventoryStatus
     WHERE stock_status = 'low_stock') AS low_stock_items;
GO

-- ============================================================
-- TRIGGER: Tự động khấu trừ kho khi đơn chuyển sang "preparing"
-- Dùng bảng ProductIngredients để biết ĐÚNG nguyên liệu + định lượng
-- thật của từng món, thay vì trừ cố định 1 con số chung cho mọi món
-- ============================================================
CREATE OR ALTER TRIGGER tr_OrderPreparing
ON Orders
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;

    -- Chỉ kích hoạt khi status chuyển sang 'preparing'
    IF NOT EXISTS (
        SELECT 1 FROM inserted i
        JOIN deleted d ON d.order_id = i.order_id
        WHERE i.status = 'preparing' AND d.status != 'preparing'
    ) RETURN;

    -- Ghi log xuất kho: tổng hợp định lượng cần xuất cho từng inventory_id
    -- cụ thể, dựa theo công thức thật của từng món trong ProductIngredients
    INSERT INTO InventoryLogs (inventory_id, order_id, action_type, quantity_change, quantity_after, reason)
    SELECT
        pi.inventory_id,
        i.order_id,
        'export',
        -SUM(oi.quantity * pi.qty_per_portion),
        MAX(inv.quantity) - SUM(oi.quantity * pi.qty_per_portion),
        N'Tự động xuất kho theo định lượng món: đơn ' + i.order_code
    FROM inserted i
    JOIN OrderItems oi          ON oi.order_id = i.order_id
    JOIN ProductIngredients pi  ON pi.product_id = oi.product_id
    JOIN Inventory inv          ON inv.inventory_id = pi.inventory_id
    WHERE i.status = 'preparing'
    GROUP BY pi.inventory_id, i.order_id, i.order_code;

    -- Cập nhật số lượng kho thực tế theo đúng nguyên liệu đã dùng
    UPDATE inv
    SET quantity   = CASE WHEN (inv.quantity - usage.total_used) > 0
                          THEN (inv.quantity - usage.total_used)
                          ELSE 0
                     END,
        updated_at = GETDATE()
    FROM Inventory inv
    JOIN (
        SELECT pi.inventory_id, SUM(oi.quantity * pi.qty_per_portion) AS total_used
        FROM inserted i
        JOIN OrderItems oi         ON oi.order_id = i.order_id
        JOIN ProductIngredients pi ON pi.product_id = oi.product_id
        WHERE i.status = 'preparing'
        GROUP BY pi.inventory_id
    ) usage ON usage.inventory_id = inv.inventory_id;
END;
GO

-- ============================================================
-- TRIGGER: Cảnh báo kho khi số lượng thấp
-- ============================================================
CREATE OR ALTER TRIGGER tr_InventoryLowAlert
ON Inventory
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;

    -- Chèn thông báo khi số lượng tồn về dưới ngưỡng min
    INSERT INTO Notifications (target_role, type, title, message)
    SELECT
        'admin',
        'inventory_alert',
        N'⚠️ Cảnh báo kho nguyên liệu',
        N'Nguyên liệu "' + i.name + N'" còn ' + CAST(i.quantity AS NVARCHAR) + i.unit + N' (dưới mức tối thiểu)'
    FROM inserted i
    JOIN deleted d ON d.inventory_id = i.inventory_id
    WHERE i.quantity <= i.min_quantity
      AND d.quantity > d.min_quantity;  -- Chỉ cảnh báo 1 lần khi vừa xuống ngưỡng
END;
GO

PRINT N'✅ Views và Triggers đã được tạo';
GO