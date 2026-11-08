const db = require('../config/db');

async function migrateSchemaFixes() {
  console.log('🔄 Đang đồng bộ hóa Schema Cơ sở Dữ liệu...');
  const conn = await db.getConnection();
  try {
    // 1. Roles: Thêm description nếu chưa có
    const [roleCols] = await conn.query(
      "SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'roles' AND COLUMN_NAME = 'description'"
    );
    if (!roleCols.length) {
      await conn.query("ALTER TABLE roles ADD COLUMN description VARCHAR(255) DEFAULT NULL AFTER label");
      console.log('  ✅ Đã thêm cột `description` vào bảng `roles`');
    }
    await conn.query("UPDATE roles SET description = label WHERE description IS NULL");

    // 2. Orders: Kiểm tra và nới rộng status check constraint & thêm các cột thiếu
    const [orderCols] = await conn.query(
      "SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'orders'"
    );
    const orderColNames = orderCols.map((c) => c.COLUMN_NAME);

    if (!orderColNames.includes('payment_status')) {
      await conn.query("ALTER TABLE orders ADD COLUMN payment_status VARCHAR(20) NOT NULL DEFAULT 'unpaid' AFTER status");
      console.log('  ✅ Đã thêm cột `payment_status` vào bảng `orders`');
    }
    if (!orderColNames.includes('coupon_code')) {
      await conn.query("ALTER TABLE orders ADD COLUMN coupon_code VARCHAR(50) DEFAULT NULL AFTER recipient_phone");
      console.log('  ✅ Đã thêm cột `coupon_code` vào bảng `orders`');
    }
    if (!orderColNames.includes('delivery_address')) {
      await conn.query("ALTER TABLE orders ADD COLUMN delivery_address VARCHAR(300) DEFAULT NULL AFTER note");
      console.log('  ✅ Đã thêm cột `delivery_address` vào bảng `orders`');
    }
    if (!orderColNames.includes('shipping_fee')) {
      await conn.query("ALTER TABLE orders ADD COLUMN shipping_fee BIGINT DEFAULT 0 AFTER delivery_address");
      console.log('  ✅ Đã thêm cột `shipping_fee` vào bảng `orders`');
    }
    if (!orderColNames.includes('recipient_phone')) {
      await conn.query("ALTER TABLE orders ADD COLUMN recipient_phone VARCHAR(20) DEFAULT NULL AFTER shipping_fee");
      console.log('  ✅ Đã thêm cột `recipient_phone` vào bảng `orders`');
    }

    // 3. Users: Thêm code, birthday, gender, email nếu thiếu
    const [userCols] = await conn.query(
      "SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users'"
    );
    const userColNames = userCols.map((c) => c.COLUMN_NAME);

    if (!userColNames.includes('code')) {
      await conn.query("ALTER TABLE users ADD COLUMN code VARCHAR(20) DEFAULT NULL AFTER id");
      console.log('  ✅ Đã thêm cột `code` vào bảng `users`');
    }
    if (!userColNames.includes('birthday')) {
      await conn.query("ALTER TABLE users ADD COLUMN birthday DATE DEFAULT NULL AFTER full_name");
      console.log('  ✅ Đã thêm cột `birthday` vào bảng `users`');
    }
    if (!userColNames.includes('gender')) {
      await conn.query("ALTER TABLE users ADD COLUMN gender VARCHAR(10) DEFAULT 'Khác' AFTER birthday");
      console.log('  ✅ Đã thêm cột `gender` vào bảng `users`');
    }
    if (!userColNames.includes('email')) {
      await conn.query("ALTER TABLE users ADD COLUMN email VARCHAR(100) DEFAULT NULL AFTER gender");
      console.log('  ✅ Đã thêm cột `email` vào bảng `users`');
    }

    // 4. Products: Thêm code nếu thiếu
    const [prodCols] = await conn.query(
      "SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'products'"
    );
    const prodColNames = prodCols.map((c) => c.COLUMN_NAME);
    if (!prodColNames.includes('code')) {
      await conn.query("ALTER TABLE products ADD COLUMN code VARCHAR(20) DEFAULT NULL AFTER id");
      console.log('  ✅ Đã thêm cột `code` vào bảng `products`');
    }

    // 5. Ingredients: Thêm code & image_url nếu thiếu
    const [ingCols] = await conn.query(
      "SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'ingredients'"
    );
    const ingColNames = ingCols.map((c) => c.COLUMN_NAME);
    if (!ingColNames.includes('code')) {
      await conn.query("ALTER TABLE ingredients ADD COLUMN code VARCHAR(20) DEFAULT NULL AFTER id");
      console.log('  ✅ Đã thêm cột `code` vào bảng `ingredients`');
    }
    if (!ingColNames.includes('image_url')) {
      await conn.query("ALTER TABLE ingredients ADD COLUMN image_url VARCHAR(255) DEFAULT NULL AFTER avg_cost");
      console.log('  ✅ Đã thêm cột `image_url` vào bảng `ingredients`');
    }

    // 6. Promotions: Thêm code, min_order_value, max_discount, description nếu thiếu
    const [promoCols] = await conn.query(
      "SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'promotions'"
    );
    const promoColNames = promoCols.map((c) => c.COLUMN_NAME);
    if (!promoColNames.includes('code')) {
      await conn.query("ALTER TABLE promotions ADD COLUMN code VARCHAR(50) DEFAULT NULL AFTER id");
      console.log('  ✅ Đã thêm cột `code` vào bảng `promotions`');
    }
    if (!promoColNames.includes('description')) {
      await conn.query("ALTER TABLE promotions ADD COLUMN description VARCHAR(255) DEFAULT NULL AFTER name");
      console.log('  ✅ Đã thêm cột `description` vào bảng `promotions`');
    }
    if (!promoColNames.includes('min_order_value')) {
      await conn.query("ALTER TABLE promotions ADD COLUMN min_order_value BIGINT DEFAULT 0 AFTER value");
      console.log('  ✅ Đã thêm cột `min_order_value` vào bảng `promotions`');
    }
    if (!promoColNames.includes('max_discount')) {
      await conn.query("ALTER TABLE promotions ADD COLUMN max_discount BIGINT DEFAULT NULL AFTER min_order_value");
      console.log('  ✅ Đã thêm cột `max_discount` vào bảng `promotions`');
    }

    // Cập nhật mã giảm giá mẫu để kiểm thử ngay
    await conn.query(`
      INSERT INTO promotions (code, name, description, type, value, min_order_value, max_discount, start_date, end_date, is_active)
      VALUES 
        ('COFFEE10', 'Giảm 10% đơn hàng', 'Giảm 10% tối đa 50k cho đơn từ 50k', 'percent_order', 10, 50000, 50000, CURDATE(), DATE_ADD(CURDATE(), INTERVAL 60 DAY), 1),
        ('BANMOI20', 'Chào bạn mới giảm 20%', 'Giảm 20% tối đa 100k cho đơn từ 100k', 'percent_order', 20, 100000, 100000, CURDATE(), DATE_ADD(CURDATE(), INTERVAL 60 DAY), 1),
        ('GIAM20K', 'Giảm 20.000đ trực tiếp', 'Giảm ngay 20k cho đơn từ 60k', 'amount_order', 20000, 60000, 20000, CURDATE(), DATE_ADD(CURDATE(), INTERVAL 60 DAY), 1)
      ON DUPLICATE KEY UPDATE is_active = 1, start_date = CURDATE(), end_date = DATE_ADD(CURDATE(), INTERVAL 60 DAY);
    `);
    console.log('  ✅ Đã nạp và kích hoạt mã giảm giá: COFFEE10, BANMOI20, GIAM20K');

    // 7. Tạo bảng work_shifts nếu chưa có
    await conn.query(`
      CREATE TABLE IF NOT EXISTS work_shifts (
        id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
        shift_code VARCHAR(20) NOT NULL,
        user_id BIGINT NOT NULL,
        shift_type VARCHAR(50) NOT NULL,
        shift_date DATE NOT NULL,
        status VARCHAR(30) NOT NULL DEFAULT 'Chưa bắt đầu',
        note VARCHAR(255) DEFAULT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        KEY user_id (user_id),
        CONSTRAINT work_shifts_ibfk_1 FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);
    console.log('  ✅ Đã xác minh bảng `work_shifts`');

    console.log('🎉 TOÀN BỘ SCHEMA ĐÃ ĐƯỢC ĐỒNG BỘ THÀNH CÔNG VỚI LIVE DATABASE!');
  } catch (err) {
    console.error('❌ Lỗi khi đồng bộ schema:', err);
    throw err;
  } finally {
    conn.release();
  }
}

migrateSchemaFixes()
  .then(() => process.exit(0))
  .catch(() => process.exit(1));

