require('dotenv').config();
const bcrypt = require('bcryptjs');
const pool = require('./db');

async function seedUsers() {
  const hash = await bcrypt.hash('123456', 10);

  const users = [
    { username: 'admin', full_name: 'Quản Lý Quán', role_id: 1, phone: '0901234567' },
    { username: 'cashier', full_name: 'Thu Ngân Hà', role_id: 2, phone: '0901234568' },
    { username: 'waiter', full_name: 'Phục Vụ Nam', role_id: 3, phone: '0901234569' },
    { username: 'barista', full_name: 'Pha Chế Tuấn', role_id: 4, phone: '0901234570' },
  ];

  for (const u of users) {
    await pool.query(
      `INSERT INTO users (username, password_hash, full_name, phone, role_id, is_active)
       VALUES (?, ?, ?, ?, ?, 1)
       ON DUPLICATE KEY UPDATE password_hash = VALUES(password_hash), full_name = VALUES(full_name), role_id = VALUES(role_id)`,
      [u.username, hash, u.full_name, u.phone, u.role_id]
    );
  }

  console.log('✅ Seeded users with default password: 123456');
  process.exit(0);
}

seedUsers().catch(err => {
  console.error(err);
  process.exit(1);
});
