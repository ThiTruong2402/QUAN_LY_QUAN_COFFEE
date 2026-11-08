const db = require('../config/db');

// GET /api/barista/queue
const getQueue = async (req, res) => {
  try {
    const [items] = await db.query(
      `SELECT oi.*, o.code AS order_code, t.code AS table_code,
        GROUP_CONCAT(CONCAT(oit.topping_name,'×',oit.quantity) SEPARATOR ', ') AS toppings
       FROM order_items oi
       JOIN orders o ON o.id=oi.order_id
       LEFT JOIN \`tables\` t ON t.id=o.table_id
       LEFT JOIN order_item_toppings oit ON oit.order_item_id=oi.id
       WHERE oi.status IN ('pending','preparing','done')
       GROUP BY oi.id ORDER BY oi.sent_at ASC`
    );
    res.json({ success: true, data: items });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Lỗi khi tải hàng đợi pha chế: ' + err.message });
  }
};

// PUT /api/barista/items/:id/status
const updateItemStatus = async (req, res) => {
  try {
    const { status } = req.body;
    const validStatuses = ['preparing', 'done', 'served'];
    if (!validStatuses.includes(status))
      return res.status(400).json({ success: false, message: 'Trạng thái không hợp lệ' });

    let query = 'UPDATE order_items SET status = ?';
    const params = [status];

    if (status === 'preparing') {
      query += ', started_at = IFNULL(started_at, NOW())';
    } else if (status === 'done') {
      query += ', done_at = IFNULL(done_at, NOW())';
    }
    query += ' WHERE id = ?';
    params.push(req.params.id);

    await db.query(query, params);

    // Đồng bộ trạng thái đơn hàng cha (orders.status)
    const [itemRows] = await db.query('SELECT order_id FROM order_items WHERE id = ?', [req.params.id]);
    if (itemRows.length) {
      const orderId = itemRows[0].order_id;
      const [allOrderItems] = await db.query('SELECT status FROM order_items WHERE order_id = ?', [orderId]);

      const allDoneOrServed = allOrderItems.length > 0 && allOrderItems.every(it => ['done', 'served'].includes(it.status));
      const allServed = allOrderItems.length > 0 && allOrderItems.every(it => it.status === 'served');
      const anyPreparing = allOrderItems.some(it => it.status === 'preparing');

      let newOrderStatus = null;
      if (allServed) {
        newOrderStatus = 'served';
      } else if (allDoneOrServed) {
        newOrderStatus = 'done';
      } else if (anyPreparing) {
        newOrderStatus = 'preparing';
      }

      if (newOrderStatus) {
        await db.query('UPDATE orders SET status = ? WHERE id = ? AND status != "cancelled"', [newOrderStatus, orderId]);
      }
    }

    // Phát sự kiện Socket.IO thời gian thực tới màn hình Barista & Thu ngân
    const io = req.app?.get('io');
    if (io) {
      io.emit('barista:item_updated', { itemId: req.params.id, status });
      io.emit('order:status_updated', { itemId: req.params.id, status });
    }

    res.json({ success: true, message: `Đã cập nhật trạng thái món thành ${status}` });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Lỗi khi cập nhật trạng thái món: ' + err.message });
  }
};

module.exports = { getQueue, updateItemStatus };
