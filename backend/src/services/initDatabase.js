const db = require('../config/db');
const bcrypt = require('bcryptjs');

async function autoMigrate() {
  try {
    console.log('🔄 Checking database schema & seed data...');

    // 1. Ensure columns
    const alters = [
      'ALTER TABLE `orders` ADD COLUMN IF NOT EXISTS `pickup_time` datetime DEFAULT NULL',
      'ALTER TABLE `products` ADD COLUMN IF NOT EXISTS `is_available` tinyint(1) DEFAULT 1',
      'ALTER TABLE `products` ADD COLUMN IF NOT EXISTS `updated_at` datetime DEFAULT CURRENT_TIMESTAMP',
      'ALTER TABLE `product_sizes` ADD COLUMN IF NOT EXISTS `is_active` tinyint(1) DEFAULT 1',
      'ALTER TABLE `tables` ADD COLUMN IF NOT EXISTS `reservation_name` varchar(100) DEFAULT NULL',
      'ALTER TABLE `tables` ADD COLUMN IF NOT EXISTS `reservation_phone` varchar(20) DEFAULT NULL',
      'ALTER TABLE `tables` ADD COLUMN IF NOT EXISTS `reservation_time` varchar(50) DEFAULT NULL',
      'ALTER TABLE `tables` ADD COLUMN IF NOT EXISTS `reservation_note` varchar(255) DEFAULT NULL',
      'ALTER TABLE `tables` ADD COLUMN IF NOT EXISTS `customer_count` int DEFAULT 0',
      'ALTER TABLE `ingredients` ADD COLUMN IF NOT EXISTS `image_url` varchar(500) DEFAULT NULL',
      'ALTER TABLE `ingredients` ADD COLUMN IF NOT EXISTS `updated_at` datetime DEFAULT CURRENT_TIMESTAMP',
    ];
    for (const sql of alters) {
      try { await db.query(sql); } catch (e) { /* ignore */ }
    }

    // 2. Ensure store_settings table
    try {
      await db.query(`
        CREATE TABLE IF NOT EXISTS \`store_settings\` (
          \`key\` VARCHAR(50) NOT NULL PRIMARY KEY,
          \`value\` VARCHAR(255) NOT NULL,
          \`description\` VARCHAR(255) DEFAULT NULL,
          \`updated_at\` DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `);
      await db.query(`
        INSERT INTO \`store_settings\` (\`key\`, \`value\`, \`description\`) VALUES
          ('open_time', '06:30', 'Giờ mở cửa quán (HH:mm)'),
          ('close_time', '23:00', 'Giờ đóng cửa quán (HH:mm)'),
          ('slot_step_minutes', '15', 'Bước giờ nhận hàng (phút)'),
          ('min_lead_time_minutes', '30', 'Đặt trước tối thiểu (phút) kể từ bây giờ'),
          ('auto_dispatch_before_minutes', '15', 'Tự động chuyển đơn cho Barista trước giờ nhận (phút)'),
          ('max_advance_days', '2', 'Cho phép đặt trước tối đa bao nhiêu ngày')
        ON DUPLICATE KEY UPDATE \`description\` = VALUES(\`description\`)
      `);
    } catch (e) { /* ignore */ }

    // 2.5 Ensure audit_logs table exists
    try {
      await db.query(`
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
          created_at  DATETIME DEFAULT CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
      `);
    } catch (e) { /* ignore */ }

    // 3. Ensure roles exist & are clearly separated
    try {
      await db.query(`
        INSERT INTO \`roles\` (\`id\`, \`name\`, \`label\`, \`description\`) VALUES
          (1, 'admin', 'Quản Trị Hệ Thống', 'Quản trị phân quyền tài khoản & theo dõi hoạt động toàn hệ thống'),
          (2, 'cashier', 'Thu ngân', 'Thao tác order, thanh toán tại quầy'),
          (3, 'waiter', 'Phục vụ bàn', 'Tạo order, xem trạng thái bàn'),
          (4, 'barista', 'Pha chế', 'Xem hàng đợi KDS, cập nhật món'),
          (5, 'warehouse', 'Thủ kho', 'Quản lý kho nguyên vật liệu'),
          (6, 'customer', 'Khách hàng', 'Tự đặt món trực tuyến & tích điểm'),
          (7, 'manager', 'Quản Lý Quán', 'Toàn quyền CRUD thực đơn, bàn, kho, ca trực, khuyến mãi & Thống kê báo cáo')
        ON DUPLICATE KEY UPDATE \`name\` = VALUES(\`name\`), \`label\` = VALUES(\`label\`), \`description\` = VALUES(\`description\`)
      `);
    } catch (e) { /* ignore */ }

    // 4. Ensure staff accounts exist with password 123456
    try {
      const defaultHash = await bcrypt.hash('123456', 10);
      const staffList = [
        { code: 'NV001', username: 'admin', name: 'admin', roleId: 1, phone: '0901234567', email: 'admin@mycoffee.vn' },
        { code: 'NV007', username: 'manager', name: 'Bùi Văn Trường', roleId: 7, phone: '0909998888', email: 'manager@mycoffee.vn' },
        { code: 'NV008', username: 'quanly', name: 'Bùi Văn Trường', roleId: 7, phone: '0909998889', email: 'quanly@mycoffee.vn' },
        { code: 'NV002', username: 'cashier', name: 'Trần Thu Hà', roleId: 2, phone: '0902345678', email: 'cashier@mycoffee.vn' },
        { code: 'NV003', username: 'barista', name: 'Đặng Minh Tuấn', roleId: 4, phone: '0903456789', email: 'barista@mycoffee.vn' },
        { code: 'NV004', username: 'waiter', name: 'Hoàng Văn Nam', roleId: 3, phone: '0904567890', email: 'waiter@mycoffee.vn' },
        { code: 'NV005', username: 'warehouse', name: 'Bùi Quốc Hoàng', roleId: 5, phone: '0905678901', email: 'warehouse@mycoffee.vn' },
      ];

      for (const s of staffList) {
        const [u] = await db.query('SELECT id, role_id FROM users WHERE username = ?', [s.username]);
        if (!u.length) {
          await db.query(`
            INSERT INTO users (code, username, password_hash, full_name, role_id, phone, email, is_active)
            VALUES (?, ?, ?, ?, ?, ?, ?, 1)
          `, [s.code, s.username, defaultHash, s.name, s.roleId, s.phone, s.email]);
          console.log(`✅ Auto-seeded staff: ${s.username} (password: 123456)`);
        } else {
          // SEC-01: Không bao giờ đè lại mật khẩu của người dùng đã thay đổi trên production/restart
          // Chỉ đảm bảo role_id hợp lệ nếu chưa có
          await db.query('UPDATE users SET full_name = COALESCE(full_name, ?) WHERE id = ?', [s.name, u[0].id]);
        }
      }
    } catch (e) {
      console.warn('Could not auto-seed users:', e.message);
    }

    // 5. Ensure uploaded images table & heal broken/duplicate product images cleanly
    try {
      await db.query(`
        CREATE TABLE IF NOT EXISTS \`product_uploaded_images\` (
          \`id\` BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
          \`mime_type\` VARCHAR(60) NOT NULL,
          \`image_data\` LONGBLOB NOT NULL,
          \`created_by\` BIGINT DEFAULT NULL,
          \`created_at\` DATETIME DEFAULT CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `);
      try {
        await db.query('ALTER TABLE `products` MODIFY COLUMN `image_url` VARCHAR(1000) DEFAULT NULL');
      } catch (e) { /* ignore if already wide enough */ }

      const imageFixes = [
        { code: 'CF01', target: '/images/drinks/ca_phe_den_da.jpg', badPrefixes: ['https://images.unsplash.com/photo-1514432324607-a09d9b4aefdd'] },
        { code: 'CF05', target: '/images/drinks/ca_phe_trung.jpg', badPrefixes: ['https://images.unsplash.com/photo-1517256064527-09c73fc73e38'] },
        { code: 'CF10', target: '/images/drinks/cold_brew_cam.jpg', badPrefixes: ['https://images.unsplash.com/photo-1517701550927-30cf4ba1dba5'] },
        { code: 'CF12', target: '/images/drinks/affogato.jpg', badPrefixes: ['https://images.unsplash.com/photo-1592663527359-cf6642f54cff'] },
        { code: 'TR06', target: '/images/drinks/tra_sua_tran_chau_duong_den.jpg', badPrefixes: ['https://images.unsplash.com/photo-1558857563-b37fe8402db0'] },
        { code: 'TR08', target: '/images/drinks/tra_nhai_dac_thom.jpg', badPrefixes: ['https://images.unsplash.com/photo-1544787219-7f47ccb76574'] },
        { code: 'BM02', target: '/images/cakes/croissant_pho_mai.jpg', badPrefixes: ['https://images.unsplash.com/photo-1509440159596-0249088772ff'] },
        { code: 'BM05', target: '/images/cakes/mousse_chanh_day.jpg', badPrefixes: ['https://images.unsplash.com/photo-1579372786545-d24232daf58c'] },
        { code: 'NE03', target: '/images/drinks/nuoc_ep_oi_hong.jpg', badPrefixes: ['https://images.unsplash.com/photo-1534353473418-4cfa6c56fd38'] },
        { code: 'AV04', target: '/images/snacks/hat_de_cuoi.jpg', badPrefixes: ['https://images.unsplash.com/photo-1509912760195-4f6cfd900695'] },
        { code: 'AV05', target: '/images/snacks/hat_dieu_rang_cui.jpg', badPrefixes: ['https://images.unsplash.com/photo-1543168256-418811576931'] },
        { code: 'AV06', target: '/images/snacks/rong_bien_kep_hat.jpg', badPrefixes: ['https://images.unsplash.com/photo-1599490659213-e2b9527bd087'] },
        { code: 'AV09', target: '/images/snacks/bap_bo_say_gion.jpg', badPrefixes: ['https://images.unsplash.com/photo-1544025162-d76694265947'] },
        { code: 'AV11', target: '/images/snacks/banh_trang_nuong.jpg', badPrefixes: [] },
      ];

      for (const fix of imageFixes) {
        const [rows] = await db.query('SELECT id, image_url FROM products WHERE code = ? LIMIT 1', [fix.code]);
        if (!rows.length) continue;
        const cur = String(rows[0].image_url || '').trim();
        const isBrokenOrLegacy = !cur || fix.badPrefixes.some((pref) => cur.startsWith(pref));
        if (isBrokenOrLegacy) {
          await db.query('UPDATE products SET image_url = ? WHERE id = ?', [fix.target, rows[0].id]);
        }
      }

      // Chuẩn hóa khung hình 4:3 lấy tâm cho các ảnh Unsplash mặc định đang thiếu h=450
      const [unsplashRows] = await db.query(
        "SELECT id, image_url FROM products WHERE image_url LIKE 'https://images.unsplash.com/photo-%' AND image_url NOT LIKE '%h=450%'"
      );
      for (const row of unsplashRows) {
        if (row.image_url.includes('auto=format&fit=crop') && !row.image_url.includes('h=')) {
          const centeredUrl = `${row.image_url.split('?')[0]}?w=600&h=450&fit=crop&crop=center&q=80`;
          await db.query('UPDATE products SET image_url = ? WHERE id = ?', [centeredUrl, row.id]);
        }
      }
    } catch (e) {
      console.warn('Could not run product image self-healing:', e.message);
    }

    console.log('✅ Database auto-migration & staff check finished!');
  } catch (err) {
    console.error('Auto-migration error:', err.message);
  }
}

module.exports = { autoMigrate };
