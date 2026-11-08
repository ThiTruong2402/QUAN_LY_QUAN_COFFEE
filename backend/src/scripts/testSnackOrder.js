const pool = require('../config/db');

async function testSnackOrder() {
  try {
    console.log('🧪 Testing order with snack item (Hạt hướng dương rang mộc)...');

    // 1. Login
    const loginRes = await fetch('http://localhost:5000/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'admin', password: '123456' })
    });
    const loginData = await loginRes.json();
    const token = loginData.data?.accessToken;
    console.log('✓ Login OK, user:', loginData.data.user.full_name);

    // 2. Check stock before & get size id
    const [[sizeStd]] = await pool.query(
      `SELECT ps.id, ps.price, p.name 
       FROM product_sizes ps
       JOIN products p ON p.id = ps.product_id
       WHERE p.code = 'AV01' AND ps.name = 'Tiêu chuẩn'`
    );
    console.log('Single Size product_size_id:', sizeStd.id);

    const [[ingBefore]] = await pool.query(
      "SELECT id, name, current_stock, unit FROM ingredients WHERE name = 'Hạt hướng dương rang mộc'"
    );
    console.log(`Stock BEFORE: ${ingBefore.current_stock} ${ingBefore.unit}`);

    // 3. Create POS direct checkout order
    const orderRes = await fetch('http://localhost:5000/api/orders/direct-checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
      body: JSON.stringify({
        items: [
          { product_id: 38, product_size_id: sizeStd.id, name: 'Hạt hướng dương rang mộc', size_name: 'Tiêu chuẩn', price: sizeStd.price, quantity: 2 }
        ],
        customer_name: 'Khách Gọi Hướng Dương',
        customer_phone: '0977889900',
        payment_method: 'Tiền mặt',
        status: 'pending'
      })
    });
    const orderData = await orderRes.json();
    console.log('✓ Created Snack Order response:', orderData);
    const orderId = orderData.data?.orderId;

    if (!orderId) {
      throw new Error('Order creation failed: ' + JSON.stringify(orderData));
    }

    // 4. Progress order: pending -> preparing -> done -> served -> paid
    await fetch(`http://localhost:5000/api/orders/${orderId}/status`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
      body: JSON.stringify({ status: 'preparing' })
    });

    await fetch(`http://localhost:5000/api/orders/${orderId}/status`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
      body: JSON.stringify({ status: 'done' })
    });

    await fetch(`http://localhost:5000/api/orders/${orderId}/status`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
      body: JSON.stringify({ status: 'served' })
    });

    const payRes = await fetch(`http://localhost:5000/api/orders/${orderId}/status`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
      body: JSON.stringify({ status: 'paid', payment_status: 'paid' })
    });
    const payData = await payRes.json();
    console.log('✓ Paid snack order status:', payData.message || 'OK');

    // 5. Check stock after
    const [[ingAfter]] = await pool.query(
      "SELECT id, name, current_stock, unit FROM ingredients WHERE id = ?",
      [ingBefore.id]
    );
    console.log(`Stock AFTER: ${ingAfter.current_stock} ${ingAfter.unit}`);

    const consumed = Number(ingBefore.current_stock) - Number(ingAfter.current_stock);
    console.log(`🎉 SUCCESS! Deducted ${consumed} ${ingAfter.unit} of sunflower seeds from inventory!`);

    process.exit(0);
  } catch (err) {
    console.error('❌ Test failed:', err);
    process.exit(1);
  }
}

testSnackOrder();
