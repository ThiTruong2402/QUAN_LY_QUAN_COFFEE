const db = require('../config/db');
const { getVietnamDateString, getVietnamDateNumber } = require('../utils/date');
const storeService = require('../services/storeSettingsService');
const { logAudit } = require('../services/auditLogger');

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
    const lineTotal = (size.price + toppingsTotal) * quantity;

    const [r] = await conn.query(
      `INSERT INTO order_items (order_id, product_size_id, product_name, size_name, unit_price, quantity, toppings_total, line_total, note)
       VALUES (?,?,?,?,?,?,?,?,?)`,
      [req.params.id, product_size_id, size.product_name, size.name, size.price, quantity, toppingsTotal, lineTotal, note || null]
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

    // Update order status & free table
    await conn.query(
      "UPDATE orders SET status='paid', closed_at=NOW() WHERE id=?", [orderId]
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

// POST /api/orders/direct-checkout (Xác nhận đơn hàng từ POS: Trạng thái ban đầu "Đang chờ làm" pending)
const directCheckout = async (req, res) => {
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    const {
      items,
      customer_name,
      customer_phone,
      order_type = 'takeaway',
      table_id = null,
      delivery_address = null,
      shipping_fee = 0,
      recipient_phone = null,
      coupon_code = null,
      payment_method = 'Tiền mặt',
      note,
      discount = 0,
      tax = 0,
      pickup_time = null,
      status: initialStatus = 'pending', // Default: 'pending' (Đang chờ làm - sau khi thanh toán xong)
    } = req.body;

    if (!items || !items.length) {
      await conn.rollback();
      return res.status(400).json({ success: false, message: 'Đơn hàng chưa có món' });
    }

    // Check or find customer (tự động nhận diện tài khoản khách hàng nếu đang đăng nhập)
    const effectivePhone = customer_phone || (req.user?.role === 'customer' ? (req.user.phone || req.user.username) : null);
    const effectiveName = customer_name || (req.user?.role === 'customer' ? req.user.full_name : 'Khách vãng lai');

    // Chống spam / double-click tức thì (Idempotency in-memory lock chặn đứng race-condition)
    if (effectivePhone) {
      const lastTime = recentOrderLocks.get(effectivePhone);
      const now = Date.now();
      if (lastTime && now - lastTime < 3000) {
        await conn.rollback();
        return res.status(429).json({
          success: false,
          message: 'Bạn đang thao tác quá nhanh! Vui lòng chờ ít giây trước khi thực hiện đơn mới.'
        });
      }
      recentOrderLocks.set(effectivePhone, now);
      if (recentOrderLocks.size > 500) {
        for (const [p, t] of recentOrderLocks.entries()) {
          if (now - t > 10000) recentOrderLocks.delete(p);
        }
      }
    }

    let customerId = null;
    if (effectivePhone) {
      const [cRows] = await conn.query('SELECT id, points_balance FROM customers WHERE phone = ?', [effectivePhone]);
      if (cRows.length) {
        customerId = cRows[0].id;
      } else {
        try {
          const [newC] = await conn.query('INSERT INTO customers (phone, name) VALUES (?, ?)', [effectivePhone, effectiveName]);
          customerId = newC.insertId;
        } catch (cErr) {
          if (cErr.code === 'ER_DUP_ENTRY' || cErr.errno === 1062) {
            const [reQuery] = await conn.query('SELECT id, points_balance FROM customers WHERE phone = ?', [effectivePhone]);
            if (reQuery.length) customerId = reQuery[0].id;
          } else {
            throw cErr;
          }
        }
      }

      // Chống spam đặt đơn trùng lặp liên tục (Anti-spam / Idempotency protection trong vòng 3 giây)
      const [dupRows] = await conn.query(
        `SELECT id, code FROM orders 
         WHERE (customer_id = ? OR recipient_phone = ?) 
           AND opened_at >= DATE_SUB(NOW(), INTERVAL 3 SECOND)
         LIMIT 1`,
        [customerId, effectivePhone]
      );
      if (dupRows.length) {
        await conn.rollback();
        return res.status(429).json({
          success: false,
          message: 'Bạn đang thao tác quá nhanh! Vui lòng chờ ít giây trước khi thực hiện đơn mới.'
        });
      }
    }

    // Xử lý đổi điểm tích lũy thành tiền giảm giá (Chuẩn thống nhất toàn hệ thống: 1 điểm = 1.000đ)
    let pointsDiscount = 0;
    let actualPointsRedeemed = 0;
    const requestedPts = Math.max(0, parseInt(req.body.points_to_redeem || req.body.points_redeemed, 10) || 0);
    if (requestedPts > 0 && customerId) {
      const [custPts] = await conn.query('SELECT points_balance FROM customers WHERE id = ? FOR UPDATE', [customerId]);
      if (custPts.length && custPts[0].points_balance > 0) {
        actualPointsRedeemed = Math.min(requestedPts, custPts[0].points_balance);
        pointsDiscount = actualPointsRedeemed * 1000;
      }
    }

    const today = getVietnamDateString();
    const dateNum = getVietnamDateNumber();
    await conn.query(
      `INSERT INTO document_counters (prefix, last_date, seq) VALUES ('HD', ?, 1)
       ON DUPLICATE KEY UPDATE seq = IF(last_date=VALUES(last_date), seq+1, 1), last_date = VALUES(last_date)`,
      [today]
    );
    const [counter] = await conn.query("SELECT seq FROM document_counters WHERE prefix='HD'");
    let invoiceNo = `HD${dateNum}-${String(counter[0].seq).padStart(4, '0')}`;
    let orderCode = invoiceNo;
    const [existOrder] = await conn.query('SELECT id FROM orders WHERE code = ?', [orderCode]);
    if (existOrder.length) {
      orderCode = `HD${dateNum}-${String(counter[0].seq).padStart(4, '0')}-${Date.now().toString().slice(-4)}`;
      invoiceNo = orderCode;
    }

    // 1. Zero-Trust Pricing & Toppings: Server tự truy vấn giá chuẩn từ product_sizes / products / toppings trong Database
    let subtotal = 0;
    const validatedItems = [];
    for (const item of items) {
      const productSizeId = item.product_size_id || null;
      const productId = item.product_id || null;
      let sizeRow = null;

      if (productSizeId) {
        const [sizeRows] = await conn.query(
          `SELECT ps.id, ps.price, ps.name AS size_name, p.id AS product_id, p.name AS product_name 
           FROM product_sizes ps
           JOIN products p ON p.id = ps.product_id
           WHERE ps.id = ?`,
          [productSizeId]
        );
        if (sizeRows.length) sizeRow = sizeRows[0];
      }

      if (!sizeRow && productId) {
        const [sizeFallback] = await conn.query(
          `SELECT ps.id, ps.price, ps.name AS size_name, p.id AS product_id, p.name AS product_name
           FROM product_sizes ps
           JOIN products p ON p.id = ps.product_id
           WHERE ps.product_id = ?
           ORDER BY ps.is_default DESC, ps.id ASC
           LIMIT 1`,
          [productId]
        );
        if (sizeFallback.length) sizeRow = sizeFallback[0];
      }

      // Zero-Trust Pricing: Chặn đứng lỗ hổng client tự truyền đơn giá tùy ý
      if (!sizeRow) {
        await conn.rollback();
        return res.status(400).json({
          success: false,
          message: `Món đồ uống "${item.name || 'chưa rõ'}" không tồn tại hoặc kích thước không hợp lệ trong hệ thống!`
        });
      }

      const unitPrice = Number(sizeRow.price);
      const productName = sizeRow.product_name;
      const sizeName = sizeRow.size_name;
      const finalSizeId = sizeRow.id;

      // Xử lý và tính giá Topping (Zero-Trust từ CSDL bảng toppings)
      let itemToppingsTotal = 0;
      const validatedItemToppings = [];
      const rawToppings = Array.isArray(item.toppings) ? item.toppings : [];
      for (const t of rawToppings) {
        const topId = t.topping_id || t.id;
        if (!topId) continue;
        const [topRows] = await conn.query('SELECT id, name, price FROM toppings WHERE id = ?', [topId]);
        if (topRows.length) {
          const topPrice = Number(topRows[0].price);
          const topQty = Math.max(1, parseInt(t.quantity, 10) || 1);
          itemToppingsTotal += topPrice * topQty;
          validatedItemToppings.push({
            topping_id: topRows[0].id,
            topping_name: topRows[0].name,
            price: topPrice,
            quantity: topQty
          });
        }
      }

      const qty = Math.max(1, parseInt(item.quantity, 10) || 1);
      const lineTotal = (unitPrice + itemToppingsTotal) * qty;
      subtotal += lineTotal;

      validatedItems.push({
        product_size_id: finalSizeId,
        product_id: sizeRow.product_id,
        name: productName,
        size_name: sizeName,
        price: unitPrice,
        quantity: qty,
        toppings_total: itemToppingsTotal,
        line_total: lineTotal,
        toppings: validatedItemToppings,
        note: item.note ? String(item.note).trim() : null
      });
    }

    // Kiểm tra định lượng tồn kho trước khi tạo đơn (Pre-check Stock chống âm kho & bán khống)
    const requiredIngMap = {};
    for (const item of validatedItems) {
      const [recipeRows] = await conn.query(
        'SELECT r.ingredient_id, r.quantity, i.name, i.current_stock, i.unit FROM recipes r JOIN ingredients i ON i.id = r.ingredient_id WHERE r.product_size_id = ?',
        [item.product_size_id]
      );
      for (const rec of recipeRows) {
        const needed = Number(rec.quantity) * Number(item.quantity);
        if (!requiredIngMap[rec.ingredient_id]) {
          requiredIngMap[rec.ingredient_id] = {
            id: rec.ingredient_id,
            name: rec.name,
            current_stock: Number(rec.current_stock),
            unit: rec.unit,
            totalNeeded: 0
          };
        }
        requiredIngMap[rec.ingredient_id].totalNeeded += needed;
      }
    }

    for (const ingId in requiredIngMap) {
      const ing = requiredIngMap[ingId];
      if (ing.current_stock < ing.totalNeeded) {
        await conn.rollback();
        return res.status(400).json({
          success: false,
          message: `Nguyên liệu "${ing.name}" trong kho không đủ để thực hiện món! (Hiện còn: ${ing.current_stock.toFixed(2)} ${ing.unit}, Cần dùng: ${ing.totalNeeded.toFixed(2)} ${ing.unit})`
        });
      }
    }

    // 2. Zero-Trust Promotions: Server tự kiểm tra và tính toán giảm giá từ bảng promotions
    let calculatedDiscount = 0;
    let validCouponCode = null;
    if (coupon_code) {
      const cleanCode = String(coupon_code).trim().toUpperCase();
      const [promoRows] = await conn.query(
        `SELECT * FROM promotions 
         WHERE BINARY code = ? AND is_active = 1 
           AND (start_date IS NULL OR start_date <= CURDATE())
           AND (end_date IS NULL OR end_date >= CURDATE())`,
        [cleanCode]
      );
      if (promoRows.length) {
        const promo = promoRows[0];
        // 1. Chặn FREESHIP nếu đơn mang về / tại quán
        if (cleanCode === 'FREESHIP' && (normalizedOrderType === 'takeaway' || normalizedOrderType === 'dine_in')) {
          await conn.rollback();
          return res.status(400).json({ success: false, message: 'Mã FREESHIP không áp dụng cho đơn tại quầy hoặc mang về' });
        }
        // 2. Chặn mã BANMOI nếu khách hàng đã từng phát sinh đơn hàng trước đó
        if (['BANMOI', 'BANMOI20'].includes(cleanCode) && customerId) {
          const [pastOrders] = await conn.query("SELECT COUNT(*) AS cnt FROM orders WHERE customer_id = ? AND status != 'cancelled'", [customerId]);
          if (pastOrders[0]?.cnt > 0) {
            await conn.rollback();
            return res.status(400).json({ success: false, message: 'Mã chào bạn mới chỉ áp dụng cho đơn hàng đầu tiên của khách hàng' });
          }
        }
        const minOrder = Number(promo.min_order_value || 0);
        if (subtotal >= minOrder) {
          const promoVal = Number(promo.value ?? promo.discount_value ?? 0);
          const isPercentage = promo.type === 'percent_order' || promo.type === 'happy_hour' || promo.type === 'percentage' || promo.discount_type === 'percentage';
          if (isPercentage) {
            calculatedDiscount = Math.round((subtotal * promoVal) / 100);
            if (promo.max_discount) {
              calculatedDiscount = Math.min(calculatedDiscount, Number(promo.max_discount));
            }
          } else {
            calculatedDiscount = Math.min(subtotal, promoVal);
          }
          validCouponCode = cleanCode;
        } else {
          await conn.rollback();
          return res.status(400).json({ success: false, message: `Mã ${cleanCode} yêu cầu đơn tối thiểu ${minOrder.toLocaleString('vi-VN')} đ` });
        }
      } else {
        await conn.rollback();
        return res.status(400).json({ success: false, message: `Mã khuyến mãi "${cleanCode}" không tồn tại hoặc đã hết hạn áp dụng!` });
      }
    }

    // Cộng gộp giảm giá từ điểm thưởng
    calculatedDiscount += pointsDiscount;

    const finalTax = Number(tax || 0);
    const total = Math.max(0, subtotal - calculatedDiscount + finalTax);

    // 0. Xử lý logic Giờ mở cửa & Đặt trước (SCHEDULED vs PENDING)
    const config = await storeService.getStoreSettings();
    const vnNow = storeService.getVietnamNow();
    const storeIsOpen = storeService.isStoreOpen(config, vnNow);

    let finalOrderStatus = 'pending';
    let effectivePickupDate = null;
    let pickupDisplayLabel = null;

    if (!storeIsOpen) {
      // Tình huống 2: Quán đóng cửa, khách đặt -> Bắt buộc chọn giờ nhận nằm trong giờ mở cửa. Đơn có trạng thái SCHEDULED
      if (!pickup_time) {
        await conn.rollback();
        return res.status(400).json({
          success: false,
          isStoreClosed: true,
          message: `Quán hiện đang đóng cửa (Giờ phục vụ: ${config.open_time} – ${config.close_time}). Quý khách vui lòng chọn giờ nhận hàng trong khung giờ mở cửa để đặt trước!`
        });
      }

      const check = storeService.validatePickupTime(pickup_time, config, vnNow);
      if (!check.valid) {
        await conn.rollback();
        return res.status(400).json({ success: false, message: check.message });
      }

      finalOrderStatus = 'scheduled';
      effectivePickupDate = check.pickupDate;
      pickupDisplayLabel = check.displayTime;
    } else {
      // Tình huống 1: Quán đang mở
      if (pickup_time) {
        // Khách chủ động hẹn giờ nhận trước
        const check = storeService.validatePickupTime(pickup_time, config, vnNow);
        if (!check.valid) {
          await conn.rollback();
          return res.status(400).json({ success: false, message: check.message });
        }
        finalOrderStatus = 'scheduled';
        effectivePickupDate = check.pickupDate;
        pickupDisplayLabel = check.displayTime;
      } else {
        // Khách đặt bình thường làm ngay -> PENDING
        finalOrderStatus = initialStatus === 'paid' ? 'paid' : 'pending';
        effectivePickupDate = null;
      }
    }

    // Xử lý trạng thái thanh toán (Lỗi 5: Khách online chuyển khoản ngân hàng thì trạng thái thanh toán là unpaid chờ xác nhận)
    const isOnlineCustomer = req.user?.role === 'customer' || !req.user || req.body.is_online_order;
    const isTransfer = ['Chuyển khoản', 'QR Banking', 'Ví MoMo', 'ZaloPay', 'bank_transfer'].includes(payment_method);
    const finalPaymentStatus = (isOnlineCustomer && isTransfer) ? 'unpaid' : 'paid';

    const closedAt = finalOrderStatus === 'paid' && finalPaymentStatus === 'paid' ? 'NOW()' : 'NULL';

    // Mô hình chỉ bán trực tiếp: 'dine_in' (Tại quán) hoặc 'takeaway' (Mang về)
    const normalizedOrderType = order_type === 'dine_in' ? 'dine_in' : 'takeaway';
    const effectiveTableId = normalizedOrderType === 'dine_in' ? (table_id || null) : null;

    let orderRes;
    try {
      [orderRes] = await conn.query(
        `INSERT INTO orders (code, order_type, table_id, customer_id, status, payment_status, subtotal, discount_total, service_fee, vat_amount, total, note, delivery_address, shipping_fee, recipient_phone, coupon_code, created_by, opened_at, closed_at, pickup_time)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, NULL, 0, NULL, ?, ?, NOW(), ${closedAt}, ?)`,
        [orderCode, normalizedOrderType, effectiveTableId, customerId, finalOrderStatus, finalPaymentStatus, subtotal, calculatedDiscount, finalTax, total, note || null, validCouponCode, req.user?.id || 1, effectivePickupDate]
      );
    } catch (insErr) {
      if (insErr.message?.includes('pickup_time')) {
        // Fallback an toàn nếu database (như TiDB Cloud) chưa bổ sung cột pickup_time
        [orderRes] = await conn.query(
          `INSERT INTO orders (code, order_type, table_id, customer_id, status, payment_status, subtotal, discount_total, service_fee, vat_amount, total, note, delivery_address, shipping_fee, recipient_phone, coupon_code, created_by, opened_at, closed_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, NULL, 0, NULL, ?, ?, NOW(), ${closedAt})`,
          [orderCode, normalizedOrderType, effectiveTableId, customerId, finalOrderStatus, finalPaymentStatus, subtotal, calculatedDiscount, finalTax, total, note || null, validCouponCode, req.user?.id || 1]
        );
      } else {
        throw insErr;
      }
    }
    const orderId = orderRes.insertId;

    // Insert items with status 'pending' (Chờ pha chế), 'scheduled' (Hẹn giờ), or 'done'
    // Lỗi 3: Bảo toàn Topping trong order_items và order_item_toppings
    const itemStatus = finalOrderStatus === 'paid' ? 'done' : (finalOrderStatus === 'scheduled' ? 'scheduled' : 'pending');
    for (const item of validatedItems) {
      const [itemRes] = await conn.query(
        `INSERT INTO order_items (order_id, product_size_id, product_name, size_name, unit_price, quantity, toppings_total, line_total, note, status, sent_at, done_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ${finalOrderStatus === 'scheduled' ? 'NULL' : 'NOW()'}, ${finalOrderStatus === 'paid' ? 'NOW()' : 'NULL'})`,
        [orderId, item.product_size_id, item.name, item.size_name, item.price, item.quantity, item.toppings_total || 0, item.line_total, item.note, itemStatus]
      );
      const orderItemId = itemRes.insertId;

      if (Array.isArray(item.toppings) && item.toppings.length > 0) {
        for (const top of item.toppings) {
          await conn.query(
            `INSERT INTO order_item_toppings (order_item_id, topping_id, topping_name, price, quantity)
             VALUES (?, ?, ?, ?, ?)`,
            [orderItemId, top.topping_id, top.topping_name, top.price, top.quantity]
          );
        }
      }
    }

    // Insert Invoice
    await conn.query(
      `INSERT INTO invoices (invoice_no, order_id, subtotal, discount, service_fee, vat, total)
       VALUES (?, ?, ?, ?, 0, ?, ?)`,
      [invoiceNo, orderId, subtotal, calculatedDiscount, finalTax, total]
    );

    // Map payment method to valid MySQL constraint: cash, bank_transfer, card, points
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

    // Insert Payment Record chỉ khi đã thực sự thanh toán thành công
    if (total > 0 && finalPaymentStatus === 'paid') {
      await conn.query(
        `INSERT INTO payments (order_id, method, amount, created_by)
         VALUES (?, ?, ?, ?)`,
        [orderId, mappedMethod, total, req.user?.id || 1]
      );
    }

    // Business Logic: Trừ định lượng kho khi đơn đã được thanh toán
    if (finalPaymentStatus === 'paid') {
      for (const item of validatedItems) {
        const sizeId = item.product_size_id || 1;
        const [recipeRows] = await conn.query(
          'SELECT ingredient_id, quantity FROM recipes WHERE product_size_id = ?',
          [sizeId]
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
              [rec.ingredient_id, consumed, ingRows[0].avg_cost, newBalance, orderId, `Bán món ${item.name} (${orderCode})`, req.user?.id || 1]
            );
          }
        }
      }
    }

    // Points & Tiers: Tích điểm và tự động thăng hạng thành viên theo total_spent
    if (customerId) {
      if (actualPointsRedeemed > 0) {
        await conn.query('UPDATE customers SET points_balance = GREATEST(0, points_balance - ?) WHERE id = ?', [actualPointsRedeemed, customerId]);
        await conn.query('INSERT INTO loyalty_transactions (customer_id, order_id, type, points) VALUES (?, ?, "redeem", ?)', [customerId, orderId, actualPointsRedeemed]);
      }
      const pts = Math.floor(total / 10000);
      await conn.query('UPDATE customers SET points_balance = points_balance + ?, total_spent = total_spent + ? WHERE id = ?', [pts, total, customerId]);
      if (pts > 0) {
        await conn.query('INSERT INTO loyalty_transactions (customer_id, order_id, type, points) VALUES (?, ?, "earn", ?)', [customerId, orderId, pts]);
      }
      // Tự động thăng hạng thành viên
      const [custRows] = await conn.query('SELECT total_spent FROM customers WHERE id = ?', [customerId]);
      if (custRows.length) {
        const spent = Number(custRows[0].total_spent || 0);
        const [tierRows] = await conn.query(
          'SELECT id FROM membership_tiers WHERE min_spent <= ? ORDER BY min_spent DESC LIMIT 1',
          [spent]
        );
        if (tierRows.length) {
          await conn.query('UPDATE customers SET tier_id = ? WHERE id = ?', [tierRows[0].id, customerId]);
        }
      }
    }

    // Đánh dấu bàn thành occupied nếu có chọn bàn
    if (effectiveTableId) {
      await conn.query("UPDATE `tables` SET status='occupied' WHERE id=?", [effectiveTableId]);
    }

    await conn.commit();

    // Phát sự kiện Socket.IO thời gian thực khi có đơn mới
    const io = req.app?.get('io');
    if (io) {
      io.emit('order:created', {
        orderId,
        orderCode,
        invoiceNo,
        customerName: effectiveName,
        customerPhone: effectivePhone,
        items: validatedItems,
        orderType: normalizedOrderType,
        tableId: effectiveTableId,
        paymentMethod: mappedMethod,
        total,
        status: finalOrderStatus,
        pickupTime: effectivePickupDate,
        pickupDisplayLabel,
      });

      // Nếu đơn là PENDING (làm ngay) thì đẩy sang Barista ngay lập tức
      // Nếu là SCHEDULED (hẹn giờ) thì hàng đợi Barista chưa hiển thị cho đến khi tự động kích hoạt trước giờ nhận 15 phút
      if (finalOrderStatus === 'pending') {
        io.emit('barista:new_order', {
          orderId,
          orderCode,
          customerName: effectiveName,
          tableId: effectiveTableId,
          orderType: normalizedOrderType,
        });
      }
    }

    let successMsg = 'Xác nhận đơn thành công! Đơn hàng đang ở trạng thái Đang chờ làm.';
    if (finalOrderStatus === 'scheduled') {
      successMsg = `Đặt trước thành công! Quán đã ghi nhận lịch hẹn nhận đơn lúc ${pickupDisplayLabel || effectivePickupDate}.`;
    } else if (finalOrderStatus === 'paid') {
      successMsg = 'Thanh toán và hoàn thành đơn thành công!';
    }

    res.json({
      success: true,
      message: successMsg,
      data: {
        invoiceNo,
        orderId,
        orderCode,
        subtotal,
        discount_total: calculatedDiscount,
        total,
        status: finalOrderStatus,
        pickup_time: effectivePickupDate,
        pickup_display_label: pickupDisplayLabel,
      }
    });
  } catch (err) {
    await conn.rollback();
    res.status(500).json({ success: false, message: err.message });
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
    const STATE_TRANSITIONS = {
      scheduled: ['pending', 'preparing', 'cancelled'],
      open: ['pending', 'preparing'],
      pending: ['preparing', 'done', 'served', 'paid'],
      preparing: ['done', 'served', 'paid'],
      done: ['served', 'paid'],
      served: ['paid'],
      paid: [],
      cancelled: [],
      merged: [],
    };
    const allowedNext = STATE_TRANSITIONS[order.status] || [];
    const isAdminOrManager = ['admin', 'manager'].includes(req.user?.role);
    if (!isAdminOrManager && !allowedNext.includes(status)) {
      await conn.rollback();
      return res.status(400).json({
        success: false,
        message: `Chuyển trạng thái không hợp lệ: Không thể chuyển từ "${order.status}" sang "${status}"`,
      });
    }

    if (order.status === 'paid' && status === 'paid') {
      await conn.rollback();
      return res.status(400).json({ success: false, message: 'Đơn hàng này đã được thanh toán trước đó' });
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

    // Nếu đơn đã thanh toán: Thu hồi điểm tích lũy và ghi nhận hoàn tiền / hủy hóa đơn
    if (order.payment_status === 'paid') {
      if (order.customer_id) {
        const pts = Math.floor(Number(order.total) / 10000);
        if (pts > 0) {
          await conn.query(
            'UPDATE customers SET points_balance = GREATEST(0, points_balance - ?), total_spent = GREATEST(0, total_spent - ?) WHERE id = ?',
            [pts, order.total, order.customer_id]
          );
          await conn.query(
            'INSERT INTO loyalty_transactions (customer_id, order_id, type, points) VALUES (?, ?, "revoke", ?)',
            [order.customer_id, id, -pts]
          );
        }
      }
      // Đánh dấu hủy hóa đơn (voided) theo chuẩn schema
      await conn.query('UPDATE invoices SET status = "voided", void_reason = ?, voided_by = ? WHERE order_id = ?', [cancel_reason || 'Đơn bị hủy', req.user?.id || 1, id]);
      // Ghi nhận bản ghi hoàn tiền (refund) tương ứng đúng phương thức thanh toán gốc
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

    await conn.commit();

    logAudit({
      userId: req.user?.id || null,
      action: 'CANCEL_ORDER',
      entityType: 'ORDER',
      entityId: id,
      reason: `Hủy đơn hàng #${order.order_code}: ${cancel_reason || 'Không rõ lý do'}`,
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

    await conn.commit();

    const io = req.app?.get('io');
    if (io) {
      io.emit('order:status_updated', {
        id: order.id,
        orderId: order.id,
        orderCode: order.code,
        paymentStatus: 'paid'
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
