const db = require('../config/db');
const { logAudit } = require('../services/auditLogger');

const MAX_UPLOAD_BYTES = 3 * 1024 * 1024; // 3MB sau giải mã Base64

function sanitizeImageUrl(rawUrl) {
  if (rawUrl === undefined) return undefined;
  if (rawUrl === null) return null;
  const trimmed = String(rawUrl).trim();
  if (!trimmed) return null;
  if (trimmed.length > 1000) {
    const err = new Error('Đường dẫn ảnh quá dài (tối đa 1000 ký tự).');
    err.status = 400;
    throw err;
  }
  const lower = trimmed.toLowerCase();
  const isSafeRelative = lower.startsWith('/images/') || lower.startsWith('/api/products/uploaded-image/');
  const isSafeHttp = lower.startsWith('https://') || lower.startsWith('http://');
  if (!isSafeRelative && !isSafeHttp) {
    const err = new Error('Đường dẫn ảnh không hợp lệ (chỉ hỗ trợ ảnh tải lên, /images/... hoặc URL http/https).');
    err.status = 400;
    throw err;
  }
  return trimmed;
}

function detectImageMime(buf) {
  if (!buf || buf.length < 12) return null;
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return 'image/png';
  if (buf.subarray(0, 4).toString('ascii') === 'GIF8') return 'image/gif';
  if (buf.subarray(0, 4).toString('ascii') === 'RIFF' && buf.subarray(8, 12).toString('ascii') === 'WEBP') return 'image/webp';
  return null;
}

function normalizeSizes(sizes, fallbackPrice) {
  const cleaned = Array.isArray(sizes)
    ? sizes
        .filter((s) => s && String(s.name || '').trim())
        .map((s) => ({
          id: s.id || s.size_id || null,
          name: String(s.name).trim().slice(0, 40),
          price: Math.max(0, Math.round(Number(s.price) || 0)),
          is_default: s.is_default ? 1 : 0,
        }))
    : [];

  if (cleaned.length === 0) {
    return [{ id: null, name: 'M', price: Math.max(0, Math.round(Number(fallbackPrice) || 30000)), is_default: 1 }];
  }

  // Đảm bảo có duy nhất 1 kích cỡ mặc định
  let foundDefault = false;
  for (const s of cleaned) {
    if (s.is_default && !foundDefault) {
      foundDefault = true;
    } else {
      s.is_default = 0;
    }
  }
  if (!foundDefault) cleaned[0].is_default = 1;
  return cleaned;
}

