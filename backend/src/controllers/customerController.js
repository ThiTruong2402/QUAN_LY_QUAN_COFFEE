const db = require('../config/db');

// GET /api/customers
const getAll = async (req, res) => {
  try {
    const { search } = req.query;
    let query = `
      SELECT c.*, t.name AS tier_name, t.discount_pct 
      FROM customers c
      LEFT JOIN membership_tiers t ON t.id = c.tier_id
    `;
    const params = [];
    if (search) {
      query += ' WHERE c.phone LIKE ? OR c.name LIKE ?';
      params.push(`%${search}%`, `%${search}%`);
    }
    query += ' ORDER BY c.id DESC';

    const [rows] = await db.query(query, params);
    const [tiers] = await db.query('SELECT * FROM membership_tiers ORDER BY min_spent');
    res.json({ success: true, data: { customers: rows, tiers } });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// GET /api/customers/lookup/:phone
const lookupPhone = async (req, res) => {
  try {
    const { phone } = req.params;
    const cleanPhone = String(phone).trim();

    // RBAC-01: Nếu là khách hàng (role 'customer'), chỉ được phép tra cứu thông tin của chính mình
    if (req.user?.role === 'customer') {
      const selfPhone = req.user.phone || req.user.username;
      if (selfPhone !== cleanPhone) {
        return res.status(403).json({
          success: false,
          message: 'Quyền hạn: Quý khách chỉ có thể tra cứu thông tin tài khoản của chính mình!'
        });
      }
    }

    const [rows] = await db.query(
      `SELECT c.id, c.phone, c.name, c.tier_id, c.points_balance, c.total_spent, t.name AS tier_name, t.discount_pct 
       FROM customers c
       LEFT JOIN membership_tiers t ON t.id = c.tier_id
       WHERE c.phone = ?`,
      [cleanPhone]
    );
    if (!rows.length) return res.status(404).json({ success: false, message: 'Khách hàng chưa có trong hệ thống' });
    res.json({ success: true, data: rows[0] });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// POST /api/customers
const create = async (req, res) => {
  try {
    const { phone, name, birthday, tier_id, points_balance } = req.body;
    if (!phone || !String(phone).trim()) {
      return res.status(400).json({ success: false, message: 'Số điện thoại không được để trống' });
    }
    const cleanPhone = String(phone).trim();

    // RBAC-03: Chỉ Admin hoặc Manager mới được phép gán points_balance và tier_id thủ công
    const isManagerOrAdmin = ['admin', 'manager'].includes(req.user?.role);
    const pts = isManagerOrAdmin ? Math.max(0, parseInt(points_balance, 10) || 0) : 0;
    const targetTier = isManagerOrAdmin && tier_id ? tier_id : 1;

    const [result] = await db.query(
      'INSERT INTO customers (phone, name, birthday, tier_id, points_balance) VALUES (?, ?, ?, ?, ?)',
      [cleanPhone, name ? String(name).trim() : null, birthday || null, targetTier, pts]
    );
    res.status(201).json({ success: true, message: 'Thêm khách hàng thành công', data: { id: result.insertId } });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(400).json({ success: false, message: `Số điện thoại ${req.body.phone} đã tồn tại trong hệ thống!` });
    }
    res.status(500).json({ success: false, message: err.message });
  }
};

// PUT /api/customers/:id
const update = async (req, res) => {
  try {
    const { id } = req.params;
    const { phone, name, birthday, tier_id, points_balance } = req.body;
    if (!phone || !String(phone).trim()) {
      return res.status(400).json({ success: false, message: 'Số điện thoại không được để trống' });
    }
    const cleanPhone = String(phone).trim();

    // RBAC-03: Chỉ Admin hoặc Manager mới được sửa points_balance và tier_id thủ công
    const isManagerOrAdmin = ['admin', 'manager'].includes(req.user?.role);
    if (!isManagerOrAdmin && (points_balance !== undefined || tier_id !== undefined)) {
      return res.status(403).json({
        success: false,
        message: 'Chỉ Quản trị viên (Admin) hoặc Quản lý mới có quyền điều chỉnh điểm và hạng hội viên thủ công!'
      });
    }

    const [oldCust] = await db.query('SELECT points_balance, tier_id FROM customers WHERE id = ?', [id]);
    const oldPts = oldCust[0]?.points_balance;
    const pts = (isManagerOrAdmin && points_balance !== undefined) ? Math.max(0, parseInt(points_balance, 10) || 0) : null;
    const targetTier = (isManagerOrAdmin && tier_id !== undefined) ? tier_id : null;

    await db.query(
      'UPDATE customers SET phone = ?, name = COALESCE(?, name), birthday = COALESCE(?, birthday), tier_id = COALESCE(?, tier_id), points_balance = COALESCE(?, points_balance) WHERE id = ?',
      [cleanPhone, name ? String(name).trim() : null, birthday || null, targetTier, pts, id]
    );

    // RBAC-03: Ghi Audit Log khi thay đổi điểm thủ công
    if (isManagerOrAdmin && pts !== null && pts !== oldPts) {
      const { logAudit } = require('../services/auditLogger');
      logAudit({
        userId: req.user?.id || null,
        action: 'UPDATE_CUSTOMER_POINTS',
        entityType: 'CUSTOMER',
        entityId: id,
        reason: `Điều chỉnh điểm thủ công khách hàng ID #${id}: ${oldPts} -> ${pts} điểm`,
        ipAddress: req.ip
      });
    }

    res.json({ success: true, message: 'Cập nhật thông tin khách hàng thành công' });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(400).json({ success: false, message: `Số điện thoại ${req.body.phone} đã thuộc về tài khoản khác!` });
    }
    res.status(500).json({ success: false, message: 'Lỗi cập nhật khách hàng: ' + err.message });
  }
};

module.exports = { getAll, lookupPhone, create, update };
