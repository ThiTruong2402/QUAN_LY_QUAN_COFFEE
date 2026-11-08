const db = require('../config/db');

async function setup() {
  console.log('🚀 Đang cấu hình 20 bàn và hệ thống tích điểm thực tế...');

  try {
    // 1. Cập nhật bảng membership_tiers với số liệu thực tế cho F&B Coffee
    await db.query(`
      CREATE TABLE IF NOT EXISTS membership_tiers (
        id BIGINT PRIMARY KEY AUTO_INCREMENT,
        name VARCHAR(50) NOT NULL,
        min_spent BIGINT NOT NULL DEFAULT 0,
        discount_pct DECIMAL(5,2) NOT NULL DEFAULT 0.00,
        points_per_10k INT NOT NULL DEFAULT 1
      )
    `);

    await db.query('SET FOREIGN_KEY_CHECKS = 0');
    await db.query('TRUNCATE TABLE membership_tiers');
    await db.query(`
      INSERT INTO membership_tiers (id, name, min_spent, discount_pct, points_per_10k) VALUES
      (1, 'Đồng', 0, 0.00, 1),
      (2, 'Bạc', 500000, 5.00, 1),
      (3, 'Vàng', 2000000, 10.00, 1),
      (4, 'Kim Cương', 5000000, 15.00, 1)
    `);
    console.log('✅ Đã cập nhật 4 hạng thẻ thành viên thực tế (Đồng, Bạc - 500k/5%, Vàng - 2tr/10%, Kim Cương - 5tr/15%)');

    // 2. Thêm cột ghi chú đặt bàn vào bảng tables nếu chưa có
    const [cols] = await db.query('DESCRIBE `tables`');
    const colNames = cols.map(c => c.Field);

    if (!colNames.includes('reservation_name')) {
      await db.query('ALTER TABLE `tables` ADD COLUMN reservation_name VARCHAR(100) NULL AFTER status');
    }
    if (!colNames.includes('reservation_phone')) {
      await db.query('ALTER TABLE `tables` ADD COLUMN reservation_phone VARCHAR(20) NULL AFTER reservation_name');
    }
    if (!colNames.includes('reservation_time')) {
      await db.query('ALTER TABLE `tables` ADD COLUMN reservation_time VARCHAR(50) NULL AFTER reservation_phone');
    }
    if (!colNames.includes('reservation_note')) {
      await db.query('ALTER TABLE `tables` ADD COLUMN reservation_note VARCHAR(255) NULL AFTER reservation_time');
    }
    if (!colNames.includes('customer_count')) {
      await db.query('ALTER TABLE `tables` ADD COLUMN customer_count INT DEFAULT 0 AFTER reservation_note');
    }
    console.log('✅ Đã đảm bảo các cột đặt bàn (reservation_*) trong bảng `tables`');

    // 3. Chuẩn hóa 3 khu vực quán
    await db.query(`
      INSERT INTO areas (id, name, is_active) VALUES
      (1, 'Tầng 1 - Máy Lạnh', 1),
      (2, 'Tầng 2 - View Kính', 1),
      (3, 'Sân Vườn Thoáng Mát', 1)
      ON DUPLICATE KEY UPDATE name=VALUES(name), is_active=VALUES(is_active)
    `);
    console.log('✅ Đã cập nhật 3 khu vực quán cafe');

    // 4. Xóa và khởi tạo chính xác 20 bàn
    await db.query('DELETE FROM `tables`');
    const tablesData = [
      // Khu 1: Tầng 1 (8 bàn: B01 -> B08)
      [1, 1, 'Bàn 01', 4, 'occupied', null, null, null, null, 2],
      [2, 1, 'Bàn 02', 4, 'empty', null, null, null, null, 0],
      [3, 1, 'Bàn 03', 2, 'empty', null, null, null, null, 0],
      [4, 1, 'Bàn 04', 4, 'occupied', null, null, null, null, 3],
      [5, 1, 'Bàn 05', 6, 'reserved', 'Anh Hoàng', '0988123456', '19:30', 'Tiệc sinh nhật, cần setup hoa', 6],
      [6, 1, 'Bàn 06', 2, 'empty', null, null, null, null, 0],
      [7, 1, 'Bàn 07', 4, 'empty', null, null, null, null, 0],
      [8, 1, 'Bàn 08', 8, 'empty', null, null, null, null, 0],

      // Khu 2: Tầng 2 (6 bàn: B09 -> B14)
      [9, 2, 'Bàn 09', 4, 'empty', null, null, null, null, 0],
      [10, 2, 'Bàn 10', 4, 'occupied', null, null, null, null, 4],
      [11, 2, 'Bàn 11', 2, 'reserved', 'Chị Linh', '0912345678', '20:00', 'Bàn đôi gần cửa sổ view phố', 2],
      [12, 2, 'Bàn 12', 4, 'empty', null, null, null, null, 0],
      [13, 2, 'Bàn 13', 6, 'empty', null, null, null, null, 0],
      [14, 2, 'Bàn 14', 4, 'empty', null, null, null, null, 0],

      // Khu 3: Sân Vườn (6 bàn: B15 -> B20)
      [15, 3, 'Bàn 15', 4, 'empty', null, null, null, null, 0],
      [16, 3, 'Bàn 16', 4, 'occupied', null, null, null, null, 2],
      [17, 3, 'Bàn 17', 2, 'empty', null, null, null, null, 0],
      [18, 3, 'Bàn 18', 4, 'empty', null, null, null, null, 0],
      [19, 3, 'Bàn 19', 6, 'empty', null, null, null, null, 0],
      [20, 3, 'Bàn 20', 4, 'empty', null, null, null, null, 0],
    ];

    for (const t of tablesData) {
      await db.query(
        'INSERT INTO `tables` (id, area_id, code, seats, status, reservation_name, reservation_phone, reservation_time, reservation_note, customer_count) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        t
      );
    }
    console.log('✅ Đã tạo thành công chuẩn 20 BÀN (Bàn 01 -> Bàn 20) với đầy đủ trạng thái: Trống (14), Đang phục vụ (4), Đặt trước (2)!');

    // 5. Cập nhật dữ liệu Khách hàng thực tế
    await db.query(`
      CREATE TABLE IF NOT EXISTS customers (
        id BIGINT PRIMARY KEY AUTO_INCREMENT,
        phone VARCHAR(20) UNIQUE NOT NULL,
        name VARCHAR(100) NOT NULL,
        birthday DATE NULL,
        tier_id BIGINT DEFAULT 1,
        points_balance INT DEFAULT 0,
        total_spent BIGINT DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    const customersData = [
      ['0901234567', 'Nguyễn Văn An', '1995-05-12', 4, 580, 5800000],   // Kim Cương: Giảm 15%
      ['0912345678', 'Trần Thị Mai', '1998-11-20', 3, 265, 2650000],    // Vàng: Giảm 10%
      ['0988123456', 'Lê Hoàng Nam', '2000-08-15', 2, 85, 850000],      // Bạc: Giảm 5%
      ['0977889900', 'Phạm Quỳnh Anh', '2002-03-08', 1, 12, 120000],   // Đồng: Tiêu chuẩn
      ['0933445566', 'Đặng Minh Huy', '1993-09-25', 2, 62, 620000],     // Bạc: Giảm 5%
    ];

    for (const c of customersData) {
      await db.query(`
        INSERT INTO customers (phone, name, birthday, tier_id, points_balance, total_spent)
        VALUES (?, ?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE
          name=VALUES(name),
          birthday=VALUES(birthday),
          tier_id=VALUES(tier_id),
          points_balance=VALUES(points_balance),
          total_spent=VALUES(total_spent)
      `, c);
    }
    console.log('✅ Đã cập nhật 5 khách hàng mẫu với số điểm và phân hạng thực tế');

    await db.query('SET FOREIGN_KEY_CHECKS = 1');
    console.log('🎉 TOÀN BỘ CẤU HÌNH DATABASE ĐÃ HOÀN TẤT XUẤT SẮC!');
    process.exit(0);
  } catch (err) {
    console.error('Lỗi cấu hình:', err);
    process.exit(1);
  }
}

setup();
