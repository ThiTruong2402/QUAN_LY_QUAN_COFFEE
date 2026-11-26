const db = require('../config/db');
const { getVietnamDateString, getVietnamDateNumber } = require('../utils/date');
const storeService = require('../services/storeSettingsService');
const { logAudit } = require('../services/auditLogger');
const orderService = require('../services/orderService');
const loyaltyService = require('../services/loyaltyService');
const inventoryService = require('../services/inventoryService');
const pricingService = require('../services/pricingService');

// In-memory idempotency & anti-spam lock (ngăn chặn race-condition, double-click / spam request liên tục trong 3s)
const recentOrderLocks = new Map();

// Helper: generate order code — dùng document_counters để tránh race condition và chuẩn múi giờ VN
const genOrderCode = async (conn) => {
  const db = conn || require('../config/db');
  const today = getVietnamDateString();
  const dateNum = getVietnamDateNumber();
  await db.query(
    `INSERT INTO document_counters (prefix, last_date, seq) VALUES ('DH', ?, 1)
     ON DUPLICATE KEY UPDATE seq = IF(last_date=VALUES(last_date), seq+1, 1), last_date=VALUES(last_date)`,
    [today]
  );
  const [counter] = await db.query("SELECT seq FROM document_counters WHERE prefix='DH'");
  return `DH${dateNum}-${String(counter[0].seq).padStart(4, '0')}`;
};

// Helper: hoàn trả nguyên liệu kho khi hủy đơn (BUG-03)
const rollbackInventoryForOrder = async (conn, orderId, userId) => {
  const [alreadyReturned] = await conn.query(
    'SELECT id FROM stock_movements WHERE ref_type = "orders" AND ref_id = ? AND movement_type = "void_return"',
    [orderId]
  );
  if (!alreadyReturned.length) {
    const [sales] = await conn.query(
      'SELECT ingredient_id, quantity, unit_cost FROM stock_movements WHERE ref_type = "orders" AND ref_id = ? AND movement_type = "sale"',
      [orderId]
    );
    for (const s of sales) {
      const [ingRows] = await conn.query('SELECT current_stock, avg_cost FROM ingredients WHERE id = ? FOR UPDATE', [s.ingredient_id]);
      if (ingRows.length) {
        const current = parseFloat(ingRows[0].current_stock);
        const newBal = current + parseFloat(s.quantity);
        await conn.query('UPDATE ingredients SET current_stock = ? WHERE id = ?', [newBal, s.ingredient_id]);
        await conn.query(
          'INSERT INTO stock_movements (ingredient_id, movement_type, quantity, unit_cost, balance_after, ref_type, ref_id, note, created_by) VALUES (?, "void_return", ?, ?, ?, "orders", ?, ?, ?)',
          [s.ingredient_id, s.quantity, ingRows[0].avg_cost, newBal, orderId, `Hoàn trả nguyên liệu do hủy đơn #${orderId}`, userId || 1]
        );
      }
    }
  }
};

