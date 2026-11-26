const db = require('../config/db');
const { getVietnamDateString } = require('../utils/date');

const MANUAL_STATUSES = ['Vắng có lý do', 'Nghỉ phép', 'Đã hủy'];
const ABSENCE_STATUSES = ['Vắng có lý do', 'Nghỉ phép'];
const GENERIC_SHIFT_NOTES = [
  'trực theo lịch tự động',
  'đã kiểm kê, ca sáng trực đầy đủ',
  'ca hành chính bình thường',
  'ca chiều theo phân công',
];

const validateAbsenceReason = (status, note) => {
  if (!ABSENCE_STATUSES.includes(status)) return null;
  const trimmed = String(note || '').trim();
  if (trimmed.length < 3) {
    return 'Vui lòng nhập lý do vắng cụ thể (tối thiểu 3 ký tự)!';
  }
  const lower = trimmed.toLowerCase();
  if (
    lower === '---' ||
    lower === 'không có' ||
    lower === 'khong co' ||
    lower === 'none' ||
    !/[\p{L}\p{N}]/u.test(trimmed) ||
    GENERIC_SHIFT_NOTES.some((g) => lower.includes(g))
  ) {
    return 'Ghi chú hiện tại không phải lý do vắng hợp lệ. Vui lòng nhập lý do cụ thể (VD: Nghỉ ốm, Việc gia đình...).';
  }
  return null;
};

const DEFAULT_SHIFT_WINDOWS = [
  { match: 'sáng', start: '06:30', end: '14:30' },
  { match: 'chiều', start: '14:30', end: '22:30' },
  { match: 'tối', start: '14:30', end: '22:30' },
  { match: 'hành chính', start: '08:00', end: '17:00' },
  { match: 'đêm', start: '22:30', end: '06:30' },
];

