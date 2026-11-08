const db = require('../config/db');

(async () => {
  const [prods] = await db.query(
    `SELECT p.id, p.code, p.name, c.name as category_name, p.image_url 
     FROM products p 
     JOIN categories c ON c.id = p.category_id 
     WHERE p.is_active = 1
     ORDER BY c.sort_order, p.code`
  );
  console.log(`Found ${prods.length} active products:`);
  for (const p of prods) {
    console.log(`[${p.code}] ${p.name} | ${p.category_name} -> ${p.image_url}`);
  }
  process.exit(0);
})();