// GET /api/orders  (open orders)
const getOpen = async (req, res) => {
  try {
    const [orders] = await db.query(
      `SELECT o.*, t.code AS table_code, u.full_name AS created_by_name
       FROM orders o
       LEFT JOIN \`tables\` t ON t.id = o.table_id
       LEFT JOIN users u ON u.id = o.created_by
       WHERE o.status = 'open' ORDER BY o.opened_at DESC`
    );
    res.json({ success: true, data: orders });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// GET /api/orders/:id
const getOne = async (req, res) => {
  try {
    const [orders] = await db.query(
      `SELECT o.*, t.code AS table_code FROM orders o
       LEFT JOIN \`tables\` t ON t.id=o.table_id WHERE o.id=?`,
      [req.params.id]
    );
    if (!orders.length) return res.status(404).json({ success: false, message: 'Không tìm thấy đơn' });

    // Bảo mật IDOR: Khách hàng chỉ được xem chi tiết đơn hàng của chính mình
    if (req.user?.role === 'customer') {
      const userPhone = req.user.phone || req.user.username;
      const [custRows] = await db.query('SELECT id FROM customers WHERE phone = ? LIMIT 1', [userPhone]);
      const customerId = custRows.length ? custRows[0].id : null;
      const order = orders[0];
      const isOwner = (order.created_by === req.user.id) ||
                      (customerId && order.customer_id === customerId) ||
                      (userPhone && order.recipient_phone === userPhone);
      if (!isOwner) {
        return res.status(403).json({ success: false, message: 'Bạn không có quyền xem thông tin đơn hàng của người khác!' });
      }
    }

    const [items] = await db.query(
      `SELECT oi.*, GROUP_CONCAT(CONCAT(oit.topping_name,'(',oit.quantity,')') SEPARATOR ', ') AS toppings_summary
       FROM order_items oi
       LEFT JOIN order_item_toppings oit ON oit.order_item_id=oi.id
       WHERE oi.order_id=? GROUP BY oi.id`,
      [req.params.id]
    );
    res.json({ success: true, data: { ...orders[0], items } });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// POST /api/orders
const create = async (req, res) => {
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    const { table_id, order_type = 'dine_in', customer_id, cash_shift_id } = req.body;

    // BR-01: check existing open order for table
    if (table_id) {
      const [existing] = await conn.query(
        "SELECT id FROM orders WHERE table_id=? AND status='open' FOR UPDATE",
        [table_id]
      );
      if (existing.length) {
        await conn.rollback();
        return res.json({ success: true, data: { id: existing[0].id }, message: 'Đơn đang mở' });
      }
    }

    const code = await genOrderCode(conn);
    const [result] = await conn.query(
      `INSERT INTO orders (code, order_type, table_id, customer_id, cash_shift_id, created_by)
       VALUES (?,?,?,?,?,?)`,
      [code, order_type, table_id || null, customer_id || null, cash_shift_id || null, req.user.id]
    );

    if (table_id) {
      await conn.query("UPDATE `tables` SET status='occupied' WHERE id=?", [table_id]);
    }

    await conn.commit();
    res.status(201).json({ success: true, data: { id: result.insertId, code } });
  } catch (err) {
    await conn.rollback();
    res.status(500).json({ success: false, message: err.message });
  } finally {
    conn.release();
  }
};

// POST /api/orders/:id/items
const addItem = async (req, res) => {
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    const { product_size_id, quantity, note, toppings = [] } = req.body;

    const validQty = parseInt(quantity, 10);
    if (isNaN(validQty) || validQty <= 0) {
      await conn.rollback();
      return res.status(400).json({ success: false, message: 'Số lượng món phải lớn hơn 0' });
    }

    const [sizes] = await conn.query(
      `SELECT ps.*, p.name AS product_name FROM product_sizes ps
       JOIN products p ON p.id=ps.product_id WHERE ps.id=?`,
      [product_size_id]
    );
    if (!sizes.length) throw new Error('Size không tồn tại');
    const size = sizes[0];

    let toppingsTotal = 0;
    const validatedToppings = [];
    for (const t of toppings) {
      if (!t.topping_id) continue;
      const [topRows] = await conn.query('SELECT name, price FROM toppings WHERE id = ?', [t.topping_id]);
      if (topRows.length) {
        const topPrice = Number(topRows[0].price);
        const topQty = Math.max(1, parseInt(t.quantity, 10) || 1);
        toppingsTotal += topPrice * topQty;
        validatedToppings.push({
          topping_id: t.topping_id,
          topping_name: topRows[0].name,
          price: topPrice,
          quantity: topQty
        });
      }
    }
    const lineTotal = (size.price + toppingsTotal) * validQty;

    const [r] = await conn.query(
      `INSERT INTO order_items (order_id, product_size_id, product_name, size_name, unit_price, quantity, toppings_total, line_total, note)
       VALUES (?,?,?,?,?,?,?,?,?)`,
      [req.params.id, product_size_id, size.product_name, size.name, size.price, validQty, toppingsTotal, lineTotal, note || null]
    );

    for (const t of validatedToppings) {
      await conn.query(
        `INSERT INTO order_item_toppings (order_item_id, topping_id, topping_name, price, quantity)
         VALUES (?,?,?,?,?)`,
        [r.insertId, t.topping_id, t.topping_name, t.price, t.quantity]
      );
    }

    // Update order subtotal
    await conn.query(
      `UPDATE orders SET subtotal=subtotal+?, total=total+? WHERE id=?`,
      [lineTotal, lineTotal, req.params.id]
    );

    await conn.commit();
    res.status(201).json({ success: true, data: { id: r.insertId } });
  } catch (err) {
    await conn.rollback();
    res.status(500).json({ success: false, message: err.message });
  } finally {
    conn.release();
  }
};

// POST /api/orders/:id/send  (gửi món xuống pha chế)
const sendItems = async (req, res) => {
  try {
    const [result] = await db.query(
      `UPDATE order_items SET status='pending', sent_at=NOW()
       WHERE order_id=? AND status='unsent'`,
      [req.params.id]
    );
    res.json({ success: true, data: { affected: result.affectedRows } });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// POST /api/orders/:id/cancel-item/:itemId
const cancelItem = async (req, res) => {
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    const { cancel_reason } = req.body;
    await conn.query(
      `UPDATE order_items SET status='cancelled', cancel_reason=?, cancelled_by=?
       WHERE id=? AND order_id=?`,
      [cancel_reason || null, req.user?.id || 1, req.params.itemId, req.params.id]
    );

    // Tính lại subtotal và total của đơn hàng dựa trên các món còn lại không bị hủy
    const [subRows] = await conn.query(
      "SELECT IFNULL(SUM(line_total), 0) AS new_subtotal FROM order_items WHERE order_id = ? AND status != 'cancelled'",
      [req.params.id]
    );
    const newSubtotal = Number(subRows[0]?.new_subtotal || 0);
    const [orderRows] = await conn.query('SELECT discount_total, vat_amount FROM orders WHERE id = ?', [req.params.id]);
    const discount = Number(orderRows[0]?.discount_total || 0);
    const vat = Number(orderRows[0]?.vat_amount || 0);
    const newTotal = Math.max(0, newSubtotal - discount + vat);

    await conn.query(
      'UPDATE orders SET subtotal = ?, total = ? WHERE id = ?',
      [newSubtotal, newTotal, req.params.id]
    );

    await conn.commit();
    res.json({ success: true, data: { subtotal: newSubtotal, total: newTotal } });
  } catch (err) {
    await conn.rollback();
    res.status(500).json({ success: false, message: 'Lỗi khi hủy món: ' + err.message });
  } finally {
    conn.release();
  }
};

// POST /api/orders/:id/pay
const pay = async (req, res) => {
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    const { payments, customer_id } = req.body;
    const orderId = req.params.id;

    // Lock order
    const [orders] = await conn.query(
      "SELECT * FROM orders WHERE id=? AND status='open' FOR UPDATE",
      [orderId]
    );
    if (!orders.length) throw new Error('Đơn không hợp lệ hoặc đã thanh toán');
    const order = orders[0];

    // Generate invoice number (Giờ chuẩn VN)
    const today = getVietnamDateString();
    const dateNum = getVietnamDateNumber();
    await conn.query(
      `INSERT INTO document_counters (prefix, last_date, seq) VALUES ('HD', ?, 1)
       ON DUPLICATE KEY UPDATE seq = IF(last_date=VALUES(last_date), seq+1, 1), last_date=VALUES(last_date)`,
      [today]
    );
    const [counter] = await conn.query("SELECT seq FROM document_counters WHERE prefix='HD'");
    const invoiceNo = `HD${dateNum}-${String(counter[0].seq).padStart(4, '0')}`;

    // Create invoice
    await conn.query(
      `INSERT INTO invoices (invoice_no, order_id, subtotal, discount, service_fee, vat, total)
       VALUES (?,?,?,?,?,?,?)`,
      [invoiceNo, orderId, order.subtotal, order.discount_total, order.service_fee, order.vat_amount, order.total]
    );

    const methodMap = {
      'Tiền mặt': 'cash',
      'cash': 'cash',
      'Thẻ ngân hàng': 'card',
      'card': 'card',
      'Chuyển khoản': 'bank_transfer',
      'QR Banking': 'bank_transfer',
      'Ví MoMo': 'bank_transfer',
      'ZaloPay': 'bank_transfer',
      'bank_transfer': 'bank_transfer',
      'points': 'points',
    };

    // Safe Payments Handling: Phòng chống crash nếu client không gửi mảng payments
    const paymentList = Array.isArray(payments) && payments.length > 0
      ? payments
      : [{ method: 'cash', amount: order.total }];

    // BIZ-02: Kiểm tra tổng số tiền thanh toán có đủ không
    const totalPaid = paymentList.reduce((sum, p) => sum + Number(p.amount || 0), 0);
    if (totalPaid < Number(order.total)) {
      await conn.rollback();
      return res.status(400).json({
        success: false,
        message: `Số tiền thanh toán (${totalPaid.toLocaleString('vi-VN')} đ) chưa đủ! Tổng đơn hàng là ${Number(order.total).toLocaleString('vi-VN')} đ`
      });
    }

    // Record payments
    for (const p of paymentList) {
      const pm = methodMap[p.method] || 'cash';
      const pAmount = Number(p.amount || order.total);
      if (pAmount > 0) {
        await conn.query(
          `INSERT INTO payments (order_id, cash_shift_id, method, amount, created_by)
           VALUES (?,?,?,?,?)`,
          [orderId, order.cash_shift_id, pm, pAmount, req.user?.id || 1]
        );
      }
    }

    // Deduct stock for order items
    const [orderItems] = await conn.query(
      'SELECT product_size_id, quantity, product_name FROM order_items WHERE order_id = ? AND status != "cancelled"',
      [orderId]
    );
    for (const item of orderItems) {
      const [recipeRows] = await conn.query(
        'SELECT ingredient_id, quantity FROM recipes WHERE product_size_id = ?',
        [item.product_size_id]
      );
      for (const rec of recipeRows) {
        const consumed = Number(rec.quantity) * Number(item.quantity);
        const [ingRows] = await conn.query(
          'SELECT current_stock, avg_cost FROM ingredients WHERE id = ? FOR UPDATE',
          [rec.ingredient_id]
        );
        if (ingRows.length) {
          const current = parseFloat(ingRows[0].current_stock);
          const newBalance = Math.max(0, current - consumed);
          await conn.query(
            'UPDATE ingredients SET current_stock = ? WHERE id = ?',
            [newBalance, rec.ingredient_id]
          );
          await conn.query(
            `INSERT INTO stock_movements (ingredient_id, movement_type, quantity, unit_cost, balance_after, ref_type, ref_id, note, created_by)
             VALUES (?, 'sale', ?, ?, ?, 'orders', ?, ?, ?)`,
            [rec.ingredient_id, consumed, ingRows[0].avg_cost, newBalance, orderId, `Bán món ${item.product_name} (${order.code})`, req.user.id]
          );
        }
      }
    }

    // BIZ-02: Cập nhật đồng bộ status = 'paid' VÀ payment_status = 'paid'
    await conn.query(
      "UPDATE orders SET status='paid', payment_status='paid', closed_at=NOW() WHERE id=?", [orderId]
    );
    if (order.table_id) {
      await conn.query("UPDATE `tables` SET status='empty' WHERE id=?", [order.table_id]);
    }

    // Loyalty points (10,000 VND = 1 point)
    if (customer_id || order.customer_id) {
      const cid = customer_id || order.customer_id;
      const pts = Math.floor(order.total / 10000);
      if (pts > 0) {
        await conn.query('UPDATE customers SET points_balance=points_balance+?, total_spent=total_spent+? WHERE id=?', [pts, order.total, cid]);
        await conn.query(
          'INSERT INTO loyalty_transactions (customer_id, order_id, type, points) VALUES (?,?,?,?)',
          [cid, orderId, 'earn', pts]
        );
      }
    }

    await conn.commit();
    res.json({ success: true, data: { invoiceNo } });
  } catch (err) {
    await conn.rollback();
    res.status(500).json({ success: false, message: err.message });
  } finally {
    conn.release();
  }
};

// GET /api/orders/all
const getAllOrders = async (req, res) => {
  try {
    const { search, from, to, status } = req.query;
    let query = `
      SELECT o.*, t.code AS table_code, a.name AS area_name,
             c.name AS customer_name, c.phone AS customer_phone,
             u.full_name AS created_by_name,
             (SELECT p.method FROM payments p WHERE p.order_id = o.id AND p.type = 'payment' ORDER BY p.id DESC LIMIT 1) AS payment_method,
             inv.invoice_no,
             (SELECT GROUP_CONCAT(CONCAT(oi.product_name, ' (', oi.size_name, ') x', oi.quantity) SEPARATOR ', ') 
              FROM order_items oi WHERE oi.order_id = o.id AND oi.status != 'cancelled') AS items_summary
      FROM orders o
      LEFT JOIN tables t ON t.id = o.table_id
      LEFT JOIN areas a ON a.id = t.area_id
      LEFT JOIN customers c ON c.id = o.customer_id
      LEFT JOIN users u ON u.id = o.created_by
      LEFT JOIN invoices inv ON inv.order_id = o.id
      WHERE 1=1
    `;
    const params = [];
    if (search) {
      query += ' AND (o.code LIKE ? OR c.name LIKE ? OR c.phone LIKE ? OR inv.invoice_no LIKE ?)';
      params.push(`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`);
    }
    if (status && status !== 'Tất cả trạng thái') {
      const stMap = {
        'Đã thanh toán': 'paid',
        'Đang chờ làm': 'pending',
        'Đang pha chế': 'preparing',
        'Đã pha xong': 'done',
        'Đã phục vụ': 'served',
        'Đang xử lý': 'open',
        'Đã hủy': 'cancelled',
      };
      query += ' AND o.status = ?';
      params.push(stMap[status] || status);
    }
    if (from) {
      query += ' AND DATE(o.opened_at) >= ?';
      params.push(from);
    }
    if (to) {
      query += ' AND DATE(o.opened_at) <= ?';
      params.push(to);
    }
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 200, 1), 1000);
    const offset = Math.max(parseInt(req.query.offset, 10) || 0, 0);
    query += ' ORDER BY o.opened_at DESC LIMIT ? OFFSET ?';
    params.push(limit, offset);

    const [rows] = await db.query(query, params);
    res.json({ success: true, data: rows });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// POST /api/orders/direct-checkout (Xác nhận đơn hàng từ POS & Khách đặt Online)
const directCheckout = async (req, res) => {
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    const result = await orderService.createDirectOrder(conn, {
      orderData: req.body,
      reqUser: req.user,
    });

    await conn.commit();

    const io = req.app?.get('io');
    if (io && result.socketEvents) {
      const { orderCreated, cashierNewOrder, baristaNewOrder } = result.socketEvents;
      if (orderCreated) io.emit('order:created', orderCreated);
      if (cashierNewOrder) io.to('cashier').emit('cashier:new_order', cashierNewOrder);
      if (baristaNewOrder) io.to('barista').emit('barista:new_order', baristaNewOrder);
    }

    const { socketEvents, ...responseData } = result;
    res.json({
      success: true,
      message: result.message,
      data: responseData
    });
  } catch (err) {
    await conn.rollback();
    const statusCode = err.status || 400;
    res.status(statusCode).json({ success: false, message: err.message });
  } finally {
    conn.release();
  }
};

// PUT /api/orders/:id/status (Chuyển bước nghiệp vụ: pending -> preparing -> done -> served -> paid)
const updateStatus = async (req, res) => {
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    const { id } = req.params;
    const { status, payment_method } = req.body;
    // Chặn hủy đơn qua API status - Bắt buộc dùng API /api/orders/:id/cancel chuẩn nghiệp vụ
    if (status === 'cancelled') {
      await conn.rollback();
      return res.status(400).json({
        success: false,
        message: 'Để hủy đơn hàng, vui lòng sử dụng API chuẩn PUT /api/orders/:id/cancel để xử lý hoàn tiền, void hóa đơn và hoàn kho!',
      });
    }

    const [orders] = await conn.query('SELECT * FROM orders WHERE id = ? FOR UPDATE', [id]);
    if (!orders.length) {
      await conn.rollback();
      return res.status(404).json({ success: false, message: 'Không tìm thấy đơn hàng' });
    }
    const order = orders[0];

    if (order.status === status) {
      await conn.rollback();
      return res.status(400).json({ success: false, message: `Đơn hàng đã ở trạng thái "${status}"` });
    }

    // State Machine: Kiểm tra luồng trạng thái hợp lệ
    // Đơn hàng đã ở trạng thái kết thúc ('paid', 'cancelled', 'merged') thì KHÔNG được phép chuyển trạng thái (kể cả Admin)
    if (['paid', 'cancelled', 'merged'].includes(order.status)) {
      await conn.rollback();
      return res.status(400).json({
        success: false,
        message: `Đơn hàng đã ở trạng thái kết thúc ("${order.status}"). Chặn tuyệt đối mọi thao tác chuyển trạng thái!`,
      });
    }

    const STATE_TRANSITIONS = {
      scheduled: ['pending', 'preparing', 'cancelled'],
      open: ['pending', 'preparing', 'cancelled'],
      pending: ['preparing', 'done', 'served', 'paid', 'cancelled'],
      preparing: ['done', 'served', 'paid', 'cancelled'],
      done: ['served', 'paid', 'cancelled'],
      served: ['paid'],
      paid: [],
      cancelled: [],
      merged: [],
    };
    const allowedNext = STATE_TRANSITIONS[order.status] || [];
    if (!allowedNext.includes(status)) {
      await conn.rollback();
      return res.status(400).json({
        success: false,
        message: `Chuyển trạng thái không hợp lệ: Không thể chuyển từ "${order.status}" sang "${status}"`,
      });
    }

    // PHÂN QUYỀN RBAC THEO NGHIỆP VỤ QUÁN CÀ PHÊ BÁN TRỰC TIẾP (3 BƯỚC):
    // 1. Đã thanh toán (Thu ngân tạo tại POS, khách trả 100% upfront)
    // 2. Đang pha chế (Barista nhận đơn và pha)
    // 3. Pha xong & Trả món (Hoàn tất đơn hàng)
    const userRole = req.user?.role;
    if (!userRole) {
      await conn.rollback();
      return res.status(401).json({ success: false, message: 'Chưa đăng nhập hoặc thiếu thông tin vai trò' });
    }
    const isAdminOrManager = userRole === 'admin' || userRole === 'manager';
    if (!isAdminOrManager && userRole === 'cashier') {
      if (['preparing'].includes(status)) {
        await conn.rollback();
        return res.status(403).json({
          success: false,
          message: 'Quyền hạn: Thu ngân chỉ xử lý tạo đơn & trả món! Bước Đang pha chế do quầy Barista phụ trách.',
        });
      }
    } else if (!isAdminOrManager && userRole === 'barista') {
      if (!['preparing', 'done', 'served'].includes(status)) {
        await conn.rollback();
        return res.status(403).json({
          success: false,
          message: 'Quyền hạn: Barista chỉ thao tác ở bước Đang pha chế và Pha xong / Trả món!',
        });
      }
    } else if (userRole === 'waiter') {
      if (!['served', 'done'].includes(status)) {
        await conn.rollback();
        return res.status(403).json({
          success: false,
          message: 'Quyền hạn: Nhân viên phục vụ chỉ có quyền xác nhận Trả món cho khách!',
        });
      }
    }

    if (status === 'preparing') {
      await conn.query('UPDATE orders SET status = "preparing" WHERE id = ?', [id]);
      await conn.query('UPDATE order_items SET status = "preparing", started_at = IFNULL(started_at, NOW()) WHERE order_id = ? AND status = "pending"', [id]);
    } else if (status === 'done') {
      // Bước 3: Đã pha xong đồ uống - Sẵn sàng trên quầy chờ trả món
      await conn.query('UPDATE orders SET status = "done" WHERE id = ?', [id]);
      await conn.query('UPDATE order_items SET status = "done", done_at = IFNULL(done_at, NOW()) WHERE order_id = ? AND status IN ("pending", "preparing")', [id]);
    } else if (status === 'served') {
      // Bước 4: Đã trả món cho khách - Đơn hàng hoàn tất và dọn khỏi KDS
      await conn.query('UPDATE orders SET status = "served", closed_at = IFNULL(closed_at, NOW()) WHERE id = ?', [id]);
      await conn.query('UPDATE order_items SET status = "served", done_at = IFNULL(done_at, NOW()) WHERE order_id = ? AND status != "cancelled"', [id]);

      // Lỗi 4: Tự động giải phóng bàn ăn về 'empty' khi đã trả món cho khách
      if (order.table_id) {
        const [activeOrders] = await conn.query(
          'SELECT id FROM orders WHERE table_id = ? AND id != ? AND status IN ("pending", "preparing", "open")',
          [order.table_id, id]
        );
        if (!activeOrders.length) {
          await conn.query('UPDATE `tables` SET status = "empty" WHERE id = ?', [order.table_id]);
          const io = req.app?.get('io');
          if (io) io.emit('table:status_updated', { tableId: order.table_id, status: 'empty' });
        }
      }
    } else if (status === 'paid') {
      await conn.query('UPDATE orders SET status = "paid", payment_status = "paid", closed_at = IFNULL(closed_at, NOW()) WHERE id = ?', [id]);
      await conn.query('UPDATE order_items SET status = "served", done_at = IFNULL(done_at, NOW()) WHERE order_id = ? AND status != "cancelled"', [id]);
      if (order.table_id) {
        const [activeOrders] = await conn.query(
          'SELECT id FROM orders WHERE table_id = ? AND id != ? AND status IN ("pending", "preparing", "open")',
          [order.table_id, id]
        );
        if (!activeOrders.length) {
          await conn.query('UPDATE `tables` SET status = "empty" WHERE id = ?', [order.table_id]);
          const io = req.app?.get('io');
          if (io) io.emit('table:status_updated', { tableId: order.table_id, status: 'empty' });
        }
      }

      // Record payment if not yet
      const [existingPay] = await conn.query('SELECT id FROM payments WHERE order_id = ?', [id]);
      if (!existingPay.length) {
        const methodMap = {
          'Tiền mặt': 'cash',
          'cash': 'cash',
          'Thẻ ngân hàng': 'card',
          'card': 'card',
          'Chuyển khoản': 'bank_transfer',
          'QR Banking': 'bank_transfer',
          'Ví MoMo': 'bank_transfer',
          'ZaloPay': 'bank_transfer',
          'bank_transfer': 'bank_transfer',
          'points': 'points',
        };
        const mappedMethod = methodMap[payment_method] || 'cash';
        await conn.query(
          'INSERT INTO payments (order_id, method, amount, created_by) VALUES (?, ?, ?, ?)',
          [id, mappedMethod, order.total, req.user?.id || 1]
        );
      }

      // Deduct stock if not deducted yet
      const [existingMovements] = await conn.query(
        'SELECT id FROM stock_movements WHERE ref_type = "orders" AND ref_id = ? AND movement_type = "sale"',
        [id]
      );
      if (!existingMovements.length) {
        const [orderItems] = await conn.query('SELECT product_size_id, quantity, product_name FROM order_items WHERE order_id = ? AND status != "cancelled"', [id]);
        for (const item of orderItems) {
          const [recipes] = await conn.query('SELECT ingredient_id, quantity FROM recipes WHERE product_size_id = ?', [item.product_size_id]);
          for (const rec of recipes) {
            const consumed = Number(rec.quantity) * Number(item.quantity);
            const [ingRows] = await conn.query('SELECT current_stock, avg_cost FROM ingredients WHERE id = ? FOR UPDATE', [rec.ingredient_id]);
            if (ingRows.length) {
              const current = parseFloat(ingRows[0].current_stock);
              const newBal = Math.max(0, current - consumed);
              await conn.query('UPDATE ingredients SET current_stock = ? WHERE id = ?', [newBal, rec.ingredient_id]);
              await conn.query(
                'INSERT INTO stock_movements (ingredient_id, movement_type, quantity, unit_cost, balance_after, ref_type, ref_id, note, created_by) VALUES (?, "sale", ?, ?, ?, "orders", ?, ?, ?)',
                [rec.ingredient_id, consumed, ingRows[0].avg_cost, newBal, id, `Bán món ${item.product_name} (${order.code})`, req.user?.id || 1]
              );
            }
          }
        }
      }
    }

    await conn.commit();

    // Phát sự kiện Socket.IO thời gian thực khi chuyển trạng thái đơn (chuẩn hóa payload)
    const io = req.app?.get('io');
    if (io) {
      io.emit('order:status_updated', { id: Number(id), orderId: Number(id), status });
      io.emit('barista:item_updated', { orderId: Number(id), status });
    }

    res.json({ success: true, message: `Đã cập nhật trạng thái đơn thành ${status}` });
  } catch (err) {
    await conn.rollback();
    res.status(500).json({ success: false, message: err.message });
  } finally {
    conn.release();
  }
};

