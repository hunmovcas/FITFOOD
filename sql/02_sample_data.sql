-- ============================================================
-- GreenBite Platform - Dữ liệu mẫu
-- File: 02_sample_data.sql
-- Chạy sau 01_schema.sql
-- ============================================================

USE GreenBiteDB;
GO

-- ============================================================
-- 1. VAI TRÒ NGƯỜI DÙNG
-- ============================================================
INSERT INTO Roles (role_name, description) VALUES
(N'customer',  N'Khách hàng - đặt món và theo dõi dinh dưỡng'),
(N'kitchen',   N'Nhân viên bếp - xem đơn và chế biến'),
(N'cashier',   N'Thu ngân - xử lý thanh toán tại quầy'),
(N'admin',     N'Quản trị viên - toàn quyền hệ thống'),
(N'shipper',   N'Nhân viên giao hàng');
GO

-- ============================================================
-- 2. TÀI KHOẢN DEMO
-- ============================================================
-- Mật khẩu demo: 123456 (trong thực tế phải hash bcrypt)
INSERT INTO Users (role_id, full_name, email, password_hash, phone, is_active) VALUES
(1, N'Nguyễn Minh Anh',    'customer@demo.com', '$2b$10$demo_hash_customer', '0901234567', 1),
(2, N'Trần Văn Bếp',       'kitchen@demo.com',  '$2b$10$demo_hash_kitchen',  '0901111111', 1),
(3, N'Lê Thu Hoa',         'cashier@demo.com',  '$2b$10$demo_hash_cashier',  '0902222222', 1),
(4, N'Admin System',       'admin@demo.com',    '$2b$10$demo_hash_admin',    '0900000000', 1),
(5, N'Nguyễn Thị Mai',     'shipper@demo.com',  '$2b$10$demo_hash_shipper',  '0904444444', 1),
-- Nhân viên bổ sung
(2, N'Phạm Đức Khoa',      'khoa@hfp.vn',       '$2b$10$demo_hash_khoa',    '0903333333', 1),
(5, N'Vũ Minh Tuấn',       'tuan@hfp.vn',       '$2b$10$demo_hash_tuan',    '0905555555', 0),  -- Nghỉ
(2, N'Đỗ Lan Anh',         'lan@hfp.vn',        '$2b$10$demo_hash_lan',     '0906666666', 1);
GO

-- Hồ sơ khách hàng mẫu
INSERT INTO CustomerProfiles (user_id, date_of_birth, gender, height_cm, weight_kg,
    health_goal, daily_cal_target, protein_target_g, carb_target_g, fat_target_g,
    loyalty_points, default_address)
VALUES
(1, '1996-05-15', N'Nữ', 162.0, 55.0, N'EatClean', 1800, 120, 150, 60, 1250,
    N'123 Trần Hưng Đạo, Phường 1, Quận 1, TP.HCM');
GO

-- Hồ sơ nhân viên
INSERT INTO StaffProfiles (user_id, shift, salary, start_date) VALUES
(2, N'Sáng 6:00-14:00', 8500000, '2023-03-01'),
(3, N'Sáng 8:00-17:00', 7500000, '2023-05-15'),
(6, N'Chiều 14:00-22:00', 8500000, '2023-06-01'),
(5, N'Toàn ngày',         6500000, '2023-07-20'),
(7, N'Chiều 11:00-20:00', 7500000, '2023-08-10'),
(8, N'Sáng 6:00-14:00',  8500000, '2023-09-05');
GO

