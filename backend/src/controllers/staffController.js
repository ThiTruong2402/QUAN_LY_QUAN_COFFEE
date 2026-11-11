const bcrypt = require('bcryptjs');
const db = require('../config/db');
const { logAudit } = require('../services/auditLogger');

// GET /api/staff
const getAll = async (req, res) => {
  try {
    const [users] = await db.query(
      `SELECT u.id, u.code, u.username, u.full_name, u.birthday, u.gender, u.email, u.phone, u.role_id, u.is_active, u.created_at,
              r.name AS role_name, r.label AS role_label
       FROM users u
       JOIN roles r ON r.id = u.role_id
       ORDER BY u.id`
    );
    const [roles] = await db.query('SELECT * FROM roles ORDER BY id');
    res.json({ success: true, data: { users, roles } });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// POST /api/staff
const create = async (req, res) => {
  try {
    const { code, username, password, full_name, birthday, gender, email, phone, role_id } = req.body;
    if (!username || !password || !full_name) {
      return res.status(400).json({ success: false, message: 'Vui lòng điền đủ tên đăng nhập, mật khẩu và họ tên' });
    }

    const [existing] = await db.query('SELECT id FROM users WHERE username = ?', [username]);
    if (existing.length) {
      return res.status(400).json({ success: false, message: 'Tên đăng nhập đã tồn tại' });
    }

    // Nghiệp vụ: Quản lý chỉ được tạo nhân viên vận hành, không được tạo Admin hoặc Quản lý khác
    if (req.user?.role === 'manager') {
      const [roleInfo] = await db.query('SELECT name FROM roles WHERE id = ?', [role_id || 2]);
      if (roleInfo.length && ['admin', 'manager'].includes(roleInfo[0].name)) {
        return res.status(403).json({ success: false, message: 'Quản lý chỉ có quyền tạo tài khoản nhân viên (Thu ngân, Pha chế, Phục vụ, Thủ kho)!' });
      }
    }

    const hash = await bcrypt.hash(password, 10);
    const [result] = await db.query(
      'INSERT INTO users (code, username, password_hash, full_name, birthday, gender, email, phone, role_id, is_active) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1)',
      [code || null, username, hash, full_name, birthday || null, gender || 'Nam', email || null, phone || null, role_id || 2]
    );

    logAudit({
      userId: req.user?.id || null,
      action: 'CREATE_STAFF',
      entityType: 'USER',
      entityId: result.insertId,
      reason: `Tạo tài khoản nhân sự [${username}] (${full_name}), vai trò ID: ${role_id}`,
      ipAddress: req.ip
    });

    res.status(201).json({ success: true, message: 'Tạo tài khoản nhân viên thành công', data: { id: result.insertId } });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// PUT /api/staff/:id
const update = async (req, res) => {
  try {
    const { id } = req.params;
    const { code, full_name, birthday, gender, email, phone, role_id, is_active, password } = req.body;

    if (!full_name || !String(full_name).trim()) {
      return res.status(400).json({ success: false, message: 'Họ và tên không được để trống' });
    }

    // Bảo mật: Không cho phép Admin tự vô hiệu hóa tài khoản của chính mình
    if (Number(id) === req.user?.id && Number(is_active) === 0) {
      return res.status(400).json({ success: false, message: 'Không thể tự vô hiệu hóa tài khoản quản trị đang đăng nhập!' });
    }

    // Nghiệp vụ: Quản lý không được sửa tài khoản Admin và không được thăng cấp lên Admin/Quản lý
    if (req.user?.role === 'manager') {
      const [targetRows] = await db.query(
        'SELECT u.role_id, r.name as role_name FROM users u JOIN roles r ON r.id = u.role_id WHERE u.id = ?',
        [id]
      );
      if (targetRows.length && ['admin', 'manager'].includes(targetRows[0].role_name)) {
        return res.status(403).json({ success: false, message: 'Quản lý không có quyền chỉnh sửa tài khoản Admin hoặc Quản lý!' });
      }
      if (role_id) {
        const [newRoleRows] = await db.query('SELECT name FROM roles WHERE id = ?', [role_id]);
        if (newRoleRows.length && ['admin', 'manager'].includes(newRoleRows[0].name)) {
          return res.status(403).json({ success: false, message: 'Quản lý không có quyền thăng cấp tài khoản lên Admin hoặc Quản lý!' });
        }
      }
    }

    let query = 'UPDATE users SET code = COALESCE(?, code), full_name = ?, birthday = ?, gender = ?, email = ?, phone = ?, role_id = COALESCE(?, role_id), is_active = COALESCE(?, is_active)';
    const params = [code || null, full_name.trim(), birthday || null, gender || 'Khác', email || null, phone || null, role_id || null, is_active !== undefined ? is_active : 1];

    if (password && String(password).trim()) {
      const hash = await bcrypt.hash(password, 10);
      query += ', password_hash = ?';
      params.push(hash);
    }

    query += ' WHERE id = ?';
    params.push(id);

    await db.query(query, params);

    logAudit({
      userId: req.user?.id || null,
      action: 'UPDATE_STAFF',
      entityType: 'USER',
      entityId: id,
      reason: `Cập nhật thông tin / phân quyền nhân viên ID #${id} (${full_name.trim()})`,
      ipAddress: req.ip
    });

    res.json({ success: true, message: 'Cập nhật nhân viên thành công' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Lỗi cập nhật nhân viên: ' + err.message });
  }
};

// DELETE /api/staff/:id
const remove = async (req, res) => {
  try {
    const { id } = req.params;
    if (Number(id) === req.user?.id) {
      return res.status(400).json({ success: false, message: 'Không thể xóa tài khoản của chính mình đang đăng nhập' });
    }
    // Soft delete: chuyển sang trạng thái Nghỉ việc (is_active = 0) để tránh vỡ FK và lưu trữ lịch sử
    await db.query('UPDATE users SET is_active = 0 WHERE id = ?', [id]);

    logAudit({
      userId: req.user?.id || null,
      action: 'DELETE_STAFF',
      entityType: 'USER',
      entityId: id,
      reason: `Chuyển nhân sự ID #${id} sang trạng thái Nghỉ việc / Khóa tài khoản`,
      ipAddress: req.ip
    });

    res.json({ success: true, message: 'Đã chuyển nhân viên sang trạng thái Nghỉ việc' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

module.exports = { getAll, create, update, remove };
