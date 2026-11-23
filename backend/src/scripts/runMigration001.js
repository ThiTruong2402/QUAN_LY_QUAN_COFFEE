const pool = require('../config/db');

async function runMigration() {
  const conn = await pool.getConnection();
  try {
    console.log('🚀 Running complete migration 001_security_and_constraints...');

    // 1. Delete duplicate recipes
    console.log('1. Cleaning duplicate recipes...');
    const [delRes] = await conn.query(`
      DELETE r1 FROM recipes r1
      INNER JOIN recipes r2 ON r1.product_size_id = r2.product_size_id 
        AND r1.ingredient_id = r2.ingredient_id 
        AND r1.id > r2.id
    `);
    console.log(`- Deleted duplicate recipes rows: ${delRes.affectedRows}`);

    // Check unique key on recipes
    const [indexes] = await conn.query(`
      SHOW INDEX FROM recipes WHERE Key_name = 'uq_recipe_size_ingredient'
    `);
    if (indexes.length === 0) {
      console.log('- Adding UNIQUE KEY uq_recipe_size_ingredient...');
      await conn.query(`ALTER TABLE recipes ADD UNIQUE KEY uq_recipe_size_ingredient (product_size_id, ingredient_id)`);
      console.log('✅ Created UNIQUE KEY uq_recipe_size_ingredient');
    } else {
      console.log('ℹ️ UNIQUE KEY uq_recipe_size_ingredient already exists');
    }

    // 2. Orders and Order Items check constraints
    console.log('2. Updating constraints on orders & order_items...');
    try {
      await conn.query(`ALTER TABLE orders DROP CONSTRAINT orders_chk_2`);
    } catch (e) {
      console.log('ℹ️ orders_chk_2 drop:', e.message);
    }
    try {
      await conn.query(`
        ALTER TABLE orders ADD CONSTRAINT orders_chk_2 
        CHECK (status IN ('open', 'awaiting_payment', 'pending', 'scheduled', 'preparing', 'done', 'served', 'paid', 'cancelled', 'merged'))
      `);
      console.log('✅ Added constraint orders_chk_2');
    } catch (e) {
      console.log('ℹ️ orders_chk_2 add:', e.message);
    }

    try {
      await conn.query(`ALTER TABLE order_items DROP CONSTRAINT order_items_chk_2`);
    } catch (e) {
      console.log('ℹ️ order_items_chk_2 drop:', e.message);
    }
    try {
      await conn.query(`
        ALTER TABLE order_items ADD CONSTRAINT order_items_chk_2 
        CHECK (status IN ('unsent', 'pending', 'scheduled', 'preparing', 'ready', 'done', 'served', 'cancelled'))
      `);
      console.log('✅ Added constraint order_items_chk_2');
    } catch (e) {
      console.log('ℹ️ order_items_chk_2 add:', e.message);
    }

    // 3. Delete redundant size 'Phần' on ID 11 & 12
    console.log('3. Checking redundant size "Phần" on ID 24, 25...');
    const [recipes] = await conn.query('SELECT * FROM recipes WHERE product_size_id IN (24, 25)');
    if (recipes.length > 0) {
      console.log(`- Deleting ${recipes.length} recipes referencing product_size_id IN (24, 25)...`);
      await conn.query('DELETE FROM recipes WHERE product_size_id IN (24, 25)');
    }
    const [delSizes] = await conn.query("DELETE FROM product_sizes WHERE id IN (24, 25) AND name = 'Phần'");
    console.log(`- Deleted redundant product_sizes: ${delSizes.affectedRows}`);

    console.log('🎉 Migration 001 completed successfully!');
  } catch (err) {
    console.error('❌ Migration failed:', err);
  } finally {
    conn.release();
    process.exit(0);
  }
}

runMigration();
