const pool = require('../config/db');

async function migrate() {
  console.log('--- UPDATING ORDERS WORKFLOW CONSTRAINTS & COLUMNS ---');
  try {
    // 1. Drop existing check constraint on orders.status
    try {
      await pool.query('ALTER TABLE orders DROP CHECK orders_chk_2');
      console.log('Dropped old orders_chk_2 constraint.');
    } catch (e) {
      console.log('Old constraint might not exist or already dropped:', e.message);
    }

    // 2. Add updated check constraint with all workflow steps:
    // 'pending' (Đang chờ làm)
    // 'preparing' (Đang pha chế)
    // 'done' (Đã pha xong / Sẵn sàng)
    // 'served' (Đã giao món)
    // 'paid' (Đã thanh toán / Hoàn thành)
    // 'cancelled' (Đã hủy)
    // 'open' (Đang mở)
    await pool.query(
      `ALTER TABLE orders ADD CONSTRAINT orders_chk_2 
       CHECK (status IN ('open', 'pending', 'preparing', 'done', 'served', 'paid', 'cancelled', 'merged'))`
    );
    console.log('Added new orders_chk_2 with full workflow statuses.');

    // 3. Ensure order_items status check constraint also includes all states
    try {
      await pool.query('ALTER TABLE order_items DROP CHECK order_items_chk_2');
    } catch (e) {}
    await pool.query(
      `ALTER TABLE order_items ADD CONSTRAINT order_items_chk_2 
       CHECK (status IN ('unsent', 'pending', 'preparing', 'done', 'served', 'cancelled'))`
    );
    console.log('Ensured order_items_chk_2 includes all states.');

    console.log('--- MIGRATION COMPLETED SUCCESSFULLY ---');
  } catch (err) {
    console.error('Migration error:', err);
  } finally {
    process.exit(0);
  }
}

migrate();
