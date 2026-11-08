require('dotenv').config();
const mysql = require('mysql2/promise');
const fs = require('fs');
const path = require('path');

async function initDb() {
  console.log('⏳ Connecting to MySQL...');
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '3306'),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD,
    multipleStatements: true,
  });

  console.log('✅ Connected to MySQL');

  const schemaPath = path.join(__dirname, 'schema.sql');
  const sql = fs.readFileSync(schemaPath, 'utf8');

  console.log('⏳ Running schema.sql...');
  await connection.query(sql);
  console.log('🎉 Database and tables initialized with sample data successfully!');

  await connection.end();
}

initDb().catch((err) => {
  console.error('❌ Failed to initialize database:', err);
  process.exit(1);
});
