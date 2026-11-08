const pool = require('../config/db');

async function cleanup() {
  try {
    await pool.query("DELETE FROM recipes WHERE product_size_id IN (SELECT id FROM product_sizes WHERE product_id IN (SELECT id FROM products WHERE code LIKE 'TEST_CF_%'))");
    await pool.query("DELETE FROM product_sizes WHERE product_id IN (SELECT id FROM products WHERE code LIKE 'TEST_CF_%')");
    await pool.query("DELETE FROM products WHERE code LIKE 'TEST_CF_%'");
    await pool.query("DELETE FROM categories WHERE name = 'Đồ Uống Test Kịch Bản'");
    await pool.query("DELETE FROM ingredients WHERE code LIKE 'ING_%'");
    console.log('✅ Cleaned up any leftover test data');
  } catch (err) {
    console.error('Error during cleanup:', err);
  } finally {
    await pool.end();
  }
}

cleanup();
