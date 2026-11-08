const db = require('../config/db');

// GET /api/work-shifts
const getAll = async (req, res) => {
  try {
    const [rows] = await db.query(`
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
    res.json({ success: true, data: rows });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
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
