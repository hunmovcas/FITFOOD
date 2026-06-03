-- ============================================================
-- GreenBite Platform - Cơ sở dữ liệu SQL Server
-- File: 01_schema.sql - Tạo cấu trúc bảng
-- Môn: Cơ sở dữ liệu
-- ============================================================

USE master;
GO

-- Tạo database nếu chưa tồn tại
IF NOT EXISTS (SELECT name FROM sys.databases WHERE name = 'GreenBiteDB')
BEGIN
    CREATE DATABASE GreenBiteDB
    COLLATE Vietnamese_CI_AS;
END
GO

USE GreenBiteDB;
GO

-- ============================================================
-- PHẦN 1: QUẢN LÝ NGƯỜI DÙNG & XÁC THỰC
-- ============================================================

-- Bảng vai trò người dùng
CREATE TABLE Roles (
    role_id     INT IDENTITY(1,1) PRIMARY KEY,
    role_name   NVARCHAR(50)  NOT NULL UNIQUE,  -- customer, kitchen, cashier, admin, shipper
    description NVARCHAR(200) NULL,
    created_at  DATETIME2 DEFAULT GETDATE()
);
GO

-- Bảng người dùng hệ thống (nhân viên + khách hàng)
CREATE TABLE Users (
    user_id      INT IDENTITY(1,1) PRIMARY KEY,
    role_id      INT           NOT NULL REFERENCES Roles(role_id),
    full_name    NVARCHAR(100) NOT NULL,
    email        NVARCHAR(150) NOT NULL UNIQUE,
    password_hash NVARCHAR(255) NOT NULL,          -- Lưu mật khẩu đã hash (bcrypt)
    phone        NVARCHAR(20)  NULL,
    avatar_url   NVARCHAR(500) NULL,
    is_active    BIT           DEFAULT 1,           -- 1=hoạt động, 0=khoá tài khoản
    created_at   DATETIME2     DEFAULT GETDATE(),
    updated_at   DATETIME2     DEFAULT GETDATE(),
    last_login   DATETIME2     NULL
);
GO

-- Bảng hồ sơ khách hàng (mở rộng từ Users)
CREATE TABLE CustomerProfiles (
    profile_id       INT IDENTITY(1,1) PRIMARY KEY,
    user_id          INT           NOT NULL REFERENCES Users(user_id) ON DELETE CASCADE,
    date_of_birth    DATE          NULL,
    gender           NVARCHAR(10)  NULL,            -- Nam, Nữ, Khác
    height_cm        DECIMAL(5,1)  NULL,            -- Chiều cao (cm)
    weight_kg        DECIMAL(5,1)  NULL,            -- Cân nặng (kg)
    health_goal      NVARCHAR(50)  NULL,            -- GiamCan, TangCo, EatClean, Keto...
    daily_cal_target INT           DEFAULT 1800,    -- Mục tiêu calo mỗi ngày
    protein_target_g INT           DEFAULT 120,     -- Mục tiêu protein (gram)
    carb_target_g    INT           DEFAULT 150,     -- Mục tiêu carbs (gram)
    fat_target_g     INT           DEFAULT 60,      -- Mục tiêu chất béo (gram)
    allergy_notes    NVARCHAR(500) NULL,            -- Ghi chú dị ứng
    loyalty_points   INT           DEFAULT 0,       -- Điểm thưởng tích luỹ
    default_address  NVARCHAR(500) NULL,            -- Địa chỉ giao hàng mặc định
    CONSTRAINT UQ_CustomerProfile_User UNIQUE (user_id)
);
GO

-- Bảng thông tin nhân viên (mở rộng từ Users)
CREATE TABLE StaffProfiles (
    staff_id    INT IDENTITY(1,1) PRIMARY KEY,
    user_id     INT           NOT NULL REFERENCES Users(user_id) ON DELETE CASCADE,
    shift       NVARCHAR(100) NULL,                 -- Ca làm việc
    salary      DECIMAL(12,0) NULL,                 -- Lương cơ bản
    start_date  DATE          NULL,                 -- Ngày bắt đầu làm việc
    CONSTRAINT UQ_StaffProfile_User UNIQUE (user_id)
);
GO

