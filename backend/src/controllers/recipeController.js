const db = require('../config/db');

// GET /api/recipes
const getAll = async (req, res) => {
  try {
    const [rows] = await db.query(`
      SELECT r.id, r.product_size_id, r.ingredient_id, r.quantity,
             p.id AS product_id, p.code AS product_code, p.name AS product_name,
             ps.name AS size_name,
             i.code AS ingredient_code, i.name AS ingredient_name, i.unit AS ingredient_unit
      FROM recipes r
      JOIN product_sizes ps ON ps.id = r.product_size_id
      JOIN products p ON p.id = ps.product_id
      JOIN ingredients i ON i.id = r.ingredient_id
      ORDER BY p.name, ps.name
    `);

    const [products] = await db.query(`
      SELECT p.id, p.code, p.name, ps.id AS size_id, ps.name AS size_name
      FROM products p
      JOIN product_sizes ps ON ps.product_id = p.id
      JOIN categories c ON c.id = p.category_id
      WHERE p.is_active = 1
      ORDER BY c.sort_order, p.code, ps.id
    `);

    const [ingredients] = await db.query('SELECT id, code, name, unit FROM ingredients ORDER BY name');

    res.json({ success: true, data: { recipes: rows, products, ingredients } });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// POST /api/recipes
const create = async (req, res) => {
  try {
    const { product_size_id, ingredient_id, quantity } = req.body;
    const [result] = await db.query(
      `INSERT INTO recipes (product_size_id, ingredient_id, quantity)
       VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE quantity = VALUES(quantity)`,
      [product_size_id, ingredient_id, quantity]
    );
    res.status(201).json({ success: true, message: 'Lưu công thức thành công', data: { id: result.insertId } });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// DELETE /api/recipes/:id
const remove = async (req, res) => {
  try {
    await db.query('DELETE FROM recipes WHERE id = ?', [req.params.id]);
    res.json({ success: true, message: 'Đã xóa công thức' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

module.exports = { getAll, create, remove };
