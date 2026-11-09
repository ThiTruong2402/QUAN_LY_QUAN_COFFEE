-- ================================================================
-- BƯỚC 1: CHẠY FILE NÀY TRÊN TIDB CLOUD ĐỂ ĐỒNG BỘ TOÀN DIỆN CSDL
-- Khắc phục:
-- 1. Thiếu cột pickup_time (gây lỗi khách đặt hàng không đẩy được về quán)
-- 2. Thiếu cột is_available, is_active (gây lỗi nạp thực đơn)
-- 3. Bổ sung tài khoản Quản Lý / Thu Ngân / Pha Chế trên TiDB Cloud
-- ================================================================

USE my_coffee_house;

-- 1. Bổ sung cột cho bảng orders (Fix lỗi Unknown column 'pickup_time')
ALTER TABLE `orders` ADD COLUMN IF NOT EXISTS `pickup_time` datetime DEFAULT NULL;

-- 2. Bổ sung cột cho bảng products (Fix lỗi Unknown column 'is_available')
ALTER TABLE `products` ADD COLUMN IF NOT EXISTS `is_available` tinyint(1) DEFAULT 1;
ALTER TABLE `products` ADD COLUMN IF NOT EXISTS `updated_at` datetime DEFAULT CURRENT_TIMESTAMP;

-- 3. Bổ sung cột cho bảng product_sizes (Fix lỗi Unknown column 'is_active')
ALTER TABLE `product_sizes` ADD COLUMN IF NOT EXISTS `is_active` tinyint(1) DEFAULT 1;

-- 4. Bổ sung các cột đặt bàn cho bảng tables
ALTER TABLE `tables` ADD COLUMN IF NOT EXISTS `reservation_name` varchar(100) DEFAULT NULL;
ALTER TABLE `tables` ADD COLUMN IF NOT EXISTS `reservation_phone` varchar(20) DEFAULT NULL;
ALTER TABLE `tables` ADD COLUMN IF NOT EXISTS `reservation_time` varchar(50) DEFAULT NULL;
ALTER TABLE `tables` ADD COLUMN IF NOT EXISTS `reservation_note` varchar(255) DEFAULT NULL;
ALTER TABLE `tables` ADD COLUMN IF NOT EXISTS `customer_count` int DEFAULT 0;

-- 5. Bổ sung cột ảnh nguyên liệu cho ingredients
ALTER TABLE `ingredients` ADD COLUMN IF NOT EXISTS `image_url` varchar(500) DEFAULT NULL;
ALTER TABLE `ingredients` ADD COLUMN IF NOT EXISTS `updated_at` datetime DEFAULT CURRENT_TIMESTAMP;

-- 6. Tạo bảng cấu hình cửa hàng (store_settings) cho tính năng hẹn giờ đặt trước
CREATE TABLE IF NOT EXISTS `store_settings` (
  `key` VARCHAR(50) NOT NULL PRIMARY KEY,
  `value` VARCHAR(255) NOT NULL,
  `description` VARCHAR(255) DEFAULT NULL,
  `updated_at` DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO `store_settings` (`key`, `value`, `description`) VALUES
  ('open_time', '06:30', 'Giờ mở cửa quán (HH:mm)'),
  ('close_time', '23:00', 'Giờ đóng cửa quán (HH:mm)'),
  ('slot_step_minutes', '15', 'Bước giờ nhận hàng (phút)'),
  ('min_lead_time_minutes', '30', 'Đặt trước tối thiểu (phút) kể từ bây giờ'),
  ('auto_dispatch_before_minutes', '15', 'Tự động chuyển đơn cho Barista trước giờ nhận (phút)'),
  ('max_advance_days', '2', 'Cho phép đặt trước tối đa bao nhiêu ngày')
ON DUPLICATE KEY UPDATE `description` = VALUES(`description`);

-- 7. Cập nhật ràng buộc check để hỗ trợ đơn hẹn giờ 'scheduled'
ALTER TABLE `orders` DROP CONSTRAINT IF EXISTS `orders_chk_2`;
ALTER TABLE `orders` ADD CONSTRAINT `orders_chk_2` CHECK (`status` IN ('pending', 'scheduled', 'processing', 'completed', 'cancelled'));

ALTER TABLE `order_items` DROP CONSTRAINT IF EXISTS `order_items_chk_2`;
ALTER TABLE `order_items` ADD CONSTRAINT `order_items_chk_2` CHECK (`status` IN ('pending', 'scheduled', 'preparing', 'ready', 'served', 'cancelled'));

-- 8. Bổ sung vai trò (roles) nếu TiDB Cloud chưa có
INSERT INTO `roles` (`id`, `name`, `label`, `description`) VALUES
  (1, 'admin', 'Quản lý', 'Quản lý toàn bộ hệ thống quán'),
  (2, 'cashier', 'Thu ngân', 'Thao tác order, thanh toán tại quầy'),
  (3, 'waiter', 'Phục vụ bàn', 'Tạo order, xem trạng thái bàn'),
  (4, 'barista', 'Pha chế', 'Xem hàng đợi KDS, cập nhật món'),
  (5, 'warehouse', 'Thủ kho', 'Quản lý kho nguyên vật liệu'),
  (6, 'customer', 'Khách hàng', 'Tự đặt món trực tuyến & tích điểm')
ON DUPLICATE KEY UPDATE `name` = VALUES(`name`);

-- 9. Bổ sung tài khoản Admin & Thu Ngân & Pha Chế (Mật khẩu mặc định: 123456)
INSERT INTO `users` (`id`, `code`, `username`, `password_hash`, `full_name`, `role_id`, `phone`, `email`, `is_active`) VALUES
  (1, 'NV001', 'admin', '$2b$10$q05S94ZPVeKW1waLEDhzkerOOsQ5Bl/AbyXYRTMNqeFHWqelHjwWa', 'Nguyễn Hoàng Long', 1, '0901234567', 'admin@mycoffee.vn', 1),
  (2, 'NV002', 'cashier', '$2b$10$k.pAE8fIhkIaO96Eg7u.Sum7uaCI4m6ZE8EFQcPdnBt4zbirmyNNO', 'Trần Thu Hà', 2, '0902345678', 'cashier@mycoffee.vn', 1),
  (3, 'NV003', 'barista', '$2b$10$1Y5f6eA4bMv93hZk1P8aGe/7jLq1rQcE9wUyU3z6t.6Q2k9x8yqWm', 'Đặng Minh Tuấn', 4, '0903456789', 'barista@mycoffee.vn', 1)
ON DUPLICATE KEY UPDATE `password_hash` = VALUES(`password_hash`);

-- Tắt mã FREESHIP
UPDATE `promotions` SET `is_active` = 0 WHERE `code` = 'FREESHIP';

SELECT 'DA DONG BO TOAN BO COT, BANG VA TAI KHOAN THANH CONG!' AS result;
