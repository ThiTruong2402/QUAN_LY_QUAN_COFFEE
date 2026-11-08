const db = require('../config/db');
const { getVietnamDateString } = require('../utils/date');

// GET /api/reports/revenue?from=&to=
const revenue = async (req, res) => {
  try {
    const { from, to } = req.query;
    const defaultTo = getVietnamDateString();
    const defaultFrom = from || '2024-01-01';
    const effectiveTo = to || defaultTo;

    // Doanh thu theo ngày: Ghi nhận ngay khi đơn đã thanh toán (payment_status = 'paid' hoặc status = 'paid')
    const [daily] = await db.query(
      `SELECT DATE(COALESCE(o.closed_at, o.opened_at)) AS date,
              COUNT(o.id) AS orders,
              SUM(o.total) AS revenue
       FROM orders o
       WHERE (o.payment_status = 'paid' OR o.status = 'paid') 
         AND o.status != 'cancelled'
         AND DATE(COALESCE(o.closed_at, o.opened_at)) BETWEEN ? AND ?
       GROUP BY DATE(COALESCE(o.closed_at, o.opened_at)) 
       ORDER BY date`,
      [defaultFrom, effectiveTo]
    );

    // Cơ cấu doanh thu theo phương thức thanh toán
    const [byMethod] = await db.query(
      `SELECT p.method, SUM(p.amount) AS total
       FROM payments p
       JOIN orders o ON o.id = p.order_id
       WHERE (o.payment_status = 'paid' OR o.status = 'paid') 
         AND o.status != 'cancelled'
         AND p.type = 'payment'
         AND DATE(p.paid_at) BETWEEN ? AND ?
       GROUP BY p.method`,
      [defaultFrom, effectiveTo]
    );

    // Top 10 sản phẩm bán chạy nhất
    const [topProducts] = await db.query(
      `SELECT oi.product_name, SUM(oi.quantity) AS qty, SUM(oi.line_total) AS revenue
       FROM order_items oi
       JOIN orders o ON o.id = oi.order_id
       WHERE (o.payment_status = 'paid' OR o.status = 'paid') 
         AND o.status != 'cancelled' 
         AND oi.status != 'cancelled'
         AND DATE(COALESCE(o.closed_at, o.opened_at)) BETWEEN ? AND ?
       GROUP BY oi.product_name 
       ORDER BY qty DESC 
       LIMIT 10`,
      [defaultFrom, effectiveTo]
    );

    res.json({ success: true, data: { daily, byMethod, topProducts } });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Lỗi tải báo cáo doanh thu: ' + err.message });
  }
};