// PUT /api/orders/:id/cancel
const cancelOrder = async (req, res) => {
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    const userRole = req.user?.role;
    const { id } = req.params;
    const { cancel_reason } = req.body;

    const [orders] = await conn.query('SELECT * FROM orders WHERE id = ? FOR UPDATE', [id]);
    if (!orders.length) {
      await conn.rollback();
      return res.status(404).json({ success: false, message: 'Không tìm thấy đơn hàng' });
    }
    const order = orders[0];

    // Chặn hủy đơn đã hủy trước đó
    if (order.status === 'cancelled') {
      await conn.rollback();
      return res.status(400).json({ success: false, message: 'Đơn hàng này đã được hủy trước đó' });
    }

    // Lỗi 10: Phân quyền hủy đơn chuẩn xác theo vai trò
    if (userRole === 'customer') {
      // Khách hàng chỉ được hủy đơn của chính mình khi đơn còn ở trạng thái scheduled hoặc pending
      const customerUserId = req.user?.id;
      const customerPhone = req.user?.phone;
      let isOwner = (order.created_by === customerUserId) ||
                    (order.customer_id && req.user?.customer_id && order.customer_id === req.user.customer_id) ||
                    (customerPhone && order.recipient_phone === customerPhone);

      if (!isOwner && order.customer_id && customerPhone) {
        const [cRows] = await conn.query('SELECT phone FROM customers WHERE id = ?', [order.customer_id]);
        if (cRows.length && cRows[0].phone === customerPhone) {
          isOwner = true;
        }
      }

      if (!isOwner) {
        await conn.rollback();
        return res.status(403).json({ success: false, message: 'Bạn không có quyền hủy đơn hàng của khách khác!' });
      }

      if (!['scheduled', 'pending', 'open'].includes(order.status)) {
        await conn.rollback();
        return res.status(400).json({
          success: false,
          message: 'Đơn hàng đang được pha chế hoặc đã hoàn tất, không thể tự hủy lúc này. Vui lòng liên hệ trực tiếp quán để được hỗ trợ!',
        });
      }
    } else if (['barista', 'waiter'].includes(userRole)) {
      await conn.rollback();
      return res.status(403).json({
        success: false,
        message: 'Quyền hạn: Pha chế hoặc Phục vụ không có quyền hủy đơn hàng. Chỉ Thu Ngân hoặc Quản Lý mới có quyền hủy đơn!',
      });
    } else if (userRole === 'cashier') {
      if (order.payment_status === 'paid' && !['scheduled', 'pending', 'open'].includes(order.status)) {
        await conn.rollback();
        return res.status(403).json({
          success: false,
          message: 'Đơn hàng đã thanh toán và đang pha chế, chỉ Quản Lý hoặc Admin mới có quyền duyệt hủy đơn và hoàn tiền!',
        });
      }
    }

    await conn.query("UPDATE orders SET status = 'cancelled', note = CONCAT(IFNULL(note, ''), ' [Hủy: ', ?, ']'), closed_at = NOW() WHERE id = ?", [cancel_reason || 'Khách hủy', id]);
    await conn.query("UPDATE order_items SET status = 'cancelled', cancel_reason = ? WHERE order_id = ?", [cancel_reason || 'Đơn bị hủy', id]);

    // Giải phóng bàn nếu đơn dine_in
    if (order.table_id) {
      await conn.query("UPDATE `tables` SET status = 'empty' WHERE id = ?", [order.table_id]);
    }

    // Hoàn trả nguyên liệu nếu đơn đã bị trừ kho (BUG-03)
    await rollbackInventoryForOrder(conn, id, req.user?.id);

    // Hoàn trả điểm đã đổi (redeem) và thu hồi điểm đã tích lũy (nếu có)
    if (order.customer_id) {
      await loyaltyService.refundPointsOnCancel(conn, { orderId: id, customerId: order.customer_id });
    }

    // BIZ-05: Luôn đánh dấu hủy hóa đơn (voided) khi đơn bị hủy (dù paid hay unpaid)
    await conn.query('UPDATE invoices SET status = "voided", void_reason = ?, voided_by = ? WHERE order_id = ?', [cancel_reason || 'Đơn bị hủy', req.user?.id || 1, id]);

    // Nếu đơn đã thanh toán: hoàn tiền & điều chỉnh total_spent
    if (order.payment_status === 'paid') {
      if (order.customer_id) {
        await conn.query(
          'UPDATE customers SET total_spent = GREATEST(0, total_spent - ?) WHERE id = ?',
          [order.total, order.customer_id]
        );
        // BIZ-04: Cập nhật lại hạng hội viên tương ứng với total_spent mới sau khi trừ tiền
        await loyaltyService.recalculateCustomerTier(conn, order.customer_id);
      }
      // Ghi nhận bản ghi hoàn tiền (refund) tương ứng đúng phương thức thanh toán gốc (tránh vi phạm CHECK amount > 0 với đơn 0đ)
      if (Number(order.total) > 0) {
        const [origPayments] = await conn.query(
          'SELECT method FROM payments WHERE order_id = ? AND type = "payment" ORDER BY id DESC LIMIT 1',
          [id]
        );
        const refundMethod = origPayments.length ? origPayments[0].method : 'cash';
        await conn.query(
          'INSERT INTO payments (order_id, method, type, amount, created_by) VALUES (?, ?, "refund", ?, ?)',
          [id, refundMethod, Number(order.total), req.user?.id || 1]
        );
      }
    }

    await conn.commit();

    logAudit({
      userId: req.user?.id || null,
      action: 'CANCEL_ORDER',
      entityType: 'ORDER',
      entityId: id,
      reason: `Hủy đơn hàng #${order.code}: ${cancel_reason || 'Không rõ lý do'}`,
      ipAddress: req.ip
    });

    // Phát sự kiện Socket.IO thời gian thực khi đơn bị hủy
    const io = req.app?.get('io');
    if (io) {
      io.emit('order:cancelled', { id });
    }

    res.json({ success: true, message: 'Đã hủy đơn hàng và xử lý hoàn kho/hoàn điểm thành công' });
  } catch (err) {
    await conn.rollback();
    res.status(500).json({ success: false, message: 'Lỗi khi hủy đơn hàng: ' + err.message });
  } finally {
    conn.release();
  }
};

