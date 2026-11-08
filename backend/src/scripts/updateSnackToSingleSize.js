const pool = require('../config/db');

async function updateSnackToSingleSize() {
  console.log('🔄 Updating snack products to have ONLY 1 size (Tiêu chuẩn)...');

  try {
    // 1. Get all snack products
    const [snackProducts] = await pool.query(`
      SELECT p.id, p.name, p.code
      FROM products p
      WHERE p.category_id = 9
    `);

    for (const prod of snackProducts) {
      // Get all sizes for this product
      const [sizes] = await pool.query(
        'SELECT id, name, price FROM product_sizes WHERE product_id = ? ORDER BY id',
        [prod.id]
      );

      const sizeM = sizes.find(s => s.name === 'M') || sizes[0];
      const otherSizes = sizes.filter(s => s.id !== sizeM.id);
      const otherIds = otherSizes.map(s => s.id);

      console.log(`Product "${prod.name}" (id ${prod.id}): keeping size id ${sizeM.id} (Price: ${sizeM.price}), removing other sizes:`, otherIds);

      // Point any order_items pointing to other sizes to sizeM
      if (otherIds.length > 0) {
        await pool.query(
          `UPDATE order_items SET product_size_id = ?, size_name = 'Tiêu chuẩn' WHERE product_size_id IN (${otherIds.join(',')})`,
          [sizeM.id]
        );

        // Delete recipes for other sizes
        await pool.query(
          `DELETE FROM recipes WHERE product_size_id IN (${otherIds.join(',')})`
        );

        // Delete other sizes
        await pool.query(
          `DELETE FROM product_sizes WHERE id IN (${otherIds.join(',')})`
        );
      }

      // Rename sizeM to 'Tiêu chuẩn' and recipe unit/quantity
      await pool.query(
        "UPDATE product_sizes SET name = 'Tiêu chuẩn' WHERE id = ?",
        [sizeM.id]
      );

      // Ensure recipe for sizeM has quantity = 1.000
      await pool.query(
        "UPDATE recipes SET quantity = 1.000 WHERE product_size_id = ?",
        [sizeM.id]
      );
    }

    console.log('✅ Finished! All snacks now have exactly 1 size ("Tiêu chuẩn").');

    // Verify
    const [result] = await pool.query(`
      SELECT p.id, p.code, p.name, ps.id as size_id, ps.name as size_name, ps.price
      FROM products p
      JOIN product_sizes ps ON ps.product_id = p.id
      WHERE p.category_id = 9
    `);
    console.table(result);

    process.exit(0);
  } catch (err) {
    console.error('❌ Failed to update snack sizes:', err);
    process.exit(1);
  }
}

updateSnackToSingleSize();

