-- ============================================================
-- FITFOOD DATABASE SCHEMA
-- Cơ sở dữ liệu cho hệ thống quản lý đồ ăn healthy
-- Sử dụng: SQL Server
-- ============================================================

-- Tạo database (chạy riêng nếu cần)
-- CREATE DATABASE FitFoodDB;
-- GO
-- USE FitFoodDB;
-- GO

-- ============================================================
-- BẢNG NGƯỜI DÙNG
-- Lưu thông tin tất cả tài khoản: customer, kitchen, admin
-- ============================================================
CREATE TABLE Users (
    user_id         INT IDENTITY(1,1) PRIMARY KEY,
    email           NVARCHAR(150) NOT NULL UNIQUE,
    password_hash   NVARCHAR(255) NOT NULL,
    full_name       NVARCHAR(100) NOT NULL,
    phone           NVARCHAR(20),
    role            NVARCHAR(20) NOT NULL DEFAULT 'customer'
                    CHECK (role IN ('customer', 'kitchen', 'cashier', 'admin')),
    loyalty_points  INT NOT NULL DEFAULT 0,
    is_active       BIT NOT NULL DEFAULT 1,
    created_at      DATETIME NOT NULL DEFAULT GETDATE(),
    updated_at      DATETIME NOT NULL DEFAULT GETDATE()
);

-- ============================================================
-- BẢNG DANH MỤC MÓN ĂN
-- ============================================================
CREATE TABLE Categories (
    category_id   INT IDENTITY(1,1) PRIMARY KEY,
    name          NVARCHAR(100) NOT NULL,
    slug          NVARCHAR(100) NOT NULL UNIQUE,
    icon          NVARCHAR(10),
    description   NVARCHAR(500),
    display_order INT DEFAULT 0,
    is_active     BIT NOT NULL DEFAULT 1
);

-- ============================================================
-- BẢNG SẢN PHẨM / MÓN ĂN
-- Lưu thực đơn với đầy đủ thông tin dinh dưỡng
-- ============================================================
CREATE TABLE Products (
    product_id    INT IDENTITY(1,1) PRIMARY KEY,
    category_id   INT REFERENCES Categories(category_id),
    name          NVARCHAR(200) NOT NULL,
    description   NVARCHAR(1000),
    price         DECIMAL(10, 0) NOT NULL,       -- Đơn vị: VNĐ
    image_url     NVARCHAR(500),
    -- Thông tin dinh dưỡng (bắt buộc)
    calories      INT NOT NULL DEFAULT 0,         -- kcal
    protein_g     DECIMAL(5, 1) NOT NULL DEFAULT 0,  -- gram
    carbs_g       DECIMAL(5, 1) NOT NULL DEFAULT 0,
    fat_g         DECIMAL(5, 1) NOT NULL DEFAULT 0,
    fiber_g       DECIMAL(5, 1) DEFAULT 0,
    sodium_mg     INT DEFAULT 0,
    -- Tags phân loại sức khoẻ
    health_tags   NVARCHAR(200),     -- JSON array: ["Keto","Low-carb"]
    is_available  BIT NOT NULL DEFAULT 1,
    prep_time_min INT DEFAULT 15,    -- Thời gian chế biến (phút)
    created_at    DATETIME NOT NULL DEFAULT GETDATE(),
    updated_at    DATETIME NOT NULL DEFAULT GETDATE()
);

-- ============================================================
-- BẢNG GÓI ĂN ĐỊNH KỲ (SUBSCRIPTION PLANS)
-- ============================================================
CREATE TABLE SubscriptionPlans (
    plan_id       INT IDENTITY(1,1) PRIMARY KEY,
    name          NVARCHAR(100) NOT NULL,
    description   NVARCHAR(500),
    price_weekly  DECIMAL(10, 0) NOT NULL,   -- Giá theo tuần
    price_monthly DECIMAL(10, 0) NOT NULL,   -- Giá theo tháng
    meals_per_day INT NOT NULL DEFAULT 1,
    days_per_week INT NOT NULL DEFAULT 5,
    is_active     BIT NOT NULL DEFAULT 1
);

