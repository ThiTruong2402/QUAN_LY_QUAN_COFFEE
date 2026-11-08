const bcrypt = require('bcryptjs');
const db = require('../config/db');
const { generateTokens, verifyRefresh } = require('../utils/jwt');

// POST /api/auth/login
const login = async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password)
      return res.status(400).json({ success: false, message: 'Vui lòng nhập tài khoản và mật khẩu' });

    const [rows] = await db.query(
      `SELECT u.*, r.name AS role_name FROM users u
       JOIN roles r ON r.id = u.role_id
       WHERE u.username = ? AND u.is_active = 1`,
      [username]
    );
    if (!rows.length)
      return res.status(401).json({ success: false, message: 'Sai tài khoản hoặc mật khẩu' });

    const user = rows[0];
    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid)
      return res.status(401).json({ success: false, message: 'Sai tài khoản hoặc mật khẩu' });

    const { accessToken, refreshToken } = generateTokens({ ...user, role_name: user.role_name });

    res.json({
      success: true,
      data: {
        accessToken,
        refreshToken,
        user: { id: user.id, username: user.username, full_name: user.full_name, role: user.role_name }
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
      `SELECT u.id, u.username, u.full_name, u.phone, r.name AS role FROM users u
       JOIN roles r ON r.id = u.role_id WHERE u.id = ?`,
      [req.user.id]
    );
    if (!rows.length) return res.status(404).json({ success: false, message: 'Không tìm thấy người dùng' });
    res.json({ success: true, data: rows[0] });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

module.exports = { login, refresh, me };
