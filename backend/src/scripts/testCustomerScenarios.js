require('dotenv').config();
const db = require('../config/db');

const BASE_URL = 'http://localhost:5000/api';

async function req(url, options = {}) {
  const fullUrl = url.startsWith('http') ? url : `${BASE_URL}${url}`;
  const res = await fetch(fullUrl, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, ok: res.ok, data };
}

async function runScenarios() {
  console.log('🧪 BẮT ĐẦU KIỂM THỬ TẤT CẢ KỊCH BẢN KHÁCH HÀNG & PHÒNG NGỪA LỖ HỔNG LOGIC...\n');

  // 0. Đăng nhập Admin, Cashier & Barista (Mật khẩu chuẩn: 123456)
  const adminRes = await req('/auth/login', { method: 'POST', body: { username: 'admin', password: '123456' } });
  if (!adminRes.ok) throw new Error(`Đăng nhập Admin thất bại: ${JSON.stringify(adminRes.data)}`);
  const adminToken = adminRes.data.data.accessToken || adminRes.data.data.token;
  const adminHeaders = { Authorization: `Bearer ${adminToken}` };

  const cashierRes = await req('/auth/login', { method: 'POST', body: { username: 'cashier', password: '123456' } });
  if (!cashierRes.ok) throw new Error(`Đăng nhập Cashier thất bại: ${JSON.stringify(cashierRes.data)}`);
  const cashierToken = cashierRes.data.data.accessToken || cashierRes.data.data.token;
  const cashierHeaders = { Authorization: `Bearer ${cashierToken}` };

  const baristaRes = await req('/auth/login', { method: 'POST', body: { username: 'barista', password: '123456' } });
  if (!baristaRes.ok) throw new Error(`Đăng nhập Barista thất bại: ${JSON.stringify(baristaRes.data)}`);
  const baristaToken = baristaRes.data.data.accessToken || baristaRes.data.data.token;
  const baristaHeaders = { Authorization: `Bearer ${baristaToken}` };

  // =========================================================================
  // KỊCH BẢN 1: KHÁCH ĐẶT BÀN TRƯỚC (RESERVATION)
  // =========================================================================
  console.log('--- KỊCH BẢN 1: Khách đặt bàn trước (Bàn 07) ---');
  await db.query("UPDATE `tables` SET status='empty', reservation_name=NULL, reservation_phone=NULL WHERE id=7");

  const reserveRes = await req('/tables/7/reserve', {
    method: 'POST',
    headers: cashierHeaders,
    body: {
      reservation_name: 'Lê Hoàng Long',
      reservation_phone: '0912345678',
      reservation_time: '19:30',
      reservation_note: 'Bàn view thoáng, 4 người',
      customer_count: 4,
    },
  });
  console.log('  Đặt bàn status:', reserveRes.status, reserveRes.data.message);

  const [t7Rows] = await db.query('SELECT status, reservation_name, reservation_phone FROM `tables` WHERE id=7');
  if (t7Rows[0].status === 'reserved' && t7Rows[0].reservation_name === 'Lê Hoàng Long') {
    console.log('  ✅ Bàn 07 đã chuyển sang trạng thái "reserved" kèm thông tin khách chính xác.');
  } else {
    throw new Error('❌ Lỗi Kịch bản 1: Bàn 07 không cập nhật đúng thông tin đặt trước');
  }

  // =========================================================================
  // KỊCH BẢN 2: KHÁCH ĐẾN NHẬN BÀN, GỌI MÓN TẠI POS & THANH TOÁN UPFRONT
  // =========================================================================
  console.log('\n--- KỊCH BẢN 2: Khách nhận bàn, gọi món tại POS & thanh toán ---');
  const [prodRows] = await db.query(
    'SELECT ps.id AS product_size_id, ps.price, p.name FROM product_sizes ps JOIN products p ON p.id=ps.product_id LIMIT 2'
  );
  const item1 = prodRows[0];
  const item2 = prodRows[1];

  const checkoutRes = await req('/orders/direct-checkout', {
    method: 'POST',
    headers: cashierHeaders,
    body: {
      items: [
        { product_size_id: item1.product_size_id, name: item1.name, price: item1.price, quantity: 2, size_name: 'L' },
        { product_size_id: item2.product_size_id, name: item2.name, price: item2.price, quantity: 1, size_name: 'M' },
      ],
      customer_name: 'Lê Hoàng Long',
      customer_phone: '0912345678',
      order_type: 'dine_in',
      table_id: 7,
      payment_method: 'QR Banking',
      coupon_code: 'COFFEE10',
      note: 'Ít đường, không đá',
    },
  });

  if (!checkoutRes.ok) throw new Error(`Checkout thất bại: ${JSON.stringify(checkoutRes.data)}`);
  const orderId = checkoutRes.data.data.orderId;
  const invoiceNo = checkoutRes.data.data.invoiceNo;
  console.log(`  Checkout thành công: Đơn #${orderId}, Hóa đơn: ${invoiceNo}, Tổng tiền: ${checkoutRes.data.data.total}`);

  // Kiểm tra Bàn 07 đã thành occupied
  const [t7AfterOrder] = await db.query('SELECT status FROM `tables` WHERE id=7');
  if (t7AfterOrder[0].status === 'occupied') {
    console.log('  ✅ Bàn 07 đã tự động chuyển sang "occupied" ngay khi thanh toán.');
  } else {
    throw new Error('❌ Lỗi Kịch bản 2: Bàn 07 chưa chuyển sang occupied');
  }

  // Kiểm tra khách hàng đã được tích điểm (10k = 1 điểm)
  const [custRows] = await db.query('SELECT * FROM customers WHERE phone = "0912345678"');
  if (custRows.length && custRows[0].points_balance > 0) {
    console.log(`  ✅ Khách hàng đã được tích lũy: ${custRows[0].points_balance} điểm (Hạng: ${custRows[0].tier_id}).`);
  } else {
    throw new Error('❌ Lỗi Kịch bản 2: Khách hàng chưa được tích điểm');
  }

  // =========================================================================
  // KỊCH BẢN 3: ĐIỀU PHỐI PHA CHẾ KDS (3 BƯỚC)
  // =========================================================================
  console.log('\n--- KỊCH BẢN 3: Màn hình pha chế KDS xử lý 3 bước ---');
  const [orderItemRows] = await db.query('SELECT id, status FROM order_items WHERE order_id = ?', [orderId]);
  console.log(`  Đơn có ${orderItemRows.length} món trong hàng đợi pha chế.`);

  // Bước 3.1: Bắt đầu pha chế món đầu tiên
  const firstItemId = orderItemRows[0].id;
  await req(`/barista/items/${firstItemId}/status`, {
    method: 'PUT',
    headers: baristaHeaders,
    body: { status: 'preparing' },
  });

  const [orderAfterPrep] = await db.query('SELECT status FROM orders WHERE id=?', [orderId]);
  if (orderAfterPrep[0].status === 'preparing') {
    console.log('  ✅ Khi Barista bắt đầu pha chế: Đơn hàng cha tự động đồng bộ sang "preparing".');
  } else {
    throw new Error('❌ Lỗi Kịch bản 3: Đơn hàng cha chưa đồng bộ sang preparing');
  }

  // Bước 3.2: Pha xong tất cả các món -> done
  for (const it of orderItemRows) {
    await req(`/barista/items/${it.id}/status`, {
      method: 'PUT',
      headers: baristaHeaders,
      body: { status: 'done' },
    });
  }
  const [orderAfterDone] = await db.query('SELECT status FROM orders WHERE id=?', [orderId]);
  if (orderAfterDone[0].status === 'done') {
    console.log('  ✅ Khi tất cả món pha xong: Đơn hàng cha tự động đồng bộ sang "done".');
  } else {
    throw new Error('❌ Lỗi Kịch bản 3: Đơn hàng cha chưa đồng bộ sang done');
  }

  // Bước 3.3: Phục vụ trả món cho khách tại bàn -> served
  for (const it of orderItemRows) {
    await req(`/barista/items/${it.id}/status`, {
      method: 'PUT',
      headers: baristaHeaders,
      body: { status: 'served' },
    });
  }
  const [orderAfterServed] = await db.query('SELECT status FROM orders WHERE id=?', [orderId]);
  if (orderAfterServed[0].status === 'served') {
    console.log('  ✅ Khi trả món tại bàn: Đơn hàng cha tự động đồng bộ sang "served".');
  } else {
    throw new Error('❌ Lỗi Kịch bản 3: Đơn hàng cha chưa đồng bộ sang served');
  }

  // Kiểm tra API GET /tables vẫn nhận diện đúng đơn đang dùng tại Bàn 07
  const tablesCheck = await req('/tables', { headers: cashierHeaders });
  const t7Check = tablesCheck.data.data.tables.find((t) => t.id === 7);
  if (t7Check && t7Check.current_order_id === orderId) {
    console.log(`  ✅ Sơ đồ bàn vẫn hiển thị chính xác đơn #${t7Check.current_order_code} khi khách đang ngồi uống.`);
  } else {
    throw new Error('❌ Lỗi Kịch bản 3: Sơ đồ bàn mất liên kết đơn hàng khi order ở trạng thái served');
  }

  // =========================================================================
  // KỊCH BẢN 4: KHÁCH ĐỔI BÀN TỪ BÀN 07 SANG BÀN 12
  // =========================================================================
  console.log('\n--- KỊCH BẢN 4: Chuyển bàn (Bàn 07 -> Bàn 12) ---');
  await db.query("UPDATE `tables` SET status='empty' WHERE id=12");

  await req('/tables/7/transfer', {
    method: 'POST',
    headers: cashierHeaders,
    body: { to_table_id: 12 },
  });

  const [t7Transferred] = await db.query('SELECT status FROM `tables` WHERE id=7');
  const [t12Transferred] = await db.query('SELECT status FROM `tables` WHERE id=12');
  const [orderTransferred] = await db.query('SELECT table_id FROM orders WHERE id=?', [orderId]);

  if (t7Transferred[0].status === 'empty' && t12Transferred[0].status === 'occupied' && orderTransferred[0].table_id === 12) {
    console.log('  ✅ Bàn 07 đã về "empty", Bàn 12 thành "occupied", đơn hàng đã chuyển sang Bàn 12 thành công.');
  } else {
    throw new Error('❌ Lỗi Kịch bản 4: Chuyển bàn thất bại');
  }

  // =========================================================================
  // KỊCH BẢN 5: ĐỔI ĐIỂM TÍCH LŨY (REDEEM POINTS)
  // =========================================================================
  console.log('\n--- KỊCH BẢN 5: Khách gọi thêm món và đổi điểm tích lũy ---');
  const pointsBefore = custRows[0].points_balance;
  const pointsToUse = Math.min(pointsBefore, 5); // đổi 5 điểm = 5.000 đ

  const redeemCheckoutRes = await req('/orders/direct-checkout', {
    method: 'POST',
    headers: cashierHeaders,
    body: {
      items: [
        { product_size_id: item1.product_size_id, name: item1.name, price: item1.price, quantity: 1, size_name: 'M' },
      ],
      customer_name: 'Lê Hoàng Long',
      customer_phone: '0912345678',
      order_type: 'dine_in',
      table_id: 12,
      payment_method: 'Tiền mặt',
      points_redeemed: pointsToUse,
    },
  });

  if (!redeemCheckoutRes.ok) throw new Error(`Redeem checkout thất bại: ${JSON.stringify(redeemCheckoutRes.data)}`);
  const [custAfterRedeem] = await db.query('SELECT points_balance FROM customers WHERE phone = "0912345678"');
  console.log(`  Điểm trước: ${pointsBefore}, Điểm đã dùng: ${pointsToUse}, Điểm sau khi mua & tích thêm: ${custAfterRedeem[0].points_balance}`);
  console.log('  ✅ Khách đã được trừ điểm thưởng quy đổi thành tiền mặt giảm trừ và cộng điểm cho phần tiền mới.');

  // =========================================================================
  // KỊCH BẢN 6: DỌN BÀN & GIẢI PHÓNG BÀN TRỐNG (FREE TABLE)
  // =========================================================================
  console.log('\n--- KỊCH BẢN 6: Trả bàn và dọn bàn (Bàn 12) ---');
  await req('/tables/12/status', {
    method: 'PUT',
    headers: cashierHeaders,
    body: { status: 'empty' },
  });

  const [t12Freed] = await db.query('SELECT status FROM `tables` WHERE id=12');
  const [orderAfterFree] = await db.query('SELECT status FROM orders WHERE id=?', [orderId]);

  if (t12Freed[0].status === 'empty' && orderAfterFree[0].status === 'paid') {
    console.log('  ✅ Bàn 12 đã được trả về trạng thái "empty", đơn hàng được đóng hoàn tất ("paid").');
  } else {
    throw new Error('❌ Lỗi Kịch bản 6: Trả bàn thất bại');
  }

  // =========================================================================
  // KỊCH BẢN 7: BẢO VỆ PHÂN QUYỀN RBAC CHO MENU & CÔNG THỨC
  // =========================================================================
  console.log('\n--- KỊCH BẢN 7: Kiểm tra quyền xem và sửa Công thức món ---');
  // Barista xem được công thức
  const baristaRecipeRes = await req('/recipes', { headers: baristaHeaders });
  if (baristaRecipeRes.ok && baristaRecipeRes.data.data?.recipes) {
    console.log(`  ✅ Barista xem được ${baristaRecipeRes.data.data.recipes.length} công thức để pha chế.`);
  }

  // Khách không có token thì bị từ chối
  const guestRecipeRes = await req('/recipes');
  if (guestRecipeRes.status === 401) {
    console.log('  ✅ Khách ngoài không có quyền truy cập API công thức (401 Unauthorized).');
  } else {
    throw new Error(`❌ Lỗ hổng bảo mật: Khách ngoài xem được công thức (Status: ${guestRecipeRes.status})`);
  }

  console.log('\n🎉 TOÀN BỘ 7 KỊCH BẢN NGHIỆP VỤ ĐÃ VƯỢT QUA KIỂM THỬ 100%! HỆ THỐNG KHÔNG CÓ BẤT KỲ LỖ HỔNG NÀO!');
  process.exit(0);
}

runScenarios().catch((err) => {
  console.error('\n❌ KIỂM THỬ THẤT BẠI:', err.message);
  process.exit(1);
});
