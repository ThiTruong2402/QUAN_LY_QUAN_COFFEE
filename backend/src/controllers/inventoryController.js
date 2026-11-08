const db = require('../config/db');

// GET /api/inventory/ingredients
const getIngredients = async (req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT *, (current_stock <= min_stock) AS is_low_stock 
       FROM ingredients ORDER BY name`
    );
    res.json({ success: true, data: rows });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Lỗi khi tải danh sách nguyên liệu: ' + err.message });
  }
};

// POST /api/inventory/ingredients
const createIngredient = async (req, res) => {
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    const { name, unit, min_stock, current_stock, avg_cost, code, image_url } = req.body;
    if (!name || !unit) {
      await conn.rollback();
      return res.status(400).json({ success: false, message: 'Tên và đơn vị không được để trống' });
    }
    const initialStock = parseFloat(current_stock || 0);
    const initialCost = parseFloat(avg_cost || 0);

    const [result] = await conn.query(
      'INSERT INTO ingredients (name, unit, min_stock, current_stock, avg_cost, code, image_url) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [name, unit, min_stock || 0, initialStock, initialCost, code || null, image_url || null]
    );
    const ingredientId = result.insertId;

    // Ghi nhận movement khởi tạo nếu có tồn ban đầu
    if (initialStock > 0) {
      await conn.query(
        `INSERT INTO stock_movements (ingredient_id, movement_type, quantity, unit_cost, balance_after, note, created_by)
         VALUES (?, 'adjustment', ?, ?, ?, 'Khởi tạo nguyên liệu ban đầu', ?)`,
        [ingredientId, initialStock, initialCost, initialStock, req.user?.id || 1]
      );
    }

    await conn.commit();
    res.status(201).json({ success: true, message: 'Thêm nguyên liệu thành công', data: { id: ingredientId } });
  } catch (err) {
    await conn.rollback();
    res.status(500).json({ success: false, message: 'Lỗi khi tạo nguyên liệu: ' + err.message });
  } finally {
    conn.release();
  }
};

// PUT /api/inventory/ingredients/:id
const updateIngredient = async (req, res) => {
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    const { id } = req.params;
    const { name, unit, min_stock, current_stock, avg_cost, code, image_url } = req.body;

    const [existing] = await conn.query('SELECT current_stock, avg_cost FROM ingredients WHERE id = ? FOR UPDATE', [id]);
    if (!existing.length) {
      await conn.rollback();
      return res.status(404).json({ success: false, message: 'Không tìm thấy nguyên liệu' });
    }

    const oldStock = parseFloat(existing[0].current_stock);
    const newStock = current_stock !== undefined ? parseFloat(current_stock) : oldStock;
    const cost = avg_cost !== undefined ? parseFloat(avg_cost) : parseFloat(existing[0].avg_cost);

    await conn.query(
      'UPDATE ingredients SET name = ?, unit = ?, min_stock = ?, current_stock = ?, avg_cost = ?, code = COALESCE(?, code), image_url = COALESCE(?, image_url) WHERE id = ?',
      [name, unit, min_stock, newStock, cost, code || null, image_url || null, id]
    );

    // Ghi nhận biến động sổ kho nếu số lượng tồn thay đổi trực tiếp
    if (Math.abs(newStock - oldStock) > 0.0001) {
      const diff = newStock - oldStock;
      await conn.query(
        `INSERT INTO stock_movements (ingredient_id, movement_type, quantity, unit_cost, balance_after, note, created_by)
         VALUES (?, 'adjustment', ?, ?, ?, 'Điều chỉnh thông tin/kiểm kê nguyên liệu', ?)`,
        [id, Math.abs(diff), cost, newStock, req.user?.id || 1]
      );
    }

    await conn.commit();
    res.json({ success: true, message: 'Cập nhật nguyên liệu thành công' });
  } catch (err) {
    await conn.rollback();
    res.status(500).json({ success: false, message: 'Lỗi khi cập nhật nguyên liệu: ' + err.message });
  } finally {
    conn.release();
  }
};

// POST /api/inventory/adjust (nhập kho / xuất kho / điều chỉnh)
const adjustStock = async (req, res) => {
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    const { ingredient_id, movement_type, quantity, unit_cost, note } = req.body;
    // movement_type: 'receipt' (nhập), 'waste' (hỏng), 'adjustment' (kiểm kê), 'issue' (xuất)
    const [ingRows] = await conn.query('SELECT current_stock, avg_cost FROM ingredients WHERE id = ? FOR UPDATE', [ingredient_id]);
    if (!ingRows.length) {
      await conn.rollback();
      return res.status(404).json({ success: false, message: 'Không tìm thấy nguyên liệu' });
    }
    const current = parseFloat(ingRows[0].current_stock);
    const oldAvgCost = parseFloat(ingRows[0].avg_cost || 0);
    const qty = parseFloat(quantity);
    if (isNaN(qty) || qty < 0) {
      await conn.rollback();
      return res.status(400).json({ success: false, message: 'Số lượng nguyên liệu phải là số dương hợp lệ' });
    }
    if (movement_type !== 'adjustment' && qty <= 0) {
      await conn.rollback();
      return res.status(400).json({ success: false, message: 'Số lượng nhập/xuất kho phải lớn hơn 0' });
    }

    let newBalance = current;
    let newAvgCost = oldAvgCost;
    const effectiveCost = unit_cost !== undefined ? parseFloat(unit_cost) : oldAvgCost;

    if (movement_type === 'receipt') {
      newBalance = current + qty;
      // Tính giá vốn bình quân gia quyền (Weighted Average Cost)
      if (newBalance > 0) {
        newAvgCost = Math.round((current * oldAvgCost + qty * effectiveCost) / newBalance);
      }
    } else if (movement_type === 'waste' || movement_type === 'issue') {
      newBalance = Math.max(0, current - qty);
    } else if (movement_type === 'adjustment') {
      newBalance = qty;
    }

    await conn.query('UPDATE ingredients SET current_stock = ?, avg_cost = ? WHERE id = ?', [newBalance, newAvgCost, ingredient_id]);
    await conn.query(
      `INSERT INTO stock_movements (ingredient_id, movement_type, quantity, unit_cost, balance_after, note, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [ingredient_id, movement_type, qty, effectiveCost, newBalance, note || null, req.user?.id || 1]
    );

    await conn.commit();
    res.json({
      success: true,
      message: 'Cập nhật tồn kho thành công',
      data: { balance_after: newBalance, avg_cost: newAvgCost }
    });
  } catch (err) {
    await conn.rollback();
    res.status(500).json({ success: false, message: 'Lỗi khi điều chỉnh kho: ' + err.message });
  } finally {
    conn.release();
  }
};

// GET /api/inventory/suppliers
const getSuppliers = async (req, res) => {
  try {
    const [rows] = await db.query('SELECT * FROM suppliers WHERE is_active = 1 ORDER BY id DESC');
    res.json({ success: true, data: rows });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Lỗi khi tải nhà cung cấp: ' + err.message });
  }
};

// GET /api/inventory/movements
const getMovements = async (req, res) => {
  try {
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 100, 1), 500);
    const offset = Math.max(parseInt(req.query.offset, 10) || 0, 0);
    const [rows] = await db.query(
      `SELECT sm.*, i.name AS ingredient_name, i.unit, u.full_name AS staff_name
       FROM stock_movements sm
       JOIN ingredients i ON i.id = sm.ingredient_id
       LEFT JOIN users u ON u.id = sm.created_by
       ORDER BY sm.created_at DESC LIMIT ? OFFSET ?`,
      [limit, offset]
    );
    res.json({ success: true, data: rows });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Lỗi khi tải lịch sử kho: ' + err.message });
  }
};

module.exports = {
  getIngredients,
  createIngredient,
  updateIngredient,
  adjustStock,
  getSuppliers,
  getMovements,
};