-- ============================================================
-- PHẦN 2: QUẢN LÝ THỰC ĐƠN & SẢN PHẨM
-- ============================================================

-- Bảng danh mục món ăn
CREATE TABLE Categories (
    category_id   INT IDENTITY(1,1) PRIMARY KEY,
    category_code NVARCHAR(20)  NOT NULL UNIQUE,    -- EatClean, Keto, LowCarb, GiamCan, TangCo
    category_name NVARCHAR(100) NOT NULL,
    description   NVARCHAR(500) NULL,
    icon_emoji    NVARCHAR(10)  NULL,
    sort_order    INT           DEFAULT 0,
    is_active     BIT           DEFAULT 1
);
GO

-- Bảng món ăn (sản phẩm)
CREATE TABLE Products (
    product_id    INT IDENTITY(1,1) PRIMARY KEY,
    category_id   INT            NOT NULL REFERENCES Categories(category_id),
    product_name  NVARCHAR(200)  NOT NULL,
    description   NVARCHAR(1000) NULL,
    emoji         NVARCHAR(10)   NULL,              -- Emoji đại diện
    price         DECIMAL(12,0)  NOT NULL,           -- Giá bán (VND)
    -- Chỉ số dinh dưỡng (quan trọng cho hệ thống healthy food)
    calories      INT            NOT NULL DEFAULT 0,
    protein_g     DECIMAL(6,1)   DEFAULT 0,         -- Protein (gram)
    carb_g        DECIMAL(6,1)   DEFAULT 0,         -- Carbohydrates (gram)
    fat_g         DECIMAL(6,1)   DEFAULT 0,         -- Chất béo (gram)
    fiber_g       DECIMAL(6,1)   DEFAULT 0,         -- Chất xơ (gram)
    sodium_mg     DECIMAL(7,1)   DEFAULT 0,         -- Natri (mg)
    -- Trạng thái
    is_available  BIT            DEFAULT 1,          -- Có sẵn hôm nay không
    is_featured   BIT            DEFAULT 0,          -- Nổi bật trên trang chủ
    prep_time_min INT            DEFAULT 15,         -- Thời gian chế biến (phút)
    -- Audit
    created_at    DATETIME2      DEFAULT GETDATE(),
    updated_at    DATETIME2      DEFAULT GETDATE()
);
GO

-- Bảng tags của sản phẩm (Vegan, Keto-friendly, Omega-3...)
CREATE TABLE ProductTags (
    tag_id     INT IDENTITY(1,1) PRIMARY KEY,
    tag_name   NVARCHAR(50) NOT NULL UNIQUE,
    tag_color  NVARCHAR(20) NULL                    -- Màu hiển thị badge
);
GO

-- Bảng liên kết sản phẩm - tags (nhiều-nhiều)
CREATE TABLE ProductTagMap (
    product_id INT NOT NULL REFERENCES Products(product_id) ON DELETE CASCADE,
    tag_id     INT NOT NULL REFERENCES ProductTags(tag_id) ON DELETE CASCADE,
    PRIMARY KEY (product_id, tag_id)
);
GO

-- Bảng công thức / nguyên liệu của từng món (để tự động trừ kho)
CREATE TABLE ProductIngredients (
    recipe_id      INT IDENTITY(1,1) PRIMARY KEY,
    product_id     INT           NOT NULL REFERENCES Products(product_id) ON DELETE CASCADE,
    ingredient_id  INT           NOT NULL,           -- FK tới Inventory sau
    quantity_used  DECIMAL(8,3)  NOT NULL,           -- Lượng dùng mỗi phần
    unit           NVARCHAR(20)  NOT NULL,           -- kg, g, ml, quả...
    notes          NVARCHAR(200) NULL
);
GO