// POST /api/products/upload-image (Admin / Manager tải ảnh từ máy lên CSDL)
const uploadImage = async (req, res) => {
  try {
    const raw = String(req.body?.dataUrl || req.body?.base64 || '').trim();
    if (!raw) {
      return res.status(400).json({ success: false, message: 'Vui lòng chọn tệp ảnh hợp lệ để tải lên.' });
    }

    const base64Body = raw.includes(',') ? raw.split(',')[1] : raw;
    const buffer = Buffer.from(base64Body, 'base64');
    if (!buffer.length || buffer.length > MAX_UPLOAD_BYTES) {
      return res.status(400).json({ success: false, message: 'Kích thước ảnh vượt quá giới hạn 3MB.' });
    }

    const detectedMime = detectImageMime(buffer);
    if (!detectedMime) {
      return res.status(400).json({ success: false, message: 'Định dạng ảnh không hợp lệ (chỉ chấp nhận JPG, PNG, WEBP, GIF).' });
    }

    const [result] = await db.query(
      'INSERT INTO product_uploaded_images (mime_type, image_data, created_by) VALUES (?, ?, ?)',
      [detectedMime, buffer, req.user?.id || null]
    );

    const imageUrl = `/api/products/uploaded-image/${result.insertId}`;
    res.status(201).json({
      success: true,
      message: 'Tải ảnh lên thành công',
      data: { id: result.insertId, image_url: imageUrl },
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// GET /api/products/uploaded-image/:imageId (Công khai để trình duyệt hiển thị thẻ <img>)
const getUploadedImage = async (req, res) => {
  try {
    const imageId = Number(req.params.imageId);
    if (!Number.isInteger(imageId) || imageId <= 0) {
      return res.status(404).end();
    }
    const [rows] = await db.query(
      'SELECT mime_type, image_data FROM product_uploaded_images WHERE id = ? LIMIT 1',
      [imageId]
    );
    if (!rows.length) {
      return res.status(404).end();
    }
    const { mime_type, image_data } = rows[0];
    res.setHeader('Content-Type', mime_type || 'image/jpeg');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    res.send(Buffer.from(image_data));
  } catch (err) {
    res.status(500).end();
  }
};

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
    let sizes = [];
    try {
      const [sizesRows] = await db.query('SELECT * FROM product_sizes WHERE is_active=1');
      sizes = sizesRows;
    } catch {
      // Fallback cho TiDB Cloud hoặc database chưa có cột is_active
      const [sizesRows] = await db.query('SELECT * FROM product_sizes');
      sizes = sizesRows;
    }
    const [toppings] = await db.query('SELECT * FROM toppings WHERE is_active=1');

    const productMap = products.map(p => {
      const pSizes = sizes.filter(s => s.product_id === p.id);
      const uniqueMap = new Map();
      for (const s of pSizes) {
        uniqueMap.set(s.name, s);
      }
      return {
        ...p,
        sizes: Array.from(uniqueMap.values()),
      };
    });

    res.json({ success: true, data: { categories, products: productMap, toppings } });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// POST /api/products
const create = async (req, res) => {
  const conn = await db.getConnection();
  try {
    const { category_id, name, description, image_url, sizes, code, price, is_available } = req.body;
    const cleanName = String(name || '').trim();
    if (!cleanName) {
      return res.status(400).json({ success: false, message: 'Tên món không được để trống.' });
    }

    const cleanCode = code ? String(code).trim().toUpperCase().slice(0, 20) : null;
    if (cleanCode) {
      const [dup] = await conn.query('SELECT id FROM products WHERE code = ? AND is_active = 1 LIMIT 1', [cleanCode]);
      if (dup.length) {
        return res.status(400).json({ success: false, message: `Mã món "${cleanCode}" đã tồn tại trên thực đơn.` });
      }
    }

    const safeImg = sanitizeImageUrl(image_url);
    const catId = Number(category_id) || 1;
    const [catRows] = await conn.query('SELECT id FROM categories WHERE id = ? AND is_active = 1 LIMIT 1', [catId]);
    if (!catRows.length) {
      return res.status(400).json({ success: false, message: 'Danh mục món không hợp lệ.' });
    }

    const normalizedSizes = normalizeSizes(sizes, price);
    const avail = is_available === undefined ? 1 : (Number(is_available) ? 1 : 0);

    await conn.beginTransaction();
    const [result] = await conn.query(
      'INSERT INTO products (category_id, name, description, image_url, code, is_available, is_active) VALUES (?,?,?,?,?,?,1)',
      [catId, cleanName, description ? String(description).trim() : null, safeImg ?? null, cleanCode, avail]
    );
    const productId = result.insertId;

    const finalCode = cleanCode || `SP${String(productId).padStart(2, '0')}`;
    if (!cleanCode) {
      await conn.query('UPDATE products SET code = ? WHERE id = ?', [finalCode, productId]);
    }

    for (const s of normalizedSizes) {
      await conn.query(
        'INSERT INTO product_sizes (product_id, name, price, is_default, is_active) VALUES (?,?,?,?,1)',
        [productId, s.name, s.price, s.is_default]
      );
    }
    await conn.commit();

    logAudit({
      userId: req.user?.id || null,
      action: 'CREATE_PRODUCT',
      entityType: 'PRODUCT',
      entityId: productId,
      reason: `Thêm món mới #${finalCode} (${cleanName})`,
      ipAddress: req.ip
    });

    res.status(201).json({
      success: true,
      message: 'Thêm món mới thành công',
      data: { id: productId, code: finalCode },
    });
  } catch (err) {
    await conn.rollback().catch(() => {});
    res.status(err.status || 500).json({ success: false, message: err.message });
  } finally {
    conn.release();
  }
};

// PUT /api/products/:id
const update = async (req, res) => {
  const conn = await db.getConnection();
  try {
    const { id } = req.params;
    const { name, description, image_url, is_available, is_active, code, category_id, price, sizes } = req.body;

    const [existingRows] = await conn.query('SELECT * FROM products WHERE id = ? LIMIT 1', [id]);
    if (!existingRows.length) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy món cần cập nhật.' });
    }
    const existing = existingRows[0];

    const nextName = name !== undefined ? String(name).trim() : existing.name;
    if (!nextName) {
      return res.status(400).json({ success: false, message: 'Tên món không được để trống.' });
    }

    let nextCode = existing.code;
    if (code !== undefined) {
      nextCode = code ? String(code).trim().toUpperCase().slice(0, 20) : null;
      if (nextCode) {
        const [dup] = await conn.query('SELECT id FROM products WHERE code = ? AND id != ? AND is_active = 1 LIMIT 1', [nextCode, id]);
        if (dup.length) {
          return res.status(400).json({ success: false, message: `Mã món "${nextCode}" đã được món khác sử dụng.` });
        }
      }
    }

    const nextDesc = description !== undefined ? (String(description).trim() || null) : existing.description;
    const nextImg = image_url !== undefined ? sanitizeImageUrl(image_url) : existing.image_url;
    const nextAvail = is_available !== undefined ? (Number(is_available) ? 1 : 0) : existing.is_available;
    const nextActive = is_active !== undefined ? (Number(is_active) ? 1 : 0) : existing.is_active;
    const nextCat = category_id !== undefined && category_id !== null ? Number(category_id) : existing.category_id;

    await conn.beginTransaction();
    await conn.query(
      'UPDATE products SET name=?, description=?, image_url=?, is_available=?, is_active=?, code=?, category_id=? WHERE id=?',
      [nextName, nextDesc, nextImg, nextAvail, nextActive, nextCode, nextCat, id]
    );

    // Update price if provided without sizes array
    if (price !== undefined && price !== null && !isNaN(price) && !Array.isArray(sizes)) {
      const numPrice = Math.max(0, Number(price));
      const [defaultSizes] = await conn.query(
        'SELECT id FROM product_sizes WHERE product_id = ? AND is_default = 1 AND is_active = 1',
        [id]
      );
      if (defaultSizes.length) {
        await conn.query('UPDATE product_sizes SET price = ? WHERE id = ?', [numPrice, defaultSizes[0].id]);
      } else {
        const [anySizes] = await conn.query(
          'SELECT id FROM product_sizes WHERE product_id = ? AND is_active = 1 LIMIT 1',
          [id]
        );
        if (anySizes.length) {
          await conn.query('UPDATE product_sizes SET price = ?, is_default = 1 WHERE id = ?', [numPrice, anySizes[0].id]);
        } else {
          await conn.query(
            'INSERT INTO product_sizes (product_id, name, price, is_default, is_active) VALUES (?, ?, ?, 1, 1)',
            [id, 'M', numPrice]
          );
        }
      }
    }

    // Đồng bộ danh sách kích cỡ & giá bán (hỗ trợ sửa, thêm, và ẩn size bị xóa)
    if (Array.isArray(sizes) && sizes.length > 0) {
      const normalizedSizes = normalizeSizes(sizes, price);
      const keptIds = [];
      for (const s of normalizedSizes) {
        if (s.id) {
          await conn.query(
            'UPDATE product_sizes SET name = ?, price = ?, is_default = ?, is_active = 1 WHERE id = ? AND product_id = ?',
            [s.name, s.price, s.is_default, s.id, id]
          );
          keptIds.push(Number(s.id));
        } else {
          const [insSize] = await conn.query(
            'INSERT INTO product_sizes (product_id, name, price, is_default, is_active) VALUES (?, ?, ?, ?, 1)',
            [id, s.name, s.price, s.is_default]
          );
          keptIds.push(insSize.insertId);
        }
      }
      if (keptIds.length > 0) {
        await conn.query(
          'UPDATE product_sizes SET is_active = 0 WHERE product_id = ? AND id NOT IN (?)',
          [id, keptIds]
        );
      }
    }

    await conn.commit();

    logAudit({
      userId: req.user?.id || null,
      action: 'UPDATE_PRODUCT',
      entityType: 'PRODUCT',
      entityId: id,
      reason: `Cập nhật thông tin / hình ảnh món ăn ID #${id} (${nextName})`,
      ipAddress: req.ip
    });

    res.json({ success: true, message: 'Cập nhật thành công' });
  } catch (err) {
    await conn.rollback().catch(() => {});
    res.status(err.status || 500).json({ success: false, message: err.message });
  } finally {
    conn.release();
  }
};

// DELETE /api/products/:id (soft delete)
const remove = async (req, res) => {
  try {
    await db.query('UPDATE products SET is_active=0 WHERE id=?', [req.params.id]);
    logAudit({
      userId: req.user?.id || null,
      action: 'DELETE_PRODUCT',
      entityType: 'PRODUCT',
      entityId: req.params.id,
      reason: `Ngừng kinh doanh món ăn ID #${req.params.id}`,
      ipAddress: req.ip
    });
    res.json({ success: true, message: 'Đã xóa món' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

module.exports = { getAll, create, update, remove, uploadImage, getUploadedImage };