// GET /api/orders/my-history (Lịch sử đơn hàng của tài khoản khách hàng đang đăng nhập)
const getMyOrders = async (req, res) => {
  try {
    const userPhone = req.user.phone || req.user.username;
    if (!userPhone) {
      return res.json({ success: true, data: [] });
    }

    const [custRows] = await db.query('SELECT id FROM customers WHERE phone = ? LIMIT 1', [userPhone]);
    if (!custRows.length) {
      return res.json({ success: true, data: [] });
    }
    const customerId = custRows[0].id;

    const [orders] = await db.query(
      `SELECT o.id, o.code, o.order_type, o.status, o.payment_status, o.subtotal,
              o.discount_total, o.total, o.opened_at, o.closed_at, o.pickup_time, o.note,
              t.code AS table_code,
              (
                SELECT GROUP_CONCAT(CONCAT(oi.product_name, ' (', oi.size_name, ') x', oi.quantity) SEPARATOR ', ')
                FROM order_items oi WHERE oi.order_id = o.id
              ) AS items_summary
       FROM orders o
       LEFT JOIN \`tables\` t ON t.id = o.table_id
       WHERE o.customer_id = ?
       ORDER BY o.opened_at DESC LIMIT 50`,
      [customerId]
    );

    res.json({ success: true, data: orders });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// POST /api/orders/:id/confirm-payment (Thu ngân hoặc Quản lý xác nhận tiền chuyển khoản của khách online đã vào tài khoản)
const confirmPayment = async (req, res) => {
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    const { id } = req.params;
    const [orders] = await conn.query('SELECT * FROM orders WHERE id = ? FOR UPDATE', [id]);
    if (!orders.length) {
      await conn.rollback();
      return res.status(404).json({ success: false, message: 'Không tìm thấy đơn hàng' });
    }
    const order = orders[0];
    if (order.payment_status === 'paid') {
      await conn.rollback();
      return res.json({ success: true, message: 'Đơn hàng này đã được xác nhận thanh toán trước đó' });
    }

    await conn.query('UPDATE orders SET payment_status = "paid" WHERE id = ?', [id]);

    // Ghi nhận thanh toán vào bảng payments nếu chưa có
    const [existingPay] = await conn.query('SELECT id FROM payments WHERE order_id = ? AND type = "payment"', [id]);
    if (!existingPay.length) {
      await conn.query(
        'INSERT INTO payments (order_id, method, amount, created_by) VALUES (?, "bank_transfer", ?, ?)',
        [id, order.total, req.user?.id || 1]
      );
    }

    // Trừ kho nguyên liệu cho đơn này nếu chưa trừ
    const [existingMovements] = await conn.query(
      'SELECT id FROM stock_movements WHERE ref_type = "orders" AND ref_id = ? AND movement_type = "sale"',
      [id]
    );
    if (!existingMovements.length) {
      const [orderItems] = await conn.query('SELECT product_size_id, quantity, product_name FROM order_items WHERE order_id = ? AND status != "cancelled"', [id]);
      for (const item of orderItems) {
        const [recipes] = await conn.query('SELECT ingredient_id, quantity FROM recipes WHERE product_size_id = ?', [item.product_size_id]);
        for (const rec of recipes) {
          const consumed = Number(rec.quantity) * Number(item.quantity);
          const [ingRows] = await conn.query('SELECT current_stock, avg_cost FROM ingredients WHERE id = ? FOR UPDATE', [rec.ingredient_id]);
          if (ingRows.length) {
            const current = parseFloat(ingRows[0].current_stock);
            const newBal = Math.max(0, current - consumed);
            await conn.query('UPDATE ingredients SET current_stock = ? WHERE id = ?', [newBal, rec.ingredient_id]);
            await conn.query(
              'INSERT INTO stock_movements (ingredient_id, movement_type, quantity, unit_cost, balance_after, ref_type, ref_id, note, created_by) VALUES (?, "sale", ?, ?, ?, "orders", ?, ?, ?)',
              [rec.ingredient_id, consumed, ingRows[0].avg_cost, newBal, id, `Bán món ${item.product_name} (${order.code})`, req.user?.id || 1]
            );
          }
        }
      }
    }

    // Tích điểm cho khách hàng khi thu ngân xác nhận đã thanh toán
    if (order.customer_id) {
      await loyaltyService.processEarnAndRedeem(conn, {
        customerId: order.customer_id,
        orderId: id,
        pointsToRedeem: 0,
        finalPaidAmount: Number(order.total),
        isPaid: true
      });
    }

    await conn.commit();

    const io = req.app?.get('io');
    if (io) {
      io.emit('order:status_updated', {
        id: order.id,
        orderId: order.id,
        orderCode: order.code,
        paymentStatus: 'paid'
      });
      // Đẩy sang KDS Barista khi đơn online đã được thu ngân xác nhận tiền vào tài khoản
      io.emit('barista:new_order', {
        orderId: order.id,
        orderCode: order.code,
        customerName: order.customer_name || 'Khách Online',
        tableId: order.table_id,
        orderType: order.order_type,
      });
    }

    res.json({ success: true, message: `Đã xác nhận thanh toán cho đơn #${order.code} thành công!` });
  } catch (err) {
    await conn.rollback();
    res.status(500).json({ success: false, message: 'Lỗi xác nhận thanh toán: ' + err.message });
  } finally {
    conn.release();
  }
};

module.exports = {
  getOpen,
  getOne,
  create,
  addItem,
  sendItems,
  cancelItem,
  pay,
  getAllOrders,
  directCheckout,
  updateStatus,
  cancelOrder,
  confirmPayment,
  getMyOrders,
};