-- ============================================================
-- PHẦN 3: QUẢN LÝ KHO NGUYÊN LIỆU
-- ============================================================

-- Bảng nhà cung cấp thực phẩm sạch
CREATE TABLE Suppliers (
    supplier_id   INT IDENTITY(1,1) PRIMARY KEY,
    supplier_name NVARCHAR(200) NOT NULL,
    category      NVARCHAR(100) NULL,               -- Thịt, Rau củ, Hải sản...
    contact_name  NVARCHAR(100) NULL,
    phone         NVARCHAR(20)  NULL,
    email         NVARCHAR(150) NULL,
    address       NVARCHAR(500) NULL,
    rating        DECIMAL(3,1)  DEFAULT 5.0,        -- Đánh giá (1-5)
    is_certified  BIT           DEFAULT 0,           -- Có chứng chỉ VSATTP không
    certification NVARCHAR(200) NULL,               -- VietGAP, GlobalGAP, HACCP...
    is_active     BIT           DEFAULT 1,
    created_at    DATETIME2     DEFAULT GETDATE()
);
GO

-- Bảng kho nguyên liệu (inventory)
CREATE TABLE Inventory (
    inventory_id    INT IDENTITY(1,1) PRIMARY KEY,
    supplier_id     INT           NULL REFERENCES Suppliers(supplier_id),
    item_code       NVARCHAR(20)  NOT NULL UNIQUE,  -- Mã định danh nguyên liệu
    item_name       NVARCHAR(200) NOT NULL,
    category        NVARCHAR(50)  NULL,             -- Thịt, Rau củ, Hải sản, Trứng...
    unit            NVARCHAR(20)  NOT NULL,         -- kg, g, quả, ml...
    -- Số lượng
    current_qty     DECIMAL(10,3) DEFAULT 0,        -- Tồn kho hiện tại
    min_qty         DECIMAL(10,3) DEFAULT 0,        -- Mức tối thiểu cần nhập thêm
    -- Giá và hạn dùng
    cost_per_unit   DECIMAL(12,0) NULL,             -- Giá nhập / đơn vị
    import_date     DATE          NULL,             -- Ngày nhập kho
    expiry_date     DATE          NULL,             -- Ngày hết hạn (quan trọng!)
    storage_temp    NVARCHAR(50)  NULL,             -- Điều kiện bảo quản
    notes           NVARCHAR(500) NULL,
    -- Audit
    created_at      DATETIME2     DEFAULT GETDATE(),
    updated_at      DATETIME2     DEFAULT GETDATE()
);
GO

-- Thêm FK từ ProductIngredients tới Inventory
ALTER TABLE ProductIngredients
    ADD CONSTRAINT FK_ProductIngredients_Inventory
    FOREIGN KEY (ingredient_id) REFERENCES Inventory(inventory_id);
GO

-- Bảng lịch sử nhập kho
CREATE TABLE InventoryTransactions (
    trans_id       INT IDENTITY(1,1) PRIMARY KEY,
    inventory_id   INT           NOT NULL REFERENCES Inventory(inventory_id),
    trans_type     NVARCHAR(20)  NOT NULL,          -- IMPORT (nhập), EXPORT (xuất dùng), ADJUST (điều chỉnh)
    quantity       DECIMAL(10,3) NOT NULL,           -- Số lượng (âm = xuất, dương = nhập)
    reason         NVARCHAR(500) NULL,              -- Lý do (nhập hàng, sử dụng nấu, hỏng...)
    performed_by   INT           NULL REFERENCES Users(user_id),
    trans_date     DATETIME2     DEFAULT GETDATE()
);
GO

-- ============================================================
-- PHẦN 4: ĐẶT HÀNG VÀ VẬN HÀNH
-- ============================================================

