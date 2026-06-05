-- ============================================================
-- FITFOOD - INDEX TỐI ƯU HIỆU NĂNG
-- ============================================================
USE FitFoodDB;
GO

-- --- Bảng Orders: tìm kiếm theo user và status thường xuyên ---
CREATE INDEX idx_orders_user_status
ON Orders (user_id, status, created_at DESC)
INCLUDE (order_code, total, order_type);

-- Tìm đơn theo ngày (báo cáo doanh thu)
CREATE INDEX idx_orders_date
ON Orders (created_at, status)
INCLUDE (total, order_type, user_id);

-- Tìm đơn theo trạng thái (KDS)
CREATE INDEX idx_orders_status_created
ON Orders (status, created_at DESC)
INCLUDE (order_code, user_id, delivery_timeslot);

-- --- Bảng OrderItems ---
CREATE INDEX idx_orderitems_order
ON OrderItems (order_id)
INCLUDE (product_id, quantity, unit_price, calories_snapshot);

CREATE INDEX idx_orderitems_product
ON OrderItems (product_id, order_id);

-- --- Bảng Products: lọc theo danh mục và trạng thái ---
CREATE INDEX idx_products_category_available
ON Products (category_id, is_available, price)
INCLUDE (name, calories, protein_g, carbs_g, fat_g, health_tags);

-- --- Bảng Inventory: tìm theo hạn sử dụng (cảnh báo) ---
CREATE INDEX idx_inventory_expiry
ON Inventory (expiry_date, quantity)
INCLUDE (inventory_code, name, category, unit, min_quantity);

-- Tìm theo danh mục
CREATE INDEX idx_inventory_category
ON Inventory (category, expiry_date, quantity);

-- --- Bảng Subscriptions: tìm gói đang chạy ---
CREATE INDEX idx_subscriptions_active
ON Subscriptions (status, start_date, end_date)
INCLUDE (user_id, plan_id, timeslot, delivery_address);

-- --- Bảng Users ---
CREATE INDEX idx_users_email ON Users (email) INCLUDE (password_hash, role, is_active);
CREATE INDEX idx_users_role  ON Users (role, is_active);

-- --- Bảng Vouchers ---
CREATE INDEX idx_vouchers_code_active
ON Vouchers (code, is_active, expires_at)
INCLUDE (discount_type, discount_value, min_order, max_uses, used_count);

-- --- Bảng Notifications: lọc theo role và chưa đọc ---
CREATE INDEX idx_notifications_role_unread
ON Notifications (target_role, is_read, created_at DESC)
INCLUDE (type, title, message);

-- --- ShipperTracking: lọc theo đơn hàng ---
CREATE INDEX idx_shipper_tracking_order
ON ShipperTracking (order_id, recorded_at DESC)
INCLUDE (shipper_id, latitude, longitude);

-- --- InventoryLogs: lịch sử theo nguyên liệu ---
CREATE INDEX idx_invlogs_inventory
ON InventoryLogs (inventory_id, created_at DESC)
INCLUDE (action_type, quantity_change, order_id);

PRINT N'✅ Tất cả indexes đã được tạo';
GO