const pool = require('../config/db');

(async () => {
  try {
    const [rows] = await pool.query(`
      SELECT ps.id, ps.product_id, p.code, p.name as product_name, ps.name as size_name, ps.price
      FROM product_sizes ps
      JOIN products p ON p.id = ps.product_id
      WHERE p.category_id = 9
      ORDER BY p.id, ps.id
    `);
    console.table(rows);
    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
})();

