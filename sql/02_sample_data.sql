-- ============================================================
-- FITFOOD - DỮ LIỆU MẪU ĐỂ DEMO
-- ============================================================
USE FitFoodDB;
GO

-- --- Danh mục ---
INSERT INTO Categories (name, slug, icon) VALUES
(N'Eat Clean',    'eat-clean',    N'🥗'),
(N'Keto',         'keto',         N'🥑'),
(N'Low-Carb',     'low-carb',     N'🌾'),
(N'Tăng cơ',      'high-protein', N'💪'),
(N'Giảm cân',     'weight-loss',  N'⚖️'),
(N'Bữa sáng',     'breakfast',    N'🌅');

-- --- Tài khoản khách hàng mẫu bổ sung ---
-- KHÔNG insert lại admin/kitchen vì đã tạo sẵn ở 01_schema.sql (insert lại sẽ lỗi UNIQUE email)
-- Mật khẩu lưu Plain-text có chủ đích (demo dữ liệu, không chú trọng bảo mật)
-- 2 user này nhận user_id = 4, 5 (tiếp theo 3 user đã insert ở 01_schema.sql)
-- -> khớp đúng với user_id 4, 5 trong dữ liệu Orders mẫu phía dưới
INSERT INTO Users (email, password_hash, full_name, phone, role) VALUES
('lan@example.com',    'Lan@123',    N'Nguyễn Thị Lan',    '0912345678', 'customer'),
('minh@example.com',   'Minh@123',   N'Trần Văn Minh',     '0987654321', 'customer');

-- --- Sản phẩm mẫu ---
INSERT INTO Products (category_id, name, description, price, calories, protein_g, carbs_g, fat_g, health_tags, prep_time_min)
VALUES
(1, N'Cơm gà nướng Eat Clean',
   N'Ức gà nướng mật ong, gạo lứt hữu cơ, rau củ hấp Đà Lạt',
   85000, 420, 38.0, 45.0, 8.0, N'["Eat Clean","Tăng cơ"]', 20),

(2, N'Salad Keto Bơ Trứng',
   N'Bơ Hass tươi, trứng luộc, rau xà lách butter, dầu olive extra virgin, muối hồng Himalaya',
   75000, 380, 18.0, 8.0, 32.0, N'["Keto","Giảm cân"]', 10),

(3, N'Bowl Quinoa Low-Carb',
   N'Quinoa đỏ, ức gà xé sợi, cải bó xôi, hạt chia, sốt tahini nguyên chất',
   92000, 350, 28.0, 32.0, 12.0, N'["Low-carb","Eat Clean"]', 15),

(6, N'Cháo yến mạch Detox',
   N'Yến mạch cán hữu cơ, hạt lanh omega-3, chuối sấy giòn, mật ong Manuka',
   55000, 280, 12.0, 52.0, 6.0, N'["Eat Clean","Giảm cân"]', 10),

(4, N'Bò áp chảo Protein Bowl',
   N'Bò thăn nội nướng medium-rare, khoai lang mật nướng, bông cải xanh hấp',
   115000, 520, 45.0, 38.0, 18.0, N'["Tăng cơ"]', 25),

(2, N'Cuốn diếp cá hồi',
   N'Cá hồi Na Uy áp chảo, diếp cá tươi, dưa leo, sốt wasabi nhẹ',
   98000, 310, 24.0, 12.0, 20.0, N'["Keto","Low-carb"]', 15);

-- --- Gói ăn ---
INSERT INTO SubscriptionPlans (name, description, price_weekly, price_monthly, meals_per_day, days_per_week)
VALUES
(N'Starter Clean', N'1 bữa/ngày, 5 ngày/tuần, Eat Clean & Giảm cân',
 490000, 1750000, 1, 5),
(N'Full Day',      N'2 bữa/ngày, 5 ngày/tuần, tất cả mục tiêu',
 820000, 2950000, 2, 5),
(N'Total Wellness',N'3 bữa/ngày, 7 ngày/tuần, cá nhân hoá hoàn toàn',
 1150000, 4200000, 3, 7);

