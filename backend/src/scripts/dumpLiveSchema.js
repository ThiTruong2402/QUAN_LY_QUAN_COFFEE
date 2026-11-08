const db = require('../config/db');

async function dump() {
  const [tables] = await db.query('SHOW TABLES');
  const tableKey = Object.keys(tables[0])[0];
  console.log(`Found ${tables.length} tables in live database:`);
  for (const t of tables) {
    const tableName = t[tableKey];
    const [create] = await db.query(`SHOW CREATE TABLE \`${tableName}\``);
    console.log(`\n-- ================= TABLE: ${tableName} =================`);
    console.log(create[0]['Create Table'] + ';');
  }
  process.exit(0);
}

dump().catch(err => {
  console.error(err);
  process.exit(1);
});

