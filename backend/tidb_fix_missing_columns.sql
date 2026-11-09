-- ================================================================
-- BƯỚC 1: CHẠY FILE NÀY TRƯỚC TRÊN TIDB CLOUD ĐỂ BỔ SUNG CỘT BỊ THIẾU
-- Sửa lỗi: Unknown column 'is_available' & Unknown column 'is_active'
-- ================================================================

USE my_coffee_house;

-- 1. Bổ sung cột cho bảng products (Fix lỗi Unknown column 'is_available')
ALTER TABLE `products` ADD COLUMN IF NOT EXISTS `is_available` tinyint(1) DEFAULT 1;
ALTER TABLE `products` ADD COLUMN IF NOT EXISTS `updated_at` datetime DEFAULT CURRENT_TIMESTAMP;

-- 2. Bổ sung cột cho bảng product_sizes (Fix lỗi Unknown column 'is_active')
ALTER TABLE `product_sizes` ADD COLUMN IF NOT EXISTS `is_active` tinyint(1) DEFAULT 1;

-- 3. Bổ sung các cột đặt bàn cho bảng tables
ALTER TABLE `tables` ADD COLUMN IF NOT EXISTS `reservation_name` varchar(100) DEFAULT NULL;
ALTER TABLE `tables` ADD COLUMN IF NOT EXISTS `reservation_phone` varchar(20) DEFAULT NULL;
ALTER TABLE `tables` ADD COLUMN IF NOT EXISTS `reservation_time` varchar(50) DEFAULT NULL;
ALTER TABLE `tables` ADD COLUMN IF NOT EXISTS `reservation_note` varchar(255) DEFAULT NULL;
ALTER TABLE `tables` ADD COLUMN IF NOT EXISTS `customer_count` int DEFAULT 0;

-- 4. Bổ sung cột ảnh nguyên liệu cho ingredients
ALTER TABLE `ingredients` ADD COLUMN IF NOT EXISTS `image_url` varchar(500) DEFAULT NULL;
ALTER TABLE `ingredients` ADD COLUMN IF NOT EXISTS `updated_at` datetime DEFAULT CURRENT_TIMESTAMP;

-- 5. Tạo bảng cấu hình cửa hàng (store_settings) cho tính năng hẹn giờ đặt trước
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

-- 6. Cập nhật ràng buộc check để hỗ trợ đơn hẹn giờ 'scheduled'
ALTER TABLE `orders` DROP CONSTRAINT IF EXISTS `orders_chk_2`;
ALTER TABLE `orders` ADD CONSTRAINT `orders_chk_2` CHECK (`status` IN ('pending', 'scheduled', 'processing', 'completed', 'cancelled'));

ALTER TABLE `order_items` DROP CONSTRAINT IF EXISTS `order_items_chk_2`;
ALTER TABLE `order_items` ADD CONSTRAINT `order_items_chk_2` CHECK (`status` IN ('pending', 'scheduled', 'preparing', 'ready', 'served', 'cancelled'));

-- Tắt mã FREESHIP (chỉ áp dụng mã giảm giá có trong tài khoản)
UPDATE `promotions` SET `is_active` = 0 WHERE `code` = 'FREESHIP';

SELECT 'DA BO SUNG TOAN BO COT VA BANG THANH CONG!' AS result;
