const bcrypt = require('bcryptjs');
const db = require('../config/db');
const { generateTokens, verifyRefresh } = require('../utils/jwt');

// POST /api/auth/login
const login = async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password)
      return res.status(400).json({ success: false, message: 'Vui lòng nhập tài khoản và mật khẩu' });

    const cleanInput = String(username).trim();

    let [rows] = await db.query(
      `SELECT u.*, r.name AS role_name FROM users u
       JOIN roles r ON r.id = u.role_id
       WHERE (u.username = ? OR u.phone = ?) AND u.is_active = 1`,
      [cleanInput, cleanInput]
    );

    // Tự động khởi tạo tài khoản quản lý / nhân sự nếu CSDL Cloud chưa nạp
    if (!rows.length && password === '123456') {
      const defaultUsers = {
        admin: { code: 'NV001', name: 'Nguyễn Hoàng Long', roleId: 1, phone: '0901234567', email: 'admin@mycoffee.vn' },
        cashier: { code: 'NV002', name: 'Trần Thu Hà', roleId: 2, phone: '0902345678', email: 'cashier@mycoffee.vn' },
        barista: { code: 'NV003', name: 'Đặng Minh Tuấn', roleId: 4, phone: '0903456789', email: 'barista@mycoffee.vn' },
        waiter: { code: 'NV004', name: 'Hoàng Văn Nam', roleId: 3, phone: '0904567890', email: 'waiter@mycoffee.vn' },
        warehouse: { code: 'NV005', name: 'Bùi Quốc Hoàng', roleId: 5, phone: '0905678901', email: 'warehouse@mycoffee.vn' },
      };

      const matchedKey = Object.keys(defaultUsers).find(k => k === cleanInput.toLowerCase() || defaultUsers[k].phone === cleanInput);
      if (matchedKey) {
        try {
          // Đảm bảo roles tồn tại
          await db.query(`
            INSERT INTO \`roles\` (\`id\`, \`name\`, \`label\`, \`description\`) VALUES
              (1, 'admin', 'Quản lý', 'Quản lý toàn bộ hệ thống quán'),
              (2, 'cashier', 'Thu ngân', 'Thao tác order, thanh toán tại quầy'),
              (3, 'waiter', 'Phục vụ bàn', 'Tạo order, xem trạng thái bàn'),
              (4, 'barista', 'Pha chế', 'Xem hàng đợi KDS, cập nhật món'),
              (5, 'warehouse', 'Thủ kho', 'Quản lý kho nguyên vật liệu'),
              (6, 'customer', 'Khách hàng', 'Tự đặt món trực tuyến & tích điểm')
            ON DUPLICATE KEY UPDATE \`name\` = VALUES(\`name\`)
          `);

          const target = defaultUsers[matchedKey];
          const hash = await bcrypt.hash('123456', 10);
          await db.query(
            `INSERT INTO users (code, username, password_hash, full_name, role_id, phone, email, is_active)
             VALUES (?, ?, ?, ?, ?, ?, ?, 1)
             ON DUPLICATE KEY UPDATE password_hash = VALUES(password_hash)`,
            [target.code, matchedKey, hash, target.name, target.roleId, target.phone, target.email]
          );

          [rows] = await db.query(
            `SELECT u.*, r.name AS role_name FROM users u
             JOIN roles r ON r.id = u.role_id
             WHERE (u.username = ? OR u.phone = ?) AND u.is_active = 1`,
            [cleanInput, cleanInput]
          );
        } catch (seedErr) {
          console.error('Error auto-seeding staff on login:', seedErr);
        }
      }
    }

    if (!rows.length)
      return res.status(401).json({ success: false, message: 'Sai tài khoản hoặc mật khẩu' });

    const user = rows[0];
    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid)
      return res.status(401).json({ success: false, message: 'Sai tài khoản hoặc mật khẩu' });

    let customerInfo = null;
    if (user.role_name === 'customer') {
      const [cRows] = await db.query(
        `SELECT c.id AS customer_id, c.points_balance, c.total_spent,
                m.name AS tier_name, m.discount_pct, m.points_per_10k
         FROM customers c
         LEFT JOIN membership_tiers m ON m.id = c.tier_id
         WHERE c.phone = ? LIMIT 1`,
        [user.phone || user.username]
      );
      if (cRows.length) customerInfo = cRows[0];
    }

    const { accessToken, refreshToken } = generateTokens({ ...user, role_name: user.role_name });

    res.json({
      success: true,
      data: {
        accessToken,
        refreshToken,
        user: {
          id: user.id,
          username: user.username,
          full_name: user.full_name,
          phone: user.phone,
          role: user.role_name,
          customer_info: customerInfo
        }
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// POST /api/auth/refresh
const refresh = async (req, res) => {
  try {
    const { refreshToken } = req.body;
    const payload = verifyRefresh(refreshToken);

    // Query DB để lấy đầy đủ thông tin user (role, username) - tránh mất RBAC sau refresh
    const [rows] = await db.query(
      `SELECT u.id, u.username, u.full_name, r.name AS role_name
       FROM users u JOIN roles r ON r.id = u.role_id
       WHERE u.id = ? AND u.is_active = 1`,
      [payload.id]
    );
    if (!rows.length) {
      return res.status(401).json({ success: false, message: 'Người dùng không tồn tại hoặc đã bị vô hiệu hóa' });
    }

    const user = rows[0];
    const { generateTokens } = require('../utils/jwt');
    const tokens = generateTokens(user);
    res.json({ success: true, data: { accessToken: tokens.accessToken } });
  } catch {
    res.status(401).json({ success: false, message: 'Refresh token không hợp lệ' });
  }
};

// GET /api/auth/me
const me = async (req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT u.id, u.username, u.full_name, u.phone, u.email, u.birthday, r.name AS role, r.label AS role_label
       FROM users u
       JOIN roles r ON r.id = u.role_id WHERE u.id = ?`,
      [req.user.id]
    );
    if (!rows.length) return res.status(404).json({ success: false, message: 'Không tìm thấy người dùng' });
    const user = rows[0];

    // Nếu là tài khoản khách hàng, lấy thông tin thành viên & tích điểm thực tế
    if (user.role === 'customer') {
      const [cRows] = await db.query(
        `SELECT c.id AS customer_id, c.points_balance, c.total_spent,
                m.name AS tier_name, m.discount_pct, m.points_per_10k
         FROM customers c
         LEFT JOIN membership_tiers m ON m.id = c.tier_id
         WHERE c.phone = ? LIMIT 1`,
        [user.phone || user.username]
      );
      if (cRows.length) {
        user.customer_info = cRows[0];
      }
    }

    res.json({ success: true, data: user });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// POST /api/auth/register (Khách hàng tự đăng ký tài khoản mới)
const register = async (req, res) => {
  try {
    const { full_name, phone, password, birthday, email } = req.body;

    // 1. Kiểm tra validation cơ bản
    if (!full_name || full_name.trim().length < 2) {
      return res.status(400).json({ success: false, message: 'Họ và tên cần có ít nhất 2 ký tự' });
    }
    if (!phone || !/^(0|\+84)[0-9]{9,10}$/.test(phone.trim().replace(/\s/g, ''))) {
      return res.status(400).json({ success: false, message: 'Số điện thoại không đúng định dạng (Ví dụ: 0901234567)' });
    }
    if (!password || password.length < 6) {
      return res.status(400).json({ success: false, message: 'Mật khẩu phải có tối thiểu 6 ký tự' });
    }

    const cleanPhone = phone.trim().replace(/\s/g, '');
    const cleanName = full_name.trim();

    // 2. Kiểm tra xem số điện thoại đã có tài khoản người dùng chưa
    const [existingUsers] = await db.query(
      `SELECT id FROM users WHERE username = ? OR phone = ? LIMIT 1`,
      [cleanPhone, cleanPhone]
    );
    if (existingUsers.length > 0) {
      return res.status(409).json({
        success: false,
        message: 'Số điện thoại này đã có tài khoản. Vui lòng chọn Đăng nhập hoặc khôi phục mật khẩu.'
      });
    }

    // 3. Lấy role_id cho vai trò 'customer'
    let [roleRows] = await db.query(`SELECT id FROM roles WHERE name = 'customer' LIMIT 1`);
    let customerRoleId = 6;
    if (roleRows.length > 0) {
      customerRoleId = roleRows[0].id;
    } else {
      const [insertRole] = await db.query(`
        INSERT INTO roles (name, label, description)
        VALUES ('customer', 'Khách hàng', 'Khách hàng xem thực đơn trực tuyến, điểm tích lũy và voucher')
      `);
      customerRoleId = insertRole.insertId;
    }

    // 4. Kiểm tra hoặc tạo hồ sơ trong bảng `customers` (đồng bộ điểm thưởng)
    const [existingCustomer] = await db.query(
      `SELECT id, points_balance, total_spent, tier_id FROM customers WHERE phone = ? LIMIT 1`,
      [cleanPhone]
    );

    let customerId;
    let initialPoints = 50; // Quà tặng chào mừng 50 điểm
    let tierName = 'Đồng';

    if (existingCustomer.length > 0) {
      customerId = existingCustomer[0].id;
      initialPoints = existingCustomer[0].points_balance;
      // Cập nhật tên nếu trước đó chưa có tên
      await db.query(`UPDATE customers SET name = COALESCE(name, ?) WHERE id = ?`, [cleanName, customerId]);
    } else {
      const [insertCust] = await db.query(
        `INSERT INTO customers (phone, name, birthday, tier_id, points_balance, total_spent)
         VALUES (?, ?, ?, 1, ?, 0)`,
        [cleanPhone, cleanName, birthday || null, initialPoints]
      );
      customerId = insertCust.insertId;

      // Ghi nhận lịch sử tích điểm chào mừng
      await db.query(
        `INSERT INTO loyalty_transactions (customer_id, type, points)
         VALUES (?, 'earn', ?)`,
        [customerId, initialPoints]
      );
    }

    // 5. Tạo user tài khoản khách hàng
    const hash = await bcrypt.hash(password, 10);
    const userCode = `KH${String(Date.now()).slice(-6)}`;

    const [insertUser] = await db.query(
      `INSERT INTO users (code, username, password_hash, full_name, birthday, phone, email, role_id, is_active)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)`,
      [userCode, cleanPhone, hash, cleanName, birthday || null, cleanPhone, email || null, customerRoleId]
    );

    const newUserId = insertUser.insertId;

    // 6. Phát hành token truy cập
    const userPayload = {
      id: newUserId,
      username: cleanPhone,
      full_name: cleanName,
      phone: cleanPhone,
      role_name: 'customer'
    };
    const { accessToken, refreshToken } = generateTokens(userPayload);

    return res.status(201).json({
      success: true,
      message: 'Chúc mừng bạn đã đăng ký thành công! Quà tặng chào mừng 50 điểm đã được cộng vào tài khoản 🎁',
      data: {
        accessToken,
        refreshToken,
        user: {
          id: newUserId,
          username: cleanPhone,
          full_name: cleanName,
          phone: cleanPhone,
          role: 'customer',
          customer_info: {
            customer_id: customerId,
            points_balance: initialPoints,
            total_spent: 0,
            tier_name: tierName,
            discount_pct: 0
          }
        }
      }
    });
  } catch (err) {
    console.error('Register error:', err);
    res.status(500).json({ success: false, message: 'Lỗi đăng ký tài khoản: ' + err.message });
  }
};

module.exports = { login, refresh, me, register };
