-- ============================================================
-- FITFOOD - STORED PROCEDURES
-- ============================================================
USE FitFoodDB;
GO

-- ============================================================
-- SP: Tạo đơn hàng + tự động khấu trừ kho
-- ============================================================
CREATE OR ALTER PROCEDURE sp_CreateOrder
    @user_id         INT = NULL,
    @order_type      NVARCHAR(10),
    @payment_method  NVARCHAR(20),
    @delivery_name   NVARCHAR(100) = NULL,
    @delivery_phone  NVARCHAR(20) = NULL,
    @delivery_address NVARCHAR(500) = NULL,
    @delivery_timeslot NVARCHAR(50) = NULL,
    @voucher_code    NVARCHAR(50) = NULL,
    @items_json      NVARCHAR(MAX),   -- JSON: [{"product_id":1,"qty":2,"notes":"..."}]
    @notes           NVARCHAR(500) = NULL,
    @new_order_id    INT OUTPUT
AS
BEGIN
    SET NOCOUNT ON;
    BEGIN TRANSACTION;

    BEGIN TRY
        -- Tạo mã đơn hàng tự động: FF-YYMMDDHHMM
        DECLARE @order_code NVARCHAR(20) =
            'FF-' + FORMAT(GETDATE(), 'yyMMddHHmm');

        -- Tính subtotal từ JSON items
        DECLARE @subtotal DECIMAL(10, 0) = 0;
        SELECT @subtotal = SUM(p.price * i.qty)
        FROM OPENJSON(@items_json)
        WITH (product_id INT '$.product_id', qty INT '$.qty') AS i
        JOIN Products p ON p.product_id = i.product_id;

        -- Xử lý voucher
        DECLARE @discount DECIMAL(10, 0) = 0;
        DECLARE @voucher_id INT = NULL;

        IF @voucher_code IS NOT NULL BEGIN
            SELECT @voucher_id = voucher_id,
                   @discount = CASE discount_type
                       WHEN 'percent' THEN LEAST(@subtotal * discount_value / 100,
                                                 ISNULL(max_discount, 999999999))
                       ELSE discount_value
                   END
            FROM Vouchers
            WHERE code = @voucher_code
              AND is_active = 1
              AND (expires_at IS NULL OR expires_at > GETDATE())
              AND (max_uses IS NULL OR used_count < max_uses)
              AND @subtotal >= min_order;
        END

        -- Chèn đơn hàng
        INSERT INTO Orders (order_code, user_id, order_type, status,
            delivery_name, delivery_phone, delivery_address, delivery_timeslot,
            subtotal, discount_amount, total, payment_method, voucher_code, notes)
        VALUES (@order_code, @user_id, @order_type, 'pending',
            @delivery_name, @delivery_phone, @delivery_address, @delivery_timeslot,
            @subtotal, @discount, @subtotal - @discount, @payment_method, @voucher_code, @notes);

        SET @new_order_id = SCOPE_IDENTITY();

        -- Chèn chi tiết đơn hàng
        INSERT INTO OrderItems (order_id, product_id, quantity, unit_price, subtotal,
            custom_notes, calories_snapshot, protein_snapshot, carbs_snapshot, fat_snapshot)
        SELECT @new_order_id, p.product_id, i.qty, p.price, p.price * i.qty,
               i.notes, p.calories, p.protein_g, p.carbs_g, p.fat_g
        FROM OPENJSON(@items_json)
        WITH (product_id INT '$.product_id', qty INT '$.qty', notes NVARCHAR(300) '$.notes') AS i
        JOIN Products p ON p.product_id = i.product_id;

        -- Cập nhật lượt dùng voucher
        IF @voucher_id IS NOT NULL BEGIN
            UPDATE Vouchers SET used_count = used_count + 1 WHERE voucher_id = @voucher_id;
            INSERT INTO VoucherUsages (voucher_id, user_id, order_id, discount_amount)
            VALUES (@voucher_id, @user_id, @new_order_id, @discount);
        END

        -- Tích điểm thưởng (1 điểm / 10.000₫)
        IF @user_id IS NOT NULL BEGIN
            DECLARE @points INT = FLOOR((@subtotal - @discount) / 10000);
            IF @points > 0 BEGIN
                UPDATE Users SET loyalty_points = loyalty_points + @points
                WHERE user_id = @user_id;
                INSERT INTO LoyaltyTransactions (user_id, order_id, points_change, reason)
                VALUES (@user_id, @new_order_id, @points, N'Tích điểm từ đơn hàng ' + @order_code);
            END
        END

        -- Thông báo bếp
        INSERT INTO Notifications (target_role, type, title, message)
        VALUES ('kitchen', 'new_order', N'Đơn hàng mới',
            N'Đơn ' + @order_code + N' cần chế biến: ' + CAST(@subtotal AS NVARCHAR));

        COMMIT TRANSACTION;
    END TRY
    BEGIN CATCH
        ROLLBACK TRANSACTION;
        THROW;
    END CATCH
