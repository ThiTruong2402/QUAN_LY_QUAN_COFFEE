const db = require('../config/db');

// GET /api/categories
const getAll = async (req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT c.*, COUNT(p.id) AS product_count 
       FROM categories c 
       LEFT JOIN products p ON p.category_id = c.id AND p.is_active = 1
       WHERE c.is_active = 1
       GROUP BY c.id
       ORDER BY c.sort_order, c.id`
    );
    res.json({ success: true, data: rows });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// POST /api/categories
const create = async (req, res) => {
  try {
    const { name, description, sort_order } = req.body;
    if (!name) return res.status(400).json({ success: false, message: 'Tên nhóm món không được trống' });
    const [result] = await db.query(
      'INSERT INTO categories (name, description, sort_order) VALUES (?, ?, ?)',
      [name, description || null, sort_order || 0]
    );
    res.status(201).json({ success: true, message: 'Tạo nhóm món thành công', data: { id: result.insertId } });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// PUT /api/categories/:id
const update = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, description, sort_order } = req.body;
    await db.query(
      'UPDATE categories SET name = ?, description = ?, sort_order = ? WHERE id = ?',
      [name, description, sort_order, id]
    );
    res.json({ success: true, message: 'Cập nhật thành công' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// DELETE /api/categories/:id (soft delete)
const remove = async (req, res) => {
  try {
    const { id } = req.params;
    await db.query('UPDATE categories SET is_active = 0 WHERE id = ?', [id]);
    res.json({ success: true, message: 'Đã xóa nhóm món' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

module.exports = { getAll, create, update, remove };
