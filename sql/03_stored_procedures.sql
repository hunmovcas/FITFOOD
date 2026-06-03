-- ============================================================
-- GreenBite Platform - Stored Procedures
-- File: 03_stored_procedures.sql
-- ============================================================

USE GreenBiteDB;
GO

-- ============================================================
-- SP 1: TẠO ĐƠN HÀNG MỚI
-- Tự động: tính tổng, trừ kho, cộng điểm thưởng
-- ============================================================
CREATE OR ALTER PROCEDURE sp_CreateOrder
    @customer_id    INT,
    @delivery_name  NVARCHAR(100),
    @delivery_phone NVARCHAR(20),
    @delivery_addr  NVARCHAR(500),
    @delivery_time  NVARCHAR(50)   = NULL,
    @delivery_note  NVARCHAR(500)  = NULL,
    @payment_method NVARCHAR(20)   = N'online',
    @order_source   NVARCHAR(20)   = N'web',
    @voucher_code   NVARCHAR(50)   = NULL,
    @items_json     NVARCHAR(MAX)  = NULL,  -- JSON: [{product_id, quantity, note}]
    @new_order_id   INT OUTPUT
AS
BEGIN
    SET NOCOUNT ON;
    BEGIN TRANSACTION;

    BEGIN TRY
        -- Tạo mã đơn hàng tự động dạng #XXXX
        DECLARE @order_code NVARCHAR(20);
        DECLARE @last_id INT;
        SELECT @last_id = ISNULL(MAX(order_id), 2400) FROM Orders;
        SET @order_code = N'#' + CAST(@last_id + 1 AS NVARCHAR(10));

        -- Tạo đơn hàng (không có items ban đầu)
        INSERT INTO Orders (order_code, customer_id, delivery_name, delivery_phone,
            delivery_addr, delivery_time, delivery_note, payment_method, order_source, voucher_code)
        VALUES (@order_code, @customer_id, @delivery_name, @delivery_phone,
            @delivery_addr, @delivery_time, @delivery_note, @payment_method, @order_source, @voucher_code);

        SET @new_order_id = SCOPE_IDENTITY();

        -- Tính tổng từ bảng OrderItems (sau khi insert items từ ứng dụng)
        -- (Items được insert riêng qua sp_AddOrderItem hoặc bulk insert)

        COMMIT TRANSACTION;
        PRINT N'✅ Tạo đơn hàng ' + @order_code + N' thành công';
    END TRY
    BEGIN CATCH
        ROLLBACK TRANSACTION;
        THROW;
    END CATCH
END;
GO

-- ============================================================
-- SP 2: CẬP NHẬT TRẠNG THÁI ĐƠN HÀNG
-- Tự động trừ kho khi trạng thái chuyển sang 'preparing'
-- ============================================================
CREATE OR ALTER PROCEDURE sp_UpdateOrderStatus
    @order_id   INT,
    @new_status NVARCHAR(30),
    @updated_by INT = NULL
