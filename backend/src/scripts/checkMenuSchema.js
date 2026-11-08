const db = require('../config/db');

(async () => {
  const [sizes] = await db.query(
    `SELECT ps.*, p.name as p_name 
     FROM product_sizes ps 
     JOIN products p ON p.id = ps.product_id 
     WHERE p.category_id = 4`
  );
  console.log('CAT 4 PRODUCT SIZES:');
  console.table(sizes);
  process.exit(0);
})();
