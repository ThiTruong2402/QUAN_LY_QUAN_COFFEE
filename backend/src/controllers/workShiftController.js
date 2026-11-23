const db = require('../config/db');

// GET /api/work-shifts
const getAll = async (req, res) => {
  try {
    let [rows] = await db.query(`
      SELECT ws.id, ws.shift_code, ws.user_id, ws.shift_type,
             DATE_FORMAT(ws.shift_date, '%Y-%m-%d') AS shift_date,
             ws.status, ws.note, ws.created_at,
             u.code AS user_code, u.full_name AS user_name,
             u.role_id, r.name AS role_name, COALESCE(r.description, r.label, r.name) AS role_label
      FROM work_shifts ws
      JOIN users u ON u.id = ws.user_id
      JOIN roles r ON r.id = u.role_id
      WHERE r.name NOT IN ('customer')
      ORDER BY ws.shift_date DESC, ws.id DESC
    `);

    res.json({ success: true, data: rows });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// Helper: Tự động tạo ca trực cho tuần hiện tại
const seedDefaultShifts = async () => {
  try {
    const [staff] = await db.query(`
      SELECT u.id, u.full_name, r.name as role 
      FROM users u 
      JOIN roles r ON r.id = u.role_id 
      WHERE r.name NOT IN ('customer') 
      ORDER BY u.id ASC
    `);
    if (!staff.length) return;

    const now = new Date();
    const day = now.getDay();
    const diffToMonday = day === 0 ? -6 : 1 - day;
    const monday = new Date(now);
    monday.setDate(now.getDate() + diffToMonday);

    const shiftTypes = [
      'Ca Sáng (06:30 - 14:30)',
      'Ca Tối (14:30 - 22:30)',
      'Ca Hành Chính (08:00 - 17:00)'
    ];

    for (let d = 0; d < 7; d++) {
      const curDate = new Date(monday);
      curDate.setDate(monday.getDate() + d);
      const y = curDate.getFullYear();
      const m = String(curDate.getMonth() + 1).padStart(2, '0');
      const dt = String(curDate.getDate()).padStart(2, '0');
      const dateStr = `${y}-${m}-${dt}`;

      for (let i = 0; i < staff.length; i++) {
        const u = staff[i];
        const shiftType = shiftTypes[(i + d) % shiftTypes.length];
        const note = (u.role === 'admin' || u.role === 'manager')
          ? 'Quản lý vận hành quán'
          : (u.role === 'barista' ? 'Pha chế đồ uống quầy Bar' : 'Thu ngân quầy POS');
        const code = `CA${dateStr.replace(/-/g, '').slice(4)}-${u.id}`;
        const status = d < (day === 0 ? 6 : day - 1) ? 'Đã hoàn thành' : (d === (day === 0 ? 6 : day - 1) ? 'Đang làm việc' : 'Chưa bắt đầu');

        await db.query(
          `INSERT INTO work_shifts (shift_code, user_id, shift_type, shift_date, status, note)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [code, u.id, shiftType, dateStr, status, note]
        );
      }
    }
  } catch (err) {
    console.error('Auto seed work shifts error:', err);
  }
};

// POST /api/work-shifts
const create = async (req, res) => {
  try {
    const { shift_code, user_id, shift_type, shift_date, status, note } = req.body;
    if (!user_id) return res.status(400).json({ success: false, message: 'Vui lòng chọn nhân viên' });

    const [uRows] = await db.query('SELECT r.name as role FROM users u JOIN roles r ON r.id = u.role_id WHERE u.id = ?', [user_id]);
    if (uRows.length && uRows[0].role === 'customer') {
      return res.status(400).json({ success: false, message: 'Tài khoản khách hàng không có quyền phân ca trực!' });
    }

    const genCode = shift_code && shift_code !== 'LT001'
      ? shift_code 
      : `CA${(shift_date || '').replace(/-/g, '').slice(4)}-${user_id}`;

    const [result] = await db.query(
      'INSERT INTO work_shifts (shift_code, user_id, shift_type, shift_date, status, note) VALUES (?, ?, ?, ?, ?, ?)',
      [genCode, user_id, shift_type, shift_date, status || 'Chưa bắt đầu', note || null]
    );
    res.status(201).json({ success: true, message: 'Thêm ca trực thành công', data: { id: result.insertId } });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// PUT /api/work-shifts/:id
const update = async (req, res) => {
  try {
    const { id } = req.params;
    const { shift_code, user_id, shift_type, shift_date, status, note } = req.body;

    if (user_id) {
      const [uRows] = await db.query('SELECT r.name as role FROM users u JOIN roles r ON r.id = u.role_id WHERE u.id = ?', [user_id]);
      if (uRows.length && uRows[0].role === 'customer') {
        return res.status(400).json({ success: false, message: 'Tài khoản khách hàng không có quyền phân ca trực!' });
      }
    }

    await db.query(
      'UPDATE work_shifts SET shift_code=?, user_id=?, shift_type=?, shift_date=?, status=?, note=? WHERE id=?',
      [shift_code, user_id, shift_type, shift_date, status, note, id]
    );
    res.json({ success: true, message: 'Cập nhật ca trực thành công' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// DELETE /api/work-shifts/:id
const remove = async (req, res) => {
  try {
    await db.query('DELETE FROM work_shifts WHERE id = ?', [req.params.id]);
    res.json({ success: true, message: 'Đã xóa ca trực' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// PUT /api/work-shifts/:id/assign-staff (Đổi nhân viên vào ca trực)
const assignStaff = async (req, res) => {
  try {
    const { id } = req.params;
    const { new_user_id, note } = req.body;
    if (!new_user_id) return res.status(400).json({ success: false, message: 'Vui lòng chọn nhân viên mới' });

    const [uRows] = await db.query(
      'SELECT u.id, u.full_name, r.name as role FROM users u JOIN roles r ON r.id = u.role_id WHERE u.id = ?',
      [new_user_id]
    );
    if (!uRows.length || uRows[0].role === 'customer') {
      return res.status(400).json({ success: false, message: 'Nhân viên không hợp lệ hoặc là tài khoản khách hàng!' });
    }

    const [oldShift] = await db.query(
      'SELECT ws.*, u.full_name AS old_user_name FROM work_shifts ws JOIN users u ON u.id = ws.user_id WHERE ws.id = ?',
      [id]
    );
    if (!oldShift.length) return res.status(404).json({ success: false, message: 'Không tìm thấy ca trực' });

    const changeNote = note || `Đổi người trực từ ${oldShift[0].old_user_name} sang ${uRows[0].full_name}`;
    await db.query(
      'UPDATE work_shifts SET user_id = ?, note = ? WHERE id = ?',
      [new_user_id, changeNote, id]
    );

    res.json({
      success: true,
      message: `Đã đổi nhân viên trực sang ${uRows[0].full_name} thành công!`
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// POST /api/work-shifts/swap (Hoán đổi ca trực giữa 2 nhân viên)
const swapShifts = async (req, res) => {
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    const { shift_id_1, shift_id_2 } = req.body;

    if (!shift_id_1 || !shift_id_2) {
      await conn.rollback();
      return res.status(400).json({ success: false, message: 'Vui lòng chọn 2 ca trực để hoán đổi' });
    }

    const [s1] = await conn.query(
      'SELECT ws.*, u.full_name as user_name FROM work_shifts ws JOIN users u ON u.id = ws.user_id WHERE ws.id = ?',
      [shift_id_1]
    );
    const [s2] = await conn.query(
      'SELECT ws.*, u.full_name as user_name FROM work_shifts ws JOIN users u ON u.id = ws.user_id WHERE ws.id = ?',
      [shift_id_2]
    );

    if (!s1.length || !s2.length) {
      await conn.rollback();
      return res.status(404).json({ success: false, message: 'Không tìm thấy ca trực để đổi' });
    }

    // Hoán đổi user_id giữa 2 ca
    const note1 = `${s1[0].note ? s1[0].note + ' | ' : ''}Đổi ca từ ${s1[0].user_name} sang ${s2[0].user_name}`;
    const note2 = `${s2[0].note ? s2[0].note + ' | ' : ''}Đổi ca từ ${s2[0].user_name} sang ${s1[0].user_name}`;

    await conn.query('UPDATE work_shifts SET user_id = ?, note = ? WHERE id = ?', [s2[0].user_id, note1, s1[0].id]);
    await conn.query('UPDATE work_shifts SET user_id = ?, note = ? WHERE id = ?', [s1[0].user_id, note2, s2[0].id]);

    await conn.commit();
    res.json({
      success: true,
      message: `Đã hoán đổi ca trực giữa ${s1[0].user_name} và ${s2[0].user_name} thành công!`
    });
  } catch (err) {
    await conn.rollback();
    res.status(500).json({ success: false, message: err.message });
  } finally {
    conn.release();
  }
};

// POST /api/work-shifts/generate-week (Tự động xếp lịch mẫu cả tuần cho toàn bộ nhân sự)
const generateWeek = async (req, res) => {
  try {
    const { start_date } = req.body;
    if (!start_date) {
      return res.status(400).json({ success: false, message: 'Vui lòng cung cấp ngày bắt đầu tuần' });
    }

    const [staff] = await db.query(`
      SELECT u.id, u.full_name, r.name as role 
      FROM users u 
      JOIN roles r ON r.id = u.role_id 
      WHERE r.name NOT IN ('customer') 
      ORDER BY u.id ASC
    `);
    if (!staff.length) {
      return res.status(400).json({ success: false, message: 'Chưa có nhân viên nào trong hệ thống' });
    }

    const monday = new Date(start_date);
    const shiftTypes = [
      'Ca Sáng (06:30 - 14:30)',
      'Ca Tối (14:30 - 22:30)',
      'Ca Hành Chính (08:00 - 17:00)'
    ];

    let createdCount = 0;
    for (let d = 0; d < 7; d++) {
      const curDate = new Date(monday);
      curDate.setDate(monday.getDate() + d);
      const y = curDate.getFullYear();
      const m = String(curDate.getMonth() + 1).padStart(2, '0');
      const dt = String(curDate.getDate()).padStart(2, '0');
      const dateStr = `${y}-${m}-${dt}`;

      for (let i = 0; i < staff.length; i++) {
        const u = staff[i];
        // Bỏ qua nếu nhân viên đã có ca trực vào ngày này
        const [existing] = await db.query(
          'SELECT id FROM work_shifts WHERE user_id = ? AND shift_date = ?',
          [u.id, dateStr]
        );
        if (existing.length) continue;

        const shiftType = shiftTypes[(i + d) % shiftTypes.length];
        const note = (u.role === 'admin' || u.role === 'manager')
          ? 'Quản lý vận hành quán'
          : (u.role === 'barista' ? 'Pha chế đồ uống quầy Bar' : (u.role === 'warehouse' ? 'Kiểm kê kho & xuất nguyên liệu' : 'Thu ngân / Phục vụ quầy'));
        const code = `CA${dateStr.replace(/-/g, '').slice(4)}-${u.id}`;
        const status = 'Chưa bắt đầu';

        await db.query(
          `INSERT INTO work_shifts (shift_code, user_id, shift_type, shift_date, status, note)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [code, u.id, shiftType, dateStr, status, note]
        );
        createdCount++;
      }
    }

    res.json({
      success: true,
      message: `Đã tạo tự động ${createdCount} ca trực cho tuần từ ${start_date}!`,
      createdCount
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// DELETE /api/work-shifts/week (Xóa nhanh lịch trực của cả tuần)
const clearWeek = async (req, res) => {
  try {
    const { start_date, end_date } = req.query;
    if (!start_date || !end_date) {
      return res.status(400).json({ success: false, message: 'Vui lòng cung cấp khoảng ngày cần xóa' });
    }

    const [delRes] = await db.query(
      'DELETE FROM work_shifts WHERE shift_date >= ? AND shift_date <= ?',
      [start_date, end_date]
    );

    res.json({
      success: true,
      message: `Đã xóa ${delRes.affectedRows} ca trực trong tuần từ ${start_date} đến ${end_date}`
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

module.exports = { getAll, create, update, remove, assignStaff, swapShifts, generateWeek, clearWeek };
