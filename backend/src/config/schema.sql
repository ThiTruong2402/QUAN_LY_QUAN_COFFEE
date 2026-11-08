-- ================================================================
-- MY COFFEE HOUSE - Database Schema (MySQL) - PRODUCTION UNIFIED
-- HỆ THỐNG QUẢN LÝ QUÁN CÀ PHÊ CHUYÊN NGHIỆP
-- Đầy đủ 27 bảng, chuẩn hóa dữ liệu, sẵn sàng khởi tạo mới 100%
-- ================================================================

CREATE DATABASE IF NOT EXISTS my_coffee_house
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE my_coffee_house;

SET FOREIGN_KEY_CHECKS = 0;

-- ----------------------------------------------------------------
-- 1. PHÂN HỆ VAI TRÒ & NGƯỜI DÙNG (ROLES & USERS)
-- ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS roles (
  id          BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  name        VARCHAR(30) COLLATE utf8mb4_unicode_ci NOT NULL UNIQUE,
  label       VARCHAR(60) COLLATE utf8mb4_unicode_ci NOT NULL,
  description VARCHAR(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  created_at  DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS users (
  id            BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  code          VARCHAR(20) COLLATE utf8mb4_unicode_ci DEFAULT NULL UNIQUE,
  username      VARCHAR(50) COLLATE utf8mb4_unicode_ci NOT NULL UNIQUE,
  password_hash VARCHAR(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  full_name     VARCHAR(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  birthday      DATE DEFAULT NULL,
  gender        VARCHAR(10) COLLATE utf8mb4_unicode_ci DEFAULT 'Khác',
  email         VARCHAR(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  phone         VARCHAR(20) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  role_id       BIGINT NOT NULL,
  pin_hash      VARCHAR(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  avatar_url    VARCHAR(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  is_active     TINYINT(1) NOT NULL DEFAULT 1,
  created_at    DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at    DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT users_ibfk_1 FOREIGN KEY (role_id) REFERENCES roles (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS work_shifts (
  id          BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  shift_code  VARCHAR(20) COLLATE utf8mb4_unicode_ci NOT NULL,
  user_id     BIGINT NOT NULL,
  shift_type  VARCHAR(50) COLLATE utf8mb4_unicode_ci NOT NULL,
  shift_date  DATE NOT NULL,
  status      VARCHAR(30) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'Chưa bắt đầu',
  note        VARCHAR(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
  KEY user_id (user_id),
  CONSTRAINT work_shifts_ibfk_1 FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------
-- 2. KHU VỰC & BÀN (AREAS & TABLES)
-- ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS areas (
  id        BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  name      VARCHAR(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  is_active TINYINT(1) DEFAULT 1
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `tables` (
  id      BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  area_id BIGINT NOT NULL,
  code    VARCHAR(20) COLLATE utf8mb4_unicode_ci NOT NULL UNIQUE,
  seats   INT DEFAULT 4,
  status  VARCHAR(15) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'empty',
  CONSTRAINT tables_ibfk_1 FOREIGN KEY (area_id) REFERENCES areas (id),
  CONSTRAINT tables_chk_1 CHECK (status IN ('empty', 'occupied', 'reserved', 'disabled'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------
-- 3. THỰC ĐƠN, DANH MỤC & TOPPING (CATALOG)
-- ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS categories (
  id          BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  name        VARCHAR(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  description VARCHAR(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  sort_order  INT DEFAULT 0,
  is_active   TINYINT(1) DEFAULT 1,
  created_at  DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS products (
  id          BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  code        VARCHAR(20) COLLATE utf8mb4_unicode_ci DEFAULT NULL UNIQUE,
  category_id BIGINT NOT NULL,
  name        VARCHAR(150) COLLATE utf8mb4_unicode_ci NOT NULL,
  description VARCHAR(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  image_url   VARCHAR(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  is_active   TINYINT(1) DEFAULT 1,
  created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT products_ibfk_1 FOREIGN KEY (category_id) REFERENCES categories (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS product_sizes (
  id         BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  product_id BIGINT NOT NULL,
  name       VARCHAR(30) COLLATE utf8mb4_unicode_ci NOT NULL,
  price      BIGINT NOT NULL,
  is_default TINYINT(1) DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT product_sizes_ibfk_1 FOREIGN KEY (product_id) REFERENCES products (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS toppings (
  id        BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  name      VARCHAR(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  price     BIGINT NOT NULL,
  is_active TINYINT(1) DEFAULT 1
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------
-- 4. KHO NGUYÊN LIỆU & ĐỊNH LƯỢNG PHA CHẾ (INVENTORY & RECIPES)
-- ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS ingredients (
  id            BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  code          VARCHAR(20) COLLATE utf8mb4_unicode_ci DEFAULT NULL UNIQUE,
  name          VARCHAR(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  unit          VARCHAR(20) COLLATE utf8mb4_unicode_ci NOT NULL,
  current_stock DECIMAL(14,3) NOT NULL DEFAULT 0.000,
  min_stock     DECIMAL(14,3) NOT NULL DEFAULT 0.000,
  avg_cost      DECIMAL(14,4) NOT NULL DEFAULT 0.0000,
  image_url     VARCHAR(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  created_at    DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS recipes (
  id              BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  product_size_id BIGINT NOT NULL,
  ingredient_id   BIGINT NOT NULL,
  quantity        DECIMAL(10,3) NOT NULL,
  CONSTRAINT recipes_ibfk_1 FOREIGN KEY (product_size_id) REFERENCES product_sizes (id) ON DELETE CASCADE,
  CONSTRAINT recipes_ibfk_2 FOREIGN KEY (ingredient_id) REFERENCES ingredients (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS suppliers (
  id         BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  name       VARCHAR(150) COLLATE utf8mb4_unicode_ci NOT NULL,
  phone      VARCHAR(20) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  address    VARCHAR(300) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  debt       BIGINT DEFAULT 0,
  is_active  TINYINT(1) DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS stock_receipts (
  id           BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  code         VARCHAR(25) COLLATE utf8mb4_unicode_ci NOT NULL UNIQUE,
  supplier_id  BIGINT NOT NULL,
  status       VARCHAR(10) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'draft',
  total_amount BIGINT DEFAULT 0,
  paid_amount  BIGINT DEFAULT 0,
  note         VARCHAR(300) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  receipt_date DATE NOT NULL,
  confirmed_at DATETIME DEFAULT NULL,
  created_by   BIGINT NOT NULL,
  created_at   DATETIME DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT stock_receipts_ibfk_1 FOREIGN KEY (supplier_id) REFERENCES suppliers (id),
  CONSTRAINT stock_receipts_ibfk_2 FOREIGN KEY (created_by) REFERENCES users (id),
  CONSTRAINT stock_receipts_chk_1 CHECK (status IN ('draft', 'confirmed', 'cancelled'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS stock_receipt_items (
  id            BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  receipt_id    BIGINT NOT NULL,
  ingredient_id BIGINT NOT NULL,
  quantity      DECIMAL(14,3) NOT NULL,
  unit_price    BIGINT NOT NULL,
  expiry_date   DATE DEFAULT NULL,
  CONSTRAINT stock_receipt_items_ibfk_1 FOREIGN KEY (receipt_id) REFERENCES stock_receipts (id) ON DELETE CASCADE,
  CONSTRAINT stock_receipt_items_ibfk_2 FOREIGN KEY (ingredient_id) REFERENCES ingredients (id),
  CONSTRAINT stock_receipt_items_chk_1 CHECK (quantity > 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS stock_movements (
  id            BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  ingredient_id BIGINT NOT NULL,
  movement_type VARCHAR(15) COLLATE utf8mb4_unicode_ci NOT NULL,
  quantity      DECIMAL(14,3) NOT NULL,
  unit_cost     DECIMAL(14,4) DEFAULT 0.0000,
  balance_after DECIMAL(14,3) NOT NULL,
  ref_type      VARCHAR(30) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  ref_id        BIGINT DEFAULT NULL,
  note          VARCHAR(200) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  created_by    BIGINT DEFAULT NULL,
  created_at    DATETIME DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT stock_movements_ibfk_1 FOREIGN KEY (ingredient_id) REFERENCES ingredients (id),
  CONSTRAINT stock_movements_ibfk_2 FOREIGN KEY (created_by) REFERENCES users (id),
  CONSTRAINT stock_movements_chk_1 CHECK (movement_type IN ('receipt', 'sale', 'waste', 'issue', 'adjustment', 'void_return'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------
-- 5. KHÁCH HÀNG & THÀNH VIÊN (CUSTOMERS & LOYALTY)
-- ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS membership_tiers (
  id             BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  name           VARCHAR(60) COLLATE utf8mb4_unicode_ci NOT NULL,
  min_spent      BIGINT DEFAULT 0,
  discount_pct   DECIMAL(5,2) DEFAULT 0.00,
  points_per_10k INT DEFAULT 1
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS customers (
  id             BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  phone          VARCHAR(20) COLLATE utf8mb4_unicode_ci NOT NULL UNIQUE,
  name           VARCHAR(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  birthday       DATE DEFAULT NULL,
  tier_id        BIGINT DEFAULT 1,
  points_balance INT DEFAULT 0,
  total_spent    BIGINT DEFAULT 0,
  created_at     DATETIME DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT customers_ibfk_1 FOREIGN KEY (tier_id) REFERENCES membership_tiers (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS loyalty_transactions (
  id          BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  customer_id BIGINT NOT NULL,
  order_id    BIGINT DEFAULT NULL,
  type        VARCHAR(10) COLLATE utf8mb4_unicode_ci NOT NULL,
  points      INT NOT NULL,
  expires_at  DATE DEFAULT NULL,
  created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT loyalty_transactions_ibfk_1 FOREIGN KEY (customer_id) REFERENCES customers (id),
  CONSTRAINT loyalty_transactions_chk_1 CHECK (type IN ('earn', 'redeem', 'expire', 'revoke'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------
-- 6. CA THU NGÂN (CASH SHIFTS)
-- ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS cash_shifts (
  id            BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  user_id       BIGINT NOT NULL,
  status        VARCHAR(20) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'open',
  opening_cash  BIGINT NOT NULL DEFAULT 0,
  expected_cash BIGINT DEFAULT NULL,
  counted_cash  BIGINT DEFAULT NULL,
  difference    BIGINT DEFAULT NULL,
  explanation   VARCHAR(300) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  approved_by   BIGINT DEFAULT NULL,
  opened_at     DATETIME DEFAULT CURRENT_TIMESTAMP,
  closed_at     DATETIME DEFAULT NULL,
  CONSTRAINT cash_shifts_ibfk_1 FOREIGN KEY (user_id) REFERENCES users (id),
  CONSTRAINT cash_shifts_ibfk_2 FOREIGN KEY (approved_by) REFERENCES users (id),
  CONSTRAINT cash_shifts_chk_1 CHECK (status IN ('open', 'pending_approval', 'closed'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------
-- 7. KHUYẾN MÃI (PROMOTIONS)
-- ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS promotions (
  id              BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  code            VARCHAR(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL UNIQUE,
  name            VARCHAR(150) COLLATE utf8mb4_unicode_ci NOT NULL,
  description     VARCHAR(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  type            VARCHAR(20) COLLATE utf8mb4_unicode_ci NOT NULL,
  value           BIGINT NOT NULL DEFAULT 0,
  min_order_value BIGINT DEFAULT 0,
  max_discount    BIGINT DEFAULT NULL,
  start_date      DATE NOT NULL,
  end_date        DATE NOT NULL,
  time_from       TIME DEFAULT NULL,
  time_to         TIME DEFAULT NULL,
  days_of_week    JSON DEFAULT NULL,
  conditions      JSON DEFAULT NULL,
  is_exclusive    TINYINT(1) DEFAULT 0,
  is_active       TINYINT(1) DEFAULT 1,
  created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT promotions_chk_1 CHECK (type IN ('percent_order', 'amount_order', 'percentage', 'fixed', 'percent_item', 'combo', 'happy_hour'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------
-- 8. ĐƠN HÀNG, CHI TIẾT ĐƠN & TOPPING (ORDERS & ORDER ITEMS)
-- ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS orders (
  id               BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  code             VARCHAR(20) COLLATE utf8mb4_unicode_ci NOT NULL UNIQUE,
  order_type       VARCHAR(15) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'takeaway',
  table_id         BIGINT DEFAULT NULL,
  parent_order_id  BIGINT DEFAULT NULL,
  customer_id      BIGINT DEFAULT NULL,
  cash_shift_id    BIGINT DEFAULT NULL,
  status           VARCHAR(15) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'pending',
  payment_status   VARCHAR(20) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'unpaid',
  subtotal         BIGINT DEFAULT 0,
  discount_total   BIGINT DEFAULT 0,
  service_fee      BIGINT DEFAULT 0,
  vat_amount       BIGINT DEFAULT 0,
  total            BIGINT DEFAULT 0,
  version          INT DEFAULT 0,
  note             VARCHAR(300) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  delivery_address VARCHAR(300) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  shipping_fee     BIGINT DEFAULT 0,
  recipient_phone  VARCHAR(20) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  coupon_code      VARCHAR(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  created_by       BIGINT NOT NULL,
  opened_at        DATETIME DEFAULT CURRENT_TIMESTAMP,
  closed_at        DATETIME DEFAULT NULL,
  CONSTRAINT orders_ibfk_1 FOREIGN KEY (table_id) REFERENCES `tables` (id),
  CONSTRAINT orders_ibfk_2 FOREIGN KEY (customer_id) REFERENCES customers (id),
  CONSTRAINT orders_ibfk_3 FOREIGN KEY (cash_shift_id) REFERENCES cash_shifts (id),
  CONSTRAINT orders_ibfk_4 FOREIGN KEY (created_by) REFERENCES users (id),
  CONSTRAINT orders_chk_1 CHECK (order_type IN ('dine_in', 'takeaway', 'online', 'delivery')),
  CONSTRAINT orders_chk_2 CHECK (status IN ('open', 'pending', 'preparing', 'done', 'served', 'paid', 'cancelled', 'merged'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS order_items (
  id              BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  order_id        BIGINT NOT NULL,
  product_size_id BIGINT NOT NULL,
  product_name    VARCHAR(150) COLLATE utf8mb4_unicode_ci NOT NULL,
  size_name       VARCHAR(30) COLLATE utf8mb4_unicode_ci NOT NULL,
  unit_price      BIGINT NOT NULL,
  quantity        INT NOT NULL,
  toppings_total  BIGINT DEFAULT 0,
  line_total      BIGINT NOT NULL,
  note            VARCHAR(200) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  status          VARCHAR(15) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'pending',
  sent_at         DATETIME DEFAULT NULL,
  started_at      DATETIME DEFAULT NULL,
  done_at         DATETIME DEFAULT NULL,
  cancel_reason   VARCHAR(200) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  cancelled_by    BIGINT DEFAULT NULL,
  approved_by     BIGINT DEFAULT NULL,
  CONSTRAINT order_items_ibfk_1 FOREIGN KEY (order_id) REFERENCES orders (id) ON DELETE CASCADE,
  CONSTRAINT order_items_ibfk_2 FOREIGN KEY (product_size_id) REFERENCES product_sizes (id),
  CONSTRAINT order_items_ibfk_3 FOREIGN KEY (cancelled_by) REFERENCES users (id),
  CONSTRAINT order_items_ibfk_4 FOREIGN KEY (approved_by) REFERENCES users (id),
  CONSTRAINT order_items_chk_1 CHECK (quantity > 0),
  CONSTRAINT order_items_chk_2 CHECK (status IN ('unsent', 'pending', 'preparing', 'done', 'served', 'cancelled'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS order_item_toppings (
  id            BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  order_item_id BIGINT NOT NULL,
  topping_id    BIGINT NOT NULL,
  topping_name  VARCHAR(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  price         BIGINT NOT NULL,
  quantity      INT DEFAULT 1,
  CONSTRAINT order_item_toppings_ibfk_1 FOREIGN KEY (order_item_id) REFERENCES order_items (id) ON DELETE CASCADE,
  CONSTRAINT order_item_toppings_ibfk_2 FOREIGN KEY (topping_id) REFERENCES toppings (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------
-- 9. HÓA ĐƠN & THANH TOÁN (INVOICES & PAYMENTS)
-- ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS document_counters (
  prefix    VARCHAR(20) COLLATE utf8mb4_unicode_ci NOT NULL PRIMARY KEY,
  last_date DATE NOT NULL,
  seq       INT NOT NULL DEFAULT 0
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS invoices (
  id          BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  invoice_no  VARCHAR(25) COLLATE utf8mb4_unicode_ci NOT NULL UNIQUE,
  order_id    BIGINT NOT NULL UNIQUE,
  subtotal    BIGINT NOT NULL,
  discount    BIGINT DEFAULT 0,
  service_fee BIGINT DEFAULT 0,
  vat         BIGINT DEFAULT 0,
  total       BIGINT NOT NULL,
  status      VARCHAR(10) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'issued',
  void_reason VARCHAR(300) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  voided_by   BIGINT DEFAULT NULL,
  print_count INT DEFAULT 0,
  created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT invoices_ibfk_1 FOREIGN KEY (order_id) REFERENCES orders (id),
  CONSTRAINT invoices_ibfk_2 FOREIGN KEY (voided_by) REFERENCES users (id),
  CONSTRAINT invoices_chk_1 CHECK (status IN ('issued', 'voided'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS payments (
  id             BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  order_id       BIGINT NOT NULL,
  cash_shift_id  BIGINT DEFAULT NULL,
  method         VARCHAR(20) COLLATE utf8mb4_unicode_ci NOT NULL,
  type           VARCHAR(10) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'payment',
  amount         BIGINT NOT NULL,
  reference_code VARCHAR(60) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  created_by     BIGINT DEFAULT NULL,
  paid_at        DATETIME DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT payments_ibfk_1 FOREIGN KEY (order_id) REFERENCES orders (id),
  CONSTRAINT payments_ibfk_2 FOREIGN KEY (cash_shift_id) REFERENCES cash_shifts (id),
  CONSTRAINT payments_ibfk_3 FOREIGN KEY (created_by) REFERENCES users (id),
  CONSTRAINT payments_chk_1 CHECK (method IN ('cash', 'bank_transfer', 'card', 'points', 'momo', 'zalopay')),
  CONSTRAINT payments_chk_2 CHECK (type IN ('payment', 'refund')),
  CONSTRAINT payments_chk_3 CHECK (amount >= 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------
-- 10. NHẬT KÝ KIỂM TOÁN (AUDIT LOGS)
-- ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS audit_logs (
  id          BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  user_id     BIGINT DEFAULT NULL,
  approved_by BIGINT DEFAULT NULL,
  action      VARCHAR(50) COLLATE utf8mb4_unicode_ci NOT NULL,
  entity_type VARCHAR(30) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  entity_id   BIGINT DEFAULT NULL,
  old_value   JSON DEFAULT NULL,
  new_value   JSON DEFAULT NULL,
  reason      VARCHAR(300) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  ip_address  VARCHAR(45) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT audit_logs_ibfk_1 FOREIGN KEY (user_id) REFERENCES users (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------
-- 11. CHỈ MỤC TỐI ƯU HIỆU NĂNG (INDEXES)
-- ----------------------------------------------------------------
CREATE INDEX idx_orders_status_opened ON orders (status, opened_at);
CREATE INDEX idx_order_items_order ON order_items (order_id);
CREATE INDEX idx_order_items_status ON order_items (status, sent_at);
CREATE INDEX idx_payments_order ON payments (order_id, paid_at);
CREATE INDEX idx_stock_movements_ingredient ON stock_movements (ingredient_id, created_at);
CREATE INDEX idx_loyalty_customer ON loyalty_transactions (customer_id, created_at);

-- ----------------------------------------------------------------
-- 12. DỮ LIỆU KHỞI TẠO MẪU (SEED DATA CHUẨN)
-- ----------------------------------------------------------------

-- 12.1 Vai trò nhân sự
INSERT INTO roles (id, name, label, description) VALUES
  (1, 'admin',     'Quản lý / Chủ quán', 'Toàn quyền kiểm soát và điều hành toàn bộ hệ thống'),
  (2, 'cashier',   'Thu ngân',           'Tạo đơn tại quầy, thu tiền và in hóa đơn cho khách'),
  (3, 'waiter',    'Phục vụ',            'Tiếp nhận yêu cầu, xem đơn và trả món cho khách'),
  (4, 'barista',   'Pha chế',            'Màn hình pha chế KDS, quản lý định lượng công thức đồ uống'),
  (5, 'warehouse', 'Thủ kho',            'Quản lý nhập xuất, tồn kho nguyên vật liệu và công nợ NCC'),
  (6, 'customer',  'Khách hàng',         'Khách hàng xem thực đơn trực tuyến, điểm tích lũy và voucher')
ON DUPLICATE KEY UPDATE label=VALUES(label), description=VALUES(description);

-- 12.2 Tài khoản nhân viên mặc định (Mật khẩu: Admin@123 / 123456)
-- Hash Admin@123: $2b$10$q05S94ZPVeKW1waLEDhzkerOOsQ5Bl/AbyXYRTMNqeFHWqelHjwWa
-- Hash 123456:    $2b$10$k.pAE8fIhkIaO96Eg7u.Sum7uaCI4m6ZE8EFQcPdnBt4zbirmyNNO
INSERT INTO users (id, code, username, password_hash, full_name, role_id, phone, email, is_active) VALUES
  (1, 'NV001', 'admin',       '$2b$10$q05S94ZPVeKW1waLEDhzkerOOsQ5Bl/AbyXYRTMNqeFHWqelHjwWa', 'Nguyễn Hoàng Long', 1, '0901234567', 'admin@mycoffee.vn', 1),
  (2, 'NV002', 'cashier',     '$2b$10$k.pAE8fIhkIaO96Eg7u.Sum7uaCI4m6ZE8EFQcPdnBt4zbirmyNNO', 'Trần Thu Hà',       2, '0902345678', 'cashier@mycoffee.vn', 1),
  (3, 'NV003', 'waiter',      '$2b$10$k.pAE8fIhkIaO96Eg7u.Sum7uaCI4m6ZE8EFQcPdnBt4zbirmyNNO', 'Phạm Minh Tuấn',    3, '0903456789', 'waiter@mycoffee.vn', 1),
  (4, 'NV004', 'barista',     '$2b$10$k.pAE8fIhkIaO96Eg7u.Sum7uaCI4m6ZE8EFQcPdnBt4zbirmyNNO', 'Lê Hải Nam',        4, '0904567890', 'barista@mycoffee.vn', 1),
  (5, 'NV005', 'warehouse',   '$2b$10$k.pAE8fIhkIaO96Eg7u.Sum7uaCI4m6ZE8EFQcPdnBt4zbirmyNNO', 'Đỗ Quang Huy',      5, '0905678901', 'warehouse@mycoffee.vn', 1)
ON DUPLICATE KEY UPDATE full_name=VALUES(full_name), role_id=VALUES(role_id);

-- 12.3 Hạng thành viên
INSERT INTO membership_tiers (id, name, min_spent, discount_pct, points_per_10k) VALUES
  (1, 'Đồng',      0,        0.00,  1),
  (2, 'Bạc',       2000000,  2.00,  2),
  (3, 'Vàng',      10000000, 5.00,  3),
  (4, 'Kim Cương', 30000000, 10.00, 5)
ON DUPLICATE KEY UPDATE name=VALUES(name), min_spent=VALUES(min_spent), discount_pct=VALUES(discount_pct);

-- 12.4 Khu vực & Bàn
INSERT INTO areas (id, name, is_active) VALUES
  (1, 'Tầng 1 - Quầy Bar & Sảnh chính', 1),
  (2, 'Tầng 2 - Không gian làm việc',   1),
  (3, 'Sân Thượng - View Ngoài Trời',   1)
ON DUPLICATE KEY UPDATE name=VALUES(name);

INSERT INTO `tables` (id, area_id, code, seats, status) VALUES
  (1, 1, 'Bàn 01', 2, 'empty'),
  (2, 1, 'Bàn 02', 4, 'empty'),
  (3, 1, 'Bàn 03', 4, 'empty'),
  (4, 1, 'Bàn 04', 6, 'empty'),
  (5, 2, 'Bàn 05', 4, 'empty'),
  (6, 2, 'Bàn 06', 4, 'empty'),
  (7, 3, 'Bàn 07', 4, 'empty'),
  (8, 3, 'Bàn 08', 2, 'empty')
ON DUPLICATE KEY UPDATE code=VALUES(code);

-- 12.5 Mã giảm giá khuyến mãi
INSERT INTO promotions (id, code, name, description, type, value, min_order_value, max_discount, start_date, end_date, is_active) VALUES
  (1, 'COFFEE10', 'Giảm 10% đơn hàng', 'Giảm 10% tối đa 50k cho đơn từ 50k', 'percent_order', 10, 50000, 50000, '2025-01-01', '2030-12-31', 1),
  (2, 'BANMOI20', 'Chào bạn mới giảm 20%', 'Giảm 20% tối đa 100k cho đơn từ 100k', 'percent_order', 20, 100000, 100000, '2025-01-01', '2030-12-31', 1),
  (3, 'GIAM20K',  'Giảm 20.000đ trực tiếp', 'Giảm ngay 20k cho đơn từ 60k', 'amount_order', 20000, 60000, 20000, '2025-01-01', '2030-12-31', 1)
ON DUPLICATE KEY UPDATE is_active=1, start_date=VALUES(start_date), end_date=VALUES(end_date);

SET FOREIGN_KEY_CHECKS = 1;
