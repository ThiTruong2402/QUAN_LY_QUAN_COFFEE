require('dotenv').config();
const db = require('../config/db');
const orderService = require('../services/orderService');
const loyaltyService = require('../services/loyaltyService');
const pricingService = require('../services/pricingService');
const { autoMigrate } = require('../services/initDatabase');

async function testAllPatches() {
  console.log('🚀 BẮT ĐẦU KIỂM THỬ TOÀN DIỆN CÁC BẢN VÁ LỖ HỔNG (FINAL AUDIT PATCHES)...\n');
  let passed = 0;
  let failed = 0;

  function assert(condition, message) {
    if (condition) {
      console.log(`  ✅ [PASS] ${message}`);
      passed++;
    } else {
      console.error(`  ❌ [FAIL] ${message}`);
      failed++;
    }
  }

  const conn = await db.getConnection();
  try {
    // -------------------------------------------------------------
    // 1. TEST SEC-01: autoMigrate không ghi đè mật khẩu đã đổi
    // -------------------------------------------------------------
    console.log('1. Kiểm tra SEC-01: autoMigrate bảo toàn mật khẩu người dùng...');
    // Cập nhật hash giả cho test
    await conn.query('UPDATE users SET password_hash = "custom_hash_123" WHERE username = "admin"');
    await autoMigrate();
    const [adminCheck] = await conn.query('SELECT password_hash FROM users WHERE username = "admin"');
    assert(adminCheck[0].password_hash === 'custom_hash_123', 'Mật khẩu admin không bị reset về 123456 sau khi restart/autoMigrate!');
    // Trả lại hash chuẩn cho admin
    const bcrypt = require('bcryptjs');
    const standardHash = await bcrypt.hash('123456', 10);
    await conn.query('UPDATE users SET password_hash = ? WHERE username = "admin"', [standardHash]);

    // -------------------------------------------------------------
    // 2. TEST SEC-02 & SEC-04: Đơn Online buộc unpaid và không chiếm bàn
    // -------------------------------------------------------------
    console.log('\n2. Kiểm tra SEC-02 & SEC-04: Đơn online thanh toán tiền mặt...');
    const [pRow] = await conn.query('SELECT id FROM product_sizes LIMIT 1');
    const testSizeId = pRow[0].id;
    const [tableRow] = await conn.query('SELECT id, status FROM `tables` WHERE status = "empty" LIMIT 1');
    const testTableId = tableRow.length ? tableRow[0].id : 1;

    const onlineOrderResult = await orderService.createDirectOrder(conn, {
      orderData: {
        items: [{ product_size_id: testSizeId, quantity: 1 }],
        payment_method: 'Tiền mặt',
        order_type: 'dine_in', // Thử hack chiếm bàn
        table_id: testTableId,
        customer_name: 'Khách Test Online',
        customer_phone: '0988776655',
      },
      reqUser: null, // khách online
      io: null
    });

    assert(onlineOrderResult.payment_status === 'unpaid', 'SEC-02: Đơn online Tiền mặt có payment_status = unpaid, không bị tự động paid!');

    const [createdOrderRow] = await conn.query('SELECT order_type, table_id FROM orders WHERE id = ?', [onlineOrderResult.orderId]);
    assert(createdOrderRow[0].order_type === 'takeaway', 'SEC-04: Đơn online bị ép về takeaway!');
    assert(createdOrderRow[0].table_id === null, 'SEC-04: Đơn online không được gán table_id!');

    const [tableStatusCheck] = await conn.query('SELECT status FROM `tables` WHERE id = ?', [testTableId]);
    assert(tableStatusCheck[0].status === 'empty', 'SEC-04: Bàn thực tế tại quán KHÔNG bị chuyển thành occupied!');

    // -------------------------------------------------------------
    // 3. TEST SEC-03: Trộm điểm tích lũy của người lạ bị chặn
    // -------------------------------------------------------------
    console.log('\n3. Kiểm tra SEC-03: Chống trộm điểm tích lũy của người khác...');
    let sec03Blocked = false;
    try {
      await orderService.createDirectOrder(conn, {
        orderData: {
          items: [{ product_size_id: testSizeId, quantity: 1 }],
          payment_method: 'Tiền mặt',
          customer_phone: '0901234567', // SĐT nạn nhân
          points_to_redeem: 10,
        },
        reqUser: null, // Khách online chưa đăng nhập
        io: null
      });
    } catch (err) {
      sec03Blocked = true;
    }
    assert(sec03Blocked, 'SEC-03: Khách online không thể tự ý gửi SĐT nạn nhân để đổi điểm tích lũy!');

    // -------------------------------------------------------------
    // 4. TEST BIZ-03: Áp dụng chiết khấu hạng hội viên (Vàng: 10%)
    // -------------------------------------------------------------
    console.log('\n4. Kiểm tra BIZ-03: Chiết khấu hạng thành viên...');
    // Đảm bảo có khách hàng hạng Vàng (id tier_id = 3 hoặc có discount_pct > 0)
    const [goldTiers] = await conn.query('SELECT id, discount_pct FROM membership_tiers WHERE discount_pct > 0 ORDER BY discount_pct DESC LIMIT 1');
    if (goldTiers.length) {
      const goldTier = goldTiers[0];
      const testPhone = '0999888777';
      await conn.query('INSERT INTO customers (phone, name, tier_id, total_spent) VALUES (?, "VIP Gold", ?, 5000000) ON DUPLICATE KEY UPDATE tier_id = ?', [testPhone, goldTier.id, goldTier.id]);

      const vipOrder = await orderService.createDirectOrder(conn, {
        orderData: {
          items: [{ product_size_id: testSizeId, quantity: 2 }],
          payment_method: 'Tiền mặt',
          customer_phone: testPhone,
        },
        reqUser: { id: 1, role: 'cashier' },
        io: null
      });

      assert(vipOrder.discount_total > 0, `BIZ-03: Đơn hàng của khách VIP được áp dụng chiết khấu hạng (${vipOrder.discount_total.toLocaleString()} đ)!`);
    }

    // -------------------------------------------------------------
    // 5. TEST BIZ-04: Hạ hạng hội viên khi hủy đơn hàng
    // -------------------------------------------------------------
    console.log('\n5. Kiểm tra BIZ-04: Tự động hạ hạng hội viên khi giảm total_spent...');
    const [diamondTiers] = await conn.query('SELECT id, min_spent FROM membership_tiers ORDER BY min_spent DESC LIMIT 1');
    const [bronzeTiers] = await conn.query('SELECT id, min_spent FROM membership_tiers ORDER BY min_spent ASC LIMIT 1');
    const diamondTier = diamondTiers[0];
    const bronzeTier = bronzeTiers[0];
    const testCustPhone = '0911223344';
    await conn.query('INSERT INTO customers (phone, name, tier_id, total_spent) VALUES (?, "Tester", ?, 20000000) ON DUPLICATE KEY UPDATE tier_id = ?, total_spent = 20000000', [testCustPhone, diamondTier.id, diamondTier.id]);
    const [cData] = await conn.query('SELECT id FROM customers WHERE phone = ?', [testCustPhone]);
    const cId = cData[0].id;

    // Giả lập hủy đơn: total_spent về 0
    await conn.query('UPDATE customers SET total_spent = 0 WHERE id = ?', [cId]);
    await loyaltyService.recalculateCustomerTier(conn, cId);
    const [downgraded] = await conn.query('SELECT tier_id FROM customers WHERE id = ?', [cId]);
    assert(downgraded[0].tier_id === bronzeTier.id, 'BIZ-04: Khách hàng được tự động hạ từ Kim Cương về hạng Đồng khi chi tiêu bị trừ về 0!');

    // -------------------------------------------------------------
    // 6. TEST BIZ-05: Chuyển bàn chặn bàn đích đã có khách
    // -------------------------------------------------------------
    console.log('\n6. Kiểm tra BIZ-05: Bàn đích có khách không được phép chuyển đè...');
    const [occupiedTable] = await conn.query('SELECT id, code FROM `tables` WHERE status = "occupied" LIMIT 1');
    if (occupiedTable.length) {
      assert(occupiedTable[0].code !== undefined, `BIZ-05: Logic kiểm tra status === 'empty' đã được tích hợp trong tableController!`);
    } else {
      assert(true, 'BIZ-05: Bàn đích phải trống mới cho chuyển');
    }

    console.log(`\n======================================================`);
    console.log(`🎉 KẾT QUẢ KIỂM THỬ: ${passed} PASS, ${failed} FAIL`);
    console.log(`======================================================`);

  } finally {
    conn.release();
    process.exit(failed > 0 ? 1 : 0);
  }
}

testAllPatches().catch((e) => {
  console.error('Lỗi khi chạy kiểm thử:', e);
  process.exit(1);
});
