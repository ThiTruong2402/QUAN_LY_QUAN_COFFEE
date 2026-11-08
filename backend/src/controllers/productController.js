const db = require('../config/db');

// GET /api/products
const getAll = async (req, res) => {
  try {
    const [categories] = await db.query(
      'SELECT * FROM categories WHERE is_active=1 ORDER BY sort_order'
    );
    const [products] = await db.query(
      `SELECT p.*, c.name AS category_name FROM products p
       JOIN categories c ON c.id = p.category_id
       WHERE p.is_active = 1 ORDER BY c.sort_order ASC, p.code ASC, p.id ASC`
    );
    const [sizes] = await db.query('SELECT * FROM product_sizes WHERE is_active=1');
    const [toppings] = await db.query('SELECT * FROM toppings WHERE is_active=1');

    const productMap = products.map(p => ({
      ...p,
      sizes: sizes.filter(s => s.product_id === p.id),
    }));

    res.json({ success: true, data: { categories, products: productMap, toppings } });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// POST /api/products
const create = async (req, res) => {
  try {
    const { category_id, name, description, image_url, sizes, code, price } = req.body;
    const [result] = await db.query(
      'INSERT INTO products (category_id, name, description, image_url, code) VALUES (?,?,?,?,?)',
      [category_id || 1, name, description || null, image_url || null, code || null]
    );
    const productId = result.insertId;
    if (sizes && sizes.length) {
      for (const s of sizes) {
        await db.query(
          'INSERT INTO product_sizes (product_id, name, price, is_default) VALUES (?,?,?,?)',
          [productId, s.name, s.price, s.is_default ? 1 : 0]
        );
      }
    } else {
      await db.query(
        'INSERT INTO product_sizes (product_id, name, price, is_default) VALUES (?,?,?,1)',
        [productId, 'M', Number(price) || 30000]
      );
    }
    res.status(201).json({ success: true, message: 'Tạo món thành công', data: { id: productId } });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// PUT /api/products/:id
const update = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, description, image_url, is_available, is_active, code, category_id, price, sizes } = req.body;
    await db.query(
      'UPDATE products SET name=?, description=?, image_url=?, is_available=COALESCE(?, is_available), is_active=COALESCE(?, is_active), code=COALESCE(?, code), category_id=COALESCE(?, category_id) WHERE id=?',
      [name, description, image_url, is_available, is_active, code || null, category_id || null, id]
    );

    // Update price if provided
    if (price !== undefined && price !== null && !isNaN(price)) {
      const numPrice = Number(price);
      const [defaultSizes] = await db.query(
        'SELECT id FROM product_sizes WHERE product_id = ? AND is_default = 1',
        [id]
      );
      if (defaultSizes.length) {
        await db.query('UPDATE product_sizes SET price = ? WHERE id = ?', [numPrice, defaultSizes[0].id]);
      } else {
        const [anySizes] = await db.query(
          'SELECT id FROM product_sizes WHERE product_id = ? LIMIT 1',
          [id]
        );
        if (anySizes.length) {
          await db.query('UPDATE product_sizes SET price = ?, is_default = 1 WHERE id = ?', [numPrice, anySizes[0].id]);
        } else {
          await db.query(
            'INSERT INTO product_sizes (product_id, name, price, is_default) VALUES (?, ?, ?, 1)',
            [id, 'M', numPrice]
          );
        }
      }
    }

    // Update sizes array if provided
    if (sizes && Array.isArray(sizes) && sizes.length > 0) {
      for (const s of sizes) {
        if (s.id) {
          await db.query('UPDATE product_sizes SET name = ?, price = ?, is_default = ? WHERE id = ?', [s.name, s.price, s.is_default ? 1 : 0, s.id]);
        } else {
          await db.query('INSERT INTO product_sizes (product_id, name, price, is_default) VALUES (?, ?, ?, ?)', [id, s.name, s.price, s.is_default ? 1 : 0]);
        }
      }
    }

    res.json({ success: true, message: 'Cập nhật thành công' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// DELETE /api/products/:id (soft delete)
const remove = async (req, res) => {
  try {
    await db.query('UPDATE products SET is_active=0 WHERE id=?', [req.params.id]);
    res.json({ success: true, message: 'Đã xóa món' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

module.exports = { getAll, create, update, remove };
