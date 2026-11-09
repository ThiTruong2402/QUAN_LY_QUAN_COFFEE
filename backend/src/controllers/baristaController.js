const db = require('../config/db');

// GET /api/barista/queue
// Lấy hàng đợi pha chế chi tiết kèm công thức, khách hàng, kênh bán, giờ hẹn
const getQueue = async (req, res) => {
  try {
    const [items] = await db.query(
      `SELECT oi.*, 
              o.code AS order_code, 
              t.code AS table_code, 
              a.name AS area_name,
              o.order_type,
              o.pickup_time,
              o.opened_at,
              o.status AS order_status,
              o.payment_status,
              COALESCE(c.name, 'Khách vãng lai') AS customer_name,
              COALESCE(c.phone, o.recipient_phone, '') AS customer_phone,
              GROUP_CONCAT(DISTINCT CONCAT(oit.topping_name, '×', oit.quantity) SEPARATOR ', ') AS toppings
       FROM order_items oi
       JOIN orders o ON o.id = oi.order_id
       LEFT JOIN \`tables\` t ON t.id = o.table_id
       LEFT JOIN areas a ON a.id = t.area_id
       LEFT JOIN customers c ON c.id = o.customer_id
       LEFT JOIN order_item_toppings oit ON oit.order_item_id = oi.id
       WHERE oi.status IN ('pending', 'preparing', 'done')
         AND o.status NOT IN ('cancelled', 'scheduled')
       GROUP BY oi.id 
       ORDER BY oi.sent_at ASC`
    );

    // Lấy công thức định lượng (recipes) cho các món trong hàng đợi
    const sizeIds = [...new Set(items.map(it => it.product_size_id).filter(Boolean))];
    let recipeMap = {};
    if (sizeIds.length > 0) {
      const [recipeRows] = await db.query(
        `SELECT r.product_size_id, i.name AS ingredient_name, r.quantity, i.unit
         FROM recipes r
         JOIN ingredients i ON i.id = r.ingredient_id
         WHERE r.product_size_id IN (?)
         ORDER BY r.product_size_id, i.name ASC`,
        [sizeIds]
      );
      for (const row of recipeRows) {
        if (!recipeMap[row.product_size_id]) {
          recipeMap[row.product_size_id] = [];
        }
        const numQty = parseFloat(row.quantity);
        let formattedAmount = `${numQty} ${row.unit}`;
        if (row.unit === 'kg' && numQty < 1) {
          formattedAmount = `${Math.round(numQty * 1000)}g`;
        } else if (row.unit === 'L' && numQty < 1) {
          formattedAmount = `${Math.round(numQty * 1000)}ml`;
        } else if (row.unit === 'hộp' && numQty < 1) {
          formattedAmount = `${Math.round(numQty * 380)}g (~${Math.round(numQty * 20)} muỗng)`;
        }
        recipeMap[row.product_size_id].push({
          ingredient: row.ingredient_name,
          quantity: row.quantity,
          unit: row.unit,
          display: formattedAmount
        });
      }
    }

    const enrichedItems = items.map(it => ({
      ...it,
      recipe: recipeMap[it.product_size_id] || []
    }));

    res.json({ success: true, data: enrichedItems });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Lỗi khi tải hàng đợi pha chế: ' + err.message });
  }
};

// PUT /api/barista/items/:id/status
// Cập nhật trạng thái từng món trong đơn
const updateItemStatus = async (req, res) => {
  try {
    const { status } = req.body;
    const validStatuses = ['pending', 'preparing', 'done', 'served'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ success: false, message: 'Trạng thái không hợp lệ' });
    }

    let query = 'UPDATE order_items SET status = ?';
    const params = [status];

    if (status === 'preparing') {
      query += ', started_at = IFNULL(started_at, NOW())';
    } else if (status === 'done' || status === 'served') {
      query += ', done_at = IFNULL(done_at, NOW())';
    }
    query += ' WHERE id = ?';
    params.push(req.params.id);

    await db.query(query, params);

    // Đồng bộ trạng thái đơn hàng cha (orders.status)
    const [itemRows] = await db.query('SELECT order_id FROM order_items WHERE id = ?', [req.params.id]);
    if (itemRows.length) {
      const orderId = itemRows[0].order_id;
      const [allOrderItems] = await db.query('SELECT status FROM order_items WHERE order_id = ? AND status != "cancelled"', [orderId]);

      const allServed = allOrderItems.length > 0 && allOrderItems.every(it => it.status === 'served');
      const allDoneOrServed = allOrderItems.length > 0 && allOrderItems.every(it => ['done', 'served'].includes(it.status));
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
        await db.query('UPDATE orders SET status = ? WHERE id = ? AND status NOT IN ("cancelled", "paid")', [newOrderStatus, orderId]);
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

// PUT /api/barista/orders/:orderId/status
// Cập nhật hàng loạt tất cả món của 1 đơn hàng (Pha nhanh cả đơn)
const updateOrderStatus = async (req, res) => {
  try {
    const { orderId } = req.params;
    const { status } = req.body;
    const validStatuses = ['preparing', 'done', 'served'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ success: false, message: 'Trạng thái không hợp lệ' });
    }

    let itemQuery = 'UPDATE order_items SET status = ?';
    if (status === 'preparing') {
      itemQuery += ', started_at = IFNULL(started_at, NOW())';
    } else if (status === 'done' || status === 'served') {
      itemQuery += ', done_at = IFNULL(done_at, NOW())';
    }
    itemQuery += ' WHERE order_id = ? AND status != "cancelled"';
    await db.query(itemQuery, [status, orderId]);

    // Cập nhật trạng thái đơn hàng cha
    await db.query('UPDATE orders SET status = ? WHERE id = ? AND status NOT IN ("cancelled", "paid")', [status, orderId]);

    // Phát sự kiện Socket.IO
    const io = req.app?.get('io');
    if (io) {
      io.emit('barista:item_updated', { orderId, status });
      io.emit('order:status_updated', { orderId, status });
    }

    res.json({ success: true, message: `Đã cập nhật toàn bộ món của đơn #${orderId} sang ${status}` });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Lỗi khi cập nhật đơn hàng: ' + err.message });
  }
};

module.exports = { getQueue, updateItemStatus, updateOrderStatus };