// GET /api/reports/stock (Thống kê hàng của kho & nguyên liệu chi tiết)
const stock = async (req, res) => {
  try {
    const [ingredients] = await db.query(
      `SELECT i.*, 
              (i.current_stock <= i.min_stock) AS is_low,
              ROUND(i.current_stock * i.avg_cost) AS total_value
       FROM ingredients i 
       ORDER BY is_low DESC, i.name`
    );

    let totalInventoryValue = 0;
    let lowStockCount = 0;
    for (const item of ingredients) {
      totalInventoryValue += Number(item.total_value || 0);
      if (item.is_low) lowStockCount++;
    }

    // Top consumed ingredients through drinks orders
    const [topConsumed] = await db.query(
      `SELECT i.name, i.unit, 
              ROUND(SUM(sm.quantity), 3) AS total_consumed,
              ROUND(SUM(sm.quantity * sm.unit_cost)) AS total_cost
       FROM stock_movements sm
       JOIN ingredients i ON i.id = sm.ingredient_id
       WHERE sm.movement_type = 'sale'
       GROUP BY i.id, i.name, i.unit
       ORDER BY total_consumed DESC
       LIMIT 10`
    );

    // Recent movements
    const [recentMovements] = await db.query(
      `SELECT sm.*, i.name AS ingredient_name, i.unit, u.full_name AS created_by_name
       FROM stock_movements sm
       JOIN ingredients i ON i.id = sm.ingredient_id
       LEFT JOIN users u ON u.id = sm.created_by
       ORDER BY sm.created_at DESC
       LIMIT 12`
    );

    res.json({
      success: true,
      data: {
        items: ingredients,
        summary: {
          total_items: ingredients.length,
          total_inventory_value: totalInventoryValue,
          low_stock_count: lowStockCount,
        },
        top_consumed: topConsumed,
        recent_movements: recentMovements,
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Lỗi tải thống kê kho: ' + err.message });
  }
};

// GET /api/reports/dashboard
const dashboard = async (req, res) => {
  try {
    const todayStr = getVietnamDateString();
    const yesterdayStr = getVietnamDateString(new Date(Date.now() - 86400000));

    // 1. Doanh thu hôm nay (Tính cả đơn đã thanh toán tại quầy đang chờ làm theo chuẩn GMT+7)
    const [[today]] = await db.query(
      `SELECT COUNT(*) AS orders, IFNULL(SUM(total), 0) AS revenue
       FROM orders 
       WHERE (payment_status = 'paid' OR status = 'paid') 
         AND status != 'cancelled' 
         AND DATE(COALESCE(closed_at, opened_at)) = ?`,
      [todayStr]
    );

    // 2. Doanh thu hôm qua
    const [[yesterday]] = await db.query(
      `SELECT COUNT(*) AS orders, IFNULL(SUM(total), 0) AS revenue
       FROM orders 
       WHERE (payment_status = 'paid' OR status = 'paid') 
         AND status != 'cancelled' 
         AND DATE(COALESCE(closed_at, opened_at)) = ?`,
      [yesterdayStr]
    );

    // 3. Đơn đang chờ pha chế / phục vụ
    const [[openOrders]] = await db.query(
      "SELECT COUNT(*) AS cnt FROM orders WHERE status IN ('open', 'pending', 'preparing', 'done', 'served')"
    );

    // 4. Đơn đã hủy hôm nay
    const [[cancelledOrders]] = await db.query(
      `SELECT COUNT(*) AS cnt FROM orders 
       WHERE status = 'cancelled' 
         AND DATE(COALESCE(closed_at, opened_at)) = ?`,
      [todayStr]
    );

    // 5. Cảnh báo nguyên liệu sắp hết
    const [[lowStock]] = await db.query(
      'SELECT COUNT(*) AS cnt FROM ingredients WHERE current_stock <= min_stock'
    );

    // 6. Tổng khách hàng thành viên
    const [[customers]] = await db.query('SELECT COUNT(*) AS cnt FROM customers');

    // 7. Tổng lũy kế toàn thời gian
    const [[allTime]] = await db.query(
      `SELECT COUNT(*) AS total_paid_orders, IFNULL(SUM(total), 0) AS total_revenue, IFNULL(AVG(total), 0) AS avg_order_value
       FROM orders 
       WHERE (payment_status = 'paid' OR status = 'paid') AND status != 'cancelled'`
    );

    // 8. Xu hướng doanh thu theo khung giờ hôm nay
    const [hourlyTrend] = await db.query(
      `SELECT HOUR(COALESCE(closed_at, opened_at)) AS hour, COUNT(*) AS count, SUM(total) AS revenue
       FROM orders 
       WHERE (payment_status = 'paid' OR status = 'paid') 
         AND status != 'cancelled'
         AND DATE(COALESCE(closed_at, opened_at)) = ?
       GROUP BY HOUR(COALESCE(closed_at, opened_at))
       ORDER BY hour`,
      [todayStr]
    );

    // 9. Top 5 đồ uống bán chạy
    const [topProducts] = await db.query(
      `SELECT oi.product_name, SUM(oi.quantity) AS qty, SUM(oi.line_total) AS revenue
       FROM order_items oi
       JOIN orders o ON o.id = oi.order_id
       WHERE (o.payment_status = 'paid' OR o.status = 'paid') 
         AND o.status != 'cancelled' 
         AND oi.status != 'cancelled'
       GROUP BY oi.product_name 
       ORDER BY qty DESC 
       LIMIT 5`
    );

    const revToday = Number(today.revenue || 0);
    const revYesterday = Number(yesterday.revenue || 0);
    let revenueGrowth = null;
    if (revYesterday > 0) {
      revenueGrowth = Math.round(((revToday - revYesterday) / revYesterday) * 100);
    }

    res.json({
      success: true,
      data: {
        today_orders: today.orders,
        today_revenue: revToday,
        yesterday_revenue: revYesterday,
        revenue_growth: revenueGrowth,
        open_orders: openOrders.cnt,
        cancelled_orders: cancelledOrders.cnt,
        low_stock_alerts: lowStock.cnt,
        total_customers: customers.cnt,
        total_revenue: Number(allTime.total_revenue || 0),
        total_paid_orders: allTime.total_paid_orders || 0,
        avg_order_value: Math.round(Number(allTime.avg_order_value || 0)),
        hourly_trend: hourlyTrend || [],
        top_products: topProducts || [],
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Lỗi tải dữ liệu bảng điều khiển: ' + err.message });
  }
};

module.exports = { revenue, stock, dashboard };