// Phân tích khoảng thời gian bắt đầu & kết thúc ca theo múi giờ Việt Nam (+07:00)
const parseShiftWindow = (shiftDate, shiftType) => {
  const dateStr = String(shiftDate || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return null;

  let startStr = '06:30';
  let endStr = '14:30';

  const timeMatch = String(shiftType || '').match(/(\d{1,2}:\d{2})\s*[-–]\s*(\d{1,2}:\d{2})/);
  if (timeMatch) {
    startStr = timeMatch[1].padStart(5, '0');
    endStr = timeMatch[2].padStart(5, '0');
  } else {
    const lower = String(shiftType || '').toLowerCase();
    const found = DEFAULT_SHIFT_WINDOWS.find((w) => lower.includes(w.match));
    if (found) {
      startStr = found.start;
      endStr = found.end;
    }
  }

  const startMs = new Date(`${dateStr}T${startStr}:00+07:00`).getTime();
  let endMs = new Date(`${dateStr}T${endStr}:00+07:00`).getTime();

  // Ca đêm kéo dài sang ngày hôm sau (VD: 22:30 - 06:30)
  if (endMs <= startMs) {
    endMs += 24 * 60 * 60 * 1000;
  }
  return { startMs, endMs };
};

// Tự động xác định trạng thái thực tế của ca trực theo giờ hiện tại
const resolveShiftStatus = (shiftDate, shiftType, currentStatus) => {
  if (MANUAL_STATUSES.includes(currentStatus)) {
    return currentStatus;
  }
  const win = parseShiftWindow(shiftDate, shiftType);
  if (!win) return currentStatus || 'Chưa bắt đầu';

  const nowMs = Date.now();
  if (nowMs < win.startMs) return 'Chưa bắt đầu';
  if (nowMs <= win.endMs) return 'Đang làm việc';
  return 'Đã hoàn thành';
};

// GET /api/work-shifts
const getAll = async (req, res) => {
  try {
    const [rows] = await db.query(`
      SELECT ws.id, ws.shift_code, ws.user_id, ws.shift_type,
             DATE_FORMAT(ws.shift_date, '%Y-%m-%d') AS shift_date,
             ws.status, ws.note, ws.created_at,
             u.code AS user_code, u.full_name AS user_name,
             u.role_id, r.name AS role_name, COALESCE(r.label, r.description, r.name) AS role_label
      FROM work_shifts ws
      JOIN users u ON u.id = ws.user_id
      JOIN roles r ON r.id = u.role_id
      WHERE r.name NOT IN ('customer') AND u.is_active = 1
      ORDER BY ws.shift_date DESC, ws.id DESC
    `);

    const staleUpdates = [];
    const normalizedRows = rows.map((row) => {
      const realStatus = resolveShiftStatus(row.shift_date, row.shift_type, row.status);
      if (realStatus !== row.status) {
        staleUpdates.push({ id: row.id, status: realStatus });
      }
      return { ...row, status: realStatus };
    });

    if (staleUpdates.length > 0) {
      await Promise.all(
        staleUpdates.map((item) =>
          db.query('UPDATE work_shifts SET status = ? WHERE id = ?', [item.status, item.id])
        )
      );
    }

    res.json({ success: true, data: normalizedRows });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// POST /api/work-shifts
const create = async (req, res) => {
  try {
    const { shift_code, user_id, shift_type, shift_date, status, note } = req.body;
    if (!user_id || !shift_date || !shift_type) {
      return res.status(400).json({ success: false, message: 'Vui lòng chọn đầy đủ nhân viên, ngày trực và ca trực' });
    }

    const [uRows] = await db.query(
      'SELECT r.name AS role FROM users u JOIN roles r ON r.id = u.role_id WHERE u.id = ?',
      [user_id]
    );
    if (!uRows.length || uRows[0].role === 'customer') {
      return res.status(400).json({ success: false, message: 'Tài khoản không hợp lệ để phân ca trực!' });
    }

    const absenceErr = validateAbsenceReason(status, note);
    if (absenceErr) {
      return res.status(400).json({ success: false, message: absenceErr });
    }

    const cleanDate = String(shift_date).slice(0, 10);
    const trimmedNote = String(note || '').trim() || null;

    const genCode = shift_code && shift_code !== 'LT001'
      ? shift_code
      : `CA${cleanDate.replace(/-/g, '').slice(4)}-${user_id}`;

    const computedStatus = resolveShiftStatus(cleanDate, shift_type, status);

    const [result] = await db.query(
      'INSERT INTO work_shifts (shift_code, user_id, shift_type, shift_date, status, note) VALUES (?, ?, ?, ?, ?, ?)',
      [genCode, user_id, shift_type, cleanDate, computedStatus, trimmedNote]
    );
    res.status(201).json({ success: true, message: 'Thêm ca trực thành công', data: { id: result.insertId, status: computedStatus, note: trimmedNote } });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// PUT /api/work-shifts/:id
const update = async (req, res) => {
  try {
    const { id } = req.params;
    const { shift_code, user_id, shift_type, shift_date, status, note } = req.body;

    const [curRows] = await db.query(
      "SELECT id, shift_code, user_id, shift_type, DATE_FORMAT(shift_date, '%Y-%m-%d') AS shift_date, status, note FROM work_shifts WHERE id = ?",
      [id]
    );
    if (!curRows.length) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy ca trực' });
    }
    const cur = curRows[0];

    const nextUserId = user_id !== undefined && user_id !== '' ? user_id : cur.user_id;
    if (nextUserId) {
      const [uRows] = await db.query(
        'SELECT r.name AS role FROM users u JOIN roles r ON r.id = u.role_id WHERE u.id = ?',
        [nextUserId]
      );
      if (!uRows.length || uRows[0].role === 'customer') {
        return res.status(400).json({ success: false, message: 'Tài khoản khách hàng không có quyền phân ca trực!' });
      }
    }

    const nextCode = shift_code !== undefined ? shift_code : cur.shift_code;
    const nextType = shift_type !== undefined ? shift_type : cur.shift_type;
    const nextDate = shift_date ? String(shift_date).slice(0, 10) : cur.shift_date;
    const requestedStatus = status !== undefined ? status : cur.status;
    const nextNote = note !== undefined ? (String(note || '').trim() || null) : cur.note;

    const absenceErr = validateAbsenceReason(requestedStatus, nextNote);
    if (absenceErr) {
      return res.status(400).json({ success: false, message: absenceErr });
    }

    const finalStatus = resolveShiftStatus(nextDate, nextType, requestedStatus);

    await db.query(
      'UPDATE work_shifts SET shift_code=?, user_id=?, shift_type=?, shift_date=?, status=?, note=? WHERE id=?',
      [nextCode, nextUserId, nextType, nextDate, finalStatus, nextNote, id]
    );
    res.json({ success: true, message: 'Cập nhật ca trực thành công', data: { status: finalStatus, note: nextNote } });
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

// POST /api/work-shifts/generate-week (Tự động xếp lịch mẫu cả tuần chuẩn GMT+7 & tính trạng thái)
const generateWeek = async (req, res) => {
  try {
    const { start_date } = req.body;
    if (!start_date) {
      return res.status(400).json({ success: false, message: 'Vui lòng cung cấp ngày bắt đầu tuần' });
    }

    const [staff] = await db.query(`
      SELECT u.id, u.full_name, r.name AS role
      FROM users u
      JOIN roles r ON r.id = u.role_id
      WHERE r.name NOT IN ('customer') AND u.is_active = 1
      ORDER BY u.id ASC
    `);
    if (!staff.length) {
      return res.status(400).json({ success: false, message: 'Chưa có nhân viên nào hoạt động' });
    }

    const monday = new Date(`${String(start_date).slice(0, 10)}T12:00:00+07:00`);
    const shiftTypes = [
      'Ca Sáng (06:30 - 14:30)',
      'Ca Chiều/Tối (14:30 - 22:30)',
      'Ca Hành Chính (08:00 - 17:00)'
    ];

    let createdCount = 0;
    for (let d = 0; d < 7; d++) {
      const curDate = new Date(monday.getTime() + d * 86400000);
      const dateStr = getVietnamDateString(curDate);

      for (let i = 0; i < staff.length; i++) {
        const u = staff[i];
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
        const computedStatus = resolveShiftStatus(dateStr, shiftType, null);

        await db.query(
          `INSERT INTO work_shifts (shift_code, user_id, shift_type, shift_date, status, note)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [code, u.id, shiftType, dateStr, computedStatus, note]
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
