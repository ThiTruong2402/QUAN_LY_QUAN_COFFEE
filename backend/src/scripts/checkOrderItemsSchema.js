const db = require('../config/db');

async function test() {
  try {
    const [rows] = await db.query('SHOW CREATE TABLE order_items');
    console.log(rows[0]['Create Table']);

    process.exit(0);
  } catch (err) {
    console.error('ERROR:', err);
    process.exit(1);
  }
}

test();

