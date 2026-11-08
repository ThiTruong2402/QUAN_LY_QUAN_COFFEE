require('dotenv').config();
const pool = require('./db');

async function setup() {
  console.log('⏳ Creating work_shifts & recipes enhancements...');

  // 1. Create work_shifts table
  await pool.query(`
    CREATE TABLE IF NOT EXISTS work_shifts (
      id BIGINT AUTO_INCREMENT PRIMARY KEY,
      shift_code VARCHAR(30) NOT NULL,
      user_id BIGINT NOT NULL,
      shift_type VARCHAR(50) NOT NULL,
      shift_date DATE NOT NULL,
      status VARCHAR(30) NOT NULL DEFAULT 'Đã hoàn thành',
      note VARCHAR(255) NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id)
    )
  `);

  // 2. Users: update user code, birthday, gender, email
  const [uCols] = await pool.query("SHOW COLUMNS FROM users LIKE 'code'");
  if (uCols.length === 0) {
    await pool.query('ALTER TABLE users ADD COLUMN code VARCHAR(20) NULL AFTER id');
    await pool.query('ALTER TABLE users ADD COLUMN birthday DATE NULL AFTER full_name');
    await pool.query("ALTER TABLE users ADD COLUMN gender VARCHAR(10) DEFAULT 'Nam' AFTER birthday");
    await pool.query('ALTER TABLE users ADD COLUMN email VARCHAR(100) NULL AFTER phone');
  }

  const [allUsers] = await pool.query('SELECT id, username FROM users');
  let idx = 1;
  for (const u of allUsers) {
    const code = `NV00${idx}`;
    const email = `${u.username}@mycoffeehouse.vn`;
    const gender = idx % 2 === 0 ? 'Nữ' : 'Nam';
    const bday = `199${idx}-0${(idx % 9) + 1}-15`;
    await pool.query(
      'UPDATE users SET code = ?, birthday = ?, gender = ?, email = ? WHERE id = ?',
      [code, bday, gender, email, u.id]
    );
    idx++;
  }

  // 3. Seed work_shifts
  const [shifts] = await pool.query('SELECT COUNT(*) as cnt FROM work_shifts');
  if (shifts[0].cnt === 0 && allUsers.length > 0) {
    const u1 = allUsers[0].id;
    const u2 = allUsers[1]?.id || u1;
    const u3 = allUsers[2]?.id || u1;
    const u4 = allUsers[3]?.id || u1;

    const sampleShifts = [
      ['LT002', u2, 'Ca Chiều (14:00 - 22:00)', '2026-05-24', 'Đã hoàn thành'],
      ['LT002', u4, 'Ca Chiều (14:00 - 22:00)', '2026-05-24', 'Đã hoàn thành'],
      ['LT002', u3, 'Ca Chiều (14:00 - 22:00)', '2026-05-24', 'Đã hoàn thành'],
      ['LT001', u1, 'Ca Sáng (06:00 - 14:00)', '2026-05-24', 'Đã hoàn thành'],
      ['LT001', u2, 'Ca Sáng (06:00 - 14:00)', '2026-05-24', 'Đã hoàn thành'],
      ['LT001', u3, 'Ca Sáng (06:00 - 14:00)', '2026-05-24', 'Vắng có lý do'],
    ];
    for (const s of sampleShifts) {
      await pool.query(
        'INSERT INTO work_shifts (shift_code, user_id, shift_type, shift_date, status) VALUES (?, ?, ?, ?, ?)',
        s
      );
    }
    console.log('✅ Seeded work_shifts sample data');
  }

  // 4. Products: add code column and photos
  const [cols] = await pool.query("SHOW COLUMNS FROM products LIKE 'code'");
  if (cols.length === 0) {
    await pool.query('ALTER TABLE products ADD COLUMN code VARCHAR(20) NULL AFTER id');
  }

  const productsUpdate = [
    { id: 1, code: 'M001', img: 'https://images.unsplash.com/photo-1514432324607-a09d9b4aefdd?w=400&auto=format&fit=crop&q=80', desc: 'Hương vị độc bản, đánh thức mọi giác quan.' },
    { id: 2, code: 'M002', img: 'https://images.unsplash.com/photo-1517256064527-09c73fc73e38?w=400&auto=format&fit=crop&q=80', desc: 'Nguyên chất đậm đà, đánh thức ngày mới.' },
    { id: 3, code: 'M003', img: 'https://images.unsplash.com/photo-1572442388796-11668a67e53d?w=400&auto=format&fit=crop&q=80', desc: 'Cà phê đá xay lớp bọt kem béo mịn.' },
    { id: 4, code: 'M004', img: 'https://images.unsplash.com/photo-1534778101976-62847782c213?w=400&auto=format&fit=crop&q=80', desc: 'Latte sữa tươi thơm béo hài hòa.' },
    { id: 5, code: 'M005', img: 'https://images.unsplash.com/photo-1551024709-8f23befc6f87?w=400&auto=format&fit=crop&q=80', desc: 'Americano thanh đắng vị tự nhiên.' },
    { id: 6, code: 'M006', img: 'https://images.unsplash.com/photo-1556679343-c7306c1976bc?w=400&auto=format&fit=crop&q=80', desc: 'Trà đào cam sả thanh mát sảng khoái.' },
    { id: 7, code: 'M007', img: 'https://images.unsplash.com/photo-1536256263959-770b48d82b0a?w=400&auto=format&fit=crop&q=80', desc: 'Matcha Uji Nhật Bản béo thơm.' },
    { id: 8, code: 'M008', img: 'https://images.unsplash.com/photo-1558857563-b37cb337d1ec?w=400&auto=format&fit=crop&q=80', desc: 'Trà sữa trân châu Đài Loan đậm trà.' },
    { id: 9, code: 'M009', img: 'https://images.unsplash.com/photo-1623065422902-30a2d299bbe4?w=400&auto=format&fit=crop&q=80', desc: 'Sinh tố bơ sáp béo ngậy tự nhiên.' },
    { id: 10, code: 'M010', img: 'https://images.unsplash.com/photo-1553530666-ba11a7da3888?w=400&auto=format&fit=crop&q=80', desc: 'Sinh tố dâu tây Đà Lạt chua ngọt.' },
    { id: 11, code: 'M011', img: 'https://images.unsplash.com/photo-1555507036-ab1f4038808a?w=400&auto=format&fit=crop&q=80', desc: 'Bánh sừng bò bơ Pháp nướng giòn.' },
    { id: 12, code: 'M012', img: 'https://images.unsplash.com/photo-1509722747041-616f39b57569?w=400&auto=format&fit=crop&q=80', desc: 'Bánh mì pate kẹp thịt giòn rụm.' },
    { id: 13, code: 'M013', img: 'https://images.unsplash.com/photo-1513558161293-cdaf765ed2fd?w=400&auto=format&fit=crop&q=80', desc: 'Nước chanh tươi mát lạnh sảng khoái.' },
    { id: 14, code: 'M014', img: 'https://images.unsplash.com/photo-1536935338788-846bb9981813?w=400&auto=format&fit=crop&q=80', desc: 'Soda chanh dây hạt chia giải nhiệt.' },
  ];

  for (const p of productsUpdate) {
    await pool.query(
      'UPDATE products SET code = ?, image_url = ?, description = ? WHERE id = ?',
      [p.code, p.img, p.desc, p.id]
    );
  }

  // 5. Ingredients: code column and photos
  const [ingCols] = await pool.query("SHOW COLUMNS FROM ingredients LIKE 'code'");
  if (ingCols.length === 0) {
    await pool.query('ALTER TABLE ingredients ADD COLUMN code VARCHAR(20) NULL AFTER id');
    await pool.query('ALTER TABLE ingredients ADD COLUMN image_url VARCHAR(500) NULL AFTER unit');
  }

  const ingUpdates = [
    { id: 1, code: 'NL001', img: 'https://images.unsplash.com/photo-1559056199-641a0ac8b55e?w=200&auto=format&fit=crop&q=80' },
    { id: 2, code: 'NL002', img: 'https://images.unsplash.com/photo-1514432324607-a09d9b4aefdd?w=200&auto=format&fit=crop&q=80' },
    { id: 3, code: 'NL003', img: 'https://images.unsplash.com/photo-1550583724-b2692b85b150?w=200&auto=format&fit=crop&q=80' },
    { id: 4, code: 'NL004', img: 'https://images.unsplash.com/photo-1563636619-e9143da7973b?w=200&auto=format&fit=crop&q=80' },
    { id: 5, code: 'NL005', img: 'https://images.unsplash.com/photo-1587735243615-c03f25aaff15?w=200&auto=format&fit=crop&q=80' },
    { id: 6, code: 'NL006', img: 'https://images.unsplash.com/photo-1576092768241-dec231879fc3?w=200&auto=format&fit=crop&q=80' },
    { id: 7, code: 'NL007', img: 'https://images.unsplash.com/photo-1536256263959-770b48d82b0a?w=200&auto=format&fit=crop&q=80' },
    { id: 8, code: 'NL008', img: 'https://images.unsplash.com/photo-1556679343-c7306c1976bc?w=200&auto=format&fit=crop&q=80' },
    { id: 9, code: 'NL009', img: 'https://images.unsplash.com/photo-1558857563-b37cb337d1ec?w=200&auto=format&fit=crop&q=80' },
    { id: 10, code: 'NL010', img: 'https://images.unsplash.com/photo-1542990253-0d0f5be5f0ed?w=200&auto=format&fit=crop&q=80' },
  ];
  for (const i of ingUpdates) {
    await pool.query('UPDATE ingredients SET code = ?, image_url = ? WHERE id = ?', [i.code, i.img, i.id]);
  }

  // 6. Seed recipes
  const [rcp] = await pool.query('SELECT COUNT(*) as cnt FROM recipes');
  if (rcp[0].cnt === 0) {
    const sampleRecipes = [
      [1, 1, 0.02],
      [4, 1, 0.02],
      [4, 3, 0.03],
      [7, 1, 0.025],
      [7, 4, 0.15],
      [14, 6, 0.015],
      [14, 8, 0.05],
      [16, 7, 0.01],
      [16, 4, 0.18],
      [18, 6, 0.02],
      [18, 9, 0.05],
    ];
    for (const r of sampleRecipes) {
      await pool.query(
        'INSERT IGNORE INTO recipes (product_size_id, ingredient_id, quantity) VALUES (?, ?, ?)',
        r
      );
    }
    console.log('✅ Seeded recipes sample data');
  }

  console.log('🎉 Setup mockup database completed!');
  process.exit(0);
}

setup().catch(err => {
  console.error(err);
  process.exit(1);
});
