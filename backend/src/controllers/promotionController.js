const db = require('../config/db');

// GET /api/promotions
const getAll = async (req, res) => {
  try {
    const [rows] = await db.query('SELECT * FROM promotions ORDER BY id DESC');
    res.json({ success: true, data: rows });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// POST /api/promotions
const create = async (req, res) => {
  try {
    const {
      name,
      code,
      type = 'percent_order',
      value,
      min_order_value = 0,
      max_discount = null,
      description = null,
      start_date,
      end_date,
    } = req.body;
    if (!name || value === undefined || value === null) {
      return res.status(400).json({ success: false, message: 'Vui lòng nhập tên và giá trị khuyến mãi' });
    }
    const cleanCode = code ? String(code).trim().toUpperCase() : null;
    const [result] = await db.query(
      `INSERT INTO promotions (name, code, type, value, min_order_value, max_discount, description, start_date, end_date, is_active)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
      [
        name,
        cleanCode,
        type,
        Number(value),
        Number(min_order_value || 0),
        max_discount ? Number(max_discount) : null,
        description || null,
        start_date || null,
        end_date || null,
      ]
    );
    res.status(201).json({ success: true, message: 'Tạo khuyến mãi thành công', data: { id: result.insertId } });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// DELETE /api/promotions/:id
const remove = async (req, res) => {
  try {
    const { id } = req.params;
    await db.query('DELETE FROM promotions WHERE id = ?', [id]);
    res.json({ success: true, message: 'Đã xóa chương trình khuyến mãi' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// PUT /api/promotions/:id/toggle
const toggle = async (req, res) => {
  try {
    const { id } = req.params;
    const [rows] = await db.query('SELECT is_active FROM promotions WHERE id = ?', [id]);
    if (!rows.length) return res.status(404).json({ success: false, message: 'Không tìm thấy khuyến mãi' });
    const nextState = rows[0].is_active ? 0 : 1;
    await db.query('UPDATE promotions SET is_active = ? WHERE id = ?', [nextState, id]);
    res.json({ success: true, message: nextState ? 'Đã kích hoạt khuyến mãi' : 'Đã tạm dừng khuyến mãi' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// GET /api/promotions/active
const getActive = async (req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT id, code, name, type, value, min_order_value, max_discount, description 
       FROM promotions 
       WHERE is_active = 1 
         AND (start_date IS NULL OR start_date <= CURDATE())
         AND (end_date IS NULL OR end_date >= CURDATE())
       ORDER BY value DESC`
    );
    res.json({ success: true, data: rows });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// POST /api/promotions/validate
const validateCoupon = async (req, res) => {
  try {
    const { code, subtotal = 0 } = req.body;
    if (!code) {
      return res.status(400).json({ success: false, message: 'Vui lòng nhập mã giảm giá' });
    }

    const [rows] = await db.query(
      `SELECT * FROM promotions 
       WHERE BINARY code = ? AND is_active = 1 
         AND (start_date IS NULL OR start_date <= CURDATE())
         AND (end_date IS NULL OR end_date >= CURDATE())`,
      [code.trim().toUpperCase()]
    );

    if (!rows.length) {
      return res.json({ success: false, valid: false, message: 'Mã giảm giá không tồn tại hoặc đã hết hạn' });
    }

    const promo = rows[0];
    const numSubtotal = Number(subtotal);

    if (promo.min_order_value && numSubtotal < Number(promo.min_order_value)) {
      return res.json({
        success: false,
        valid: false,
        message: `Đơn hàng tối thiểu phải từ ${Number(promo.min_order_value).toLocaleString('vi-VN')} đ để áp dụng mã này`,
      });
    }

    let discount = 0;
    if (promo.type === 'percent_order' || promo.type === 'happy_hour') {
      discount = Math.round(numSubtotal * (Number(promo.value) / 100));
      if (promo.max_discount && discount > Number(promo.max_discount)) {
        discount = Number(promo.max_discount);
      }
    } else if (promo.type === 'amount_order') {
      discount = Math.min(numSubtotal, Number(promo.value));
    }

    res.json({
      success: true,
      valid: true,
      message: `Áp dụng thành công mã "${promo.code}": ${promo.name}`,
      data: {
        code: promo.code,
        name: promo.name,
        discount,
        description: promo.description,
        type: promo.type,
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

module.exports = { getAll, getActive, validateCoupon, create, toggle, remove };

