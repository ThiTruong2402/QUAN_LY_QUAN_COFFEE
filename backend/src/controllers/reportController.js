const db = require('../config/db');
const { getVietnamDateString } = require('../utils/date');

const shiftDateStr = (isoDate, deltaDays) => {
  const d = new Date(`${isoDate}T12:00:00+07:00`);
  d.setDate(d.getDate() + deltaDays);
  return getVietnamDateString(d);
};

// GET /api/reports/revenue?period=today|7d|30d|month&from=YYYY-MM-DD&to=YYYY-MM-DD
const revenue = async (req, res) => {
  try {
    const todayStr = getVietnamDateString();
    const period = String(req.query.period || '').toLowerCase();
    const effectiveTo = req.query.to || todayStr;
    let effectiveFrom = req.query.from;
    if (!effectiveFrom) {
      if (period === 'today') effectiveFrom = todayStr;
      else if (period === '7d') effectiveFrom = shiftDateStr(effectiveTo, -6);
      else if (period === 'month') effectiveFrom = `${effectiveTo.slice(0, 7)}-01`;
      else effectiveFrom = shiftDateStr(effectiveTo, -29);
    }

    // Tính khoảng ngày kỳ trước để so sánh % tăng trưởng
    const fromMs = new Date(`${effectiveFrom}T00:00:00+07:00`).getTime();
    const toMs = new Date(`${effectiveTo}T00:00:00+07:00`).getTime();
    const rangeDays = Math.max(1, Math.round((toMs - fromMs) / 86400000) + 1);
    const prevTo = shiftDateStr(effectiveFrom, -1);
    const prevFrom = shiftDateStr(prevTo, -(rangeDays - 1));

    // 1. Tổng hợp KPI trong kỳ lọc & kỳ trước
    const [[currSummary]] = await db.query(
      `SELECT COUNT(*) AS orders,
              IFNULL(SUM(subtotal), 0) AS gross_sales,
              IFNULL(SUM(discount_total), 0) AS total_discount,
              IFNULL(SUM(total), 0) AS net_revenue,
              IFNULL(AVG(total), 0) AS avg_order_value
       FROM orders
       WHERE (payment_status = 'paid' OR status = 'paid')
         AND status != 'cancelled'
         AND DATE(COALESCE(closed_at, opened_at)) BETWEEN ? AND ?`,
      [effectiveFrom, effectiveTo]
    );

    const [[prevSummary]] = await db.query(
      `SELECT COUNT(*) AS orders, IFNULL(SUM(total), 0) AS net_revenue
       FROM orders
       WHERE (payment_status = 'paid' OR status = 'paid')
         AND status != 'cancelled'
         AND DATE(COALESCE(closed_at, opened_at)) BETWEEN ? AND ?`,
      [prevFrom, prevTo]
    );

    const [[itemStats]] = await db.query(
      `SELECT IFNULL(SUM(oi.quantity), 0) AS total_items_sold
       FROM order_items oi
       JOIN orders o ON o.id = oi.order_id
       WHERE (o.payment_status = 'paid' OR o.status = 'paid')
         AND o.status != 'cancelled' AND oi.status != 'cancelled'
         AND DATE(COALESCE(o.closed_at, o.opened_at)) BETWEEN ? AND ?`,
      [effectiveFrom, effectiveTo]
    );

    const [[cancelStats]] = await db.query(
      `SELECT COUNT(*) AS cancelled_orders, IFNULL(SUM(total), 0) AS cancelled_value
       FROM orders
       WHERE status = 'cancelled'
         AND DATE(COALESCE(closed_at, opened_at)) BETWEEN ? AND ?`,
      [effectiveFrom, effectiveTo]
    );

    const [[cogsStats]] = await db.query(
      `SELECT IFNULL(ROUND(SUM(quantity * unit_cost)), 0) AS total_cogs
       FROM stock_movements
       WHERE movement_type = 'sale'
         AND DATE(created_at) BETWEEN ? AND ?`,
      [effectiveFrom, effectiveTo]
    );

    // 2. Xu hướng doanh thu & số đơn theo ngày (Tuân thủ MySQL ONLY_FULL_GROUP_BY)
    const [daily] = await db.query(
      `SELECT DATE_FORMAT(COALESCE(o.closed_at, o.opened_at), '%Y-%m-%d') AS date,
              COUNT(o.id) AS orders,
              IFNULL(SUM(o.total), 0) AS revenue
       FROM orders o
       WHERE (o.payment_status = 'paid' OR o.status = 'paid')
         AND o.status != 'cancelled'
         AND DATE(COALESCE(o.closed_at, o.opened_at)) BETWEEN ? AND ?
       GROUP BY DATE_FORMAT(COALESCE(o.closed_at, o.opened_at), '%Y-%m-%d')
       ORDER BY date ASC`,
      [effectiveFrom, effectiveTo]
    );

    // 3. Khung giờ cao điểm (Peak Hours) trong toàn bộ kỳ lọc
    const [hourly] = await db.query(
      `SELECT HOUR(COALESCE(o.closed_at, o.opened_at)) AS hour,
              COUNT(o.id) AS orders,
              IFNULL(SUM(o.total), 0) AS revenue
       FROM orders o
       WHERE (o.payment_status = 'paid' OR o.status = 'paid')
         AND o.status != 'cancelled'
         AND DATE(COALESCE(o.closed_at, o.opened_at)) BETWEEN ? AND ?
       GROUP BY HOUR(COALESCE(o.closed_at, o.opened_at))
       ORDER BY hour ASC`,
      [effectiveFrom, effectiveTo]
    );

    // 4. Cơ cấu phương thức thanh toán
    const [byMethod] = await db.query(
      `SELECT p.method, COUNT(DISTINCT p.order_id) AS orders, IFNULL(SUM(p.amount), 0) AS total
       FROM payments p
       JOIN orders o ON o.id = p.order_id
       WHERE (o.payment_status = 'paid' OR o.status = 'paid')
         AND o.status != 'cancelled'
         AND p.type = 'payment'
         AND DATE(COALESCE(o.closed_at, o.opened_at)) BETWEEN ? AND ?
       GROUP BY p.method
       ORDER BY total DESC`,
      [effectiveFrom, effectiveTo]
    );

    // 5. Cơ cấu kênh phục vụ (Tại quán vs Mang về / Online)
    const [byOrderType] = await db.query(
      `SELECT o.order_type, COUNT(o.id) AS orders, IFNULL(SUM(o.total), 0) AS total
       FROM orders o
       WHERE (o.payment_status = 'paid' OR o.status = 'paid')
         AND o.status != 'cancelled'
         AND DATE(COALESCE(o.closed_at, o.opened_at)) BETWEEN ? AND ?
       GROUP BY o.order_type
       ORDER BY total DESC`,
      [effectiveFrom, effectiveTo]
    );

    // 6. Doanh thu theo nhóm món
    const [byCategory] = await db.query(
      `SELECT COALESCE(c.name, 'Khác') AS category_name,
              SUM(oi.quantity) AS qty,
              IFNULL(SUM(oi.line_total), 0) AS revenue
       FROM order_items oi
       JOIN orders o ON o.id = oi.order_id
       LEFT JOIN product_sizes ps ON ps.id = oi.product_size_id
       LEFT JOIN products p ON p.id = ps.product_id
       LEFT JOIN categories c ON c.id = p.category_id
       WHERE (o.payment_status = 'paid' OR o.status = 'paid')
         AND o.status != 'cancelled' AND oi.status != 'cancelled'
         AND DATE(COALESCE(o.closed_at, o.opened_at)) BETWEEN ? AND ?
       GROUP BY COALESCE(c.name, 'Khác')
       ORDER BY revenue DESC`,
      [effectiveFrom, effectiveTo]
    );

    // 7. Top sản phẩm bán chạy (sắp giảm dần theo doanh thu)
    const [topProducts] = await db.query(
      `SELECT oi.product_name,
              SUM(oi.quantity) AS qty,
              IFNULL(SUM(oi.line_total), 0) AS revenue
       FROM order_items oi
       JOIN orders o ON o.id = oi.order_id
       WHERE (o.payment_status = 'paid' OR o.status = 'paid')
         AND o.status != 'cancelled' AND oi.status != 'cancelled'
         AND DATE(COALESCE(o.closed_at, o.opened_at)) BETWEEN ? AND ?
       GROUP BY oi.product_name
       ORDER BY revenue DESC, qty DESC
       LIMIT 10`,
      [effectiveFrom, effectiveTo]
    );

    // 8. Hiệu suất doanh thu theo Nhân viên thu ngân / Kênh Online
    const [byStaff] = await db.query(
      `SELECT COALESCE(u.full_name, 'Cổng Khách Hàng Online') AS staff_name,
              COALESCE(r.label, r.name, 'Online') AS role_label,
              COUNT(o.id) AS orders,
              IFNULL(SUM(o.total), 0) AS revenue
       FROM orders o
       LEFT JOIN users u ON u.id = o.created_by
       LEFT JOIN roles r ON r.id = u.role_id
       WHERE (o.payment_status = 'paid' OR o.status = 'paid')
         AND o.status != 'cancelled'
         AND DATE(COALESCE(o.closed_at, o.opened_at)) BETWEEN ? AND ?
       GROUP BY COALESCE(u.full_name, 'Cổng Khách Hàng Online'), COALESCE(r.label, r.name, 'Online')
       ORDER BY revenue DESC
       LIMIT 8`,
      [effectiveFrom, effectiveTo]
    );

    const netRev = Number(currSummary.net_revenue || 0);
    const prevRev = Number(prevSummary.net_revenue || 0);
    const cogs = Number(cogsStats.total_cogs || 0);
    const grossProfit = Math.max(0, netRev - cogs);
    const grossMarginPct = netRev > 0 ? Math.round((grossProfit / netRev) * 100) : 0;
    const growthPct = prevRev > 0 ? Math.round(((netRev - prevRev) / prevRev) * 100) : null;

    res.json({
      success: true,
      data: {
        summary: {
          from: effectiveFrom,
          to: effectiveTo,
          orders: Number(currSummary.orders || 0),
          gross_sales: Number(currSummary.gross_sales || 0),
          total_discount: Number(currSummary.total_discount || 0),
          net_revenue: netRev,
          prev_revenue: prevRev,
          revenue_growth_pct: growthPct,
          avg_order_value: Math.round(Number(currSummary.avg_order_value || 0)),
          total_items_sold: Number(itemStats.total_items_sold || 0),
          cancelled_orders: Number(cancelStats.cancelled_orders || 0),
          cancelled_value: Number(cancelStats.cancelled_value || 0),
          total_cogs: cogs,
          gross_profit: grossProfit,
          gross_margin_pct: grossMarginPct,
        },
        daily,
        hourly,
        byMethod,
        byOrderType,
        byCategory,
        topProducts,
        byStaff,
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Lỗi tải báo cáo doanh thu: ' + err.message });
  }
};

// GET /api/reports/stock (Thống kê kho & nguyên liệu chuẩn theo tổng giá trị tiêu hao)
const stock = async (req, res) => {
  try {
    const { from, to } = req.query;
    const dateFilterSql = (from && to) ? 'AND DATE(sm.created_at) BETWEEN ? AND ?' : '';
    const dateFilterParams = (from && to) ? [from, to] : [];

    const [ingredients] = await db.query(
      `SELECT i.*,
              (i.current_stock <= i.min_stock) AS is_low,
              ROUND(i.current_stock * i.avg_cost) AS total_value
       FROM ingredients i
       ORDER BY is_low DESC, total_value DESC, i.name ASC`
    );

    let totalInventoryValue = 0;
    let lowStockCount = 0;
    let outOfStockCount = 0;
    for (const item of ingredients) {
      totalInventoryValue += Number(item.total_value || 0);
      if (Number(item.current_stock) <= 0) outOfStockCount++;
      else if (item.is_low) lowStockCount++;
    }

    const [topConsumed] = await db.query(
      `SELECT i.id, i.code, i.name, i.unit,
              ROUND(SUM(sm.quantity), 3) AS total_consumed,
              ROUND(SUM(sm.quantity * sm.unit_cost)) AS total_cost
       FROM stock_movements sm
       JOIN ingredients i ON i.id = sm.ingredient_id
       WHERE sm.movement_type = 'sale' ${dateFilterSql}
       GROUP BY i.id, i.code, i.name, i.unit
       HAVING ROUND(SUM(sm.quantity * sm.unit_cost)) > 0
       ORDER BY total_cost DESC
       LIMIT 8`,
      dateFilterParams
    );

    const [[costOverview]] = await db.query(
      `SELECT
         IFNULL(ROUND(SUM(CASE WHEN sm.movement_type = 'sale' THEN sm.quantity * sm.unit_cost ELSE 0 END)), 0) AS total_sale_cost,
         IFNULL(ROUND(SUM(CASE WHEN sm.movement_type = 'waste' THEN sm.quantity * sm.unit_cost ELSE 0 END)), 0) AS total_waste_cost
       FROM stock_movements sm
       WHERE 1=1 ${dateFilterSql}`,
      dateFilterParams
    );

    const [recentMovements] = await db.query(
      `SELECT sm.*, i.name AS ingredient_name, i.unit, u.full_name AS created_by_name
       FROM stock_movements sm
       JOIN ingredients i ON i.id = sm.ingredient_id
       LEFT JOIN users u ON u.id = sm.created_by
       ORDER BY sm.created_at DESC
       LIMIT 15`
    );

    res.json({
      success: true,
      data: {
        items: ingredients,
        summary: {
          total_items: ingredients.length,
          total_inventory_value: totalInventoryValue,
          low_stock_count: lowStockCount,
          out_of_stock_count: outOfStockCount,
          ok_stock_count: Math.max(0, ingredients.length - lowStockCount - outOfStockCount),
          total_sale_cost: Number(costOverview.total_sale_cost || 0),
          total_waste_cost: Number(costOverview.total_waste_cost || 0),
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
       ORDER BY revenue DESC, qty DESC 
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
