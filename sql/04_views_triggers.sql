-- ============================================================
-- 04_views_triggers.sql
-- GreenBite — Views, Triggers, Indexes nâng cao
-- Database: SQL Server (T-SQL)
-- Mô tả: Tạo các VIEW phục vụ báo cáo, TRIGGER tự động
--        khấu trừ kho & đồng bộ dữ liệu, INDEX tối ưu truy vấn
-- ============================================================

USE GreenBiteDB;
GO

-- ============================================================
-- SECTION 1: VIEWS — Phục vụ báo cáo & dashboard
-- ============================================================

-- ------------------------------------------------------------
-- VIEW 1: vw_DailyRevenue
-- Doanh thu theo từng ngày, tổng đơn, tổng calo bán ra
-- Dùng cho: Admin Dashboard → biểu đồ doanh thu 7/30 ngày
-- ------------------------------------------------------------
CREATE OR ALTER VIEW vw_DailyRevenue AS
SELECT
    CAST(o.CreatedAt AS DATE)           AS RevenueDate,
    COUNT(o.OrderID)                     AS TotalOrders,
    SUM(o.TotalAmount)                   AS TotalRevenue,
    SUM(o.TotalAmount - o.DeliveryFee)   AS FoodRevenue,
    SUM(o.DeliveryFee)                   AS DeliveryRevenue,
    AVG(o.TotalAmount)                   AS AvgOrderValue,
    SUM(
        SELECT ISNULL(SUM(p.Calories * od.Quantity), 0)
        FROM   OrderDetails od
        JOIN   Products p ON od.ProductID = p.ProductID
        WHERE  od.OrderID = o.OrderID
    )                                    AS TotalCaloriesSold,
    COUNT(CASE WHEN o.PaymentMethod = 'online'  THEN 1 END) AS OnlinePayments,
    COUNT(CASE WHEN o.PaymentMethod = 'cash'    THEN 1 END) AS CashPayments
FROM   Orders o
WHERE  o.Status NOT IN ('cancelled')
GROUP BY CAST(o.CreatedAt AS DATE);
GO

-- ------------------------------------------------------------
-- VIEW 2: vw_ProductSalesRanking
-- Xếp hạng món ăn theo doanh số, phục vụ báo cáo top món
-- Dùng cho: Admin Reports → bảng Top 10 món bán chạy
-- ------------------------------------------------------------
CREATE OR ALTER VIEW vw_ProductSalesRanking AS
SELECT
    p.ProductID,
    p.ProductName,
    p.Category,
    p.Emoji,
    p.Calories,
    p.Price,
    ISNULL(SUM(od.Quantity), 0)                             AS TotalSold,
    ISNULL(SUM(od.Quantity * od.UnitPrice), 0)              AS TotalRevenue,
    ISNULL(AVG(CAST(r.Rating AS FLOAT)), 0)                 AS AvgRating,
    COUNT(DISTINCT r.ReviewID)                              AS ReviewCount,
    RANK() OVER (ORDER BY SUM(od.Quantity) DESC)            AS SalesRank
FROM   Products p
LEFT JOIN OrderDetails  od ON p.ProductID = od.ProductID
LEFT JOIN Orders         o ON od.OrderID   = o.OrderID AND o.Status = 'completed'
LEFT JOIN Reviews        r ON p.ProductID  = r.ProductID
GROUP BY p.ProductID, p.ProductName, p.Category, p.Emoji, p.Calories, p.Price;
GO

