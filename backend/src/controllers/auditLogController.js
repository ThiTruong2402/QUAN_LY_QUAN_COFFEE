const db = require('../config/db');

// GET /api/audit-logs
const getLogs = async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 30));
    const offset = (page - 1) * limit;

    const { action, entityType, userId, search, fromDate, toDate } = req.query;

    const whereClauses = [];
    const params = [];

    if (action) {
      if (action === 'ORDER') {
        whereClauses.push("a.action IN ('CREATE_ORDER', 'UPDATE_ORDER_STATUS', 'CANCEL_ORDER', 'PAY_ORDER')");
      } else if (action === 'STAFF') {
        whereClauses.push("a.action IN ('CREATE_STAFF', 'UPDATE_STAFF', 'DELETE_STAFF', 'RESET_PASSWORD', 'ASSIGN_ROLE')");
      } else if (action === 'INVENTORY') {
        whereClauses.push("a.action IN ('ADJUST_STOCK', 'CREATE_INGREDIENT', 'UPDATE_INGREDIENT')");
      } else if (action === 'MENU') {
        whereClauses.push("a.action IN ('CRUD_PRODUCT', 'CRUD_CATEGORY', 'CRUD_RECIPE', 'ADD_PRODUCT', 'UPDATE_PRODUCT', 'DELETE_PRODUCT')");
      } else {
        whereClauses.push('a.action = ?');
        params.push(action);
      }
    }

    if (entityType) {
      whereClauses.push('a.entity_type = ?');
      params.push(entityType);
    }

    if (userId) {
      whereClauses.push('a.user_id = ?');
      params.push(userId);
    }

    if (search && search.trim()) {
      const s = `%${search.trim()}%`;
      whereClauses.push('(a.reason LIKE ? OR a.action LIKE ? OR u.full_name LIKE ? OR u.username LIKE ?)');
      params.push(s, s, s, s);
    }

    if (fromDate) {
      whereClauses.push('a.created_at >= ?');
      params.push(`${fromDate} 00:00:00`);
    }

    if (toDate) {
      whereClauses.push('a.created_at <= ?');
      params.push(`${toDate} 23:59:59`);
    }

    const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

    // Count total
    const [countRows] = await db.query(
      `SELECT COUNT(*) AS total
       FROM audit_logs a
       LEFT JOIN users u ON u.id = a.user_id
       ${whereSql}`,
      params
    );
    const total = countRows[0]?.total || 0;

    // Fetch items with user & role info
    const [rows] = await db.query(
      `SELECT 
         a.id, a.user_id, a.approved_by, a.action, a.entity_type, a.entity_id,
         a.old_value, a.new_value, a.reason, a.ip_address, a.created_at,
         u.code AS user_code, u.username, u.full_name,
         r.name AS role_name, r.label AS role_label
       FROM audit_logs a
       LEFT JOIN users u ON u.id = a.user_id
       LEFT JOIN roles r ON r.id = u.role_id
       ${whereSql}
       ORDER BY a.id DESC
       LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );

    // Summary statistics for cards
    const [statsRows] = await db.query(`
      SELECT
        COUNT(*) AS total_all,
        SUM(CASE WHEN DATE(created_at) = CURDATE() THEN 1 ELSE 0 END) AS today_count,
        SUM(CASE WHEN action IN ('CREATE_ORDER', 'UPDATE_ORDER_STATUS', 'CANCEL_ORDER', 'PAY_ORDER') THEN 1 ELSE 0 END) AS order_actions,
        SUM(CASE WHEN action IN ('CREATE_STAFF', 'UPDATE_STAFF', 'DELETE_STAFF', 'RESET_PASSWORD', 'ASSIGN_ROLE') THEN 1 ELSE 0 END) AS staff_actions,
        SUM(CASE WHEN action = 'LOGIN' THEN 1 ELSE 0 END) AS login_actions
      FROM audit_logs
    `);

    res.json({
      success: true,
      data: {
        logs: rows,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit) || 1,
        },
        stats: statsRows[0] || {
          total_all: 0,
          today_count: 0,
          order_actions: 0,
          staff_actions: 0,
          login_actions: 0,
        },
      },
    });
  } catch (err) {
    console.error('AuditLog getLogs error:', err);
    res.status(500).json({ success: false, message: 'Lỗi tải nhật ký hoạt động: ' + err.message });
  }
};

module.exports = { getLogs };