-- ============================================================
-- BẢNG ĐĂNG KÝ GÓI ĂN CỦA KHÁCH HÀNG
-- ============================================================
CREATE TABLE Subscriptions (
    subscription_id  INT IDENTITY(1,1) PRIMARY KEY,
    user_id          INT NOT NULL REFERENCES Users(user_id),
    plan_id          INT NOT NULL REFERENCES SubscriptionPlans(plan_id),
    start_date       DATE NOT NULL,
    end_date         DATE NOT NULL,
    health_goal      NVARCHAR(50),  -- eat-clean, keto, low-carb, weight-loss, muscle-gain
    delivery_address NVARCHAR(500) NOT NULL,
    timeslot         NVARCHAR(50),  -- "11:00 - 13:00"
    status           NVARCHAR(20) NOT NULL DEFAULT 'active'
                     CHECK (status IN ('active', 'paused', 'cancelled', 'expired')),
    period_type      NVARCHAR(10) NOT NULL DEFAULT 'weekly'
                     CHECK (period_type IN ('weekly', 'monthly')),
    total_price      DECIMAL(10, 0) NOT NULL,
    created_at       DATETIME NOT NULL DEFAULT GETDATE()
);

-- ============================================================
-- BẢNG ĐỊA CHỈ GIAO HÀNG
-- ============================================================
CREATE TABLE DeliveryAddresses (
    address_id    INT IDENTITY(1,1) PRIMARY KEY,
    user_id       INT NOT NULL REFERENCES Users(user_id),
    label         NVARCHAR(50) DEFAULT N'Nhà',    -- Nhà, Công ty, ...
    receiver_name NVARCHAR(100) NOT NULL,
    phone         NVARCHAR(20) NOT NULL,
    full_address  NVARCHAR(500) NOT NULL,
    district      NVARCHAR(100),
    city          NVARCHAR(100) DEFAULT N'Hồ Chí Minh',
    is_default    BIT DEFAULT 0,
    created_at    DATETIME DEFAULT GETDATE()
);

-- ============================================================
-- BẢNG ĐƠN HÀNG
-- ============================================================
CREATE TABLE Orders (
    order_id        INT IDENTITY(1,1) PRIMARY KEY,
    order_code      NVARCHAR(20) NOT NULL UNIQUE,   -- VD: FF-2401
    user_id         INT REFERENCES Users(user_id),  -- NULL nếu khách vãng lai
    subscription_id INT REFERENCES Subscriptions(subscription_id),
    order_type      NVARCHAR(10) NOT NULL DEFAULT 'online'
                    CHECK (order_type IN ('online', 'walkin')),
    status          NVARCHAR(20) NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending','confirmed','preparing','ready','delivering','done','cancelled')),
    -- Thông tin giao hàng
    delivery_name    NVARCHAR(100),
    delivery_phone   NVARCHAR(20),
    delivery_address NVARCHAR(500),
    delivery_timeslot NVARCHAR(50),
    delivery_note    NVARCHAR(300),
    -- Thanh toán
    subtotal          DECIMAL(10, 0) NOT NULL DEFAULT 0,
    discount_amount   DECIMAL(10, 0) NOT NULL DEFAULT 0,
    total             DECIMAL(10, 0) NOT NULL DEFAULT 0,
    payment_method    NVARCHAR(20) DEFAULT 'cod'
                      CHECK (payment_method IN ('cod','bank','momo','zalopay','cash')),
    payment_status    NVARCHAR(20) DEFAULT 'pending'
                      CHECK (payment_status IN ('pending','paid','refunded')),
    voucher_code      NVARCHAR(50),
    -- Timestamps
    created_at        DATETIME NOT NULL DEFAULT GETDATE(),
    confirmed_at      DATETIME,
    preparing_at      DATETIME,
    ready_at          DATETIME,
    delivered_at      DATETIME,
    notes             NVARCHAR(500)
);

