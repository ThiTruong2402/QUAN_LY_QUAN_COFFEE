const db = require('../config/db');

(async () => {
  const [[minMax]] = await db.query(
    "SELECT MIN(closed_at) as min_date, MAX(closed_at) as max_date, COUNT(*) as cnt FROM orders WHERE status='paid'"
  );
  console.log('MIN MAX DATES:', minMax);

  const [topProducts] = await db.query(
    `SELECT oi.product_name, SUM(oi.quantity) AS qty, SUM(oi.line_total) AS revenue
     FROM order_items oi
     JOIN orders o ON o.id=oi.order_id
     WHERE o.status='paid' AND oi.status != 'cancelled'
     GROUP BY oi.product_name ORDER BY qty DESC LIMIT 5`
  );
  console.log('TOP 5 PRODUCTS ALL-TIME:', topProducts);

  process.exit(0);
})();
