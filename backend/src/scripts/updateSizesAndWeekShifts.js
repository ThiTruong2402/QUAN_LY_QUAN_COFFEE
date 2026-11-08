const db = require('../config/db');

async function run() {
  console.log('--- 1. UPDATING 3 SIZES (S, M, L) WITH 4K DIFFERENCE FOR ALL 30 PRODUCTS ---');
  
  const [products] = await db.query('SELECT id, code, name FROM products WHERE is_active = 1');
  
  for (const p of products) {
    // Find current default price or any size price
    const [sizes] = await db.query('SELECT * FROM product_sizes WHERE product_id = ? ORDER BY is_default DESC, id ASC', [p.id]);
    let baseMPrice = 29000;
    if (sizes.length > 0) {
      const defaultSize = sizes.find(s => s.name === 'M') || sizes.find(s => s.is_default) || sizes[0];
      baseMPrice = Number(defaultSize.price);
    }

    const priceS = Math.max(10000, baseMPrice - 4000);
    const priceM = baseMPrice;
    const priceL = baseMPrice + 4000;

    // Upsert Size S
    const [exS] = await db.query('SELECT id FROM product_sizes WHERE product_id = ? AND name = "S"', [p.id]);
    let sId;
    if (exS.length) {
      sId = exS[0].id;
      await db.query('UPDATE product_sizes SET price = ?, is_default = 0 WHERE id = ?', [priceS, sId]);
    } else {
      const [ins] = await db.query('INSERT INTO product_sizes (product_id, name, price, is_default) VALUES (?, "S", ?, 0)', [p.id, priceS]);
      sId = ins.insertId;
    }

    // Upsert Size M (default)
    const [exM] = await db.query('SELECT id FROM product_sizes WHERE product_id = ? AND name = "M"', [p.id]);
    let mId;
    if (exM.length) {
      mId = exM[0].id;
      await db.query('UPDATE product_sizes SET price = ?, is_default = 1 WHERE id = ?', [priceM, mId]);
    } else {
      const [ins] = await db.query('INSERT INTO product_sizes (product_id, name, price, is_default) VALUES (?, "M", ?, 1)', [p.id, priceM]);
      mId = ins.insertId;
    }

    // Upsert Size L
    const [exL] = await db.query('SELECT id FROM product_sizes WHERE product_id = ? AND name = "L"', [p.id]);
    let lId;
    if (exL.length) {
      lId = exL[0].id;
      await db.query('UPDATE product_sizes SET price = ?, is_default = 0 WHERE id = ?', [priceL, lId]);
    } else {
      const [ins] = await db.query('INSERT INTO product_sizes (product_id, name, price, is_default) VALUES (?, "L", ?, 0)', [p.id, priceL]);
      lId = ins.insertId;
    }

    // Ensure recipes exist for S, M, L
    const [mRecipes] = await db.query('SELECT ingredient_id, quantity FROM recipes WHERE product_size_id = ?', [mId]);
    if (mRecipes.length > 0) {
      for (const rec of mRecipes) {
        const qtyM = Number(rec.quantity);
        const qtyS = (qtyM * 0.8).toFixed(3);
        const qtyL = (qtyM * 1.25).toFixed(3);

        await db.query(
          'INSERT INTO recipes (product_size_id, ingredient_id, quantity) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE quantity = VALUES(quantity)',
          [sId, rec.ingredient_id, qtyS]
        );
        await db.query(
          'INSERT INTO recipes (product_size_id, ingredient_id, quantity) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE quantity = VALUES(quantity)',
          [lId, rec.ingredient_id, qtyL]
        );
      }
    }
  }

  console.log(`✅ All ${products.length} products now have 3 sizes (S, M, L) with exactly 4k difference.`);

  console.log('--- 2. SEEDING WEEKLY TIMETABLE FOR ALL STAFF (7 DAYS: MON TO SUN) ---');
  
  // Get all active users
  const [users] = await db.query('SELECT id, code, full_name, role_id FROM users WHERE is_active = 1');
  const userMap = {};
  for (const u of users) {
    if (u.code) userMap[u.code] = u;
  }

  // Calculate dates for current week (Monday to Sunday)
  const today = new Date();
  const dayOfWeek = today.getDay(); // 0 is Sunday, 1 is Monday...
  const distanceToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  const monday = new Date(today);
  monday.setDate(today.getDate() + distanceToMonday);

  const weekDates = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    weekDates.push(d.toISOString().slice(0, 10));
  }
  console.log('Current week dates (Mon-Sun):', weekDates);

  // Define weekly schedule template
  // NV001: Admin (All week HC)
  // NV002: Cashier Mai (Ca Sáng: Mon, Tue, Wed, Fri, Sat, Sun)
  // NV003: Cashier Hà (Ca Tối: Mon, Tue, Thu, Fri, Sat, Sun)
  // NV004: Barista Tuấn (Ca Sáng: Mon, Tue, Wed, Thu, Sat, Sun)
  // NV005: Barista Linh (Ca Tối: Mon, Wed, Thu, Fri, Sat, Sun)
  // NV006: Waiter Nam (Ca Sáng: Mon, Tue, Wed, Thu, Fri, Sat)
  // NV007: Waiter An (Ca Tối: Tue, Wed, Thu, Fri, Sat, Sun)
  // NV008: Warehouse Hoàng (Ca HC: Mon to Fri, Sat morning)
  // NV009: Tech Đức (Ca HC: Mon to Sat)

  const staffWeekRules = [
    { code: 'NV001', type: 'Ca Hành Chính (08:00 - 17:00)', days: [0, 1, 2, 3, 4, 5], note: 'Điều hành tổng thể & kiểm soát doanh thu' },
    { code: 'NV002', type: 'Ca Sáng (06:30 - 14:30)', days: [0, 1, 2, 4, 5, 6], note: 'Thu ngân quầy POS ca sáng' },
    { code: 'NV003', type: 'Ca Chiều / Tối (14:30 - 22:30)', days: [0, 1, 3, 4, 5, 6], note: 'Thu ngân quầy POS ca tối & chốt két' },
    { code: 'NV004', type: 'Ca Sáng (06:30 - 14:30)', days: [0, 1, 2, 3, 5, 6], note: 'Trưởng quầy Barista pha chế' },
    { code: 'NV005', type: 'Ca Chiều / Tối (14:30 - 22:30)', days: [0, 2, 3, 4, 5, 6], note: 'Pha chế trà, sinh tố, đá xay' },
    { code: 'NV006', type: 'Ca Sáng (06:30 - 14:30)', days: [0, 1, 2, 3, 4, 5], note: 'Phục vụ bàn ca sáng' },
    { code: 'NV007', type: 'Ca Chiều / Tối (14:30 - 22:30)', days: [1, 2, 3, 4, 5, 6], note: 'Phục vụ bàn ca tối' },
    { code: 'NV008', type: 'Ca Hành Chính (08:00 - 17:00)', days: [0, 1, 2, 3, 4, 5], note: 'Quản lý kho & kiểm kê tồn vật tư' },
    { code: 'NV009', type: 'Ca Hành Chính (08:30 - 17:30)', days: [0, 1, 2, 3, 4, 5], note: 'Bảo trì máy móc & thiết bị POS' },
  ];

  let shiftSeq = 100;
  for (let dayIndex = 0; dayIndex < 7; dayIndex++) {
    const shiftDate = weekDates[dayIndex];
    for (const rule of staffWeekRules) {
      if (rule.days.includes(dayIndex)) {
        const u = userMap[rule.code];
        if (u) {
          shiftSeq++;
          const shiftCode = `CA${shiftDate.replace(/-/g, '').slice(4)}-${String(shiftSeq).slice(-3)}`;
          
          const [ex] = await db.query(
            'SELECT id FROM work_shifts WHERE user_id = ? AND shift_date = ?',
            [u.id, shiftDate]
          );
          if (ex.length) {
            await db.query(
              'UPDATE work_shifts SET shift_code = ?, shift_type = ?, note = ?, status = "Đang làm việc" WHERE id = ?',
              [shiftCode, rule.type, rule.note, ex[0].id]
            );
          } else {
            await db.query(
              `INSERT INTO work_shifts (shift_code, user_id, shift_type, shift_date, status, note)
               VALUES (?, ?, ?, ?, 'Đang làm việc', ?)`,
              [shiftCode, u.id, rule.type, shiftDate, rule.note]
            );
          }
        }
      }
    }
  }

  const [totalShifts] = await db.query('SELECT COUNT(*) as cnt FROM work_shifts');
  console.log(`✅ Weekly timetable successfully populated! Total shifts in DB: ${totalShifts[0].cnt}`);
  console.log('--- COMPLETED ---');
  process.exit(0);
}

run().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