-- ------------------------------------------------------------
-- VIEW 3: vw_InventoryAlert
-- Danh sách nguyên liệu cần chú ý: sắp hết hoặc sắp hết hạn
-- Dùng cho: Kitchen Inventory → cột cảnh báo màu đỏ/cam
-- ------------------------------------------------------------
CREATE OR ALTER VIEW vw_InventoryAlert AS
SELECT
    i.InventoryID,
    i.ItemName,
    i.Category,
    i.Unit,
    i.CurrentQty,
    i.MinQty,
    i.ExpiryDate,
    i.CostPerUnit,
    s.SupplierName,
    s.ContactPhone,
    -- Mức tồn kho (%)
    CASE
        WHEN i.MinQty = 0 THEN 100
        ELSE CAST(i.CurrentQty * 100.0 / (i.MinQty * 3) AS INT)
    END                                                     AS StockPercent,
    -- Cảnh báo tồn kho
    CASE
        WHEN i.CurrentQty = 0          THEN 'out'
        WHEN i.CurrentQty < i.MinQty   THEN 'critical'
        WHEN i.CurrentQty < i.MinQty*2 THEN 'low'
        ELSE                                'ok'
    END                                                     AS StockStatus,
    -- Cảnh báo hạn sử dụng (tính từ hôm nay)
    DATEDIFF(DAY, GETDATE(), i.ExpiryDate)                  AS DaysUntilExpiry,
    CASE
        WHEN DATEDIFF(DAY, GETDATE(), i.ExpiryDate) < 0  THEN 'expired'
        WHEN DATEDIFF(DAY, GETDATE(), i.ExpiryDate) <= 1 THEN 'expiring_today'
        WHEN DATEDIFF(DAY, GETDATE(), i.ExpiryDate) <= 3 THEN 'expiring_soon'
        ELSE                                                   'ok'
    END                                                     AS ExpiryStatus
FROM   Inventory i
LEFT JOIN Suppliers s ON i.SupplierID = s.SupplierID;
GO

-- ------------------------------------------------------------
-- VIEW 4: vw_CustomerStats
-- Thống kê hành vi từng khách hàng: tổng đơn, calo, điểm
-- Dùng cho: Admin → phân tích retention, CRM
-- ------------------------------------------------------------
CREATE OR ALTER VIEW vw_CustomerStats AS
SELECT
    u.UserID,
    u.FullName,
    u.Email,
    u.LoyaltyPoints,
    u.CreatedAt                                                     AS MemberSince,
    COUNT(DISTINCT o.OrderID)                                       AS TotalOrders,
    ISNULL(SUM(o.TotalAmount), 0)                                   AS TotalSpent,
    ISNULL(AVG(o.TotalAmount), 0)                                   AS AvgOrderValue,
    ISNULL(SUM(
        SELECT SUM(p.Calories * od2.Quantity)
        FROM   OrderDetails od2
        JOIN   Products p ON od2.ProductID = p.ProductID
        WHERE  od2.OrderID = o.OrderID
    ), 0)                                                           AS TotalCaloriesConsumed,
    MAX(o.CreatedAt)                                                AS LastOrderDate,
    DATEDIFF(DAY, MAX(o.CreatedAt), GETDATE())                      AS DaysSinceLastOrder,
    -- Phân loại hội viên
    CASE
        WHEN COUNT(DISTINCT o.OrderID) >= 20  THEN 'platinum'
        WHEN COUNT(DISTINCT o.OrderID) >= 10  THEN 'gold'
        WHEN COUNT(DISTINCT o.OrderID) >= 5   THEN 'silver'
        ELSE                                       'bronze'
    END                                                             AS MemberTier
FROM   Users u
LEFT JOIN Orders o ON u.UserID = o.CustomerID AND o.Status = 'completed'
WHERE  u.Role = 'customer'
GROUP BY u.UserID, u.FullName, u.Email, u.LoyaltyPoints, u.CreatedAt;
GO

-- ------------------------------------------------------------
-- VIEW 5: vw_FoodWasteReport
-- Tỉ lệ hao hụt nguyên liệu theo danh mục
-- Dùng cho: Admin Reports → biểu đồ Food Waste
-- ------------------------------------------------------------
CREATE OR ALTER VIEW vw_FoodWasteReport AS
SELECT
    w.WasteDate,
    w.Category,
    w.ItemName,
    w.WasteQty,
    w.Unit,
    w.Reason,
    i.CostPerUnit,
    w.WasteQty * i.CostPerUnit                              AS WasteCost,
    -- Tỉ lệ hao hụt so với nhập kho trong ngày
    CASE
        WHEN ISNULL(tr.TotalReceived, 0) = 0 THEN 0
        ELSE CAST(w.WasteQty * 100.0 / tr.TotalReceived AS DECIMAL(5,2))
    END                                                     AS WastePercent