-- ============================================================
-- 3. DANH MỤC & TAGS
-- ============================================================
INSERT INTO Categories (category_code, category_name, description, icon_emoji, sort_order) VALUES
(N'EatClean', N'Eat Clean',    N'Thực phẩm sạch, nguyên chất, không chế biến quá nhiều', N'🥗', 1),
(N'Keto',     N'Keto',         N'Ít carbs, nhiều chất béo lành mạnh, hỗ trợ đốt mỡ',    N'🥑', 2),
(N'LowCarb',  N'Low-carb',     N'Kiểm soát lượng tinh bột, phù hợp giảm cân',            N'🥦', 3),
(N'GiamCan',  N'Giảm cân',     N'Calo thấp, no lâu, tăng cảm giác đầy bụng',             N'⚖️', 4),
(N'TangCo',   N'Tăng cơ',      N'Giàu protein, hỗ trợ phát triển cơ bắp',               N'💪', 5),
(N'HighPro',  N'High Protein', N'Hàm lượng protein cực cao, cho người tập luyện',        N'🐟', 6);
GO

INSERT INTO ProductTags (tag_name, tag_color) VALUES
(N'Keto',        N'green'),
(N'Eat Clean',   N'green'),
(N'Vegan',       N'lime'),
(N'Low Carb',    N'blue'),
(N'High Protein',N'blue'),
(N'Omega-3',     N'blue'),
(N'Giảm cân',   N'orange'),
(N'Tăng cơ',    N'orange'),
(N'Không Gluten',N'gray'),
(N'Hữu cơ',     N'green');
GO

-- ============================================================
-- 4. NHÀ CUNG CẤP
-- ============================================================
INSERT INTO Suppliers (supplier_name, category, contact_name, phone, email, address, rating, is_certified, certification) VALUES
(N'Trang trại Hữu Cơ Xanh', N'Thịt & Gia cầm', N'Nguyễn Văn A', '0901234567',
    'order@huucoxanh.vn', N'KCN Bình Dương', 4.8, 1, N'VietGAP, Hữu cơ'),
(N'Rau Sạch Dalat',          N'Rau củ quả',     N'Trần Thị B',   '0912345678',
    'sales@rausachdalat.vn', N'Đà Lạt, Lâm Đồng', 4.9, 1, N'GlobalGAP, Organic'),
(N'Hải sản Tươi Ngon',       N'Hải sản',        N'Lê Văn C',     '0923456789',
    'info@haisantuoi.vn', N'Cảng Cá TP.HCM', 4.6, 0, NULL),
(N'Gạo Sạch Việt',           N'Ngũ cốc',        N'Phạm Văn D',   '0934567890',
    'gao@sachwiet.vn', N'An Giang', 4.7, 1, N'Hữu cơ, HACCP'),
(N'Trại Gà Sạch',            N'Trứng & Gia cầm',N'Vũ Thị E',     '0945678901',
    'trai@gasach.vn', N'Đồng Nai', 4.5, 1, N'VietGAP');
GO

-- ============================================================
-- 5. KHO NGUYÊN LIỆU MẪU
-- ============================================================
INSERT INTO Inventory (supplier_id, item_code, item_name, category, unit,
    current_qty, min_qty, cost_per_unit, import_date, expiry_date, storage_temp) VALUES