AS
BEGIN
    SET NOCOUNT ON;
    BEGIN TRANSACTION;

    BEGIN TRY
        DECLARE @old_status NVARCHAR(30);
        SELECT @old_status = status FROM Orders WHERE order_id = @order_id;

        IF @old_status IS NULL
        BEGIN
            RAISERROR(N'Không tìm thấy đơn hàng ID %d', 16, 1, @order_id);
            RETURN;
        END

        -- Cập nhật trạng thái
        UPDATE Orders
        SET status = @new_status,
            updated_at = GETDATE(),
            completed_at = CASE WHEN @new_status = N'done' THEN GETDATE() ELSE completed_at END
        WHERE order_id = @order_id;

        -- Khi bắt đầu chế biến → tự động trừ nguyên liệu kho
        IF @old_status = N'confirmed' AND @new_status = N'preparing'
        BEGIN
            -- Trừ kho dựa trên công thức (ProductIngredients)
            INSERT INTO InventoryTransactions (inventory_id, trans_type, quantity, reason, performed_by)
            SELECT
                pi.ingredient_id,
                N'EXPORT',
                -(pi.quantity_used * oi.quantity),   -- Âm = xuất kho
                N'Chế biến đơn #' + o.order_code,
                @updated_by
            FROM OrderItems oi
            INNER JOIN Orders o ON oi.order_id = o.order_id
            INNER JOIN ProductIngredients pi ON oi.product_id = pi.product_id
            WHERE oi.order_id = @order_id;

            -- Cập nhật số lượng thực tế trong kho
            UPDATE inv
            SET inv.current_qty = inv.current_qty - usage.total_used,
                inv.updated_at = GETDATE()
            FROM Inventory inv
            INNER JOIN (
                SELECT pi.ingredient_id, SUM(pi.quantity_used * oi.quantity) AS total_used
                FROM OrderItems oi
                INNER JOIN ProductIngredients pi ON oi.product_id = pi.product_id
                WHERE oi.order_id = @order_id
                GROUP BY pi.ingredient_id
            ) usage ON inv.inventory_id = usage.ingredient_id;
        END

        -- Khi đơn hoàn thành → cộng điểm thưởng cho khách
        IF @new_status = N'done'
        BEGIN
            DECLARE @total DECIMAL(12,0), @customer INT, @points INT;
            SELECT @total = total_amount, @customer = customer_id
            FROM Orders WHERE order_id = @order_id;

            -- 1 điểm mỗi 10.000đ
            SET @points = CAST(@total / 10000 AS INT);

            IF @points > 0
            BEGIN
                -- Cập nhật bảng CustomerProfiles
                UPDATE CustomerProfiles
                SET loyalty_points = loyalty_points + @points
                WHERE user_id = @customer;

                -- Ghi lịch sử điểm
                INSERT INTO LoyaltyTransactions (customer_id, points, reason, order_id)
                VALUES (@customer, @points, N'Mua hàng ' + (SELECT order_code FROM Orders WHERE order_id = @order_id), @order_id);
            END
        END

        COMMIT TRANSACTION;
        PRINT N'✅ Cập nhật trạng thái đơn ' + CAST(@order_id AS VARCHAR) + N' → ' + @new_status;
    END TRY
    BEGIN CATCH
        ROLLBACK TRANSACTION;
        THROW;
    END CATCH
END;
GO

-- ============================================================
-- SP 3: TÍNH TỔNG GIÁ TRỊ ĐƠN HÀNG
-- Gọi sau khi insert xong OrderItems
-- ============================================================
CREATE OR ALTER PROCEDURE sp_RecalculateOrderTotal
    @order_id INT
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @subtotal     DECIMAL(12,0);
    DECLARE @ship_fee     DECIMAL(12,0) = 25000;
    DECLARE @discount     DECIMAL(12,0) = 0;
    DECLARE @total_cal    INT;
    DECLARE @voucher_code NVARCHAR(50);

    -- Tính tạm tính và tổng calo
    SELECT
        @subtotal  = SUM(oi.quantity * oi.unit_price),
        @total_cal = SUM(oi.calories * oi.quantity)
    FROM OrderItems oi
    WHERE oi.order_id = @order_id;

    -- Lấy voucher nếu có
    SELECT @voucher_code = voucher_code FROM Orders WHERE order_id = @order_id;

    IF @voucher_code IS NOT NULL
    BEGIN
        DECLARE @disc_type NVARCHAR(20), @disc_val DECIMAL(12,0), @min_order DECIMAL(12,0);
        SELECT @disc_type = discount_type, @disc_val = discount_val, @min_order = min_order
        FROM Vouchers WHERE code = @voucher_code AND status = N'active';

        IF @subtotal >= @min_order
        BEGIN
            IF @disc_type = N'percent'
                SET @discount = ROUND(@subtotal * @disc_val / 100, 0);
            ELSE
                SET @discount = @disc_val;
        END
    END

    -- Cập nhật đơn hàng
    UPDATE Orders SET
        subtotal        = @subtotal,
        ship_fee        = @ship_fee,
        discount_amount = @discount,
        total_amount    = @subtotal + @ship_fee - @discount,
        total_calories  = ISNULL(@total_cal, 0),
        updated_at      = GETDATE()
    WHERE order_id = @order_id;

    PRINT N'✅ Tính lại tổng đơn ' + CAST(@order_id AS VARCHAR);