FROM   WasteLog w
JOIN   Inventory i ON w.InventoryID = i.InventoryID
LEFT JOIN (
    SELECT InventoryID, CAST(TransactionDate AS DATE) AS TxDate,
           SUM(CASE WHEN TxType='in' THEN Quantity ELSE 0 END) AS TotalReceived
    FROM   InventoryTransactions
    GROUP BY InventoryID, CAST(TransactionDate AS DATE)
) tr ON w.InventoryID = tr.InventoryID AND w.WasteDate = tr.TxDate;
GO

-- ------------------------------------------------------------
-- VIEW 6: vw_SubscriptionStatus
-- Trạng thái các gói ăn đăng ký còn hiệu lực
-- Dùng cho: Admin → quản lý subscription, tính toán nguyên liệu
-- ------------------------------------------------------------
CREATE OR ALTER VIEW vw_SubscriptionStatus AS
SELECT
    sp.SubPlanID,
    u.FullName        AS CustomerName,
    u.Email,
    u.Phone,
    sp.PlanType,
    sp.DaysPerWeek,
    sp.MealsPerDay,
    sp.StartDate,
    sp.EndDate,
    sp.DeliveryAddress,
    sp.DeliveryTimeSlot,
    sp.Status,
    DATEDIFF(DAY, GETDATE(), sp.EndDate)                    AS DaysRemaining,
    -- Tính tổng bữa còn lại
    DATEDIFF(DAY, GETDATE(), sp.EndDate) / 7 * sp.DaysPerWeek * sp.MealsPerDay
                                                            AS MealsRemaining,
    sp.WeeklyPrice,
    -- Cảnh báo gia hạn
    CASE
        WHEN DATEDIFF(DAY, GETDATE(), sp.EndDate) <= 3  THEN 'expiring_soon'
        WHEN DATEDIFF(DAY, GETDATE(), sp.EndDate) <= 0  THEN 'expired'
        ELSE                                                  'active'
    END                                                     AS RenewalAlert
FROM   SubscriptionPlans sp
JOIN   Users u ON sp.CustomerID = u.UserID
WHERE  sp.Status = 'active';
GO

-- ------------------------------------------------------------
-- VIEW 7: vw_WeeklyMenuIngredients
-- Tổng nguyên liệu cần chuẩn bị cho thực đơn tuần tới
-- Dùng cho: Admin → lên kế hoạch nhập hàng
-- ------------------------------------------------------------
CREATE OR ALTER VIEW vw_WeeklyMenuIngredients AS
SELECT
    ri.InventoryID,
    i.ItemName,
    i.Unit,
    SUM(ri.QtyRequired * sp_count.ActiveSubCount)           AS TotalQtyNeeded,
    i.CurrentQty                                            AS CurrentStock,
    GREATEST(0, SUM(ri.QtyRequired * sp_count.ActiveSubCount) - i.CurrentQty)
                                                            AS QtyToOrder,
    i.CostPerUnit,
    GREATEST(0, SUM(ri.QtyRequired * sp_count.ActiveSubCount) - i.CurrentQty)
        * i.CostPerUnit                                     AS EstimatedCost
FROM   RecipeIngredients ri
JOIN   Inventory i ON ri.InventoryID = i.InventoryID
JOIN   WeeklyMenu wm ON ri.ProductID = wm.ProductID
CROSS JOIN (
    SELECT COUNT(*) AS ActiveSubCount
    FROM   SubscriptionPlans WHERE Status = 'active'
) sp_count
WHERE  wm.MenuDate BETWEEN GETDATE() AND DATEADD(DAY, 7, GETDATE())
GROUP BY ri.InventoryID, i.ItemName, i.Unit, i.CurrentQty, i.CostPerUnit;
GO


