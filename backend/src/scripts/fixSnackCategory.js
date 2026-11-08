const db = require('../config/db');

(async () => {
  try {
    // 1. Check if category "Đồ ăn vặt & Hạt" exists exactly
    const [existing] = await db.query(
      "SELECT id FROM categories WHERE BINARY name = 'Đồ ăn vặt & Hạt'"
    );

    let catId;
    if (existing.length > 0) {
      catId = existing[0].id;
    } else {
      const [ins] = await db.query(
        `INSERT INTO categories (name, description, sort_order, is_active)
         VALUES ('Đồ ăn vặt & Hạt', 'Hạt hướng dương, hạt bí, khô gà, khô bò ăn vặt giòn ngon', 6, 1)`
      );
      catId = ins.insertId;
      console.log(`Created dedicated category 'Đồ ăn vặt & Hạt' id: ${catId}`);
    }

    // 2. Update all snack products (code starts with 'AV')
    const [updateResult] = await db.query(
      "UPDATE products SET category_id = ? WHERE code LIKE 'AV%'",
      [catId]
    );
    console.log(`Updated ${updateResult.affectedRows} snack products to category id ${catId}`);

    // 3. Print categories and products
    const [cats] = await db.query('SELECT * FROM categories ORDER BY sort_order');
    console.log('--- ALL CATEGORIES ---');
    console.table(cats);

    const [snackProds] = await db.query(
      `SELECT p.id, p.code, p.name, c.name as category_name, p.is_available 
       FROM products p 
       JOIN categories c ON c.id = p.category_id 
       WHERE c.id = ?`,
      [catId]
    );
    console.log('--- SNACK PRODUCTS IN CATEGORY ---');
    console.table(snackProds);

    process.exit(0);
  } catch (err) {
    console.error('Error:', err);
    process.exit(1);
  }
})();

