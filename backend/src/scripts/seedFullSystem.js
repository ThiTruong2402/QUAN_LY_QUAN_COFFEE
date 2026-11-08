const db = require('../config/db');
const bcrypt = require('bcryptjs');

async function seed() {
  console.log('--- STARTING COMPREHENSIVE SEEDING FOR MY COFFEE HOUSE ---');

  // 1. Ensure Roles
  const roles = [
    { id: 1, name: 'admin', label: 'Quản lý / Chủ quán' },
    { id: 2, name: 'cashier', label: 'Thu ngân' },
    { id: 3, name: 'waiter', label: 'Phục vụ bàn' },
    { id: 4, name: 'barista', label: 'Pha chế' },
    { id: 5, name: 'warehouse', label: 'Thủ kho / Tiếp liệu' },
  ];
  for (const r of roles) {
    await db.query(
      'INSERT INTO roles (id, name, label) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE name=VALUES(name), label=VALUES(label)',
      [r.id, r.name, r.label]
    );
  }
  console.log('✅ Roles ensured.');

  // 2. Full Staff for all operational stages
  const defaultHash = await bcrypt.hash('123456', 10);
  const staffMembers = [
    { code: 'NV001', username: 'admin', full_name: 'Nguyễn Hoàng Long', role_id: 1, phone: '0901234561', email: 'long.nh@mycoffeehouse.vn', birthday: '1992-05-15', gender: 'Nam' },
    { code: 'NV002', username: 'cashier_mai', full_name: 'Trần Tuyết Mai', role_id: 2, phone: '0901234562', email: 'mai.tt@mycoffeehouse.vn', birthday: '1998-03-20', gender: 'Nữ' },
    { code: 'NV003', username: 'cashier', full_name: 'Lê Thu Hà', role_id: 2, phone: '0901234563', email: 'ha.lt@mycoffeehouse.vn', birthday: '1999-08-14', gender: 'Nữ' },
    { code: 'NV004', username: 'barista', full_name: 'Đặng Minh Tuấn', role_id: 4, phone: '0901234564', email: 'tuan.dm@mycoffeehouse.vn', birthday: '1996-11-02', gender: 'Nam' },
    { code: 'NV005', username: 'barista_linh', full_name: 'Vũ Khánh Linh', role_id: 4, phone: '0901234565', email: 'linh.vk@mycoffeehouse.vn', birthday: '2001-07-25', gender: 'Nữ' },
    { code: 'NV006', username: 'waiter', full_name: 'Hoàng Văn Nam', role_id: 3, phone: '0901234566', email: 'nam.hv@mycoffeehouse.vn', birthday: '2000-02-18', gender: 'Nam' },
    { code: 'NV007', username: 'waiter_an', full_name: 'Phạm Thúy An', role_id: 3, phone: '0901234567', email: 'an.pt@mycoffeehouse.vn', birthday: '2002-10-30', gender: 'Nữ' },
    { code: 'NV008', username: 'warehouse', full_name: 'Bùi Quốc Hoàng', role_id: 5, phone: '0901234568', email: 'hoang.bq@mycoffeehouse.vn', birthday: '1994-09-09', gender: 'Nam' },
    { code: 'NV009', username: 'tech_duc', full_name: 'Ngô Tiến Đức', role_id: 1, phone: '0901234569', email: 'duc.nt@mycoffeehouse.vn', birthday: '1995-12-12', gender: 'Nam' },
  ];

  for (const s of staffMembers) {
    const [existing] = await db.query('SELECT id FROM users WHERE username = ? OR code = ?', [s.username, s.code]);
    if (existing.length) {
      await db.query(
        'UPDATE users SET full_name=?, role_id=?, phone=?, email=?, birthday=?, gender=?, code=?, is_active=1 WHERE id=?',
        [s.full_name, s.role_id, s.phone, s.email, s.birthday, s.gender, s.code, existing[0].id]
      );
    } else {
      await db.query(
        `INSERT INTO users (code, username, password_hash, full_name, role_id, phone, email, birthday, gender, is_active)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
        [s.code, s.username, defaultHash, s.full_name, s.role_id, s.phone, s.email, s.birthday, s.gender]
      );
    }
  }
  console.log('✅ 9 Staff members seeded with complete stations.');

  // 3. Work Shifts for all staff
  const [allUsers] = await db.query('SELECT id, code, full_name, role_id FROM users WHERE is_active=1');
  const userMap = {};
  for (const u of allUsers) {
    if (u.code) userMap[u.code] = u.id;
  }

  // Clear or populate work_shifts
  const today = new Date().toISOString().slice(0, 10);
  const shiftList = [
    { user_code: 'NV001', shift_code: 'CA-HC-01', shift_type: 'Ca Hành Chính (08:00 - 17:00)', note: 'Quản lý điều hành tổng thể cửa hàng' },
    { user_code: 'NV002', shift_code: 'CA-SANG-01', shift_type: 'Ca Sáng (06:30 - 14:30)', note: 'Thu ngân chính quầy POS ca sáng' },
    { user_code: 'NV003', shift_code: 'CA-TOI-01', shift_type: 'Ca Chiều / Tối (14:30 - 22:30)', note: 'Thu ngân chính quầy POS ca tối & chốt két' },
    { user_code: 'NV004', shift_code: 'CA-SANG-02', shift_type: 'Ca Sáng (06:30 - 14:30)', note: 'Barista trưởng pha chế đồ uống & kiểm tra máy espresso' },
    { user_code: 'NV005', shift_code: 'CA-TOI-02', shift_type: 'Ca Chiều / Tối (14:30 - 22:30)', note: 'Barista phụ pha chế trà, sinh tố, đá xay' },
    { user_code: 'NV006', shift_code: 'CA-SANG-03', shift_type: 'Ca Sáng (06:30 - 14:30)', note: 'Phục vụ bàn, chăm sóc khách, order bàn ca sáng' },
    { user_code: 'NV007', shift_code: 'CA-TOI-03', shift_type: 'Ca Chiều / Tối (14:30 - 22:30)', note: 'Phục vụ bàn & dọn dẹp kết ca tối' },
    { user_code: 'NV008', shift_code: 'CA-HC-02', shift_type: 'Ca Hành Chính (08:00 - 17:00)', note: 'Kiểm kê xuất nhập tồn kho nguyên vật liệu' },
    { user_code: 'NV009', shift_code: 'CA-HC-03', shift_type: 'Ca Hành Chính (08:30 - 17:30)', note: 'Bảo trì máy pha, máy POS, đường mạng & thiết bị' },
  ];

  for (const sf of shiftList) {
    const uid = userMap[sf.user_code];
    if (uid) {
      const [exShift] = await db.query(
        'SELECT id FROM work_shifts WHERE user_id = ? AND shift_date = ?',
        [uid, today]
      );
      if (exShift.length) {
        await db.query(
          'UPDATE work_shifts SET shift_code=?, shift_type=?, note=?, status="Đang làm việc" WHERE id=?',
          [sf.shift_code, sf.shift_type, sf.note, exShift[0].id]
        );
      } else {
        await db.query(
          `INSERT INTO work_shifts (shift_code, user_id, shift_type, shift_date, status, note)
           VALUES (?, ?, ?, ?, 'Đang làm việc', ?)`,
          [sf.shift_code, uid, sf.shift_type, today, sf.note]
        );
      }
    }
  }
  console.log('✅ Work shifts seeded for all stations.');

  // 4. Ensure Expanded Ingredients (20 ingredients)
  const ingredientsList = [
    { code: 'NL001', name: 'Cà phê hạt Robusta Buôn Ma Thuột', unit: 'kg', min_stock: 5, current_stock: 25.0, avg_cost: 160000, image_url: 'https://images.unsplash.com/photo-1559056199-641a0ac8b55e?w=300&auto=format&fit=crop&q=80' },
    { code: 'NL002', name: 'Cà phê hạt Arabica Cầu Đất', unit: 'kg', min_stock: 5, current_stock: 18.0, avg_cost: 240000, image_url: 'https://images.unsplash.com/photo-1514432324607-a09d9b4aefdd?w=300&auto=format&fit=crop&q=80' },
    { code: 'NL003', name: 'Sữa đặc Ông Thọ lon', unit: 'lon', min_stock: 15, current_stock: 65.0, avg_cost: 24000, image_url: 'https://images.unsplash.com/photo-1528740561666-dc2479dc08ab?w=300&auto=format&fit=crop&q=80' },
    { code: 'NL004', name: 'Sữa tươi thanh trùng Barista 1L', unit: 'hộp', min_stock: 12, current_stock: 42.0, avg_cost: 36000, image_url: 'https://images.unsplash.com/photo-1550583724-b2692b85b150?w=300&auto=format&fit=crop&q=80' },
    { code: 'NL005', name: 'Đường cát trắng cao cấp', unit: 'kg', min_stock: 10, current_stock: 35.0, avg_cost: 22000, image_url: 'https://images.unsplash.com/photo-1587734195503-904fca47e0e9?w=300&auto=format&fit=crop&q=80' },
    { code: 'NL006', name: 'Trà đen hảo hạng', unit: 'kg', min_stock: 3, current_stock: 8.5, avg_cost: 180000, image_url: 'https://images.unsplash.com/photo-1576092768241-dec231879fc3?w=300&auto=format&fit=crop&q=80' },
    { code: 'NL007', name: 'Bột Matcha Uji Nhật Bản', unit: 'g', min_stock: 500, current_stock: 2500.0, avg_cost: 1200, image_url: 'https://images.unsplash.com/photo-1536256263959-770b48d82b0a?w=300&auto=format&fit=crop&q=80' },
    { code: 'NL008', name: 'Đào ngâm đóng hộp Kronos', unit: 'hộp', min_stock: 6, current_stock: 28.0, avg_cost: 55000, image_url: 'https://images.unsplash.com/photo-1621263764928-df1444c5e859?w=300&auto=format&fit=crop&q=80' },
    { code: 'NL009', name: 'Trân châu đen Đài Loan', unit: 'kg', min_stock: 4, current_stock: 15.0, avg_cost: 48000, image_url: 'https://images.unsplash.com/photo-1558857563-b37fe8402db0?w=300&auto=format&fit=crop&q=80' },
    { code: 'NL010', name: 'Bột Cacao nguyên chất', unit: 'kg', min_stock: 2, current_stock: 6.0, avg_cost: 150000, image_url: 'https://images.unsplash.com/photo-1542990253-0d0f5be5f0ed?w=300&auto=format&fit=crop&q=80' },
    { code: 'NL011', name: 'Sốt caramel Torani', unit: 'chai', min_stock: 3, current_stock: 10.0, avg_cost: 195000, image_url: 'https://images.unsplash.com/photo-1589301760014-d929f3979dbc?w=300&auto=format&fit=crop&q=80' },
    { code: 'NL012', name: 'Kem béo thực vật Rich lùn', unit: 'hộp', min_stock: 8, current_stock: 25.0, avg_cost: 28000, image_url: 'https://images.unsplash.com/photo-1550583724-b2692b85b150?w=300&auto=format&fit=crop&q=80' },
    { code: 'NL013', name: 'Nước cốt dừa Chaokoh', unit: 'lon', min_stock: 5, current_stock: 20.0, avg_cost: 32000, image_url: 'https://images.unsplash.com/photo-1544787219-7f47ccb76574?w=300&auto=format&fit=crop&q=80' },
    { code: 'NL014', name: 'Siro dâu tươi Đà Lạt', unit: 'chai', min_stock: 3, current_stock: 12.0, avg_cost: 145000, image_url: 'https://images.unsplash.com/photo-1464965911861-746a04b4bca6?w=300&auto=format&fit=crop&q=80' },
    { code: 'NL015', name: 'Bơ sáp tươi Đắk Lắk', unit: 'kg', min_stock: 5, current_stock: 16.0, avg_cost: 55000, image_url: 'https://images.unsplash.com/photo-1523049673857-eb18f1d7b578?w=300&auto=format&fit=crop&q=80' },
    { code: 'NL016', name: 'Hạt sen tươi Huế', unit: 'kg', min_stock: 3, current_stock: 8.0, avg_cost: 95000, image_url: 'https://images.unsplash.com/photo-1509358271058-acd22cc93898?w=300&auto=format&fit=crop&q=80' },
    { code: 'NL017', name: 'Bột kem cheese mặn', unit: 'kg', min_stock: 2, current_stock: 7.0, avg_cost: 135000, image_url: 'https://images.unsplash.com/photo-1486297678162-eb2a19b0a32d?w=300&auto=format&fit=crop&q=80' },
    { code: 'NL018', name: 'Bánh quy vụn Oreo', unit: 'gói', min_stock: 5, current_stock: 18.0, avg_cost: 38000, image_url: 'https://images.unsplash.com/photo-1563805042-7684c019e1cb?w=300&auto=format&fit=crop&q=80' },
    { code: 'NL019', name: 'Vải thiều ngâm đường', unit: 'hộp', min_stock: 4, current_stock: 14.0, avg_cost: 52000, image_url: 'https://images.unsplash.com/photo-1577968897966-3d4325b36b61?w=300&auto=format&fit=crop&q=80' },
    { code: 'NL020', name: 'Cam sành tươi mọng nước', unit: 'kg', min_stock: 6, current_stock: 22.0, avg_cost: 30000, image_url: 'https://images.unsplash.com/photo-1557800636-894a64c1696f?w=300&auto=format&fit=crop&q=80' },
  ];

  for (const ing of ingredientsList) {
    const [ex] = await db.query('SELECT id FROM ingredients WHERE code = ?', [ing.code]);
    if (ex.length) {
      await db.query(
        'UPDATE ingredients SET name=?, unit=?, min_stock=?, avg_cost=?, image_url=? WHERE id=?',
        [ing.name, ing.unit, ing.min_stock, ing.avg_cost, ing.image_url, ex[0].id]
      );
    } else {
      await db.query(
        `INSERT INTO ingredients (code, name, unit, min_stock, current_stock, avg_cost, image_url)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [ing.code, ing.name, ing.unit, ing.min_stock, ing.current_stock, ing.avg_cost, ing.image_url]
      );
    }
  }
  console.log('✅ 20 Ingredients ensured.');

  // 5. Expand Menu to 30 items
  const menuItems = [
    // --- 1. CÀ PHÊ (8 món) ---
    {
      code: 'M001',
      name: 'Cà phê đen đá',
      category_id: 1,
      price: 25000,
      description: 'Cà phê Robusta Đắk Lắk nguyên chất pha phin truyền thống thơm lừng đậm vị.',
      image_url: 'https://images.unsplash.com/photo-1514432324607-a09d9b4aefdd?w=400&auto=format&fit=crop&q=80',
      recipe: [
        { ing_code: 'NL001', qty: 0.025 },
        { ing_code: 'NL005', qty: 0.010 }
      ]
    },
    {
      code: 'M002',
      name: 'Cà phê sữa đá',
      category_id: 1,
      price: 29000,
      description: 'Hương vị cà phê phin đậm đà hòa quyện cùng sữa đặc ngọt béo đặc trưng.',
      image_url: 'https://images.unsplash.com/photo-1517701604599-bb29b565090c?w=400&auto=format&fit=crop&q=80',
      recipe: [
        { ing_code: 'NL001', qty: 0.020 },
        { ing_code: 'NL003', qty: 0.040 }
      ]
    },
    {
      code: 'M003',
      name: 'Bạc xỉu ba tầng',
      category_id: 1,
      price: 32000,
      description: 'Sự phân tầng tinh tế giữa sữa đặc, sữa tươi thanh trùng và lớp cà phê sóng sánh.',
      image_url: 'https://images.unsplash.com/photo-1461023058943-07fcbe16d735?w=400&auto=format&fit=crop&q=80',
      recipe: [
        { ing_code: 'NL001', qty: 0.015 },
        { ing_code: 'NL003', qty: 0.035 },
        { ing_code: 'NL004', qty: 0.080 }
      ]
    },
    {
      code: 'M004',
      name: 'Cà phê muối xứ Huế',
      category_id: 1,
      price: 35000,
      description: 'Vị đậm của cà phê quyện cùng lớp kem muối béo ngậy ngọt mặn hài hòa.',
      image_url: 'https://images.unsplash.com/photo-1509785307050-d4066910ec1e?w=400&auto=format&fit=crop&q=80',
      recipe: [
        { ing_code: 'NL001', qty: 0.020 },
        { ing_code: 'NL003', qty: 0.030 },
        { ing_code: 'NL012', qty: 0.030 }
      ]
    },
    {
      code: 'M005',
      name: 'Cà phê trứng Hà Nội',
      category_id: 1,
      price: 39000,
      description: 'Lớp kem trứng bông mịn thơm lừng phủ trên cốt cà phê phin nóng hổi truyền thống.',
      image_url: 'https://images.unsplash.com/photo-1541167760496-1628856ab772?w=400&auto=format&fit=crop&q=80',
      recipe: [
        { ing_code: 'NL001', qty: 0.025 },
        { ing_code: 'NL003', qty: 0.035 },
        { ing_code: 'NL005', qty: 0.015 }
      ]
    },
    {
      code: 'M006',
      name: 'Americano đá',
      category_id: 1,
      price: 35000,
      description: 'Chiết xuất espresso Arabica nguyên chất pha cùng nước tinh khiết thanh nhẹ.',
      image_url: 'https://images.unsplash.com/photo-1551030173-122aabc4489c?w=400&auto=format&fit=crop&q=80',
      recipe: [
        { ing_code: 'NL002', qty: 0.020 }
      ]
    },
    {
      code: 'M007',
      name: 'Cappuccino bọt sữa',
      category_id: 1,
      price: 45000,
      description: 'Cân bằng giữa espresso Arabica Cầu Đất, sữa nóng và lớp bọt sữa dày mịn nghệ thuật.',
      image_url: 'https://images.unsplash.com/photo-1534778101976-62847782c213?w=400&auto=format&fit=crop&q=80',
      recipe: [
        { ing_code: 'NL002', qty: 0.020 },
        { ing_code: 'NL004', qty: 0.150 },
        { ing_code: 'NL010', qty: 0.002 }
      ]
    },
    {
      code: 'M008',
      name: 'Latte vani hạnh nhân',
      category_id: 1,
      price: 45000,
      description: 'Cà phê sữa phong cách Ý êm dịu hòa quyện cùng sữa tươi thanh trùng mịn màng.',
      image_url: 'https://images.unsplash.com/photo-1570968915860-54d5c301fa9f?w=400&auto=format&fit=crop&q=80',
      recipe: [
        { ing_code: 'NL002', qty: 0.018 },
        { ing_code: 'NL004', qty: 0.180 }
      ]
    },

    // --- 2. TRÀ & MATCHA (7 món) ---
    {
      code: 'M009',
      name: 'Trà đào cam sả',
      category_id: 2,
      price: 39000,
      description: 'Trà đen thanh mát kết hợp lát đào vàng giòn sần sật, hương cam vàng và sả tươi.',
      image_url: 'https://images.unsplash.com/photo-1556679343-c7306c1976bc?w=400&auto=format&fit=crop&q=80',
      recipe: [
        { ing_code: 'NL006', qty: 0.015 },
        { ing_code: 'NL008', qty: 0.050 },
        { ing_code: 'NL005', qty: 0.020 }
      ]
    },
    {
      code: 'M010',
      name: 'Trà vải hoa hồng',
      category_id: 2,
      price: 42000,
      description: 'Vị chát nhẹ của trà đen quyện vị ngọt thanh của vải thiều và hương thơm hoa hồng dịu nhẹ.',
      image_url: 'https://images.unsplash.com/photo-1576092768241-dec231879fc3?w=400&auto=format&fit=crop&q=80',
      recipe: [
        { ing_code: 'NL006', qty: 0.015 },
        { ing_code: 'NL019', qty: 0.050 },
        { ing_code: 'NL005', qty: 0.015 }
      ]
    },
    {
      code: 'M011',
      name: 'Trà dâu tây dưa hấu',
      category_id: 2,
      price: 42000,
      description: 'Thức uống giải nhiệt ngọt lịm với cốt trà thơm kết hợp siro dâu Đà Lạt tươi mát.',
      image_url: 'https://images.unsplash.com/photo-1497534446932-c925b458314e?w=400&auto=format&fit=crop&q=80',
      recipe: [
        { ing_code: 'NL006', qty: 0.015 },
        { ing_code: 'NL014', qty: 0.030 },
        { ing_code: 'NL005', qty: 0.015 }
      ]
    },
    {
      code: 'M012',
      name: 'Trà xanh gạo rang Genmai',
      category_id: 2,
      price: 35000,
      description: 'Hương vị trà xanh mộc mạc thơm ngát mùi gạo lứt rang truyền thống Nhật Bản.',
      image_url: 'https://images.unsplash.com/photo-1576092768241-dec231879fc3?w=400&auto=format&fit=crop&q=80',
      recipe: [
        { ing_code: 'NL006', qty: 0.015 },
        { ing_code: 'NL005', qty: 0.010 }
      ]
    },
    {
      code: 'M013',
      name: 'Matcha Latte Uji',
      category_id: 2,
      price: 49000,
      description: 'Bột matcha thượng hạng nhập khẩu trực tiếp từ Uji Nhật Bản kết hợp cùng sữa tươi béo thơm.',
      image_url: 'https://images.unsplash.com/photo-1536256263959-770b48d82b0a?w=400&auto=format&fit=crop&q=80',
      recipe: [
        { ing_code: 'NL007', qty: 6.0 }, // 6 grams
        { ing_code: 'NL004', qty: 0.180 },
        { ing_code: 'NL003', qty: 0.020 }
      ]
    },
    {
      code: 'M014',
      name: 'Trà sữa trân châu đường đen',
      category_id: 2,
      price: 39000,
      description: 'Trà sữa truyền thống nấu từ trà đen đậm đà kèm trân châu đen Đài Loan dẻo dai ngọt lịm.',
      image_url: 'https://images.unsplash.com/photo-1558857563-b37fe8402db0?w=400&auto=format&fit=crop&q=80',
      recipe: [
        { ing_code: 'NL006', qty: 0.020 },
        { ing_code: 'NL004', qty: 0.120 },
        { ing_code: 'NL003', qty: 0.030 },
        { ing_code: 'NL009', qty: 0.050 }
      ]
    },
    {
      code: 'M015',
      name: 'Trà sen vàng kem cheese',
      category_id: 2,
      price: 45000,
      description: 'Trà thanh khiết kèm hạt sen bùi béo phủ lớp kem cheese mặn mòi đặc sánh trên cùng.',
      image_url: 'https://images.unsplash.com/photo-1544787219-7f47ccb76574?w=400&auto=format&fit=crop&q=80',
      recipe: [
        { ing_code: 'NL006', qty: 0.015 },
        { ing_code: 'NL016', qty: 0.040 },
        { ing_code: 'NL017', qty: 0.025 }
      ]
    },

    // --- 3. SINH TỐ & ĐÁ XAY (6 món) ---
    {
      code: 'M016',
      name: 'Sinh tố bơ sáp Đắk Lắk',
      category_id: 3,
      price: 45000,
      description: 'Bơ sáp loại 1 tươi ngon xay nhuyễn dẻo quánh cùng sữa đặc và sữa tươi ngọt béo.',
      image_url: 'https://images.unsplash.com/photo-1553530666-ba11a7da3888?w=400&auto=format&fit=crop&q=80',
      recipe: [
        { ing_code: 'NL015', qty: 0.150 },
        { ing_code: 'NL003', qty: 0.040 },
        { ing_code: 'NL004', qty: 0.080 }
      ]
    },
    {
      code: 'M017',
      name: 'Sinh tố dâu tây sữa chua',
      category_id: 3,
      price: 45000,
      description: 'Dâu tây đỏ mọng chua ngọt hòa quyện cùng sữa chua bổ dưỡng tốt cho sức khỏe.',
      image_url: 'https://images.unsplash.com/photo-1553530979-f55da25b68df?w=400&auto=format&fit=crop&q=80',
      recipe: [
        { ing_code: 'NL014', qty: 0.050 },
        { ing_code: 'NL004', qty: 0.100 },
        { ing_code: 'NL003', qty: 0.025 }
      ]
    },
    {
      code: 'M018',
      name: 'Sinh tố xoài cát chu',
      category_id: 3,
      price: 42000,
      description: 'Xoài cát chín vàng tự nhiên thơm lừng xay sánh mịn, giàu vitamin C bổ dưỡng.',
      image_url: 'https://images.unsplash.com/photo-1623065422902-30a2d299bbe4?w=400&auto=format&fit=crop&q=80',
      recipe: [
        { ing_code: 'NL003', qty: 0.035 },
        { ing_code: 'NL004', qty: 0.080 },
        { ing_code: 'NL005', qty: 0.015 }
      ]
    },
    {
      code: 'M019',
      name: 'Cà phê cốt dừa đá xay',
      category_id: 3,
      price: 48000,
      description: 'Món đặc sản trứ danh với cốt dừa béo ngậy đá xay quyện cùng cốt cà phê thơm lừng.',
      image_url: 'https://images.unsplash.com/photo-1517701604599-bb29b565090c?w=400&auto=format&fit=crop&q=80',
      recipe: [
        { ing_code: 'NL001', qty: 0.020 },
        { ing_code: 'NL013', qty: 0.060 },
        { ing_code: 'NL003', qty: 0.035 }
      ]
    },
    {
      code: 'M020',
      name: 'Cookie kem béo đá xay',
      category_id: 3,
      price: 48000,
      description: 'Bánh Oreo giòn rụm xay cùng sữa tươi và kem Rich béo ngậy, phủ whipping cream.',
      image_url: 'https://images.unsplash.com/photo-1572490122747-3968b75cc699?w=400&auto=format&fit=crop&q=80',
      recipe: [
        { ing_code: 'NL018', qty: 0.040 },
        { ing_code: 'NL004', qty: 0.120 },
        { ing_code: 'NL012', qty: 0.030 },
        { ing_code: 'NL003', qty: 0.025 }
      ]
    },
    {
      code: 'M021',
      name: 'Matcha đá xay kem cheese',
      category_id: 3,
      price: 52000,
      description: 'Đá xay matcha Nhật Bản mát lạnh kết hợp hoàn hảo cùng lớp phô mai kem mặn thơm.',
      image_url: 'https://images.unsplash.com/photo-1536256263959-770b48d82b0a?w=400&auto=format&fit=crop&q=80',
      recipe: [
        { ing_code: 'NL007', qty: 7.0 },
        { ing_code: 'NL004', qty: 0.120 },
        { ing_code: 'NL017', qty: 0.030 },
        { ing_code: 'NL003', qty: 0.025 }
      ]
    },

    // --- 4. BÁNH NGỌT & ĂN VẶT (5 món) ---
    {
      code: 'M022',
      name: 'Bánh Croissant bơ Pháp',
      category_id: 4,
      price: 25000,
      description: 'Bánh sừng bò ngàn lớp thơm lừng bơ Pháp, vỏ giòn ruột mềm xốp hảo hạng.',
      image_url: 'https://images.unsplash.com/photo-1555507036-ab1f4038808a?w=400&auto=format&fit=crop&q=80',
      recipe: [
        { ing_code: 'NL005', qty: 0.005 }
      ]
    },
    {
      code: 'M023',
      name: 'Tiramisu ca cao Ý',
      category_id: 4,
      price: 38000,
      description: 'Bánh tiramisu truyền thống thấm đẫm cà phê espresso phủ lớp bột ca cao mịn màng.',
      image_url: 'https://images.unsplash.com/photo-1571877227200-a0d98ea607e9?w=400&auto=format&fit=crop&q=80',
      recipe: [
        { ing_code: 'NL002', qty: 0.010 },
        { ing_code: 'NL010', qty: 0.010 }
      ]
    },
    {
      code: 'M024',
      name: 'Bánh phô mai nướng Burnt',
      category_id: 4,
      price: 39000,
      description: 'Cheesecake nướng cháy xém phong cách Basque với cốt phô mai tan chảy béo ngậy.',
      image_url: 'https://images.unsplash.com/photo-1533134242443-d4fd215305ad?w=400&auto=format&fit=crop&q=80',
      recipe: [
        { ing_code: 'NL017', qty: 0.040 }
      ]
    },
    {
      code: 'M025',
      name: 'Bánh mousse chanh dây',
      category_id: 4,
      price: 35000,
      description: 'Vị chua thanh mát lành của chanh dây tươi cân bằng hoàn hảo với lớp kem mousse mịn màng.',
      image_url: 'https://images.unsplash.com/photo-1587314168485-3236d6710814?w=400&auto=format&fit=crop&q=80',
      recipe: [
        { ing_code: 'NL005', qty: 0.015 }
      ]
    },
    {
      code: 'M026',
      name: 'Bánh mì que pate bơ cay',
      category_id: 4,
      price: 30000,
      description: 'Bánh mì que Hải Phòng giòn tan ngập tràn pate béo ngậy và tương ớt cay nồng.',
      image_url: 'https://images.unsplash.com/photo-1509722747041-616f39b57569?w=400&auto=format&fit=crop&q=80',
      recipe: [
        { ing_code: 'NL005', qty: 0.005 }
      ]
    },

    // --- 5. NƯỚC GIẢI KHÁT & TRÁI CÂY (4 món) ---
    {
      code: 'M027',
      name: 'Nước cam tươi nguyên chất',
      category_id: 5,
      price: 35000,
      description: '100% cam sành vắt tay tươi mới giàu vitamin C, ngọt thanh dịu mát sảng khoái.',
      image_url: 'https://images.unsplash.com/photo-1613478223719-2ab802602423?w=400&auto=format&fit=crop&q=80',
      recipe: [
        { ing_code: 'NL020', qty: 0.250 },
        { ing_code: 'NL005', qty: 0.020 }
      ]
    },
    {
      code: 'M028',
      name: 'Nước ép dưa hấu mát lạnh',
      category_id: 5,
      price: 32000,
      description: 'Dưa hấu tươi mọng nước ép lạnh giữ trọn vị ngọt thanh thuần khiết giải nhiệt ngày hè.',
      image_url: 'https://images.unsplash.com/photo-1589733955941-5eeaf752f6dd?w=400&auto=format&fit=crop&q=80',
      recipe: [
        { ing_code: 'NL005', qty: 0.010 }
      ]
    },
    {
      code: 'M029',
      name: 'Soda việt quất bạc hà',
      category_id: 5,
      price: 35000,
      description: 'Sự kết hợp giữa soda có gas sảng khoái, mứt việt quất chua ngọt và lá bạc hà mát lạnh.',
      image_url: 'https://images.unsplash.com/photo-1513558161293-cdaf765ed2fd?w=400&auto=format&fit=crop&q=80',
      recipe: [
        { ing_code: 'NL014', qty: 0.035 },
        { ing_code: 'NL005', qty: 0.015 }
      ]
    },
    {
      code: 'M030',
      name: 'Soda chanh leo thảo mộc',
      category_id: 5,
      price: 32000,
      description: 'Nước khoáng có gas hòa cùng nước cốt chanh dây chua thanh và mật ong hoa cỏ dịu ngọt.',
      image_url: 'https://images.unsplash.com/photo-1551024709-8f23befc6f87?w=400&auto=format&fit=crop&q=80',
      recipe: [
        { ing_code: 'NL005', qty: 0.020 }
      ]
    },
  ];

  // Fetch updated ingredients to get id map
  const [dbIngs] = await db.query('SELECT id, code FROM ingredients');
  const ingMap = {};
  for (const i of dbIngs) {
    ingMap[i.code] = i.id;
  }

  for (const item of menuItems) {
    const [ex] = await db.query('SELECT id FROM products WHERE code = ?', [item.code]);
    let productId;
    if (ex.length) {
      productId = ex[0].id;
      await db.query(
        'UPDATE products SET name=?, category_id=?, description=?, image_url=?, is_available=1, is_active=1 WHERE id=?',
        [item.name, item.category_id, item.description, item.image_url, productId]
      );
    } else {
      const [ins] = await db.query(
        `INSERT INTO products (code, name, category_id, description, image_url, is_available, is_active)
         VALUES (?, ?, ?, ?, ?, 1, 1)`,
        [item.code, item.name, item.category_id, item.description, item.image_url]
      );
      productId = ins.insertId;
    }

    // Product Size M (default)
    const [exSizeM] = await db.query('SELECT id FROM product_sizes WHERE product_id = ? AND name = "M"', [productId]);
    let sizeMId;
    if (exSizeM.length) {
      sizeMId = exSizeM[0].id;
      await db.query('UPDATE product_sizes SET price = ?, is_default = 1 WHERE id = ?', [item.price, sizeMId]);
    } else {
      const [insM] = await db.query(
        'INSERT INTO product_sizes (product_id, name, price, is_default) VALUES (?, "M", ?, 1)',
        [productId, item.price]
      );
      sizeMId = insM.insertId;
    }

    // Product Size L (+8,000 VND)
    const [exSizeL] = await db.query('SELECT id FROM product_sizes WHERE product_id = ? AND name = "L"', [productId]);
    let sizeLId;
    if (exSizeL.length) {
      sizeLId = exSizeL[0].id;
      await db.query('UPDATE product_sizes SET price = ?, is_default = 0 WHERE id = ?', [item.price + 8000, sizeLId]);
    } else {
      const [insL] = await db.query(
        'INSERT INTO product_sizes (product_id, name, price, is_default) VALUES (?, "L", ?, 0)',
        [productId, item.price + 8000]
      );
      sizeLId = insL.insertId;
    }

    // Recipes
    if (item.recipe && item.recipe.length) {
      for (const r of item.recipe) {
        const ingId = ingMap[r.ing_code];
        if (ingId) {
          // Recipe for Size M
          await db.query(
            `INSERT INTO recipes (product_size_id, ingredient_id, quantity)
             VALUES (?, ?, ?)
             ON DUPLICATE KEY UPDATE quantity = VALUES(quantity)`,
            [sizeMId, ingId, r.qty]
          );

          // Recipe for Size L (1.35x quantity)
          await db.query(
            `INSERT INTO recipes (product_size_id, ingredient_id, quantity)
             VALUES (?, ?, ?)
             ON DUPLICATE KEY UPDATE quantity = VALUES(quantity)`,
            [sizeLId, ingId, (r.qty * 1.35).toFixed(3)]
          );
        }
      }
    }
  }

  console.log(`✅ ${menuItems.length} Products & Recipes seeded successfully.`);
  console.log('--- SEEDING COMPLETED PERFECTLY ---');
  process.exit(0);
}

seed().catch((err) => {
  console.error('Seeding error:', err);
  process.exit(1);
});