-- ============================================================
-- SECTION 2: TRIGGERS — Tự động hóa nghiệp vụ
-- ============================================================

-- ------------------------------------------------------------
-- TRIGGER 1: trg_DeductInventory
-- Tự động khấu trừ kho nguyên liệu khi đơn hàng được xác nhận
-- hoàn thành chế biến (status = 'ready' hoặc 'completed')
-- ------------------------------------------------------------
CREATE OR ALTER TRIGGER trg_DeductInventory
ON Orders
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;

    -- Chỉ xử lý khi status chuyển sang 'ready' hoặc 'completed'
    IF NOT EXISTS (
        SELECT 1 FROM inserted i
        JOIN deleted d ON i.OrderID = d.OrderID
        WHERE i.Status IN ('ready','completed')
          AND d.Status NOT IN ('ready','completed')
    ) RETURN;

    -- Khấu trừ từng nguyên liệu theo công thức
    UPDATE inv
    SET    inv.CurrentQty = inv.CurrentQty
               - (ri.QtyRequired * od.Quantity),
           inv.UpdatedAt  = GETDATE()
    FROM   Inventory inv
    JOIN   RecipeIngredients ri ON inv.InventoryID = ri.InventoryID
    JOIN   OrderDetails      od ON ri.ProductID    = od.ProductID
    JOIN   inserted           i ON od.OrderID       = i.OrderID
    JOIN   deleted            d ON i.OrderID         = d.OrderID
    WHERE  i.Status IN ('ready','completed')
      AND  d.Status NOT IN ('ready','completed');

    -- Ghi log giao dịch kho
    INSERT INTO InventoryTransactions
        (InventoryID, TxType, Quantity, Reason, OrderID, TransactionDate)
    SELECT
        ri.InventoryID,
        'out',
        ri.QtyRequired * od.Quantity,
        CONCAT('Chế biến đơn hàng #', i.OrderID),
        i.OrderID,
        GETDATE()
    FROM   RecipeIngredients ri
    JOIN   OrderDetails      od ON ri.ProductID = od.ProductID
    JOIN   inserted           i ON od.OrderID    = i.OrderID
    JOIN   deleted            d ON i.OrderID      = d.OrderID
    WHERE  i.Status IN ('ready','completed')
      AND  d.Status NOT IN ('ready','completed');

    -- Cảnh báo nguyên liệu sắp hết
    INSERT INTO InventoryAlerts (InventoryID, AlertType, CreatedAt)
    SELECT inv.InventoryID, 'low_stock', GETDATE()
    FROM   Inventory inv
    WHERE  inv.CurrentQty < inv.MinQty
      AND  NOT EXISTS (
               SELECT 1 FROM InventoryAlerts a
               WHERE  a.InventoryID = inv.InventoryID
                 AND  a.AlertType   = 'low_stock'
                 AND  a.IsResolved  = 0
           );
END;
GO

