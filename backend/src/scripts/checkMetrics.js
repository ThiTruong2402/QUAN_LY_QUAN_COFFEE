require('dotenv').config();
const pool = require('../config/db');

async function check() {
  const [rows] = await pool.query(`
    SELECT 
      (SELECT COUNT(*) FROM products WHERE is_active = 1) AS products,
      (SELECT COUNT(*) FROM ingredients) AS ingredients,
      (SELECT COUNT(*) FROM ingredients WHERE current_stock <= min_stock) AS low_ingredients,
      (SELECT COUNT(*) FROM users WHERE is_active = 1) AS users,
      (SELECT COUNT(*) FROM orders WHERE status IN ('open', 'pending', 'preparing')) AS open_orders,
      (SELECT COUNT(*) FROM orders WHERE status = 'paid') AS paid_orders,
      (SELECT IFNULL(SUM(total), 0) FROM orders WHERE status = 'paid') AS total_revenue,
      (SELECT COUNT(*) FROM customers) AS customers
  `);
  console.log('REAL_DB_METRICS:', rows[0]);

  // Top 5 products by paid orders
  const [top] = await pool.query(`
    SELECT oi.product_name, SUM(oi.quantity) as qty, SUM(oi.line_total) as revenue
    FROM order_items oi
    JOIN orders o ON o.id = oi.order_id
    WHERE o.status = 'paid'
    GROUP BY oi.product_name
    ORDER BY qty DESC
    LIMIT 5
  `);
  console.log('REAL_TOP_PRODUCTS:', top);

  // Hourly distribution
  const [hourly] = await pool.query(`
    SELECT HOUR(closed_at) AS hour, COUNT(*) AS count, SUM(total) AS revenue
    FROM orders
    WHERE status = 'paid' AND closed_at IS NOT NULL
    GROUP BY HOUR(closed_at)
    ORDER BY hour
  `);
  console.log('REAL_HOURLY:', hourly);

  process.exit(0);
}

check().catch(e => { console.error(e); process.exit(1); });

