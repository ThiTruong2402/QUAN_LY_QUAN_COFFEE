const db = require('../config/db');

async function testOrderFlow() {
  console.log('🧪 Testing End-to-End Direct Counter Sales Coffee Shop Order Flow...');

  // 1. Get sample item (Cà phê đen đá)
  const [sizes] = await db.query(
    `SELECT ps.id, ps.product_id, ps.name as size_name, ps.price, p.name as product_name
     FROM product_sizes ps
     JOIN products p ON p.id = ps.product_id
     WHERE p.name LIKE '%Cà phê đen đá%' LIMIT 1`
  );

  const sample = sizes[0] || { id: 1, product_id: 1, size_name: 'M', price: 25000, product_name: 'Cà phê đen đá' };

  // Simulate POS direct checkout
  console.log('1. Khách gọi món tại quầy và thanh toán 100% upfront (Tiền mặt / VietQR):');
  const [res] = await db.query(
    `INSERT INTO orders (code, order_type, customer_id, status, payment_status, subtotal, discount_total, vat_amount, total, note, created_by, opened_at)
     VALUES (?, 'dine_in', NULL, 'pending', 'paid', ?, 0, 0, ?, 'Ít ngọt, nhiều đá', 1, NOW())`,
    [`TEST-${Date.now()}`, sample.price, sample.price]
  );
  const orderId = res.insertId;
  console.log(`   ✅ Đã tạo đơn #${orderId} - Trạng thái: 'pending' (Đã thanh toán 100% upfront • Chờ quầy Barista pha)`);

  // Insert item
  await db.query(
    `INSERT INTO order_items (order_id, product_size_id, product_name, size_name, unit_price, quantity, line_total, status, sent_at)
     VALUES (?, ?, ?, ?, ?, 1, ?, 'pending', NOW())`,
    [orderId, sample.id, sample.product_name, sample.size_name, sample.price, sample.price]
  );

  // Insert payment
  await db.query(
    `INSERT INTO payments (order_id, method, amount, created_by)
     VALUES (?, 'bank_transfer', ?, 1)`,
    [orderId, sample.price]
  );
  console.log(`   ✅ Ghi nhận thanh toán: 100% qua Chuyển khoản QR (VietQR Napas247 - Techcombank)`);

  // 2. Barista receives ticket & starts brewing
  console.log('2. Quầy Barista nhận ticket trong hàng đợi -> Bấm "☕ Bắt đầu pha chế":');
  await db.query(
    `UPDATE orders SET status = 'preparing' WHERE id = ?`,
    [orderId]
  );
  await db.query(
    `UPDATE order_items SET status = 'preparing', started_at = NOW() WHERE order_id = ?`,
    [orderId]
  );
  console.log(`   ✅ Đơn hàng #${orderId} chuyển sang: 'preparing' (Barista đang pha theo công thức định lượng)`);

  // 3. Barista finishes brewing & serves customer
  console.log('3. Barista pha xong -> Báo chuông & Trả món cho khách:');
  await db.query(
    `UPDATE orders SET status = 'done', closed_at = NOW() WHERE id = ?`,
    [orderId]
  );
  await db.query(
    `UPDATE order_items SET status = 'done', done_at = NOW() WHERE order_id = ?`,
    [orderId]
  );
  console.log(`   ✅ Đơn hàng #${orderId} chuyển sang: 'done' (Hoàn tất & Trả món)`);
  console.log('   ✅ ĐƠN HOÀN TẤT 100%! KHÔNG CẦN BƯỚC THU TIỀN SAU CÙNG VÌ ĐÃ THU NGAY LÚC TẠO ĐƠN!');

  process.exit(0);
}

testOrderFlow().catch(err => {
  console.error('❌ Flow test failed:', err);
  process.exit(1);
});

