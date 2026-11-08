const pool = require('../config/db');

(async () => {
  try {
    const [recipes] = await pool.query(`
      SELECT r.id, r.product_size_id, ps.name as size_name, p.name as prod_name
      FROM recipes r
      JOIN product_sizes ps ON ps.id = r.product_size_id
      JOIN products p ON p.id = ps.product_id
      WHERE p.category_id = 9
    `);
    console.log('Recipes referencing snack sizes:', recipes);

    const [orderItems] = await pool.query(`
      SELECT oi.id, oi.order_id, oi.product_id, oi.product_size_id, oi.size_name
      FROM order_items oi
      JOIN products p ON p.id = oi.product_id
      WHERE p.category_id = 9
    `);
    console.log('Order items referencing snack sizes:', orderItems);

    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
})();
