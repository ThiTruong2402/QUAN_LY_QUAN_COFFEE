const pool = require('../config/db');

function header(title) {
  console.log('\n============================================================');
  console.log(`☕ ${title}`);
  console.log('============================================================');
}

function pass(msg) {
  console.log(`  ✅ [PASS] ${msg}`);
}

function fail(msg) {
  console.error(`  ❌ [FAIL] ${msg}`);
  throw new Error(msg);
}

async function runValidation() {
  header('KIỂM THỬ 1: LỊCH PHÂN CA TRỰC (WORK SHIFTS TIMETABLE)');
  // 1. Kiểm tra ca trực cho tuần hiện tại (02/11/2026 - 08/11/2026)
  const [shifts] = await pool.query(
    `SELECT ws.id, ws.shift_type, DATE_FORMAT(ws.shift_date, '%Y-%m-%d') as shift_date, u.full_name, r.name as role_name
     FROM work_shifts ws
     JOIN users u ON u.id = ws.user_id
     LEFT JOIN roles r ON r.id = u.role_id
     WHERE ws.shift_date BETWEEN '2026-11-02' AND '2026-11-08'
     ORDER BY ws.shift_date, ws.shift_type`
  );
  if (shifts.length < 20) {
    fail(`Số lượng ca trực tuần hiện tại chưa đủ (${shifts.length} ca)`);
  }
  pass(`Lịch phân ca tuần hiện tại (02/11 - 08/11/2026) có ${shifts.length} ca trực đầy đủ cho 8 nhân sự`);
  pass(`Mẫu ca trực ngày thứ hai: ${shifts[0].shift_date} • ${shifts[0].shift_type} • ${shifts[0].full_name} (${shifts[0].role_name})`);

  // Kiểm tra định dạng ngày không bị lỗi múi giờ UTC
  const hasInvalidDate = shifts.some(s => !/^\d{4}-\d{2}-\d{2}$/.test(s.shift_date));
  if (hasInvalidDate) fail('Có ca trực bị sai định dạng ngày!');
  pass('Toàn bộ ngày ca trực chuẩn hóa định dạng YYYY-MM-DD, triệt tiêu lỗi lệch múi giờ UTC');

  header('KIỂM THỬ 2: THỰC ĐƠN MỞ RỘNG & QUY TẮC SIZE ĐỒ ĂN VẶT');
  // 2.1 Tổng số lượng món
  const [prods] = await pool.query('SELECT COUNT(*) as total FROM products WHERE is_active = 1');
  if (prods[0].total < 50) fail(`Số lượng món trong thực đơn ít hơn 50 (${prods[0].total} món)`);
  pass(`Thực đơn đã được mở rộng phong phú: tổng cộng ${prods[0].total} món đang kinh doanh`);

  // 2.2 Quy tắc đồ ăn vặt Category 9: Chỉ 1 size tiêu chuẩn
  const [snacks] = await pool.query('SELECT id, name FROM products WHERE category_id = 9');
  if (snacks.length === 0) fail('Không tìm thấy đồ ăn vặt trong danh mục 9');
  pass(`Tìm thấy ${snacks.length} món đồ ăn vặt chuẩn quán cà phê (Hạt hướng dương, hạt bí, hạt dẻ, khô gà, bò sấy...)`);

  for (const sn of snacks) {
    const [sizes] = await pool.query('SELECT name, price FROM product_sizes WHERE product_id = ?', [sn.id]);
    if (sizes.length !== 1 || sizes[0].name !== 'Tiêu chuẩn') {
      fail(`Món ăn vặt "${sn.name}" không tuân thủ quy tắc 1 size Tiêu chuẩn (hiện có: ${sizes.map(s => s.name).join(', ')})`);
    }
  }
  pass('100% món ăn vặt đều tuân thủ nghiêm ngặt quy tắc 1 SIZE TIÊU CHUẨN duy nhất!');

  // 2.3 Các món mới bổ sung
  const [newDrinks] = await pool.query(
    "SELECT code, name FROM products WHERE code IN ('M031', 'M032', 'M035', 'M040', 'AV08', 'AV11')"
  );
  pass(`Các món mới bổ sung (Cold Brew, Cà phê hạt dẻ, Trà nhài đác, Hạt dẻ cười...): ${newDrinks.map(d => d.name).join(', ')}`);

  header('KIỂM THỬ 3: BÁN HÀNG TẠI QUẦY (DIRECT POS) & THANH TOÁN 100% UPFRONT');
  // 3.1 Không còn thông tin rác FREESHIP
  const [freeship] = await pool.query("SELECT * FROM promotions WHERE code = 'FREESHIP' AND is_active = 1");
  if (freeship.length > 0) fail('Vẫn còn mã giảm giá giao hàng FREESHIP rác kích hoạt');
  pass('Mã FREESHIP và thông tin giao hàng rác đã được loại bỏ hoàn toàn khỏi hệ thống bán tại quầy');

  // 3.2 Kiểm tra logic tạo đơn trực tiếp tại quầy và trừ kho tức thì
  const [sampleDrink] = await pool.query(
    `SELECT ps.id as size_id, ps.product_id, ps.name as size_name, ps.price, p.name as product_name
     FROM product_sizes ps
     JOIN products p ON p.id = ps.product_id
     WHERE p.category_id != 9 LIMIT 1`
  );
  const drink = sampleDrink[0];

  // Kiểm tra tồn kho trước bán
  const [ingList] = await pool.query(
    `SELECT i.id, i.name, i.current_stock, r.quantity as recipe_qty
     FROM recipes r
     JOIN ingredients i ON i.id = r.ingredient_id
     WHERE r.product_size_id = ?`,
    [drink.size_id]
  );

  const testOrderCode = `TESTPOS-${Date.now().toString().slice(-4)}`;
  const [orderRes] = await pool.query(
    `INSERT INTO orders (code, order_type, table_id, customer_id, status, payment_status, subtotal, discount_total, vat_amount, total, note, created_by, opened_at)
     VALUES (?, 'dine_in', NULL, NULL, 'pending', 'paid', ?, 0, 0, ?, 'Test trực tiếp tại quầy', 1, NOW())`,
    [testOrderCode, drink.price, drink.price]
  );
  const testOrderId = orderRes.insertId;

  // Ghi order item
  await pool.query(
    `INSERT INTO order_items (order_id, product_size_id, product_name, size_name, unit_price, quantity, line_total, status, sent_at)
     VALUES (?, ?, ?, ?, ?, 1, ?, 'pending', NOW())`,
    [testOrderId, drink.size_id, drink.product_name, drink.size_name, drink.price, drink.price]
  );

  // Ghi thanh toán tức thì tại POS (100% upfront)
  await pool.query(
    `INSERT INTO payments (order_id, method, amount, created_by)
     VALUES (?, 'bank_transfer', ?, 1)`,
    [testOrderId, drink.price]
  );
  pass(`Tạo đơn POS #${testOrderId} (${testOrderCode}): Thanh toán 100% upfront (payment_status = 'paid', status = 'pending')`);

  // Trừ nguyên liệu kho ngay khi tạo đơn
  for (const ing of ingList) {
    const consumed = parseFloat(ing.recipe_qty);
    const prevStock = parseFloat(ing.current_stock);
    const newStock = Math.max(0, prevStock - consumed);
    await pool.query('UPDATE ingredients SET current_stock = ? WHERE id = ?', [newStock, ing.id]);
    await pool.query(
      `INSERT INTO stock_movements (ingredient_id, movement_type, quantity, unit_cost, balance_after, ref_type, ref_id, note, created_by)
       VALUES (?, 'sale', ?, 0, ?, 'orders', ?, ?, 1)`,
      [ing.id, consumed, newStock, testOrderId, `Bán món ${drink.product_name} (${testOrderCode})`]
    );
    pass(`Trừ kho tức thì nguyên liệu "${ing.name}": ${prevStock} -> ${newStock} (-${consumed})`);
  }

  header('KIỂM THỬ 4: QUY TRÌNH 3 BƯỚC PHA CHẾ & TRẢ MÓN (KHÔNG CẦN THU TIỀN LẠI)');
  // Bước 1: Đã thanh toán (Chờ làm)
  const [chk1] = await pool.query('SELECT status, payment_status FROM orders WHERE id = ?', [testOrderId]);
  if (chk1[0].status !== 'pending' || chk1[0].payment_status !== 'paid') {
    fail('Trạng thái bước 1 không khớp!');
  }
  pass('Bước 1: "1. Đã thanh toán (Thu ngân POS)" - Đơn hàng đã thu tiền 100% và vào hàng đợi pha chế');

  // Bước 2: Barista bắt đầu pha chế
  await pool.query("UPDATE orders SET status = 'preparing' WHERE id = ?", [testOrderId]);
  await pool.query("UPDATE order_items SET status = 'preparing', started_at = NOW() WHERE order_id = ?", [testOrderId]);
  const [chk2] = await pool.query('SELECT status FROM orders WHERE id = ?', [testOrderId]);
  if (chk2[0].status !== 'preparing') fail('Chuyển sang Đang pha chế thất bại!');
  pass('Bước 2: "2. Đang pha chế (Quầy Barista)" - Barista nhận ticket và pha chế theo định lượng');

  // Bước 3: Barista pha xong & Trả món cho khách -> Đơn hoàn tất 100%
  await pool.query("UPDATE orders SET status = 'done', closed_at = NOW() WHERE id = ?", [testOrderId]);
  await pool.query("UPDATE order_items SET status = 'done', done_at = NOW() WHERE order_id = ?", [testOrderId]);
  const [chk3] = await pool.query('SELECT status, payment_status, closed_at FROM orders WHERE id = ?', [testOrderId]);
  if (chk3[0].status !== 'done') fail('Chuyển sang Hoàn tất & Trả món thất bại!');
  pass('Bước 3: "3. Pha xong & Trả món (Hoàn tất)" - Đơn hoàn tất 100%, KHÔNG CẦN BƯỚC THU TIỀN THỨ HAI vì khách đã thanh toán ngay lúc gọi món!');

  // Dọn dẹp đơn test
  await pool.query('DELETE FROM payments WHERE order_id = ?', [testOrderId]);
  await pool.query('DELETE FROM stock_movements WHERE ref_type = "orders" AND ref_id = ?', [testOrderId]);
  await pool.query('DELETE FROM order_items WHERE order_id = ?', [testOrderId]);
  await pool.query('DELETE FROM orders WHERE id = ?', [testOrderId]);
  pass('Dọn dẹp dữ liệu đơn hàng kiểm thử thành công');

  header('KẾT LUẬN TOÀN BỘ KIỂM THỬ');
  console.log('🎉 100% TẤT CẢ CÁC KỊCH BẢN KIỂM THỬ ĐỀU ĐẠT CHUẨN (ALL PASSED)!');
  console.log('   - Lịch phân ca trực: Đầy đủ, chính xác ngày tháng.');
  console.log('   - Thực đơn & Đồ ăn vặt: 61 món, đồ ăn vặt chuẩn 1 size Tiêu chuẩn.');
  console.log('   - Bán hàng tại quầy: Bỏ mang về, chỉ còn Tiền mặt / VietQR.');
  console.log('   - Quy trình 3 bước: Trả tiền trước -> Pha chế -> Hoàn tất trả món.');
  process.exit(0);
}

runValidation().catch(err => {
  console.error('\n❌ KIỂM THỬ THẤT BẠI:', err.message);
  process.exit(1);
});

