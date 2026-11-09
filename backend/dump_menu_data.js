require('dotenv').config();
const mysql = require('mysql2/promise');
const fs = require('fs');

async function dump() {
  const localDb = await mysql.createConnection({
    host: 'localhost',
    port: 3306,
    user: 'root',
    password: process.env.DB_PASSWORD || 'Truong2005@',
    database: 'my_coffee_house',
    charset: 'utf8mb4'
  });

  let sql = `-- ================================================================
-- NẠP DỮ LIỆU ĐẦY ĐỦ CHO MY COFFEE HOUSE (TIDB CLOUD & PRODUCTION)
-- Đầy đủ 57 món, 6 danh mục, 145 kích cỡ, công thức, mã khuyến mãi & bàn
-- ================================================================

USE my_coffee_house;
SET FOREIGN_KEY_CHECKS = 0;

-- 1. Bổ sung các cột mở rộng nếu bảng chưa có (Tương thích 100% TiDB & MySQL)
ALTER TABLE products ADD COLUMN IF NOT EXISTS is_available TINYINT(1) DEFAULT 1;
ALTER TABLE products ADD COLUMN IF NOT EXISTS updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP;
ALTER TABLE ingredients ADD COLUMN IF NOT EXISTS image_url VARCHAR(255) DEFAULT NULL;
ALTER TABLE \`tables\` ADD COLUMN IF NOT EXISTS reservation_name VARCHAR(100) DEFAULT NULL;
ALTER TABLE \`tables\` ADD COLUMN IF NOT EXISTS reservation_phone VARCHAR(20) DEFAULT NULL;
ALTER TABLE \`tables\` ADD COLUMN IF NOT EXISTS reservation_time VARCHAR(20) DEFAULT NULL;
ALTER TABLE \`tables\` ADD COLUMN IF NOT EXISTS reservation_note VARCHAR(255) DEFAULT NULL;
ALTER TABLE \`tables\` ADD COLUMN IF NOT EXISTS customer_count INT DEFAULT 0;

`;

  const tables = ['categories', 'products', 'product_sizes', 'toppings', 'ingredients', 'recipes', 'promotions', 'areas', 'tables'];

  for (const t of tables) {
    const [rows] = await localDb.query(`SELECT * FROM \`${t}\``);
    console.log(`Table ${t}: ${rows.length} rows`);
    if (rows.length === 0) continue;

    sql += `-- ----------------------------------------------------------------\n-- BẢNG: ${t} (${rows.length} dòng)\n-- ----------------------------------------------------------------\n`;

    const cols = Object.keys(rows[0]).map(c => `\`${c}\``).join(', ');
    const valuesList = rows.map(r => {
      const vals = Object.values(r).map(v => {
        if (v === null) return 'NULL';
        if (typeof v === 'number' || typeof v === 'boolean') return v;
        if (v instanceof Date) return `'${v.toISOString().slice(0, 19).replace('T', ' ')}'`;
        if (typeof v === 'object') return `'${JSON.stringify(v).replace(/'/g, "''")}'`;
        return `'${String(v).replace(/'/g, "''").replace(/\\/g, '\\\\')}'`;
      });
      return `(${vals.join(', ')})`;
    });

    for (let i = 0; i < valuesList.length; i += 50) {
      const chunk = valuesList.slice(i, i + 50);
      sql += `INSERT INTO \`${t}\` (${cols}) VALUES\n  ${chunk.join(',\n  ')}\nON DUPLICATE KEY UPDATE id=id;\n\n`;
    }
  }

  sql += 'SET FOREIGN_KEY_CHECKS = 1;\n';
  fs.writeFileSync('import_full_menu.sql', sql, 'utf8');
  fs.writeFileSync('../import_full_menu.sql', sql, 'utf8');
  console.log('✅ Generated new import_full_menu.sql with ALTER TABLE migrations!');
  await localDb.end();
  process.exit(0);
}

dump().catch(err => {
  console.error('Dump error:', err);
  process.exit(1);
});

