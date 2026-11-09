const db = require('../config/db');
const { getStoreSettings } = require('./storeSettingsService');

let schedulerInterval = null;

const checkAndDispatchScheduledOrders = async (io) => {
  try {
    const config = await getStoreSettings();
    const leadMinutes = parseInt(config.auto_dispatch_before_minutes, 10) || 15;

    // Tìm các đơn đặt trước (SCHEDULED) đã đến gần giờ nhận (còn <= leadMinutes phút)
    const [ordersToDispatch] = await db.query(
      `SELECT o.*, 
              c.name AS customer_name, c.phone AS customer_phone,
              (SELECT p.method FROM payments p WHERE p.order_id = o.id AND p.type = 'payment' ORDER BY p.id DESC LIMIT 1) AS payment_method,
              inv.invoice_no,
              (SELECT GROUP_CONCAT(CONCAT(oi.product_name, IF(oi.size_name IN ('S','M','L','XL'), CONCAT(' (Size ', oi.size_name, ')'), ''), ' x', oi.quantity) SEPARATOR ', ')
               FROM order_items oi WHERE oi.order_id = o.id AND oi.status != 'cancelled') AS items_summary
       FROM orders o
       LEFT JOIN customers c ON c.id = o.customer_id
       LEFT JOIN invoices inv ON inv.order_id = o.id
       WHERE o.status = 'scheduled'
         AND o.pickup_time IS NOT NULL
         AND o.pickup_time <= DATE_ADD(NOW(), INTERVAL ? MINUTE)`,
      [leadMinutes]
    );

    if (!ordersToDispatch || ordersToDispatch.length === 0) return;

    for (const order of ordersToDispatch) {
      // 1. Chuyển trạng thái đơn hàng sang PENDING
      const [updateResult] = await db.query(
        "UPDATE orders SET status = 'pending' WHERE id = ? AND status = 'scheduled'",
        [order.id]
      );

      // Nếu đã có tiến trình khác cập nhật thì bỏ qua
      if (updateResult.affectedRows === 0) continue;

      // 2. Chuyển toàn bộ order_items sang PENDING để đẩy vào hàng đợi Barista
      await db.query(
        "UPDATE order_items SET status = 'pending', sent_at = NOW() WHERE order_id = ? AND status = 'scheduled'",
        [order.id]
      );

      console.log(`[OrderScheduler] 🚀 Đã tự động chuyển đơn #${order.code} từ SCHEDULED sang PENDING (Giờ nhận: ${order.pickup_time})`);

      // 3. Bắn sự kiện Socket.IO thông báo cho Nhân viên thu ngân và Barista
      if (io) {
        io.emit('order:status_updated', {
          orderId: order.id,
          orderCode: order.code,
          previousStatus: 'scheduled',
          status: 'pending',
          reason: 'auto_scheduled_dispatch',
          pickupTime: order.pickup_time
        });

        io.emit('order:created', {
          orderId: order.id,
          orderCode: order.code,
          invoiceNo: order.invoice_no,
          customerName: order.customer_name,
          customerPhone: order.customer_phone,
          orderType: order.order_type,
          total: order.total,
          status: 'pending',
          isScheduledDispatch: true,
          pickupTime: order.pickup_time
        });

        io.emit('barista:new_order', {
          orderId: order.id,
          orderCode: order.code,
          customerName: order.customer_name,
          orderType: order.order_type,
          isScheduledDispatch: true,
          pickupTime: order.pickup_time
        });
      }
    }
  } catch (err) {
    console.error('[OrderScheduler] Error checking scheduled orders:', err.message);
  }
};

const initOrderScheduler = (io) => {
  if (schedulerInterval) {
    clearInterval(schedulerInterval);
  }
  // Chạy ngay khi khởi động
  checkAndDispatchScheduledOrders(io);
  // Định kỳ quét mỗi 30 giây
  schedulerInterval = setInterval(() => {
    checkAndDispatchScheduledOrders(io);
  }, 30000);

  console.log('⏰ Order Scheduler background worker started (interval: 30s)');
};

module.exports = {
  initOrderScheduler,
  checkAndDispatchScheduledOrders
};

