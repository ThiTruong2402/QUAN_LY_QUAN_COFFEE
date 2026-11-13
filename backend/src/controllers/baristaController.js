const db = require('../config/db');

// GET /api/barista/queue
// Lấy hàng đợi pha chế chi tiết kèm công thức, quy trình chuẩn hóa, khách hàng, kênh bán, phân loại đồ uống vs đồ đóng gói
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
              p.category_id,
              cat.name AS category_name,
              oit_agg.toppings
       FROM order_items oi
       JOIN orders o ON o.id = oi.order_id
       LEFT JOIN \`tables\` t ON t.id = o.table_id
       LEFT JOIN areas a ON a.id = t.area_id
       LEFT JOIN customers c ON c.id = o.customer_id
       LEFT JOIN product_sizes ps ON ps.id = oi.product_size_id
       LEFT JOIN products p ON p.id = ps.product_id
       LEFT JOIN categories cat ON cat.id = p.category_id
       LEFT JOIN (
         SELECT order_item_id, GROUP_CONCAT(CONCAT(topping_name, '×', quantity) SEPARATOR ', ') AS toppings
         FROM order_item_toppings
         GROUP BY order_item_id
       ) oit_agg ON oit_agg.order_item_id = oi.id
       WHERE oi.status IN ('pending', 'preparing', 'done')
         AND o.status NOT IN ('cancelled', 'scheduled')
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

    const enrichedItems = items.map(it => {
      const rec = recipeMap[it.product_size_id] || [];
      const catId = Number(it.category_id);
      // Đồ đóng gói lấy liền chỉ áp dụng cho nhóm Đồ ăn vặt & Hạt (category_id = 9)
      const isPackaged = catId === 9 || (String(it.category_name || '').includes('ăn vặt') || String(it.category_name || '').includes('Hạt'));

      // Quy trình chuẩn hóa barista theo chủng loại món
      let steps = [];
      if (isPackaged) {
        steps = [
          'Lấy gói/hũ sản phẩm từ quầy trưng bày',
          'Kiểm tra hạn sử dụng và tem niêm phong',
          'Giao trực tiếp cho khách hoặc nhân viên phục vụ'
        ];
      } else if (catId === 4 || String(it.category_name || '').includes('Bánh')) {
        steps = [
          'Lấy bánh từ tủ mát bảo quản',
          'Hâm nóng bằng lò vi sóng/nướng 30-45 giây (nếu có yêu cầu)',
          'Đặt lên đĩa trang trí và kèm nĩa thìa phục vụ'
        ];
      } else if (catId === 1 || String(it.category_name || '').includes('Cà phê')) {
        steps = [
          'Xay và chiết xuất espresso theo định lượng chuẩn',
          'Đánh sữa / phối trộn đường sữa theo ghi chú khách',
          'Thêm đá, rót ly và đậy nắp / dán màng ly mang về'
        ];
      } else if (catId === 2 || String(it.category_name || '').includes('Trà')) {
        steps = [
          'Đong cốt trà nền và siro theo công thức',
          'Lắc đều với đá lạnh trong bình shaker',
          'Thêm topping (nếu có), rót ly và cắm ống hút'
        ];
      } else {
        steps = [
          'Kiểm tra định lượng nguyên liệu theo công thức',
          'Pha chế / xay nhuyễn theo công thức chuẩn',
          'Decor topping và bàn giao tại quầy xuất món'
        ];
      }

      return {
        ...it,
        recipe: rec,
        is_packaged: isPackaged,
        workflow_steps: steps
      };
    });

    res.json({ success: true, data: enrichedItems });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Lỗi khi tải hàng đợi pha chế: ' + err.message });
  }
};

// PUT /api/barista/items/:id/status
// Cập nhật trạng thái từng món trong đơn và đồng bộ trạng thái đơn hàng cha
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
    let orderId = null;
    let newOrderStatus = null;

    if (itemRows.length) {
      orderId = itemRows[0].order_id;
      const [allOrderItems] = await db.query('SELECT status FROM order_items WHERE order_id = ? AND status != "cancelled"', [orderId]);

      const allServed = allOrderItems.length > 0 && allOrderItems.every(it => it.status === 'served');
      const allDoneOrServed = allOrderItems.length > 0 && allOrderItems.every(it => ['done', 'served'].includes(it.status));
      const anyPreparing = allOrderItems.some(it => it.status === 'preparing');
      const anyDone = allOrderItems.some(it => it.status === 'done');
      const allPending = allOrderItems.length > 0 && allOrderItems.every(it => it.status === 'pending');

      if (allServed) {
        newOrderStatus = 'served';
      } else if (allDoneOrServed) {
        newOrderStatus = 'done';
      } else if (anyPreparing || anyDone) {
        newOrderStatus = 'preparing';
      } else if (allPending) {
        newOrderStatus = 'pending';
      }

      if (newOrderStatus) {
        let updateOrderSql = 'UPDATE orders SET status = ?';
        if (newOrderStatus === 'served') {
          updateOrderSql += ', closed_at = IFNULL(closed_at, NOW())';
        }
        updateOrderSql += ' WHERE id = ? AND status != "cancelled"';
        await db.query(updateOrderSql, [newOrderStatus, orderId]);

        // Nếu toàn bộ đơn đã trả món (served), giải phóng bàn ăn nếu có
        if (newOrderStatus === 'served') {
          const [orderRows] = await db.query('SELECT table_id FROM orders WHERE id = ?', [orderId]);
          if (orderRows.length && orderRows[0].table_id) {
            const tableId = orderRows[0].table_id;
            const [activeOrders] = await db.query(
              'SELECT id FROM orders WHERE table_id = ? AND id != ? AND status IN ("pending", "preparing", "open")',
              [tableId, orderId]
            );
            if (!activeOrders.length) {
              await db.query('UPDATE `tables` SET status = "empty" WHERE id = ?', [tableId]);
              const io = req.app?.get('io');
              if (io) io.emit('table:status_updated', { tableId, status: 'empty' });
            }
          }
        }
      }
    }

    // Phát sự kiện Socket.IO thời gian thực chuẩn hóa cho toàn hệ thống
    const io = req.app?.get('io');
    if (io) {
      io.emit('barista:item_updated', { itemId: req.params.id, orderId, status });
      io.emit('order:status_updated', {
        id: orderId,
        orderId,
        status: newOrderStatus || status,
        itemId: req.params.id,
        itemStatus: status
      });
    }

    res.json({
      success: true,
      message: `Đã cập nhật trạng thái món thành ${status}`,
      data: { itemId: req.params.id, orderId, itemStatus: status, orderStatus: newOrderStatus }
    });
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
    let orderQuery = 'UPDATE orders SET status = ?';
    if (status === 'served') {
      orderQuery += ', closed_at = IFNULL(closed_at, NOW())';
    }
    orderQuery += ' WHERE id = ? AND status != "cancelled"';
    await db.query(orderQuery, [status, orderId]);

    // Giải phóng bàn ăn nếu chuyển sang served
    if (status === 'served') {
      const [orderRows] = await db.query('SELECT table_id FROM orders WHERE id = ?', [orderId]);
      if (orderRows.length && orderRows[0].table_id) {
        const tableId = orderRows[0].table_id;
        const [activeOrders] = await db.query(
          'SELECT id FROM orders WHERE table_id = ? AND id != ? AND status IN ("pending", "preparing", "open")',
          [tableId, orderId]
        );
        if (!activeOrders.length) {
          await db.query('UPDATE `tables` SET status = "empty" WHERE id = ?', [tableId]);
          const io = req.app?.get('io');
          if (io) io.emit('table:status_updated', { tableId, status: 'empty' });
        }
      }
    }

    // Phát sự kiện Socket.IO chuẩn hóa
    const io = req.app?.get('io');
    if (io) {
      io.emit('barista:item_updated', { orderId: Number(orderId), status });
      io.emit('order:status_updated', { id: Number(orderId), orderId: Number(orderId), status });
    }

    res.json({
      success: true,
      message: `Đã cập nhật toàn bộ món của đơn #${orderId} sang ${status}`,
      data: { orderId: Number(orderId), status }
    });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Lỗi khi cập nhật đơn hàng: ' + err.message });
  }
};

module.exports = { getQueue, updateItemStatus, updateOrderStatus };