END;
GO

-- ============================================================
-- SP 4: KIỂM TRA NGUYÊN LIỆU SẮP HẾT HẠN / SẮP HẾT KHO
-- ============================================================
CREATE OR ALTER PROCEDURE sp_CheckInventoryAlerts
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @today DATE = CAST(GETDATE() AS DATE);

    -- Nguyên liệu sắp hết hạn (trong 2 ngày tới)
    SELECT
        item_code,
        item_name,
        category,
        unit,
        current_qty,
        expiry_date,
        DATEDIFF(DAY, @today, expiry_date) AS days_until_expiry,
        N'⚠️ SẮP HẾT HẠN' AS alert_type
    FROM Inventory
    WHERE expiry_date IS NOT NULL
        AND expiry_date >= @today
        AND DATEDIFF(DAY, @today, expiry_date) <= 2
        AND current_qty > 0

    UNION ALL

    -- Nguyên liệu đã hết hạn
    SELECT
        item_code,
        item_name,
        category,
        unit,
        current_qty,
        expiry_date,
        DATEDIFF(DAY, @today, expiry_date) AS days_until_expiry,
        N'❌ ĐÃ HẾT HẠN' AS alert_type
    FROM Inventory
    WHERE expiry_date IS NOT NULL
        AND expiry_date < @today
        AND current_qty > 0

    UNION ALL

    -- Nguyên liệu dưới mức tối thiểu
    SELECT
        item_code,
        item_name,
        category,
        unit,
        current_qty,
        expiry_date,
        NULL,
        N'🔴 SẮP HẾT KHO' AS alert_type
    FROM Inventory
    WHERE current_qty < min_qty
        AND min_qty > 0

    ORDER BY days_until_expiry;
END;
GO

-- ============================================================
-- SP 5: THỐNG KÊ DOANH THU THEO NGÀY/TUẦN/THÁNG
-- ============================================================
CREATE OR ALTER PROCEDURE sp_RevenueReport
    @period    NVARCHAR(10) = N'day',  -- day, week, month
    @from_date DATE = NULL,
    @to_date   DATE = NULL
AS
BEGIN
    SET NOCOUNT ON;

    -- Mặc định 30 ngày gần nhất
    IF @from_date IS NULL SET @from_date = DATEADD(DAY, -29, CAST(GETDATE() AS DATE));
    IF @to_date   IS NULL SET @to_date   = CAST(GETDATE() AS DATE);

    IF @period = N'day'
    BEGIN
        SELECT
            CAST(created_at AS DATE)    AS report_date,
            COUNT(*)                    AS total_orders,
            SUM(total_amount)           AS total_revenue,
            AVG(total_amount)           AS avg_order_value,
            SUM(total_calories)         AS total_calories_sold,
            SUM(CASE WHEN status = N'done' THEN 1 ELSE 0 END) AS completed_orders,
            SUM(CASE WHEN status = N'cancelled' THEN 1 ELSE 0 END) AS cancelled_orders
        FROM Orders
        WHERE CAST(created_at AS DATE) BETWEEN @from_date AND @to_date
        GROUP BY CAST(created_at AS DATE)
        ORDER BY report_date DESC;
    END
    ELSE IF @period = N'month'
    BEGIN
        SELECT
            FORMAT(created_at, N'yyyy-MM')  AS report_month,
            COUNT(*)                        AS total_orders,
            SUM(total_amount)               AS total_revenue,
            AVG(total_amount)               AS avg_order_value
        FROM Orders
        WHERE CAST(created_at AS DATE) BETWEEN @from_date AND @to_date
            AND status != N'cancelled'
        GROUP BY FORMAT(created_at, N'yyyy-MM')
        ORDER BY report_month DESC;
    END
