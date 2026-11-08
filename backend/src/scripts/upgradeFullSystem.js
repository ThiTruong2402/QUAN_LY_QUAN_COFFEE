const pool = require('../config/db');

async function upgradeFullSystem() {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    console.log('--- 1. Upgrading orders table for Online / Delivery & Payment Status ---');
    // Drop existing orders_chk_1 constraint
    try {
      await conn.query('ALTER TABLE orders DROP CHECK orders_chk_1');
      console.log('Dropped old orders_chk_1');
    } catch (e) {
      console.log('No orders_chk_1 to drop or already dropped:', e.message);
    }

    // Add updated orders_chk_1 constraint allowing 'dine_in', 'takeaway', 'online', 'delivery'
    try {
      await conn.query("ALTER TABLE orders ADD CONSTRAINT orders_chk_1 CHECK (order_type IN ('dine_in', 'takeaway', 'online', 'delivery'))");
      console.log('Added new orders_chk_1 constraint');
    } catch (e) {
      console.log('Constraint already exists or:', e.message);
    }

    // Add delivery_address, shipping_fee, recipient_phone, payment_status, coupon_code to orders
    const [ordersCols] = await conn.query('DESCRIBE orders');
    const colNames = ordersCols.map(c => c.Field);

    if (!colNames.includes('delivery_address')) {
      await conn.query('ALTER TABLE orders ADD COLUMN delivery_address VARCHAR(255) DEFAULT NULL AFTER note');
      console.log('Added column delivery_address to orders');
    }
    if (!colNames.includes('shipping_fee')) {
      await conn.query('ALTER TABLE orders ADD COLUMN shipping_fee BIGINT DEFAULT 0 AFTER delivery_address');
      console.log('Added column shipping_fee to orders');
    }
    if (!colNames.includes('recipient_phone')) {
      await conn.query('ALTER TABLE orders ADD COLUMN recipient_phone VARCHAR(20) DEFAULT NULL AFTER shipping_fee');
      console.log('Added column recipient_phone to orders');
    }
    if (!colNames.includes('coupon_code')) {
      await conn.query('ALTER TABLE orders ADD COLUMN coupon_code VARCHAR(50) DEFAULT NULL AFTER recipient_phone');
      console.log('Added column coupon_code to orders');
    }
    if (!colNames.includes('payment_status')) {
      await conn.query("ALTER TABLE orders ADD COLUMN payment_status VARCHAR(20) DEFAULT 'paid' AFTER status");
      console.log('Added column payment_status to orders');
    }

    console.log('--- 2. Upgrading promotions / coupons table ---');
    const [promoCols] = await conn.query('DESCRIBE promotions');
    const promoColNames = promoCols.map(c => c.Field);

    if (!promoColNames.includes('code')) {
      await conn.query('ALTER TABLE promotions ADD COLUMN code VARCHAR(50) UNIQUE AFTER id');
      console.log('Added column code to promotions');
    }
    if (!promoColNames.includes('min_order_value')) {
      await conn.query('ALTER TABLE promotions ADD COLUMN min_order_value BIGINT DEFAULT 0 AFTER value');
      console.log('Added column min_order_value to promotions');
    }
    if (!promoColNames.includes('max_discount')) {
      await conn.query('ALTER TABLE promotions ADD COLUMN max_discount BIGINT DEFAULT NULL AFTER min_order_value');
      console.log('Added column max_discount to promotions');
    }
    if (!promoColNames.includes('description')) {
      await conn.query('ALTER TABLE promotions ADD COLUMN description VARCHAR(255) DEFAULT NULL AFTER max_discount');
      console.log('Added column description to promotions');
    }

    // Seed realistic Coffee Shop Discount Vouchers
    const coupons = [
      {
        code: 'COFFEE10',
        name: 'Giảm 10% Cho Đơn Hàng Cà Phê',
        type: 'percent_order',
        value: 10,
        min_order_value: 50000,
        max_discount: 30000,
        description: 'Giảm 10% tối đa 30k cho đơn từ 50k',
      },
      {
        code: 'GIAM20K',
        name: 'Voucher Giảm Ngay 20.000 đ',
        type: 'amount_order',
        value: 20000,
        min_order_value: 80000,
        max_discount: 20000,
        description: 'Giảm trực tiếp 20.000 đ cho đơn từ 80k',
      },
      {
        code: 'MYCOFFEE20',
        name: 'Ưu Đãi Khách Thân Thiết 20%',
        type: 'percent_order',
        value: 20,
        min_order_value: 100000,
        max_discount: 50000,
        description: 'Giảm 20% tối đa 50k cho đơn từ 100k',
      },
      {
        code: 'BANMOI',
        name: 'Chào Bạn Mới - Giảm 15.000 đ',
        type: 'amount_order',
        value: 15000,
        min_order_value: 40000,
        max_discount: 15000,
        description: 'Tặng 15k cho khách hàng lần đầu trải nghiệm',
      },
      {
        code: 'FREESHIP',
        name: 'Miễn Phí Giao Hàng Online',
        type: 'amount_order',
        value: 25000,
        min_order_value: 60000,
        max_discount: 25000,
        description: 'Freeship 25k cho đơn đặt hàng Online từ 60k',
      },
    ];

    for (const c of coupons) {
      await conn.query(
        `INSERT INTO promotions (code, name, type, value, min_order_value, max_discount, description, start_date, end_date, is_active)
         VALUES (?, ?, ?, ?, ?, ?, ?, '2025-01-01', '2028-12-31', 1)
         ON DUPLICATE KEY UPDATE name = VALUES(name), type = VALUES(type), value = VALUES(value), min_order_value = VALUES(min_order_value), max_discount = VALUES(max_discount), description = VALUES(description), is_active = 1`,
        [c.code, c.name, c.type, c.value, c.min_order_value, c.max_discount, c.description]
      );
    }
    console.log('Seeded 5 active discount coupons successfully');

    await conn.commit();
    console.log('✅ DATABASE UPGRADE COMPLETED SUCCESSFULLY!');
  } catch (err) {
    await conn.rollback();
    console.error('Error upgrading database:', err);
  } finally {
    conn.release();
    process.exit(0);
  }
}

upgradeFullSystem();