-- Bảng đơn hàng chính
CREATE TABLE Orders (
    order_id        INT IDENTITY(1,1) PRIMARY KEY,
    order_code      NVARCHAR(20)  NOT NULL UNIQUE,  -- #2401, #2402...
    customer_id     INT           NOT NULL REFERENCES Users(user_id),
    -- Địa chỉ giao hàng (lưu snapshot tại thời điểm đặt)
    delivery_name   NVARCHAR(100) NOT NULL,
    delivery_phone  NVARCHAR(20)  NOT NULL,
    delivery_addr   NVARCHAR(500) NOT NULL,
    delivery_time   NVARCHAR(50)  NULL,             -- Khung giờ giao
    delivery_note   NVARCHAR(500) NULL,             -- Ghi chú giao hàng
    -- Tài chính
    subtotal        DECIMAL(12,0) DEFAULT 0,        -- Tổng tiền hàng
    ship_fee        DECIMAL(12,0) DEFAULT 25000,    -- Phí giao hàng
    discount_amount DECIMAL(12,0) DEFAULT 0,        -- Số tiền giảm
    total_amount    DECIMAL(12,0) DEFAULT 0,        -- Tổng thanh toán
    -- Trạng thái đơn hàng
    status          NVARCHAR(30)  DEFAULT 'pending', -- pending, confirmed, preparing, ready, delivering, done, cancelled
    payment_method  NVARCHAR(20)  DEFAULT 'online', -- online, cash, points
    payment_status  NVARCHAR(20)  DEFAULT 'pending', -- pending, paid, refunded
    -- Shipper
    shipper_id      INT           NULL REFERENCES Users(user_id),
    -- Nguồn đặt hàng
    order_source    NVARCHAR(20)  DEFAULT 'web',    -- web, pos, app
    voucher_code    NVARCHAR(50)  NULL,             -- Mã voucher đã dùng
    -- Dinh dưỡng tổng đơn
    total_calories  INT           DEFAULT 0,        -- Tổng calo đơn hàng
    -- Audit
    created_at      DATETIME2     DEFAULT GETDATE(),
    updated_at      DATETIME2     DEFAULT GETDATE(),
    completed_at    DATETIME2     NULL
);
GO

-- Bảng chi tiết đơn hàng (từng món trong đơn)
CREATE TABLE OrderItems (
    item_id      INT IDENTITY(1,1) PRIMARY KEY,
    order_id     INT            NOT NULL REFERENCES Orders(order_id) ON DELETE CASCADE,
    product_id   INT            NOT NULL REFERENCES Products(product_id),
    quantity     INT            NOT NULL DEFAULT 1,
    unit_price   DECIMAL(12,0)  NOT NULL,           -- Giá tại thời điểm đặt (snapshot)
    item_note    NVARCHAR(500)  NULL,               -- Ghi chú cá nhân hoá (không hành, bớt cay...)
    calories     INT            DEFAULT 0,           -- Calo (snapshot)
    subtotal     AS (quantity * unit_price) PERSISTED -- Tự tính thành tiền
);
GO

-- Bảng đánh giá đơn hàng
CREATE TABLE OrderRatings (
    rating_id   INT IDENTITY(1,1) PRIMARY KEY,
    order_id    INT  NOT NULL REFERENCES Orders(order_id),
    customer_id INT  NOT NULL REFERENCES Users(user_id),
    stars       INT  NOT NULL CHECK (stars BETWEEN 1 AND 5),
    comment     NVARCHAR(1000) NULL,
    rated_at    DATETIME2 DEFAULT GETDATE(),
    CONSTRAINT UQ_OrderRating UNIQUE (order_id, customer_id)
);
GO

-- ============================================================
-- PHẦN 5: GÓI ĂN ĐỊNH KỲ (SUBSCRIPTION)
-- ============================================================