(1, N'#01001', N'Ức gà',      N'Thịt',    N'kg', 15.5, 5.0,  95000,  '2024-01-15', '2024-01-17', N'2-4°C tủ lạnh'),
(3, N'#01002', N'Cá hồi',     N'Hải sản', N'kg', 3.2,  2.0,  280000, '2024-01-15', '2024-01-16', N'0-2°C đá lạnh'),
(2, N'#01003', N'Xà lách',    N'Rau củ',  N'kg', 8.0,  3.0,  35000,  '2024-01-15', '2024-01-18', N'4-8°C ngăn mát'),
(2, N'#01004', N'Củ cải',     N'Rau củ',  N'kg', 6.5,  3.0,  28000,  '2024-01-13', '2024-01-20', N'4-8°C ngăn mát'),
(2, N'#01005', N'Cà chua bi', N'Rau củ',  N'kg', 4.1,  2.0,  45000,  '2024-01-14', '2024-01-19', N'4-8°C ngăn mát'),
(1, N'#01006', N'Thịt bò',    N'Thịt',    N'kg', 2.8,  3.0,  250000, '2024-01-14', '2024-01-17', N'2-4°C tủ lạnh'),
(5, N'#01007', N'Trứng gà',   N'Trứng',   N'quả',48,   24,   4000,   '2024-01-14', '2024-01-22', N'Nhiệt độ phòng'),
(4, N'#01008', N'Gạo lứt',    N'Ngũ cốc', N'kg', 25.0, 10.0, 32000,  '2024-01-01', '2024-06-01', N'Khô ráo, thoáng mát'),
(NULL,N'#01009',N'Đậu hũ',    N'Đạm',     N'kg', 5.5,  2.0,  22000,  '2024-01-15', '2024-01-18', N'4-8°C ngăn mát'),
(3, N'#01010', N'Tôm sú',     N'Hải sản', N'kg', 1.5,  2.0,  180000, '2024-01-15', '2024-01-16', N'0-2°C đá lạnh'),
(2, N'#01011', N'Bơ Hass',    N'Rau củ',  N'quả',20,   10,   15000,  '2024-01-12', '2024-01-19', N'Nhiệt độ phòng'),
(2, N'#01012', N'Cải xoăn',   N'Rau củ',  N'kg', 3.0,  1.5,  40000,  '2024-01-15', '2024-01-17', N'4-8°C ngăn mát');
GO

-- ============================================================
-- 6. SẢN PHẨM / THỰC ĐƠN
-- ============================================================
INSERT INTO Products (category_id, product_name, description, emoji, price,
    calories, protein_g, carb_g, fat_g, fiber_g, is_available, is_featured, prep_time_min)
VALUES
-- Keto
(2, N'Gà nướng Keto',     N'Ức gà thảo mộc nướng than hoa, ăn kèm salad xanh',                    N'🍗', 89000,  320, 42.0, 5.0,  12.0, 2.0, 1, 1, 20),
(2, N'Bò Keto Salad',     N'Thịt bò thảo mộc, trứng luộc, dưa leo, sốt MCT',                      N'🥩', 115000, 290, 38.0, 4.0,  15.0, 3.0, 1, 0, 15),
-- Eat Clean
(1, N'Bát Buddha Eat Clean',N'Gạo lứt, đậu hũ sốt tamari, rau củ nướng, sốt tahini',              N'🥗', 79000,  420, 18.0, 52.0, 14.0, 8.0, 1, 1, 25),
(1, N'Wrap Tôm Cuộn',     N'Bánh mì nguyên cám, tôm sú, rau xanh, sốt Greek yogurt',              N'🌯', 95000,  410, 28.0, 45.0, 11.0, 5.0, 1, 0, 20),
(1, N'Smoothie Bowl Acai',N'Acai, chuối, granola, hạt chia, trái cây tươi',                        N'🫐', 75000,  290, 8.0,  48.0, 6.0,  7.0, 1, 1, 10),
(1, N'Bánh mì nguyên cám',N'Bánh mì nguyên cám, trứng bác, bơ, cà chua',                          N'🥪', 49000,  280, 16.0, 38.0, 7.0,  4.0, 1, 0, 10),
-- High Protein
(6, N'Cá hồi áp chảo',   N'Cá hồi Na Uy với rau củ mùa vụ và sốt chanh dây',                     N'🐟', 145000, 380, 35.0, 8.0,  18.0, 3.0, 1, 1, 25),
(6, N'Yến mạch Protein',  N'Yến mạch, protein whey, hạt lanh, chuối, sữa hạnh nhân',              N'🥣', 55000,  350, 22.0, 42.0, 9.0,  6.0, 1, 0, 10),
-- Low Carb
(3, N'Salad Low-carb',    N'Xà lách romaine, dưa leo, cà chua bi, sốt mù tạt mật ong',            N'🥬', 65000,  180, 12.0, 12.0, 10.0, 4.0, 1, 0, 10),
(3, N'Súp miso rau củ',   N'Dashi, đậu hũ non, rong biển, nấm, hành lá',                          N'🍜', 58000,  160, 8.0,  24.0, 3.0,  5.0, 1, 0, 15),
-- Giảm cân
(4, N'Cơm gạo lứt gà',   N'Cơm gạo lứt, ức gà hấp, rau củ luộc, tương ít muối',                 N'🍚', 72000,  450, 30.0, 58.0, 8.0,  6.0, 1, 0, 25),
-- Đồ uống
(1, N'Sinh tố xanh',      N'Cải xoăn, táo xanh, gừng, chanh, dưa leo',                            N'🥤', 45000,  130, 4.0,  22.0, 2.0,  3.0, 1, 1, 5);
GO