-- ------------------------------------------------------------
-- TRIGGER 2: trg_UpdateLoyaltyPoints
-- Cộng điểm thưởng cho khách sau khi đơn hoàn thành
-- Quy tắc: 10.000đ = 1 điểm
-- ------------------------------------------------------------
CREATE OR ALTER TRIGGER trg_UpdateLoyaltyPoints
ON Orders
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;

    -- Chỉ xử lý khi status chuyển sang 'completed'
    IF NOT EXISTS (
        SELECT 1 FROM inserted i JOIN deleted d ON i.OrderID = d.OrderID
        WHERE i.Status = 'completed' AND d.Status <> 'completed'
    ) RETURN;

    -- Tính điểm thưởng: 10.000đ = 1 điểm (làm tròn xuống)
    UPDATE u
    SET    u.LoyaltyPoints = u.LoyaltyPoints
               + FLOOR(i.TotalAmount / 10000),
           u.UpdatedAt     = GETDATE()
    FROM   Users u
    JOIN   inserted i ON u.UserID = i.CustomerID
    JOIN   deleted  d ON i.OrderID = d.OrderID
    WHERE  i.Status = 'completed'
      AND  d.Status <> 'completed';

    -- Ghi log điểm thưởng
    INSERT INTO LoyaltyPointsLog
        (UserID, Points, Reason, OrderID, CreatedAt)
    SELECT
        i.CustomerID,
        FLOOR(i.TotalAmount / 10000),
        CONCAT('Hoàn thành đơn hàng #', i.OrderID),
        i.OrderID,
        GETDATE()
    FROM   inserted i
    JOIN   deleted  d ON i.OrderID = d.OrderID
    WHERE  i.Status = 'completed'
      AND  d.Status <> 'completed';
END;
GO

-- ------------------------------------------------------------
-- TRIGGER 3: trg_OrderStatusLog
-- Ghi lịch sử thay đổi trạng thái đơn hàng để tracking
-- ------------------------------------------------------------
CREATE OR ALTER TRIGGER trg_OrderStatusLog
ON Orders
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;

    INSERT INTO OrderStatusHistory
        (OrderID, OldStatus, NewStatus, ChangedAt, ChangedBy)
    SELECT
        i.OrderID,
        d.Status,
        i.Status,
        GETDATE(),
        SYSTEM_USER
    FROM   inserted i
    JOIN   deleted  d ON i.OrderID = d.OrderID
    WHERE  i.Status <> d.Status;
END;
GO

-- ------------------------------------------------------------
-- TRIGGER 4: trg_AutoCalcOrderTotal
-- Tự động tính lại tổng tiền khi thêm/sửa OrderDetails
-- ------------------------------------------------------------
CREATE OR ALTER TRIGGER trg_AutoCalcOrderTotal
ON OrderDetails
AFTER INSERT, UPDATE, DELETE
AS
BEGIN
    SET NOCOUNT ON;

    -- Lấy tập hợp các OrderID bị ảnh hưởng
    DECLARE @AffectedOrders TABLE (OrderID INT);
    INSERT INTO @AffectedOrders
    SELECT DISTINCT OrderID FROM inserted
    UNION
    SELECT DISTINCT OrderID FROM deleted;

    -- Cập nhật lại tổng tiền
    UPDATE o
    SET    o.SubTotal    = agg.NewSubTotal,
           o.TotalAmount = agg.NewSubTotal + o.DeliveryFee - ISNULL(o.DiscountAmount, 0),
           o.UpdatedAt   = GETDATE()
    FROM   Orders o
    JOIN (
        SELECT OrderID, SUM(Quantity * UnitPrice) AS NewSubTotal
        FROM   OrderDetails
        GROUP BY OrderID
    ) agg ON o.OrderID = agg.OrderID
    WHERE  o.OrderID IN (SELECT OrderID FROM @AffectedOrders);
END;
GO