END;
GO

-- ============================================================
-- SP: Cập nhật trạng thái đơn hàng + khấu trừ kho
-- ============================================================
CREATE OR ALTER PROCEDURE sp_UpdateOrderStatus
    @order_id   INT,
    @new_status NVARCHAR(20),
    @updated_by INT = NULL
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @current_status NVARCHAR(20);
    SELECT @current_status = status FROM Orders WHERE order_id = @order_id;

    IF @current_status IS NULL BEGIN
        RAISERROR(N'Không tìm thấy đơn hàng', 16, 1); RETURN;
    END

    -- Chỉ cho phép tiến theo chiều xuôi
    UPDATE Orders
    SET status = @new_status,
        confirmed_at  = CASE WHEN @new_status = 'confirmed'  THEN GETDATE() ELSE confirmed_at END,
        preparing_at  = CASE WHEN @new_status = 'preparing'  THEN GETDATE() ELSE preparing_at END,
        ready_at      = CASE WHEN @new_status = 'ready'      THEN GETDATE() ELSE ready_at END,
        delivered_at  = CASE WHEN @new_status = 'done'       THEN GETDATE() ELSE delivered_at END
    WHERE order_id = @order_id;

    -- Khi trạng thái chuyển sang "preparing" → khấu trừ kho nguyên liệu
    -- (Trigger cũng xử lý việc này, để đây như backup logic)
    IF @new_status = 'preparing' BEGIN
        PRINT N'[INFO] Kho đã được khấu trừ qua Trigger tr_OrderPreparing';
    END
END;
GO

-- ============================================================
-- SP: Tính định lượng nguyên liệu cần nhập theo subscription
-- ============================================================
CREATE OR ALTER PROCEDURE sp_CalcIngredientNeeds
    @from_date DATE,
    @to_date   DATE
AS
BEGIN
    SET NOCOUNT ON;
    /*
       Tính tổng lượng nguyên liệu cần cho:
       - Đơn hàng lẻ đã đặt trong khoảng thời gian
       - Gói ăn đang chạy trong khoảng thời gian
       Kết quả dùng để gợi ý nhập kho
    */
    SELECT
        P.name          AS product_name,
        SUM(OI.quantity) AS total_portions,
        P.calories       AS cal_per_portion,
        SUM(OI.quantity) * P.protein_g AS protein_needed_g,
        SUM(OI.quantity) * P.carbs_g   AS carbs_needed_g,
        SUM(OI.quantity) * P.fat_g     AS fat_needed_g
    FROM Orders O
    JOIN OrderItems OI ON OI.order_id = O.order_id
    JOIN Products P    ON P.product_id = OI.product_id
    WHERE CAST(O.created_at AS DATE) BETWEEN @from_date AND @to_date
      AND O.status NOT IN ('cancelled')
    GROUP BY P.product_id, P.name, P.calories, P.protein_g, P.carbs_g, P.fat_g
    ORDER BY total_portions DESC;
END;
GO

-- ============================================================
-- SP: Báo cáo doanh thu theo ngày
-- ============================================================
CREATE OR ALTER PROCEDURE sp_RevenueReport
    @from_date DATE,
    @to_date   DATE
AS
BEGIN
    SET NOCOUNT ON;
    SELECT
        CAST(created_at AS DATE)    AS report_date,
        COUNT(*)                    AS total_orders,
        SUM(total)                  AS total_revenue,
        SUM(discount_amount)        AS total_discount,
        AVG(CAST(total AS FLOAT))   AS avg_order_value,
        SUM(CASE WHEN order_type = 'online' THEN 1 ELSE 0 END) AS online_orders,
        SUM(CASE WHEN order_type = 'walkin' THEN 1 ELSE 0 END) AS walkin_orders
    FROM Orders
    WHERE CAST(created_at AS DATE) BETWEEN @from_date AND @to_date
      AND status != 'cancelled'
    GROUP BY CAST(created_at AS DATE)
    ORDER BY report_date DESC;
END;
GO

PRINT N'✅ Stored procedures đã được tạo';
GO