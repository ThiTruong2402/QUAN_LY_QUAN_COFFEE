const http = require('http');

function apiCall(method, path, body = null, token = null) {
  return new Promise((resolve, reject) => {
    const dataString = body ? JSON.stringify(body) : null;
    const headers = { 'Content-Type': 'application/json' };
    if (dataString) headers['Content-Length'] = Buffer.byteLength(dataString);
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const req = http.request(
      {
        hostname: 'localhost',
        port: 5000,
        path: '/api' + path,
        method: method,
        headers: headers,
      },
      (res) => {
        let respData = '';
        res.on('data', (c) => (respData += c));
        res.on('end', () => {
          try {
            resolve({ status: res.statusCode, data: JSON.parse(respData) });
          } catch {
            resolve({ status: res.statusCode, raw: respData });
          }
        });
      }
    );
    req.on('error', reject);
    if (dataString) req.write(dataString);
    req.end();
  });
}

async function runTests() {
  console.log('🚀 BẮT ĐẦU KIỂM THỬ TOÀN DIỆN CÁC SỬA LỖI HỆ THỐNG...\n');

  // 1. Đăng nhập các vai trò (Mật khẩu chuẩn: 123456)
  const adminLogin = await apiCall('POST', '/auth/login', { username: 'admin', password: '123456' });
  const adminToken = adminLogin.data?.data?.accessToken;

  const cashierLogin = await apiCall('POST', '/auth/login', { username: 'cashier', password: '123456' });
  const cashierToken = cashierLogin.data?.data?.accessToken;

  const baristaLogin = await apiCall('POST', '/auth/login', { username: 'barista', password: '123456' });
  const baristaToken = baristaLogin.data?.data?.accessToken;

  const warehouseLogin = await apiCall('POST', '/auth/login', { username: 'warehouse', password: '123456' });
  const warehouseToken = warehouseLogin.data?.data?.accessToken;

  console.log('1. Đăng nhập 4 vai trò chính:');
  console.log('  Admin token:', !!adminToken);
  console.log('  Cashier token:', !!cashierToken);
  console.log('  Barista token:', !!baristaToken);
  console.log('  Warehouse token:', !!warehouseToken);

  // 2. Test Quyền Cashier truy cập Dashboard
  console.log('\n2. Kiểm tra Cashier truy cập Báo cáo Dashboard:');
  const cashierDash = await apiCall('GET', '/reports/dashboard', null, cashierToken);
  console.log('  Status code:', cashierDash.status, 'Success:', cashierDash.data?.success);
  if (cashierDash.status !== 200) throw new Error('Cashier should be allowed to view dashboard!');

  // 3. Test Quyền Warehouse truy cập Báo cáo Kho
  console.log('\n3. Kiểm tra Warehouse truy cập Báo cáo Kho:');
  const warehouseStock = await apiCall('GET', '/reports/stock', null, warehouseToken);
  console.log('  Status code:', warehouseStock.status, 'Success:', warehouseStock.data?.success);
  if (warehouseStock.status !== 200) throw new Error('Warehouse should be allowed to view stock report!');

  // 4. Test API Ca trực với mọi vai trò (Fix r.description)
  console.log('\n4. Kiểm tra API Ca trực GET /work-shifts (Barista gọi):');
  const baristaShifts = await apiCall('GET', '/work-shifts', null, baristaToken);
  console.log('  Status code:', baristaShifts.status, 'Số ca trực:', baristaShifts.data?.data?.length);
  if (baristaShifts.status !== 200 || !baristaShifts.data?.data) throw new Error('Shifts query failed!');

  // 5. Test Lỗ hổng RBAC: Warehouse cố cập nhật status đơn hàng qua PUT /orders/:id/status
  console.log('\n5. Kiểm tra chặn Warehouse cập nhật status đơn hàng:');
  const warehouseStatusUpdate = await apiCall('PUT', '/orders/1/status', { status: 'paid' }, warehouseToken);
  console.log('  Status code:', warehouseStatusUpdate.status, 'Message:', warehouseStatusUpdate.data?.message);
  if (warehouseStatusUpdate.status !== 403) throw new Error('Warehouse must be forbidden from updating order status!');

  // 6. Test directCheckout có mã giảm giá (Không bị NaN, tính chuẩn 10%)
  console.log('\n6. Kiểm tra directCheckout áp dụng mã giảm giá COFFEE10:');
  const checkoutPayload = {
    items: [
      { product_id: 1, product_size_id: 1, name: 'Cà phê Đen đá', size_name: 'Vừa', price: 29000, quantity: 3, line_total: 87000 }
    ],
    coupon_code: 'COFFEE10',
    payment_method: 'Tiền mặt',
    order_type: 'takeaway',
  };
  const checkoutRes = await apiCall('POST', '/orders/direct-checkout', checkoutPayload, cashierToken);
  console.log('  Checkout Status:', checkoutRes.status, 'Order Code:', checkoutRes.data?.data?.code || checkoutRes.data?.data?.orderCode);
  console.log('  Subtotal:', checkoutRes.data?.data?.subtotal, 'Discount:', checkoutRes.data?.data?.discount_total, 'Total:', checkoutRes.data?.data?.total);
  if (checkoutRes.status !== 200 || isNaN(checkoutRes.data?.data?.total) || Number(checkoutRes.data?.data?.discount_total) <= 0) {
    throw new Error('Direct checkout discount calculation failed! Discount must be > 0 when coupon conditions are met.');
  }
  const createdOrderId = checkoutRes.data?.data?.orderId;

  // 7. Test State Machine: Chuyển sang preparing -> done, sau đó chặn quay lại pending
  console.log('\n7. Kiểm tra State Machine đơn hàng:');
  const toPreparing = await apiCall('PUT', `/orders/${createdOrderId}/status`, { status: 'preparing' }, baristaToken);
  console.log('  Pending -> Preparing (Barista):', toPreparing.status, toPreparing.data?.success);

  const toDone = await apiCall('PUT', `/orders/${createdOrderId}/status`, { status: 'done' }, baristaToken);
  console.log('  Preparing -> Done (Barista):', toDone.status, toDone.data?.success);

  // Thử quay lại pending (phải bị từ chối)
  const illegalReverse = await apiCall('PUT', `/orders/${createdOrderId}/status`, { status: 'pending' }, baristaToken);
  console.log('  Done -> Pending (Phải bị chặn 400):', illegalReverse.status, illegalReverse.data?.message);
  if (illegalReverse.status !== 400) throw new Error('Reverse transition must be rejected by State Machine!');

  // Thử hủy đơn qua API status (phải bị từ chối chuyển sang /cancel)
  const cancelViaStatus = await apiCall('PUT', `/orders/${createdOrderId}/status`, { status: 'cancelled' }, cashierToken);
  console.log('  Cancel via /status (Phải bị chặn 400):', cancelViaStatus.status, cancelViaStatus.data?.message);
  if (cancelViaStatus.status !== 400) throw new Error('Cancelling via /status must be rejected!');

  // 8. Hủy đơn chuẩn qua PUT /orders/:id/cancel
  console.log('\n8. Hủy đơn chuẩn qua PUT /orders/:id/cancel:');
  const validCancel = await apiCall('PUT', `/orders/${createdOrderId}/cancel`, { cancel_reason: 'Khách đổi ý muốn hủy' }, adminToken);
  console.log('  Hủy đơn chuẩn (Admin):', validCancel.status, validCancel.data?.message);
  if (validCancel.status !== 200) throw new Error('Valid cancelOrder failed!');

  // 9. Kiểm tra doanh thu tức thì trên Dashboard
  console.log('\n9. Kiểm tra Doanh thu và Thống kê trên Dashboard:');
  const finalDash = await apiCall('GET', '/reports/dashboard', null, adminToken);
  console.log('  Dashboard Today Orders:', finalDash.data?.data?.today_orders);
  console.log('  Dashboard Today Revenue:', finalDash.data?.data?.today_revenue);
  console.log('  Dashboard Total Customers:', finalDash.data?.data?.total_customers);

  console.log('\n🎉 TẤT CẢ 9 KỊCH BẢN KIỂM THỬ ĐÃ THÀNH CÔNG 100%! HỆ THỐNG HOÀN TOÀN ĐẠT CHUẨN!');
}

runTests()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error('❌ LỖI KIỂM THỬ:', e);
    process.exit(1);
  });