-- ------------------------------------------------------------
-- TRIGGER 5: trg_CheckExpiryOnReceive
-- Kiểm tra hạn sử dụng khi nhập nguyên liệu vào kho
-- Từ chối nhập nếu hạn sử dụng <= ngày hôm nay
-- ------------------------------------------------------------
CREATE OR ALTER TRIGGER trg_CheckExpiryOnReceive
ON InventoryTransactions
INSTEAD OF INSERT
AS
BEGIN
    SET NOCOUNT ON;

    -- Kiểm tra các mục nhập (TxType = 'in') có hạn sử dụng hợp lệ
    IF EXISTS (
        SELECT 1
        FROM   inserted  ins
        JOIN   Inventory inv ON ins.InventoryID = inv.InventoryID
        WHERE  ins.TxType    = 'in'
          AND  inv.ExpiryDate IS NOT NULL
          AND  inv.ExpiryDate <= CAST(GETDATE() AS DATE)
    )
    BEGIN
        RAISERROR('Không thể nhập nguyên liệu đã hết hạn sử dụng!', 16, 1);
        RETURN;
    END;

    -- Nếu hợp lệ, thực hiện INSERT bình thường
    INSERT INTO InventoryTransactions
        (InventoryID, TxType, Quantity, Reason, OrderID, TransactionDate, CreatedBy)
    SELECT InventoryID, TxType, Quantity, Reason, OrderID, TransactionDate, CreatedBy
    FROM   inserted;

    -- Cập nhật CurrentQty trong Inventory
    UPDATE inv
    SET    inv.CurrentQty = inv.CurrentQty +
               CASE ins.TxType
                   WHEN 'in'     THEN  ins.Quantity
                   WHEN 'out'    THEN -ins.Quantity
                   WHEN 'adjust' THEN  ins.Quantity   -- có thể âm
                   ELSE 0
               END,
           inv.UpdatedAt = GETDATE()
    FROM   Inventory inv
    JOIN   inserted  ins ON inv.InventoryID = ins.InventoryID;
END;
GO

-- ------------------------------------------------------------
-- TRIGGER 6: trg_VoucherUsageCount
-- Tăng số lần dùng voucher mỗi khi áp dụng thành công
-- Vô hiệu hoá voucher nếu đã đạt giới hạn
-- ------------------------------------------------------------
CREATE OR ALTER TRIGGER trg_VoucherUsageCount
ON Orders
AFTER INSERT
AS
BEGIN
    SET NOCOUNT ON;

    -- Tăng UsedCount
    UPDATE v
    SET    v.UsedCount = v.UsedCount + 1,
           v.UpdatedAt  = GETDATE()
    FROM   Vouchers v
    JOIN   inserted i ON v.VoucherID = i.VoucherID
    WHERE  i.VoucherID IS NOT NULL;

    -- Vô hiệu hoá voucher nếu đã đạt giới hạn
    UPDATE Vouchers
    SET    Status    = 'inactive',
           UpdatedAt = GETDATE()
    WHERE  UsedCount >= UsageLimit
      AND  UsageLimit > 0
      AND  Status = 'active';
END;
GO


-- ============================================================
-- SECTION 3: INDEXES — Tối ưu hiệu năng truy vấn
-- ============================================================

-- Index trên cột hay dùng trong WHERE/JOIN
CREATE NONCLUSTERED INDEX IX_Orders_CustomerID_Status
    ON Orders (CustomerID, Status)
    INCLUDE (TotalAmount, CreatedAt);

CREATE NONCLUSTERED INDEX IX_Orders_CreatedAt
    ON Orders (CreatedAt DESC)
    INCLUDE (Status, TotalAmount);

CREATE NONCLUSTERED INDEX IX_OrderDetails_ProductID
    ON OrderDetails (ProductID)
    INCLUDE (Quantity, UnitPrice);

CREATE NONCLUSTERED INDEX IX_Inventory_ExpiryDate
    ON Inventory (ExpiryDate)
    WHERE ExpiryDate IS NOT NULL;

CREATE NONCLUSTERED INDEX IX_Inventory_Category_Stock
    ON Inventory (Category, CurrentQty)
    INCLUDE (ItemName, MinQty);

CREATE NONCLUSTERED INDEX IX_Products_Category_Available
    ON Products (Category, IsAvailable)
    INCLUDE (ProductName, Price, Calories);

CREATE NONCLUSTERED INDEX IX_SubscriptionPlans_Status_EndDate
    ON SubscriptionPlans (Status, EndDate)
    INCLUDE (CustomerID, DaysPerWeek, MealsPerDay);

CREATE NONCLUSTERED INDEX IX_Users_Email
    ON Users (Email)
    INCLUDE (FullName, Role, LoyaltyPoints);
GO

PRINT '✅ Views, Triggers và Indexes đã được tạo thành công!';
GO