-- Gán tags cho sản phẩm
INSERT INTO ProductTagMap (product_id, tag_id) VALUES
(1,1),(1,5),   -- Gà nướng Keto: Keto, High Protein
(2,1),(2,7),   -- Bò Keto: Keto, Giảm cân
(3,2),(3,3),   -- Bát Buddha: Eat Clean, Vegan
(4,2),         -- Wrap Tôm: Eat Clean
(5,2),         -- Smoothie Bowl: Eat Clean
(6,2),         -- Bánh mì: Eat Clean
(7,5),(7,6),   -- Cá hồi: High Protein, Omega-3
(8,5),(8,8),   -- Yến mạch: High Protein, Tăng cơ
(9,4),(9,3),   -- Salad LC: Low Carb, Vegan
(10,4),(10,3), -- Súp miso: Low Carb, Vegan
(11,7),        -- Cơm gạo lứt: Giảm cân
(12,2),(12,3); -- Sinh tố xanh: Eat Clean, Vegan
GO

-- ============================================================
-- 7. GÓI ĂN ĐỊNH KỲ
-- ============================================================
INSERT INTO SubscriptionPlans (plan_name, health_goal, days_per_week, meals_per_day,
    price_per_meal, discount_pct, description, is_featured) VALUES
(N'Gói 3 ngày',      N'EatClean', 3, 1, 75000, 5,
    N'Thứ 2, 4, 6 - 1 bữa trưa mỗi ngày', 0),
(N'Gói 5 ngày Keto', N'Keto',     5, 2, 72000, 15,
    N'Thứ 2 đến Thứ 6 - 2 bữa trưa và tối', 1),
(N'Gói 7 ngày',      N'Toàn diện',7, 3, 68000, 25,
    N'Cả tuần - 3 bữa đầy đủ', 0),
(N'Gói 1 tháng',     N'EatClean',20, 1, 70000, 15,
    N'20 ngày làm việc với báo cáo dinh dưỡng', 0),
(N'Gói VIP 30 ngày', N'Toàn diện',30, 2, 65000, 28,
    N'30 ngày liên tục, chef cá nhân hoá', 1);
GO

-- ============================================================
-- 8. VOUCHER MẪU
-- ============================================================
INSERT INTO Vouchers (code, discount_type, discount_val, min_order, max_uses,
    valid_to, description, status) VALUES
(N'HEALTHY20', N'percent', 20, 200000, 500, '2024-02-29', N'Giảm 20% cho đơn từ 200k',    N'active'),
(N'NEWUSER50K', N'fixed',  50000, 100000, 200, '2024-01-31', N'Giảm 50k cho khách mới',   N'active'),
(N'KETOFAN',   N'percent', 15, 150000, 300, '2024-01-20', N'Dành cho hội viên Keto',       N'active'),
(N'TET2024',   N'percent', 30, 300000, 1000,'2024-02-10', N'Khuyến mãi Tết Nguyên Đán',   N'scheduled');
GO

-- ============================================================
-- 9. ĐƠN HÀNG MẪU
-- ============================================================
INSERT INTO Orders (order_code, customer_id, delivery_name, delivery_phone, delivery_addr,
    delivery_time, subtotal, ship_fee, total_amount, status, payment_method, payment_status,
    shipper_id, order_source, total_calories, created_at, completed_at) VALUES