-- ============================================================
-- BẢNG CHI TIẾT ĐƠN HÀNG
-- ============================================================
CREATE TABLE OrderItems (
    item_id       INT IDENTITY(1,1) PRIMARY KEY,
    order_id      INT NOT NULL REFERENCES Orders(order_id) ON DELETE CASCADE,
    product_id    INT NOT NULL REFERENCES Products(product_id),
    quantity      INT NOT NULL DEFAULT 1,
    unit_price    DECIMAL(10, 0) NOT NULL,
    subtotal      DECIMAL(10, 0) NOT NULL,
    custom_notes  NVARCHAR(300),    -- Ghi chú cá nhân hóa: "không hành", "bớt muối"
    -- Snapshot dinh dưỡng tại thời điểm đặt
    calories_snapshot  INT,
    protein_snapshot   DECIMAL(5,1),
    carbs_snapshot     DECIMAL(5,1),
    fat_snapshot       DECIMAL(5,1)
);

-- ============================================================
-- BẢNG NHÀ CUNG CẤP
-- ============================================================
CREATE TABLE Suppliers (
    supplier_id   INT IDENTITY(1,1) PRIMARY KEY,
    name          NVARCHAR(200) NOT NULL,
    contact_name  NVARCHAR(100),
    phone         NVARCHAR(20),
    email         NVARCHAR(150),
    address       NVARCHAR(500),
    category      NVARCHAR(100),   -- Rau củ hữu cơ, Thịt tươi, Hải sản, ...
    notes         NVARCHAR(500),
    is_active     BIT DEFAULT 1,
    created_at    DATETIME DEFAULT GETDATE()
);

-- ============================================================
-- BẢNG KHO NGUYÊN LIỆU
-- ============================================================
CREATE TABLE Inventory (
    inventory_id    INT IDENTITY(1,1) PRIMARY KEY,
    inventory_code  NVARCHAR(20) NOT NULL UNIQUE,   -- VD: #01234
    supplier_id     INT REFERENCES Suppliers(supplier_id),
    name            NVARCHAR(200) NOT NULL,
    category        NVARCHAR(100) NOT NULL,   -- Rau củ, Thịt, Hải sản, ...
    unit            NVARCHAR(20) NOT NULL DEFAULT 'kg',
    quantity        DECIMAL(10, 2) NOT NULL DEFAULT 0,
    min_quantity    DECIMAL(10, 2) DEFAULT 1,   -- Ngưỡng cảnh báo sắp hết
    unit_cost       DECIMAL(10, 0),
    import_date     DATE NOT NULL DEFAULT CAST(GETDATE() AS DATE),
    expiry_date     DATE NOT NULL,
    batch_number    NVARCHAR(50),
    notes           NVARCHAR(300),
    -- Trạng thái tự động tính dựa vào expiry_date
    created_at      DATETIME DEFAULT GETDATE(),
    updated_at      DATETIME DEFAULT GETDATE()
);

-- ============================================================
-- BẢNG LỊCH SỬ NHẬP/XUẤT KHO
-- ============================================================
CREATE TABLE InventoryLogs (
    log_id          INT IDENTITY(1,1) PRIMARY KEY,
    inventory_id    INT NOT NULL REFERENCES Inventory(inventory_id),
    order_id        INT REFERENCES Orders(order_id),
    action_type     NVARCHAR(20) NOT NULL
                    CHECK (action_type IN ('import','export','adjust','waste')),
    quantity_change DECIMAL(10, 2) NOT NULL,   -- Dương: nhập, Âm: xuất
    quantity_after  DECIMAL(10, 2) NOT NULL,
    reason          NVARCHAR(300),
    performed_by    INT REFERENCES Users(user_id),
    created_at      DATETIME DEFAULT GETDATE()
);

-- ============================================================
-- BẢNG LỊCH THỰC ĐƠN
-- ============================================================
CREATE TABLE MenuSchedule (
    schedule_id   INT IDENTITY(1,1) PRIMARY KEY,
    schedule_date DATE NOT NULL,
    product_id    INT NOT NULL REFERENCES Products(product_id),
    meal_type     NVARCHAR(20) NOT NULL
                  CHECK (meal_type IN ('breakfast','lunch','dinner','snack')),
    max_quantity  INT DEFAULT 100,   -- Giới hạn số lượng có thể bán trong ngày
    is_available  BIT DEFAULT 1,
    created_by    INT REFERENCES Users(user_id),
    created_at    DATETIME DEFAULT GETDATE(),
    UNIQUE (schedule_date, product_id, meal_type)
);

