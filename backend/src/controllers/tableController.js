const db = require('../config/db');

// GET /api/tables
const getAll = async (req, res) => {
  try {
    const [tables] = await db.query(
      `SELECT t.*, a.name AS area_name,
        (SELECT o.id FROM orders o WHERE o.table_id=t.id AND o.status IN ('pending', 'preparing', 'open', 'done', 'served') ORDER BY o.id DESC LIMIT 1) AS current_order_id,
        (SELECT o.code FROM orders o WHERE o.table_id=t.id AND o.status IN ('pending', 'preparing', 'open', 'done', 'served') ORDER BY o.id DESC LIMIT 1) AS current_order_code,
        (SELECT o.total FROM orders o WHERE o.table_id=t.id AND o.status IN ('pending', 'preparing', 'open', 'done', 'served') ORDER BY o.id DESC LIMIT 1) AS current_order_total,
        (SELECT o.opened_at FROM orders o WHERE o.table_id=t.id AND o.status IN ('pending', 'preparing', 'open', 'done', 'served') ORDER BY o.id DESC LIMIT 1) AS current_order_time,
        (SELECT COALESCE(SUM(oi.quantity), 0) FROM order_items oi JOIN orders o ON o.id=oi.order_id WHERE o.table_id=t.id AND o.status IN ('pending', 'preparing', 'open', 'done', 'served')) AS current_item_count
       FROM \`tables\` t 
       JOIN areas a ON a.id=t.area_id 
       ORDER BY t.id ASC`
    );
    const [areas] = await db.query('SELECT * FROM areas WHERE is_active=1 ORDER BY id ASC');
    res.json({ success: true, data: { tables, areas } });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Lỗi tải danh sách bàn: ' + err.message });
  }
};

// PUT /api/tables/:id/status
const updateStatus = async (req, res) => {
  try {
    const { status, customer_count } = req.body;
    const VALID_STATUSES = ['empty', 'occupied', 'reserved', 'disabled'];
    if (!VALID_STATUSES.includes(status)) {
      return res.status(400).json({
        success: false,
        message: `Trạng thái bàn không hợp lệ. Chỉ chấp nhận: ${VALID_STATUSES.join(', ')}`,
      });
    }

    if (status === 'empty') {
      await db.query(
        'UPDATE `tables` SET status=?, reservation_name=NULL, reservation_phone=NULL, reservation_time=NULL, reservation_note=NULL, customer_count=0 WHERE id=?',
        [status, req.params.id]
      );
      // Khi trả bàn / dọn bàn: tự động đóng đơn hàng đã phục vụ xong (served / done) thành paid
      await db.query(
        "UPDATE orders SET status='paid', closed_at=COALESCE(closed_at, NOW()) WHERE table_id=? AND status IN ('done', 'served')",
        [req.params.id]
      );
    } else {
      await db.query(
        'UPDATE `tables` SET status=?, customer_count=COALESCE(?, customer_count) WHERE id=?',
        [status, customer_count || null, req.params.id]
      );
    }

    res.json({ success: true, message: 'Cập nhật trạng thái bàn thành công' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Lỗi cập nhật bàn: ' + err.message });
  }
};

// POST /api/tables/:id/reserve
const reserveTable = async (req, res) => {
  try {
    const { reservation_name, reservation_phone, reservation_time, reservation_note, customer_count } = req.body;
    if (!reservation_name || !reservation_phone) {
      return res.status(400).json({ success: false, message: 'Vui lòng cung cấp Tên khách hàng và Số điện thoại đặt bàn' });
    }

    // Chặn ghi đè bàn đang có khách ngồi dùng đồ uống (Lỗi 7: Không đặt trước đè bàn occupied)
    const [tableRows] = await db.query('SELECT id, code, status FROM `tables` WHERE id = ?', [req.params.id]);
    if (!tableRows.length) {
      return res.status(404).json({ success: false, message: 'Bàn không tồn tại' });
    }
    const table = tableRows[0];
    if (table.status === 'occupied') {
      return res.status(400).json({
        success: false,
        message: `Bàn ${table.code} hiện đang có khách ngồi dùng đồ uống tại quán, không thể đặt trước bàn này!`
      });
    }

    await db.query(
      `UPDATE \`tables\` SET 
        status='reserved', 
        reservation_name=?, 
        reservation_phone=?, 
        reservation_time=?, 
        reservation_note=?, 
        customer_count=? 
       WHERE id=?`,
      [reservation_name, reservation_phone, reservation_time || 'Hôm nay', reservation_note || '', customer_count || 2, req.params.id]
    );

    res.json({ success: true, message: `Đặt bàn ${table.code} trước thành công` });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Lỗi đặt bàn: ' + err.message });
  }
};

// POST /api/tables/:id/cancel-reservation
const cancelReservation = async (req, res) => {
  try {
    await db.query(
      `UPDATE \`tables\` SET 
        status='empty', 
        reservation_name=NULL, 
        reservation_phone=NULL, 
        reservation_time=NULL, 
        reservation_note=NULL, 
        customer_count=0 
       WHERE id=?`,
      [req.params.id]
    );
    res.json({ success: true, message: 'Đã hủy đặt bàn thành công' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Lỗi hủy đặt bàn: ' + err.message });
  }
};

// POST /api/tables/:id/transfer
const transferTable = async (req, res) => {
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    const fromTableId = req.params.id;
    const { to_table_id } = req.body;

    if (!to_table_id || String(fromTableId) === String(to_table_id)) {
      await conn.rollback();
      return res.status(400).json({ success: false, message: 'Bàn đích không hợp lệ' });
    }

    // Kiểm tra bàn đích có trống không
    const [targetTable] = await conn.query('SELECT * FROM `tables` WHERE id=?', [to_table_id]);
    if (!targetTable.length) {
      await conn.rollback();
      return res.status(404).json({ success: false, message: 'Không tìm thấy bàn đích' });
    }

    // Chuyển tất cả đơn của bàn sang bàn đích (bao gồm đang làm, đã làm, đã phục vụ)
    await conn.query(
      "UPDATE orders SET table_id=? WHERE table_id=? AND status IN ('pending', 'preparing', 'open', 'done', 'served')",
      [to_table_id, fromTableId]
    );

    // Bàn đích thành occupied
    await conn.query("UPDATE `tables` SET status='occupied' WHERE id=?", [to_table_id]);
    // Bàn nguồn thành empty
    await conn.query("UPDATE `tables` SET status='empty', customer_count=0 WHERE id=?", [fromTableId]);

    await conn.commit();
    res.json({ success: true, message: 'Chuyển bàn thành công' });
  } catch (err) {
    await conn.rollback();
    res.status(500).json({ success: false, message: 'Lỗi chuyển bàn: ' + err.message });
  } finally {
    conn.release();
  }
};

module.exports = {
  getAll,
  updateStatus,
  reserveTable,
  cancelReservation,
  transferTable,
};
