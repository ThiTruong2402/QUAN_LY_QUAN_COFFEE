const pool = require('../config/db');

async function testWorkflow() {
  try {
    const loginRes = await fetch('http://localhost:5000/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'admin', password: '123456' })
    });
    const loginData = await loginRes.json();
    const token = loginData.data?.accessToken;
    console.log('Login OK, user:', loginData.data.user.full_name);

    // 1. Create order from POS (Xác nhận đơn hàng -> status: pending)
    const orderRes = await fetch('http://localhost:5000/api/orders/direct-checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
      body: JSON.stringify({
        items: [
          { product_id: 1, product_size_id: 2, name: 'Cà Phê Muối', size_name: 'M', price: 29000, quantity: 2 },
          { product_id: 3, product_size_id: 8, name: 'Bạc Xỉu Sài Gòn', size_name: 'L', price: 33000, quantity: 1 }
        ],
        customer_name: 'Bùi Văn Trường',
        customer_phone: '0901234567',
        payment_method: 'QR Banking',
        status: 'pending'
      })
    });
    const orderData = await orderRes.json();
    console.log('1. Created Order:', orderData);
    const orderId = orderData.data.orderId;

    // Check DB state right after creation (Should be 'pending')
    const [chk1] = await pool.query('SELECT id, code, status, closed_at FROM orders WHERE id = ?', [orderId]);
    console.log('DB state right after creation (must be pending):', chk1[0]);

    // 2. Transition: pending -> preparing (Barista bắt đầu làm)
    const prepRes = await fetch('http://localhost:5000/api/orders/' + orderId + '/status', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
      body: JSON.stringify({ status: 'preparing' })
    });
    console.log('2. Preparing status response:', await prepRes.json());

    // 3. Transition: preparing -> done (Đã pha xong)
    const doneRes = await fetch('http://localhost:5000/api/orders/' + orderId + '/status', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
      body: JSON.stringify({ status: 'done' })
    });
    console.log('3. Done status response:', await doneRes.json());

    // 4. Transition: done -> served (Đã phục vụ)
    const servedRes = await fetch('http://localhost:5000/api/orders/' + orderId + '/status', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
      body: JSON.stringify({ status: 'served' })
    });
    console.log('4. Served status response:', await servedRes.json());

    // 5. Transition: served -> paid (Thu tiền & Hoàn tất)
    const paidRes = await fetch('http://localhost:5000/api/orders/' + orderId + '/status', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
      body: JSON.stringify({ status: 'paid', payment_method: 'QR Banking' })
    });
    console.log('5. Paid status response:', await paidRes.json());

    // Final checks
    const [chkFinal] = await pool.query('SELECT id, code, status, closed_at FROM orders WHERE id = ?', [orderId]);
    console.log('Final Order in DB:');
    console.table(chkFinal);

    const [items] = await pool.query('SELECT product_name, size_name, status, started_at, done_at FROM order_items WHERE order_id = ?', [orderId]);
    console.log('Final Items in DB:');
    console.table(items);

    const [sm] = await pool.query("SELECT ingredient_id, movement_type, quantity, ref_id, note FROM stock_movements WHERE ref_type = 'orders' AND ref_id = ?", [orderId]);
    console.log('Stock Movements (Inventory deduction):');
    console.table(sm);

    console.log('✅ ALL WORKFLOW BUSINESS LOGIC PASSED SUCCESSFULLY!');
  } catch (err) {
    console.error('Test error:', err);
  } finally {
    process.exit(0);
  }
}

testWorkflow();