-- ============================================================
-- BẢNG VOUCHER / MÃ GIẢM GIÁ
-- ============================================================
CREATE TABLE Vouchers (
    voucher_id    INT IDENTITY(1,1) PRIMARY KEY,
    code          NVARCHAR(50) NOT NULL UNIQUE,
    discount_type NVARCHAR(10) NOT NULL CHECK (discount_type IN ('percent','fixed')),
    discount_value DECIMAL(10, 2) NOT NULL,
    max_discount  DECIMAL(10, 0),    -- Giới hạn số tiền giảm tối đa (cho percent)
    min_order     DECIMAL(10, 0) DEFAULT 0,
    max_uses      INT,
    used_count    INT NOT NULL DEFAULT 0,
    condition_type NVARCHAR(30) DEFAULT 'all'
                  CHECK (condition_type IN ('all','new_user','subscription','first_order')),
    starts_at     DATETIME,
    expires_at    DATETIME,
    is_active     BIT DEFAULT 1,
    created_by    INT REFERENCES Users(user_id),
    created_at    DATETIME DEFAULT GETDATE()
);

-- ============================================================
-- BẢNG LỊCH SỬ SỬ DỤNG VOUCHER
-- ============================================================
CREATE TABLE VoucherUsages (
    usage_id    INT IDENTITY(1,1) PRIMARY KEY,
    voucher_id  INT NOT NULL REFERENCES Vouchers(voucher_id),
    user_id     INT REFERENCES Users(user_id),
    order_id    INT NOT NULL REFERENCES Orders(order_id),
    discount_amount DECIMAL(10, 0) NOT NULL,
    used_at     DATETIME DEFAULT GETDATE()
);

-- ============================================================
-- BẢNG SHIPPER VÀ TRACKING
-- ============================================================
CREATE TABLE Shippers (
    shipper_id  INT IDENTITY(1,1) PRIMARY KEY,
    user_id     INT NOT NULL REFERENCES Users(user_id),
    vehicle     NVARCHAR(50),
    plate_number NVARCHAR(20),
    is_online   BIT DEFAULT 0,
    last_lat    DECIMAL(10, 7),
    last_lng    DECIMAL(10, 7),
    last_location_at DATETIME
);

CREATE TABLE ShipperTracking (
    tracking_id INT IDENTITY(1,1) PRIMARY KEY,
    order_id    INT NOT NULL REFERENCES Orders(order_id),
    shipper_id  INT NOT NULL REFERENCES Shippers(shipper_id),
    latitude    DECIMAL(10, 7) NOT NULL,
    longitude   DECIMAL(10, 7) NOT NULL,
    recorded_at DATETIME DEFAULT GETDATE()
);

-- ============================================================
-- BẢNG ĐIỂM THƯỞNG
-- ============================================================
CREATE TABLE LoyaltyTransactions (
    trans_id      INT IDENTITY(1,1) PRIMARY KEY,
    user_id       INT NOT NULL REFERENCES Users(user_id),
    order_id      INT REFERENCES Orders(order_id),
    points_change INT NOT NULL,   -- Dương: tích lũy, Âm: sử dụng
    reason        NVARCHAR(200),
    created_at    DATETIME DEFAULT GETDATE()
);

-- ============================================================
-- BẢNG THÔNG BÁO HỆ THỐNG
-- ============================================================
CREATE TABLE Notifications (
    notif_id      INT IDENTITY(1,1) PRIMARY KEY,
    target_role   NVARCHAR(20),    -- kitchen, admin, customer
    target_user   INT REFERENCES Users(user_id),
    type          NVARCHAR(50),    -- new_order, inventory_alert, expiry_warning
    title         NVARCHAR(200),
    message       NVARCHAR(1000),
    is_read       BIT DEFAULT 0,
    created_at    DATETIME DEFAULT GETDATE()
);

PRINT N'✅ Schema FitFood đã được tạo thành công';
GO