END;
GO

-- ============================================================
-- SP 6: TOP MÓN ĂN BÁN CHẠY
-- ============================================================
CREATE OR ALTER PROCEDURE sp_TopSellingProducts
    @top_n     INT  = 10,
    @from_date DATE = NULL,
    @to_date   DATE = NULL
AS
BEGIN
    SET NOCOUNT ON;

    IF @from_date IS NULL SET @from_date = DATEADD(DAY, -29, CAST(GETDATE() AS DATE));
    IF @to_date   IS NULL SET @to_date   = CAST(GETDATE() AS DATE);

    SELECT TOP (@top_n)
        p.product_id,
        p.product_name,
        p.emoji,
        p.price,
        p.calories,
        c.category_name,
        SUM(oi.quantity)               AS total_sold,
        SUM(oi.quantity * oi.unit_price) AS total_revenue,
        COUNT(DISTINCT oi.order_id)    AS order_count,
        AVG(CAST(oi.quantity AS FLOAT)) AS avg_qty_per_order
    FROM OrderItems oi
    INNER JOIN Products p ON oi.product_id = p.product_id
    INNER JOIN Categories c ON p.category_id = c.category_id
    INNER JOIN Orders o ON oi.order_id = o.order_id
    WHERE CAST(o.created_at AS DATE) BETWEEN @from_date AND @to_date
        AND o.status != N'cancelled'
    GROUP BY p.product_id, p.product_name, p.emoji, p.price, p.calories, c.category_name
    ORDER BY total_sold DESC;
END;
GO

-- ============================================================
-- SP 7: DỰ BÁO NGUYÊN LIỆU CẦN NHẬP CHO TUẦN TỚI
-- Dựa trên subscription plans đã đăng ký
-- ============================================================
CREATE OR ALTER PROCEDURE sp_ForecastIngredients
    @target_date DATE = NULL
AS
BEGIN
    SET NOCOUNT ON;

    IF @target_date IS NULL SET @target_date = DATEADD(DAY, 7, CAST(GETDATE() AS DATE));

    -- Đếm số gói ăn có lịch giao trong tuần tới
    DECLARE @active_subs INT;
    SELECT @active_subs = COUNT(*)
    FROM CustomerSubscriptions
    WHERE status = N'active'
        AND next_delivery <= @target_date
        AND (end_date IS NULL OR end_date >= CAST(GETDATE() AS DATE));

    -- Dự báo nguyên liệu cần dùng
    SELECT
        inv.item_code,
        inv.item_name,
        inv.unit,
        inv.current_qty                                     AS current_stock,
        inv.min_qty                                         AS min_stock,
        -- Ước tính dùng = trung bình 7 ngày qua * 7
        ISNULL(usage7.daily_avg * 7, 0)                    AS estimated_usage_7d,
        inv.current_qty - ISNULL(usage7.daily_avg * 7, 0) AS projected_remaining,
        CASE
            WHEN inv.current_qty - ISNULL(usage7.daily_avg * 7, 0) < inv.min_qty
            THEN ISNULL(usage7.daily_avg * 7, 0) + inv.min_qty - inv.current_qty
            ELSE 0
        END                                                AS recommended_order_qty
    FROM Inventory inv
    LEFT JOIN (
        SELECT
            inventory_id,
            ABS(SUM(quantity)) / 7.0 AS daily_avg
        FROM InventoryTransactions
        WHERE trans_type = N'EXPORT'
            AND trans_date >= DATEADD(DAY, -7, GETDATE())
        GROUP BY inventory_id
    ) usage7 ON inv.inventory_id = usage7.inventory_id
    ORDER BY recommended_order_qty DESC, inv.item_name;
END;
GO

-- ============================================================
-- SP 8: TỈ LỆ HAO HỤT THỰC PHẨM (FOOD WASTE REPORT)
-- ============================================================
CREATE OR ALTER PROCEDURE sp_FoodWasteReport
    @month INT = NULL,
    @year  INT = NULL