(N'#2401', 1, N'Nguyễn Minh Anh', '0901234567', N'123 Trần Hưng Đạo, Q.1, TP.HCM',
    N'Sớm nhất', 154000, 25000, 179000, N'delivering', N'online', N'paid',
    5, N'web', 500, '2024-01-15 10:30:00', NULL),
(N'#2402', 1, N'Nguyễn Minh Anh', '0901234567', N'123 Trần Hưng Đạo, Q.1, TP.HCM',
    N'11:00-12:00', 190000, 25000, 215000, N'done', N'cash', N'paid',
    5, N'web', 510, '2024-01-14 12:10:00', '2024-01-14 12:55:00'),
(N'#2403', 1, N'Nguyễn Minh Anh', '0901234567', N'123 Trần Hưng Đạo, Q.1, TP.HCM',
    N'Sớm nhất', 158000, 25000, 183000, N'done', N'online', N'paid',
    5, N'web', 840, '2024-01-13 11:45:00', '2024-01-13 12:30:00');
GO

-- Chi tiết đơn hàng
INSERT INTO OrderItems (order_id, product_id, quantity, unit_price, item_note, calories) VALUES
(1, 1, 1, 89000, NULL, 320),           -- Gà nướng Keto
(1, 9, 1, 65000, N'Không hành tây', 180), -- Salad Low-carb
(2, 7, 1, 145000, N'Ít muối', 380),    -- Cá hồi áp chảo
(2, 12, 1, 45000, NULL, 130),          -- Sinh tố xanh
(3, 3, 2, 79000, N'Không đậu phọng', 420); -- Bát Buddha x2
GO

-- Đánh giá đơn hàng
INSERT INTO OrderRatings (order_id, customer_id, stars, comment) VALUES
(2, 1, 5, N'Cá hồi rất tươi, đóng gói đẹp, giao hàng đúng giờ!'),
(3, 1, 4, N'Bát Buddha ngon, nhưng muốn thêm rau củ hơn nữa');
GO

-- Điểm thưởng
INSERT INTO LoyaltyTransactions (customer_id, points, reason, order_id) VALUES
(1, 150, N'Mua hàng đơn #2402', 2),
(1, 158, N'Mua hàng đơn #2403', 3),
(1, -58,  N'Đổi điểm giảm giá', NULL);
GO

-- Tracking calo 7 ngày qua
INSERT INTO CalorieTracking (customer_id, track_date, total_cal, total_protein, total_carb, total_fat)
VALUES
(1, '2024-01-09', 1720, 95.0, 185.0, 52.0),
(1, '2024-01-10', 1850, 110.0,200.0, 58.0),
(1, '2024-01-11', 1600, 88.0, 170.0, 48.0),
(1, '2024-01-12', 1900, 115.0,205.0, 62.0),
(1, '2024-01-13', 1780, 100.0,190.0, 55.0),
(1, '2024-01-14', 1680, 92.0, 178.0, 50.0),
(1, '2024-01-15', 640,  36.0, 72.0,  22.0);  -- Hôm nay (chưa xong)
GO

-- Giao dịch kho mẫu
INSERT INTO InventoryTransactions (inventory_id, trans_type, quantity, reason, performed_by)
VALUES
(1, N'IMPORT',  20.0, N'Nhập hàng tuần từ Trang trại Hữu Cơ Xanh', 4),
(1, N'EXPORT',  -4.5, N'Sử dụng chế biến ngày 15/01', 2),
(2, N'IMPORT',   5.0, N'Nhập cá hồi tươi', 4),
(2, N'EXPORT',  -1.8, N'Sử dụng chế biến ngày 15/01', 2),
(3, N'IMPORT',  10.0, N'Nhập rau sạch Đà Lạt', 4),
(3, N'EXPORT',  -2.0, N'Sử dụng chế biến ngày 15/01', 2);
GO

PRINT N'✅ Dữ liệu mẫu đã được thêm thành công!';
GO