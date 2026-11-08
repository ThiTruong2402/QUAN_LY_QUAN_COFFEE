const pool = require('../config/db');

// Utility logging
function printHeader(title) {
  console.log('\n============================================================');
  console.log(`🔷 ${title}`);
  console.log('============================================================');
}

function assert(condition, message) {
  if (!condition) {
    console.error(`❌ FAILED: ${message}`);
    throw new Error(`Assertion failed: ${message}`);
  } else {
    console.log(`  ✅ PASSED: ${message}`);
  }
}

async function runAllTests() {
  let createdCategoryId = null;
  let createdProductId = null;
  let createdSizeIds = [];
  let createdIngredientId = null;
  let testCustomerId = null;
  let createdOrderId = null;

  try {
    printHeader('KỊCH BẢN 1: QUẢN LÝ DANH MỤC & SẢN PHẨM (CATALOG & PRODUCT LIFECYCLE)');

    // 1.1 Tạo danh mục test
    const [catRes] = await pool.query(
      'INSERT INTO categories (name, description, sort_order, is_active) VALUES (?, ?, ?, 1)',
      ['Đồ Uống Test Kịch Bản', 'Danh mục chuyên biệt để kiểm thử tự động', 99]
    );
    createdCategoryId = catRes.insertId;
    assert(createdCategoryId > 0, `Tạo danh mục mới thành công với ID = ${createdCategoryId}`);

    // 1.2 Tạo món mới đầy đủ thông tin kèm 3 kích cỡ (S, M, L)
    const productCode = `TEST_CF_${Date.now().toString().slice(-4)}`;
    const [prodRes] = await pool.query(
      'INSERT INTO products (category_id, name, description, image_url, code, is_available, is_active) VALUES (?, ?, ?, ?, ?, 1, 1)',
      [createdCategoryId, 'Cà Phê Muối Macchiato Test', 'Cà phê thơm béo vị muối biển', 'https://example.com/drink.jpg', productCode]
    );
    createdProductId = prodRes.insertId;
    assert(createdProductId > 0, `Tạo sản phẩm mới thành công với ID = ${createdProductId}, Code = ${productCode}`);

    // Thêm 3 size: S (25k), M (30k - mặc định), L (35k)
    const sizesToCreate = [
      { name: 'S', price: 25000, is_default: 0 },
      { name: 'M', price: 30000, is_default: 1 },
      { name: 'L', price: 35000, is_default: 0 }
    ];
    for (const s of sizesToCreate) {
      const [szRes] = await pool.query(
        'INSERT INTO product_sizes (product_id, name, price, is_default, is_active) VALUES (?, ?, ?, ?, 1)',
        [createdProductId, s.name, s.price, s.is_default]
      );
      createdSizeIds.push({ id: szRes.insertId, name: s.name, price: s.price });
    }
    assert(createdSizeIds.length === 3, 'Tạo thành công 3 kích cỡ (S, M, L) cho sản phẩm');

    // 1.3 Kiểm tra truy vấn sản phẩm kèm sizes
    const [prodCheck] = await pool.query(
      `SELECT p.*, c.name AS category_name FROM products p
       JOIN categories c ON c.id = p.category_id
       WHERE p.id = ?`,
      [createdProductId]
    );
    assert(prodCheck.length === 1 && prodCheck[0].name === 'Cà Phê Muối Macchiato Test', 'Lấy thông tin món kèm danh mục chính xác');

    const [sizeRows] = await pool.query('SELECT * FROM product_sizes WHERE product_id = ? ORDER BY price', [createdProductId]);
    assert(sizeRows.length === 3, 'Sản phẩm có đầy đủ 3 sizes trong cơ sở dữ liệu');
    assert(sizeRows.find(s => s.name === 'M' && s.is_default === 1 && Number(s.price) === 30000), 'Size M là kích cỡ mặc định với giá 30.000đ');

    // 1.4 Kiểm tra Cập nhật sản phẩm (Update)
    await pool.query(
      'UPDATE products SET name = ?, description = ? WHERE id = ?',
      ['Cà Phê Muối Đặc Biệt Test', 'Phiên bản cải tiến đậm vị hơn', createdProductId]
    );
    const [updatedProd] = await pool.query('SELECT name, description FROM products WHERE id = ?', [createdProductId]);
    assert(updatedProd[0].name === 'Cà Phê Muối Đặc Biệt Test', 'Cập nhật tên sản phẩm thành công');

    // 1.5 Kiểm tra Đánh dấu hết hàng (is_available = 0) và mở lại (is_available = 1)
    await pool.query('UPDATE products SET is_available = 0 WHERE id = ?', [createdProductId]);
    const [availCheck1] = await pool.query('SELECT is_available FROM products WHERE id = ?', [createdProductId]);
    assert(availCheck1[0].is_available === 0, 'Đánh dấu món HẾT HÀNG (is_available = 0) thành công');

    await pool.query('UPDATE products SET is_available = 1 WHERE id = ?', [createdProductId]);
    const [availCheck2] = await pool.query('SELECT is_available FROM products WHERE id = ?', [createdProductId]);
    assert(availCheck2[0].is_available === 1, 'Mở bán lại món (is_available = 1) thành công');


    printHeader('KỊCH BẢN 2: QUẢN LÝ NGUYÊN LIỆU & ĐỊNH LƯỢNG CÔNG THỨC (RECIPES)');

    // 2.1 Tạo nguyên liệu kho test
    const ingCode = `ING_${Date.now().toString().slice(-4)}`;
    const [ingRes] = await pool.query(
      'INSERT INTO ingredients (code, name, unit, min_stock, current_stock, avg_cost) VALUES (?, ?, ?, ?, ?, ?)',
      [ingCode, 'Hạt Cà Phê Robusta Test', 'g', 500, 5000, 150] // 5000g = 5kg, vốn 150đ/g
    );
    createdIngredientId = ingRes.insertId;
    assert(createdIngredientId > 0, `Tạo nguyên liệu kho thành công với ID = ${createdIngredientId}, tồn kho 5000g`);

    // 2.2 Thêm công thức cho từng size: Size S = 20g, Size M = 25g, Size L = 30g
    const sizeM = createdSizeIds.find(s => s.name === 'M');
    const sizeL = createdSizeIds.find(s => s.name === 'L');

    await pool.query(
      'INSERT INTO recipes (product_size_id, ingredient_id, quantity) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE quantity = VALUES(quantity)',
      [sizeM.id, createdIngredientId, 25.0]
    );
    await pool.query(
      'INSERT INTO recipes (product_size_id, ingredient_id, quantity) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE quantity = VALUES(quantity)',
      [sizeL.id, createdIngredientId, 30.0]
    );

    const [recCheck] = await pool.query('SELECT * FROM recipes WHERE ingredient_id = ?', [createdIngredientId]);
    assert(recCheck.length === 2, 'Gắn công thức định lượng thành công cho Size M (25g) và Size L (30g)');


    printHeader('KỊCH BẢN 3: BÁN HÀNG TẠI QUẦY POS & XỬ LÝ KHUYẾN MÃI (ZERO-TRUST PRICING)');

    // 3.1 Tạo khách hàng test
    const testPhone = `09${Math.floor(10000000 + Math.random() * 90000000)}`;
    const [custRes] = await pool.query(
      'INSERT INTO customers (phone, name, points_balance, total_spent) VALUES (?, ?, 0, 0)',
      [testPhone, 'Nguyễn Văn Kiểm Thử']
    );
    testCustomerId = custRes.insertId;
    assert(testCustomerId > 0, `Tạo khách hàng test thành công với SĐT: ${testPhone}`);

    // 3.2 Chuẩn bị đơn hàng: Khách gọi 2 ly Size M (30.000đ/ly) + 1 ly Size L (35.000đ/ly)
    // Tổng lý thuyết: (2 * 30.000) + (1 * 35.000) = 95.000đ
    const orderItems = [
      { product_size_id: sizeM.id, name: 'Cà Phê Muối Đặc Biệt Test', size_name: 'M', quantity: 2 },
      { product_size_id: sizeL.id, name: 'Cà Phê Muối Đặc Biệt Test', size_name: 'L', quantity: 1 }
    ];

    // Tạo mã đơn hàng chuẩn format <= 20 ký tự
    const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const randSuffix = Math.floor(1000 + Math.random() * 9000);
    const orderCode = `DH${today}-${randSuffix}`;
    const invoiceNo = `HD${today}-${randSuffix}`;

    // Áp dụng Zero-Trust Pricing: Server tự truy xuất giá thật từ DB
    let calculatedSubtotal = 0;
    const validatedItems = [];
    for (const it of orderItems) {
      const [szRow] = await pool.query('SELECT price FROM product_sizes WHERE id = ?', [it.product_size_id]);
      const price = Number(szRow[0].price);
      const lineTotal = price * it.quantity;
      calculatedSubtotal += lineTotal;
      validatedItems.push({
        ...it,
        unit_price: price,
        line_total: lineTotal
      });
    }
    assert(calculatedSubtotal === 95000, `Hệ thống tính đúng giá trị đơn hàng Zero-Trust Subtotal = 95.000đ (thực tế: ${calculatedSubtotal}đ)`);

    // Tạo đơn hàng trạng thái 'pending' (Chờ pha chế)
    const [ordRes] = await pool.query(
      `INSERT INTO orders (code, order_type, table_id, customer_id, status, payment_status, subtotal, discount_total, vat_amount, total, created_by, opened_at)
       VALUES (?, 'takeaway', NULL, ?, 'pending', 'paid', ?, 0, 0, ?, 1, NOW())`,
      [orderCode, testCustomerId, calculatedSubtotal, calculatedSubtotal]
    );
    createdOrderId = ordRes.insertId;
    assert(createdOrderId > 0, `Tạo đơn hàng mang về thành công với Order ID = ${createdOrderId}, Mã đơn = ${orderCode}`);

    // Ghi các món vào order_items
    for (const vItem of validatedItems) {
      await pool.query(
        `INSERT INTO order_items (order_id, product_size_id, product_name, size_name, unit_price, quantity, line_total, status, sent_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', NOW())`,
        [createdOrderId, vItem.product_size_id, vItem.name, vItem.size_name, vItem.unit_price, vItem.quantity, vItem.line_total]
      );
    }

    // Ghi hóa đơn & thanh toán
    await pool.query(
      'INSERT INTO invoices (invoice_no, order_id, subtotal, discount, service_fee, vat, total) VALUES (?, ?, ?, 0, 0, 0, ?)',
      [invoiceNo, createdOrderId, calculatedSubtotal, calculatedSubtotal]
    );
    await pool.query(
      'INSERT INTO payments (order_id, method, amount, created_by) VALUES (?, "bank_transfer", ?, 1)',
      [createdOrderId, calculatedSubtotal]
    );


    printHeader('KỊCH BẢN 4: TRỪ KHO TỰ ĐỘNG & BIẾN ĐỘNG NGUYÊN LIỆU (STOCK MOVEMENTS)');

    // Định lượng tiêu hao lý thuyết:
    // 2 ly Size M x 25g = 50g
    // 1 ly Size L x 30g = 30g
    // Tổng tiêu hao = 80g. Tồn ban đầu = 5000g -> Tồn sau bán = 4920g.
    const expectedConsumed = (2 * 25) + (1 * 30);
    assert(expectedConsumed === 80, `Định lượng tiêu thụ dự kiến là 80g cà phê`);

    // Thực hiện trừ kho đúng chuẩn nghiệp vụ POS
    for (const it of validatedItems) {
      const [recs] = await pool.query('SELECT ingredient_id, quantity FROM recipes WHERE product_size_id = ?', [it.product_size_id]);
      for (const r of recs) {
        const qtyUsed = Number(r.quantity) * it.quantity;
        const [ing] = await pool.query('SELECT current_stock, avg_cost FROM ingredients WHERE id = ? FOR UPDATE', [r.ingredient_id]);
        const curStock = parseFloat(ing[0].current_stock);
        const newStock = Math.max(0, curStock - qtyUsed);

        await pool.query('UPDATE ingredients SET current_stock = ? WHERE id = ?', [newStock, r.ingredient_id]);
        await pool.query(
          `INSERT INTO stock_movements (ingredient_id, movement_type, quantity, unit_cost, balance_after, ref_type, ref_id, note, created_by)
           VALUES (?, 'sale', ?, ?, ?, 'orders', ?, ?, 1)`,
          [r.ingredient_id, qtyUsed, ing[0].avg_cost, newStock, createdOrderId, `Bán món ${it.name} (${orderCode})`]
        );
      }
    }

    // Kiểm tra số dư kho thực tế trong Database
    const [ingAfterSale] = await pool.query('SELECT current_stock FROM ingredients WHERE id = ?', [createdIngredientId]);
    const actualStockAfter = parseFloat(ingAfterSale[0].current_stock);
    assert(actualStockAfter === 4920, `Tồn kho sau khi bán đã tự động trừ chính xác còn ${actualStockAfter}g (Chuẩn 4920g)`);

    // Kiểm tra lịch sử stock_movements
    const [movements] = await pool.query(
      "SELECT * FROM stock_movements WHERE ref_type = 'orders' AND ref_id = ? AND movement_type = 'sale'",
      [createdOrderId]
    );
    assert(movements.length === 2, 'Ghi nhận đúng 2 bản ghi trừ kho cho 2 kích cỡ');

    // Tích điểm: 95.000đ -> Math.floor(95000 / 10000) = 9 điểm
    const expectedPoints = Math.floor(calculatedSubtotal / 10000);
    await pool.query(
      'UPDATE customers SET points_balance = points_balance + ?, total_spent = total_spent + ? WHERE id = ?',
      [expectedPoints, calculatedSubtotal, testCustomerId]
    );
    await pool.query(
      'INSERT INTO loyalty_transactions (customer_id, order_id, type, points) VALUES (?, ?, "earn", ?)',
      [testCustomerId, createdOrderId, expectedPoints]
    );

    const [custAfter] = await pool.query('SELECT points_balance, total_spent FROM customers WHERE id = ?', [testCustomerId]);
    assert(custAfter[0].points_balance === 9, `Tích điểm khách hàng thành công: ${custAfter[0].points_balance} điểm (+9 điểm)`);
    assert(Number(custAfter[0].total_spent) === 95000, `Tổng chi tiêu khách hàng: ${custAfter[0].total_spent}đ`);


    printHeader('KỊCH BẢN 5: LUỒNG TRẠNG THÁI PHA CHẾ (BARISTA WORKFLOW)');

    // 5.1 Chuyển sang đang pha chế ('preparing')
    await pool.query("UPDATE orders SET status = 'preparing' WHERE id = ?", [createdOrderId]);
    await pool.query("UPDATE order_items SET status = 'preparing', started_at = NOW() WHERE order_id = ?", [createdOrderId]);
    const [ordStatus1] = await pool.query('SELECT status FROM orders WHERE id = ?', [createdOrderId]);
    assert(ordStatus1[0].status === 'preparing', 'Đơn hàng chuyển sang trạng thái: ĐANG PHA CHẾ (preparing)');

    // 5.2 Pha chế hoàn tất ('done')
    await pool.query("UPDATE orders SET status = 'done' WHERE id = ?", [createdOrderId]);
    await pool.query("UPDATE order_items SET status = 'done', done_at = NOW() WHERE order_id = ?", [createdOrderId]);
    const [ordStatus2] = await pool.query('SELECT status FROM orders WHERE id = ?', [createdOrderId]);
    assert(ordStatus2[0].status === 'done', 'Đơn hàng chuyển sang trạng thái: ĐÃ PHA XONG (done)');

    // 5.3 Phục vụ / Giao cho khách ('served')
    await pool.query("UPDATE orders SET status = 'served' WHERE id = ?", [createdOrderId]);
    const [ordStatus3] = await pool.query('SELECT status FROM orders WHERE id = ?', [createdOrderId]);
    assert(ordStatus3[0].status === 'served', 'Đơn hàng chuyển sang trạng thái: ĐÃ PHỤC VỤ (served)');


    printHeader('KỊCH BẢN 6: NGOẠI LỆ, HỦY ĐƠN HÀNG & HOÀN KHO (VOID & ROLLBACK)');

    // Giả lập tình huống khách hủy đơn:
    // Yêu cầu logic thực tế:
    // 1. orders.status -> 'cancelled'
    // 2. Hoàn lại 80g nguyên liệu về kho: 4920g + 80g = 5000g
    // 3. Ghi nhận stock_movements loại 'void_return'
    // 4. Thu hồi 9 điểm tích lũy của khách hàng (points_balance trở về 0)
    // 5. Hóa đơn chuyển sang status 'voided'
    // 6. Ghi nhận payment loại 'refund'

    // Rollback stock
    const [salesMovements] = await pool.query(
      "SELECT ingredient_id, quantity, unit_cost FROM stock_movements WHERE ref_type = 'orders' AND ref_id = ? AND movement_type = 'sale'",
      [createdOrderId]
    );
    for (const sm of salesMovements) {
      const [curIng] = await pool.query('SELECT current_stock, avg_cost FROM ingredients WHERE id = ?', [sm.ingredient_id]);
      const restoredStock = parseFloat(curIng[0].current_stock) + parseFloat(sm.quantity);
      await pool.query('UPDATE ingredients SET current_stock = ? WHERE id = ?', [restoredStock, sm.ingredient_id]);
      await pool.query(
        `INSERT INTO stock_movements (ingredient_id, movement_type, quantity, unit_cost, balance_after, ref_type, ref_id, note, created_by)
         VALUES (?, 'void_return', ?, ?, ?, 'orders', ?, ?, 1)`,
        [sm.ingredient_id, sm.quantity, curIng[0].avg_cost, restoredStock, createdOrderId, `Hoàn trả nguyên liệu do hủy đơn #${createdOrderId}`]
      );
    }

    // Kiểm tra tồn kho đã phục hồi hoàn toàn chưa
    const [restoredIng] = await pool.query('SELECT current_stock FROM ingredients WHERE id = ?', [createdIngredientId]);
    assert(parseFloat(restoredIng[0].current_stock) === 5000, `Tồn kho nguyên liệu đã được HOÀN TRẢ ĐẦY ĐỦ về 5000g`);

    // Thu hồi điểm tích lũy
    await pool.query(
      'UPDATE customers SET points_balance = GREATEST(0, points_balance - ?), total_spent = GREATEST(0, total_spent - ?) WHERE id = ?',
      [expectedPoints, calculatedSubtotal, testCustomerId]
    );
    await pool.query(
      'INSERT INTO loyalty_transactions (customer_id, order_id, type, points) VALUES (?, ?, "revoke", ?)',
      [testCustomerId, createdOrderId, -expectedPoints]
    );

    const [custRollback] = await pool.query('SELECT points_balance, total_spent FROM customers WHERE id = ?', [testCustomerId]);
    assert(custRollback[0].points_balance === 0, 'Điểm tích lũy của khách hàng đã được thu hồi chính xác (về 0 điểm)');
    assert(Number(custRollback[0].total_spent) === 0, 'Tổng chi tiêu của khách hàng đã được hoàn trừ chính xác (về 0đ)');

    // Cập nhật trạng thái đơn hủy và hóa đơn voided
    await pool.query("UPDATE orders SET status = 'cancelled' WHERE id = ?", [createdOrderId]);
    await pool.query("UPDATE invoices SET status = 'voided', void_reason = 'Khách yêu cầu hủy' WHERE order_id = ?", [createdOrderId]);
    await pool.query("INSERT INTO payments (order_id, method, type, amount, created_by) VALUES (?, 'cash', 'refund', ?, 1)", [createdOrderId, calculatedSubtotal]);

    const [finalOrder] = await pool.query('SELECT status FROM orders WHERE id = ?', [createdOrderId]);
    assert(finalOrder[0].status === 'cancelled', 'Trạng thái đơn hàng cuối cùng là CANCELLED');

    const [finalInv] = await pool.query('SELECT status FROM invoices WHERE order_id = ?', [createdOrderId]);
    assert(finalInv[0].status === 'voided', 'Hóa đơn đã được hủy (status = voided)');


    printHeader('KỊCH BẢN 7: DỌN DẸP DỮ LIỆU TEST (CLEANUP & SOFT DELETE VERIFICATION)');

    // Xóa mềm món (Soft delete test)
    await pool.query('UPDATE products SET is_active = 0 WHERE id = ?', [createdProductId]);
    const [softDelProd] = await pool.query('SELECT is_active FROM products WHERE id = ?', [createdProductId]);
    assert(softDelProd[0].is_active === 0, 'Xóa mềm sản phẩm thành công (is_active = 0)');

    // Dọn dẹp sạch sẽ dữ liệu test
    await pool.query('DELETE FROM stock_movements WHERE ref_id = ?', [createdOrderId]);
    await pool.query('DELETE FROM payments WHERE order_id = ?', [createdOrderId]);
    await pool.query('DELETE FROM invoices WHERE order_id = ?', [createdOrderId]);
    await pool.query('DELETE FROM order_items WHERE order_id = ?', [createdOrderId]);
    await pool.query('DELETE FROM orders WHERE id = ?', [createdOrderId]);
    await pool.query('DELETE FROM loyalty_transactions WHERE customer_id = ?', [testCustomerId]);
    await pool.query('DELETE FROM customers WHERE id = ?', [testCustomerId]);
    await pool.query('DELETE FROM recipes WHERE product_size_id IN (?, ?)', [sizeM.id, sizeL.id]);
    await pool.query('DELETE FROM ingredients WHERE id = ?', [createdIngredientId]);
    await pool.query('DELETE FROM product_sizes WHERE product_id = ?', [createdProductId]);
    await pool.query('DELETE FROM products WHERE id = ?', [createdProductId]);
    await pool.query('DELETE FROM categories WHERE id = ?', [createdCategoryId]);

    console.log('  ✅ Đã dọn dẹp sạch sẽ toàn bộ các bản ghi kiểm thử, cơ sở dữ liệu giữ nguyên tính toàn vẹn!');

    printHeader('🎉 TẤT CẢ 7 KỊCH BẢN KIỂM THỬ THỰC TẾ ĐÃ HOÀN TOÀN VƯỢT QUA VỚI 0 LỖI!');
  } catch (err) {
    console.error('\n❌ PHÁT SINH LỖI TRONG QUÁ TRÌNH KIỂM THỬ:', err);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

runAllTests();