-- --- Nhà cung cấp ---
INSERT INTO Suppliers (name, contact_name, phone, category, notes)
VALUES
(N'Nông trại Organic Đà Lạt', N'Nguyễn Hoà',    '0263123456', N'Rau củ hữu cơ', N'Giao mỗi sáng 5h'),
(N'Thịt sạch Farm Bình Dương', N'Trần Minh Đức', '0274987654', N'Thịt tươi',      N'Cam kết nguồn gốc'),
(N'Hải sản tươi Vũng Tàu',    N'Lê Văn Hải',   '0254345678', N'Hải sản',        N'Đặt trước 1 ngày');

-- --- Kho nguyên liệu mẫu ---
INSERT INTO Inventory (inventory_code, supplier_id, name, category, unit, quantity, min_quantity, import_date, expiry_date)
VALUES
('#01234', 1, N'Củ cải trắng',   N'Rau củ',  'kg', 5.0,  2.0, '2025-05-17', '2025-05-20'),
('#01235', 2, N'Ức gà',           N'Thịt',    'kg', 12.0, 3.0, '2025-05-17', '2025-05-19'),
('#01236', 1, N'Bông cải xanh',   N'Rau củ',  'kg', 8.0,  2.0, '2025-05-17', '2025-05-21'),
('#01237', 3, N'Cá hồi fillet',   N'Hải sản', 'kg', 3.0,  1.0, '2025-05-17', '2025-05-18'),
('#01238', 1, N'Gạo lứt',         N'Ngũ cốc', 'kg', 20.0, 5.0, '2025-05-15', '2025-06-15'),
('#01239', 1, N'Xà lách butter',  N'Rau củ',  'kg', 2.0,  1.0, '2025-05-17', '2025-05-19');

-- --- Định lượng nguyên liệu cho từng món (ProductIngredients) ---
-- Ghi chú: do bộ dữ liệu Inventory mẫu chỉ có 6 nguyên liệu nên chỉ map
-- được những nguyên liệu có sẵn trùng khớp, mang tính minh hoạ cho trigger,
-- thực tế cần bổ sung đầy đủ Inventory để map hết nguyên liệu mỗi món.
INSERT INTO ProductIngredients (product_id, inventory_id, qty_per_portion) VALUES
(1, 2, 0.150),   -- Cơm gà nướng Eat Clean      -> Ức gà 0.15kg
(1, 5, 0.200),   -- Cơm gà nướng Eat Clean      -> Gạo lứt 0.2kg
(1, 3, 0.080),   -- Cơm gà nướng Eat Clean      -> Bông cải xanh 0.08kg
(2, 6, 0.100),   -- Salad Keto Bơ Trứng         -> Xà lách butter 0.1kg
(3, 2, 0.120),   -- Bowl Quinoa Low-Carb        -> Ức gà 0.12kg
(5, 3, 0.150),   -- Bò áp chảo Protein Bowl     -> Bông cải xanh 0.15kg
(6, 4, 0.120);   -- Cuốn diếp cá hồi            -> Cá hồi fillet 0.12kg

-- --- Voucher mẫu ---
INSERT INTO Vouchers (code, discount_type, discount_value, min_order, max_uses, condition_type, expires_at)
VALUES
('HEALTHY20', 'percent', 20, 150000, 100, 'all',      '2025-06-30'),
('NEWUSER50K','fixed',   50000, 200000, 50,  'new_user', '2025-06-30'),
('KETO30',    'percent', 30, 250000, 30,  'subscription', '2025-06-15');

-- --- Đơn hàng mẫu ---
INSERT INTO Orders (order_code, user_id, order_type, status, delivery_name, delivery_phone,
    delivery_address, subtotal, total, payment_method, payment_status)
VALUES
('FF-2401', 4, 'online', 'preparing', N'Nguyễn Thị Lan', '0912345678',
 N'123 Nguyễn Văn Cừ, Q.5', 255000, 255000, 'cod', 'pending'),
('FF-2402', 5, 'online', 'ready',     N'Trần Văn Minh', '0987654321',
 N'45 Lê Văn Sỹ, Q.3',      85000,  85000,  'momo', 'paid'),
('FF-2403', 4, 'online', 'pending', N'Nguyễn Thị Lan', '0912345678',
 N'123 Nguyễn Văn Cừ, Q.5', 167000, 167000, 'cash', 'pending');

PRINT N'✅ Dữ liệu mẫu đã được chèn thành công';
GO