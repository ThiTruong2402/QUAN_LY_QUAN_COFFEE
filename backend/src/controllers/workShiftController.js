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
      LEFT JOIN roles r ON r.id = u.role_id
      ORDER BY ws.shift_date DESC, ws.id DESC
    `);

    // Tự động khởi tạo ca trực tuần hiện tại nếu hệ thống chưa có dữ liệu ca trực
    if (rows.length === 0) {
      await seedDefaultShifts();
      const [reloaded] = await db.query(`
        SELECT ws.id, ws.shift_code, ws.user_id, ws.shift_type,
               DATE_FORMAT(ws.shift_date, '%Y-%m-%d') AS shift_date,
               ws.status, ws.note, ws.created_at,
               u.code AS user_code, u.full_name AS user_name,
               u.role_id, r.name AS role_name, COALESCE(r.description, r.label, r.name) AS role_label
        FROM work_shifts ws
        JOIN users u ON u.id = ws.user_id
        LEFT JOIN roles r ON r.id = u.role_id
        ORDER BY ws.shift_date DESC, ws.id DESC
      `);
      rows = reloaded;
    }

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
    const [result] = await db.query(
      'INSERT INTO work_shifts (shift_code, user_id, shift_type, shift_date, status, note) VALUES (?, ?, ?, ?, ?, ?)',
      [shift_code || 'LT001', user_id, shift_type, shift_date, status || 'Chưa bắt đầu', note || null]
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

module.exports = { getAll, create, update, remove };