-- Bảng các gói đăng ký
CREATE TABLE SubscriptionPlans (
    plan_id         INT IDENTITY(1,1) PRIMARY KEY,
    plan_name       NVARCHAR(100)  NOT NULL,
    health_goal     NVARCHAR(50)   NULL,            -- EatClean, Keto, GiamCan...
    days_per_week   INT            NOT NULL,        -- Số ngày / tuần (3, 5, 7)
    meals_per_day   INT            NOT NULL,        -- Số bữa / ngày (1, 2, 3)
    price_per_meal  DECIMAL(12,0)  NOT NULL,
    discount_pct    INT            DEFAULT 0,       -- % giảm giá so với đặt lẻ
    description     NVARCHAR(500)  NULL,
    is_featured     BIT            DEFAULT 0,
    is_active       BIT            DEFAULT 1,
    created_at      DATETIME2      DEFAULT GETDATE()
);
GO

-- Bảng đăng ký gói ăn của khách hàng
CREATE TABLE CustomerSubscriptions (
    sub_id          INT IDENTITY(1,1) PRIMARY KEY,
    customer_id     INT            NOT NULL REFERENCES Users(user_id),
    plan_id         INT            NOT NULL REFERENCES SubscriptionPlans(plan_id),
    -- Thông tin giao hàng
    delivery_addr   NVARCHAR(500)  NOT NULL,
    delivery_phone  NVARCHAR(20)   NOT NULL,
    delivery_slot   NVARCHAR(50)   NULL,            -- Khung giờ (11:00-12:00...)
    dietary_notes   NVARCHAR(500)  NULL,            -- Dị ứng / khẩu vị
    -- Thời hạn
    start_date      DATE           NOT NULL,
    end_date        DATE           NULL,
    next_delivery   DATE           NULL,            -- Ngày giao tiếp theo
    -- Tài chính
    weekly_price    DECIMAL(12,0)  NULL,
    payment_method  NVARCHAR(20)   DEFAULT 'transfer',
    -- Trạng thái
    status          NVARCHAR(20)   DEFAULT 'active', -- active, paused, cancelled, expired
    pause_until     DATE           NULL,            -- Tạm dừng đến ngày nào
    -- Audit
    created_at      DATETIME2      DEFAULT GETDATE(),
    updated_at      DATETIME2      DEFAULT GETDATE()
);
GO

-- ============================================================
-- PHẦN 6: MARKETING & KHUYẾN MÃI
-- ============================================================

-- Bảng mã giảm giá (voucher)
CREATE TABLE Vouchers (
    voucher_id    INT IDENTITY(1,1) PRIMARY KEY,
    code          NVARCHAR(50)   NOT NULL UNIQUE,   -- HEALTHY20, NEWUSER50K...
    discount_type NVARCHAR(20)   NOT NULL,          -- percent (%), fixed (số tiền cố định)
    discount_val  DECIMAL(12,0)  NOT NULL,           -- Giá trị giảm
    min_order     DECIMAL(12,0)  DEFAULT 0,          -- Đơn tối thiểu
    max_uses      INT            NULL,              -- Giới hạn số lần dùng (NULL = không giới hạn)
    used_count    INT            DEFAULT 0,
    valid_from    DATETIME2      DEFAULT GETDATE(),
    valid_to      DATETIME2      NULL,
    description   NVARCHAR(500)  NULL,
    status        NVARCHAR(20)   DEFAULT 'active',   -- active, expired, scheduled, paused
    created_by    INT            NULL REFERENCES Users(user_id),
    created_at    DATETIME2      DEFAULT GETDATE()
);
GO

-- Bảng lịch sử sử dụng voucher
CREATE TABLE VoucherUsages (
    usage_id    INT IDENTITY(1,1) PRIMARY KEY,
    voucher_id  INT       NOT NULL REFERENCES Vouchers(voucher_id),
    customer_id INT       NOT NULL REFERENCES Users(user_id),
    order_id    INT       NOT NULL REFERENCES Orders(order_id),
    used_at     DATETIME2 DEFAULT GETDATE()
);
GO

