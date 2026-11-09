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
    const [rows] = await db.query(
      `SELECT c.*, t.name AS tier_name, t.discount_pct 
       FROM customers c
       LEFT JOIN membership_tiers t ON t.id = c.tier_id
       WHERE c.phone = ?`,
      [phone]
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
    const { phone, name, birthday, tier_id } = req.body;
    if (!phone) return res.status(400).json({ success: false, message: 'Số điện thoại không được trống' });
    const [result] = await db.query(
      'INSERT INTO customers (phone, name, birthday, tier_id) VALUES (?, ?, ?, ?)',
      [phone, name || null, birthday || null, tier_id || 1]
    );
    res.status(201).json({ success: true, message: 'Thêm khách hàng thành công', data: { id: result.insertId } });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// PUT /api/customers/:id
const update = async (req, res) => {
  try {
    const { id } = req.params;
    const { phone, name, birthday, tier_id } = req.body;
    if (!phone || !String(phone).trim()) {
      return res.status(400).json({ success: false, message: 'Số điện thoại không được để trống' });
    }
    await db.query(
      'UPDATE customers SET phone = ?, name = COALESCE(?, name), birthday = COALESCE(?, birthday), tier_id = COALESCE(?, tier_id) WHERE id = ?',
      [phone.trim(), name || null, birthday || null, tier_id || null, id]
    );
    res.json({ success: true, message: 'Cập nhật thông tin khách hàng thành công' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Lỗi cập nhật khách hàng: ' + err.message });
  }
};

module.exports = { getAll, lookupPhone, create, update };
