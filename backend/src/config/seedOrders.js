require('dotenv').config();
const pool = require('./db');

async function seedOrders() {
  const [cnt] = await pool.query('SELECT COUNT(*) as count FROM orders');
  if (cnt[0].count === 0) {
    const ordersData = [
      { code: 'HD24072026001', cust_id: 1, total: 85000, status: 'paid', method: 'cash', date: '2026-07-24 08:30:00' },
      { code: 'HD22062026002', cust_id: 2, total: 80000, status: 'paid', method: 'cash', date: '2026-06-22 09:15:00' },
      { code: 'HD21062026003', cust_id: 3, total: 170000, status: 'paid', method: 'cash', date: '2026-06-21 14:20:00' },
      { code: 'HD21062026004', cust_id: 1, total: 190000, status: 'paid', method: 'card', date: '2026-06-21 16:45:00' },
      { code: 'HD15062026007', cust_id: 2, total: 115000, status: 'cancelled', method: 'card', date: '2026-06-15 11:10:00' },
      { code: 'HD12062026006', cust_id: 4, total: 85000, status: 'open', method: 'bank_transfer', date: '2026-06-12 18:00:00' },
    ];

    for (const o of ordersData) {
      const [res] = await pool.query(
        `INSERT INTO orders (code, order_type, customer_id, status, subtotal, total, created_by, opened_at, closed_at)
         VALUES (?, 'dine_in', ?, ?, ?, ?, 1, ?, ?)`,
        [o.code, o.cust_id, o.status, o.total, o.total, o.date, o.status === 'paid' ? o.date : null]
      );
      const orderId = res.insertId;

      await pool.query(
        `INSERT INTO invoices (invoice_no, order_id, subtotal, total)
         VALUES (?, ?, ?, ?)`,
        [o.code, orderId, o.total, o.total]
      );

      await pool.query(
        `INSERT INTO payments (order_id, method, amount, created_by)
         VALUES (?, ?, ?, 1)`,
        [orderId, o.method, o.total]
      );
    }
    console.log('✅ Seeded 6 realistic orders matching image11.png!');
  }
  process.exit(0);
}

seedOrders().catch(err => {
  console.error(err);
  process.exit(1);
});