-- Bảng lịch sử điểm thưởng
CREATE TABLE LoyaltyTransactions (
    ltrans_id    INT IDENTITY(1,1) PRIMARY KEY,
    customer_id  INT            NOT NULL REFERENCES Users(user_id),
    points       INT            NOT NULL,           -- Dương = cộng, Âm = trừ
    reason       NVARCHAR(200)  NULL,               -- Mua hàng, Đổi điểm, Hoàn tiền...
    order_id     INT            NULL REFERENCES Orders(order_id),
    trans_at     DATETIME2      DEFAULT GETDATE()
);
GO

-- ============================================================
-- PHẦN 7: THỰC ĐƠN TUẦN (MENU PLANNING)
-- ============================================================

-- Bảng kế hoạch thực đơn theo tuần
CREATE TABLE MenuPlans (
    plan_id      INT IDENTITY(1,1) PRIMARY KEY,
    week_start   DATE          NOT NULL,            -- Thứ 2 đầu tuần
    week_end     DATE          NOT NULL,            -- Chủ nhật cuối tuần
    created_by   INT           NULL REFERENCES Users(user_id),
    status       NVARCHAR(20)  DEFAULT 'draft',     -- draft, published
    notes        NVARCHAR(1000) NULL,
    created_at   DATETIME2     DEFAULT GETDATE()
);
GO

-- Bảng chi tiết thực đơn mỗi ngày
CREATE TABLE MenuPlanItems (
    item_id    INT IDENTITY(1,1) PRIMARY KEY,
    plan_id    INT           NOT NULL REFERENCES MenuPlans(plan_id) ON DELETE CASCADE,
    product_id INT           NOT NULL REFERENCES Products(product_id),
    menu_date  DATE          NOT NULL,              -- Ngày cụ thể
    meal_type  NVARCHAR(20)  NOT NULL,              -- Sáng, Trưa, Tối, Snack
    sort_order INT           DEFAULT 0
);
GO

-- ============================================================
-- PHẦN 8: LỊCH SỬ CALO KHÁCH HÀNG
-- ============================================================

-- Bảng theo dõi calo hàng ngày của khách hàng
CREATE TABLE CalorieTracking (
    track_id      INT IDENTITY(1,1) PRIMARY KEY,
    customer_id   INT       NOT NULL REFERENCES Users(user_id),
    track_date    DATE      NOT NULL,
    total_cal     INT       DEFAULT 0,             -- Tổng calo hôm đó
    total_protein DECIMAL(6,1) DEFAULT 0,
    total_carb    DECIMAL(6,1) DEFAULT 0,
    total_fat     DECIMAL(6,1) DEFAULT 0,
    CONSTRAINT UQ_CalTracking UNIQUE (customer_id, track_date)
);
GO

-- ============================================================
-- PHẦN 9: INDEXES để tối ưu truy vấn
-- ============================================================

-- Index cho tìm kiếm đơn hàng theo trạng thái
CREATE INDEX IX_Orders_Status ON Orders(status);
CREATE INDEX IX_Orders_Customer ON Orders(customer_id);
CREATE INDEX IX_Orders_CreatedAt ON Orders(created_at DESC);
CREATE INDEX IX_Orders_Source ON Orders(order_source);

-- Index cho kho nguyên liệu
CREATE INDEX IX_Inventory_ExpiryDate ON Inventory(expiry_date);
CREATE INDEX IX_Inventory_Category ON Inventory(category);

-- Index cho sản phẩm
CREATE INDEX IX_Products_Category ON Products(category_id);
CREATE INDEX IX_Products_Available ON Products(is_available);

-- Index cho tracking calo
CREATE INDEX IX_CalorieTracking_Date ON CalorieTracking(customer_id, track_date DESC);

PRINT N'✅ Schema GreenBiteDB tạo thành công!';
GO