AS
BEGIN
    SET NOCOUNT ON;

    IF @month IS NULL SET @month = MONTH(GETDATE());
    IF @year  IS NULL SET @year  = YEAR(GETDATE());

    SELECT
        inv.item_name,
        inv.category,
        inv.unit,
        -- Tổng nhập trong tháng
        ISNULL(imp.total_imported, 0)   AS total_imported,
        -- Tổng dùng trong tháng
        ISNULL(ABS(exp.total_exported), 0) AS total_used,
        -- Hao hụt = nhập - dùng - tồn cuối kỳ (ước tính)
        ISNULL(imp.total_imported, 0) - ISNULL(ABS(exp.total_exported), 0) AS waste_estimate,
        -- % hao hụt
        CASE WHEN ISNULL(imp.total_imported, 0) > 0
            THEN ROUND(
                (ISNULL(imp.total_imported, 0) - ISNULL(ABS(exp.total_exported), 0))
                / imp.total_imported * 100, 1)
            ELSE 0
        END AS waste_pct
    FROM Inventory inv
    LEFT JOIN (
        SELECT inventory_id, SUM(quantity) AS total_imported
        FROM InventoryTransactions
        WHERE trans_type = N'IMPORT'
            AND MONTH(trans_date) = @month AND YEAR(trans_date) = @year
        GROUP BY inventory_id
    ) imp ON inv.inventory_id = imp.inventory_id
    LEFT JOIN (
        SELECT inventory_id, SUM(quantity) AS total_exported
        FROM InventoryTransactions
        WHERE trans_type = N'EXPORT'
            AND MONTH(trans_date) = @month AND YEAR(trans_date) = @year
        GROUP BY inventory_id
    ) exp ON inv.inventory_id = exp.inventory_id
    WHERE ISNULL(imp.total_imported, 0) > 0
    ORDER BY waste_pct DESC;
END;
GO

-- ============================================================
-- SP 9: DASHBOARD KPI TổNG QUAN
-- ============================================================
CREATE OR ALTER PROCEDURE sp_DashboardKPI
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @today DATE = CAST(GETDATE() AS DATE);
    DECLARE @month_start DATE = DATEFROMPARTS(YEAR(@today), MONTH(@today), 1);

    -- KPI hôm nay
    SELECT
        -- Doanh thu hôm nay
        (SELECT ISNULL(SUM(total_amount),0) FROM Orders
         WHERE CAST(created_at AS DATE) = @today AND status != N'cancelled') AS revenue_today,
        -- Số đơn hôm nay
        (SELECT COUNT(*) FROM Orders WHERE CAST(created_at AS DATE) = @today) AS orders_today,
        -- Đơn đang chờ xử lý
        (SELECT COUNT(*) FROM Orders WHERE status IN (N'pending', N'confirmed')) AS pending_orders,
        -- Đơn đang giao
        (SELECT COUNT(*) FROM Orders WHERE status = N'delivering') AS delivering_orders,
        -- Doanh thu tháng này
        (SELECT ISNULL(SUM(total_amount),0) FROM Orders
         WHERE created_at >= @month_start AND status != N'cancelled') AS revenue_month,
        -- Số khách mới tháng này
        (SELECT COUNT(*) FROM Users u INNER JOIN Roles r ON u.role_id = r.role_id
         WHERE r.role_name = N'customer' AND CAST(u.created_at AS DATE) >= @month_start) AS new_customers_month,
        -- Số gói ăn đang hoạt động
        (SELECT COUNT(*) FROM CustomerSubscriptions WHERE status = N'active') AS active_subscriptions,
        -- Nguyên liệu sắp hết hạn
        (SELECT COUNT(*) FROM Inventory
         WHERE expiry_date IS NOT NULL
           AND DATEDIFF(DAY, @today, expiry_date) <= 2
           AND current_qty > 0) AS expiring_ingredients;
END;
GO

PRINT N'✅ Tất cả Stored Procedures đã được tạo thành công!';
GO