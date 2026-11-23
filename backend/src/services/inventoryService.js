/**
 * inventoryService.js
 * Quản lý kiểm tra định lượng tồn kho, xuất kho khi bán và hoàn kho khi hủy đơn
 */

/**
 * 1. Kiểm tra định lượng tồn kho trước khi tạo đơn (Pre-check Stock chống bán khống & âm kho)
 */
async function checkStockAvailability(conn, validatedItems) {
  const requiredIngMap = {};

  for (const item of validatedItems) {
    const sizeId = item.product_size_id;
    if (!sizeId) continue;

    const [recipeRows] = await conn.query(
      `SELECT r.ingredient_id, r.quantity, i.name, i.current_stock, i.unit 
       FROM recipes r 
       JOIN ingredients i ON i.id = r.ingredient_id 
       WHERE r.product_size_id = ?`,
      [sizeId]
    );

    for (const rec of recipeRows) {
      const needed = Number(rec.quantity) * Number(item.quantity);
      if (!requiredIngMap[rec.ingredient_id]) {
        requiredIngMap[rec.ingredient_id] = {
          id: rec.ingredient_id,
          name: rec.name,
          current_stock: Number(rec.current_stock),
          unit: rec.unit,
          totalNeeded: 0
        };
      }
      requiredIngMap[rec.ingredient_id].totalNeeded += needed;
    }
  }

  for (const ingId in requiredIngMap) {
    const ing = requiredIngMap[ingId];
    if (ing.current_stock < ing.totalNeeded) {
      throw new Error(
        `Nguyên liệu "${ing.name}" trong kho không đủ để thực hiện món! (Hiện còn: ${ing.current_stock.toFixed(2)} ${ing.unit}, Cần dùng: ${ing.totalNeeded.toFixed(2)} ${ing.unit})`
      );
    }
  }

  return true;
}

/**
 * 2. Trừ định lượng nguyên liệu kho khi đơn hàng ĐÃ THANH TOÁN (Atomic Transaction + FOR UPDATE)
 */
async function deductStockForOrder(conn, { orderId, orderCode, validatedItems, userId = 1 }) {
  for (const item of validatedItems) {
    const sizeId = item.product_size_id;
    if (!sizeId) continue;

    const [recipeRows] = await conn.query(
      'SELECT ingredient_id, quantity FROM recipes WHERE product_size_id = ?',
      [sizeId]
    );

    for (const rec of recipeRows) {
      const consumed = Number(rec.quantity) * Number(item.quantity);
      const [ingRows] = await conn.query(
        'SELECT current_stock, avg_cost FROM ingredients WHERE id = ? FOR UPDATE',
        [rec.ingredient_id]
      );

      if (ingRows.length) {
        const current = parseFloat(ingRows[0].current_stock);
        const newBalance = Math.max(0, current - consumed);

        await conn.query(
          'UPDATE ingredients SET current_stock = ? WHERE id = ?',
          [newBalance, rec.ingredient_id]
        );

        await conn.query(
          `INSERT INTO stock_movements (ingredient_id, movement_type, quantity, unit_cost, balance_after, ref_type, ref_id, note, created_by)
           VALUES (?, 'sale', ?, ?, ?, 'orders', ?, ?, ?)`,
          [rec.ingredient_id, consumed, ingRows[0].avg_cost, newBalance, orderId, `Bán món ${item.name} (${orderCode})`, userId]
        );
      }
    }
  }
}

/**
 * 3. Hoàn trả nguyên liệu kho khi đơn hàng đã thanh toán bị HỦY
 */
async function restoreStockForOrder(conn, { orderId, orderCode, userId = 1 }) {
  const [movements] = await conn.query(
    `SELECT ingredient_id, quantity, unit_cost 
     FROM stock_movements 
     WHERE ref_type = 'orders' AND ref_id = ? AND movement_type = 'sale'`,
    [orderId]
  );

  for (const mov of movements) {
    const qty = parseFloat(mov.quantity);
    const [ingRows] = await conn.query(
      'SELECT current_stock, avg_cost FROM ingredients WHERE id = ? FOR UPDATE',
      [mov.ingredient_id]
    );

    if (ingRows.length) {
      const current = parseFloat(ingRows[0].current_stock);
      const newBalance = current + qty;

      await conn.query(
        'UPDATE ingredients SET current_stock = ? WHERE id = ?',
        [newBalance, mov.ingredient_id]
      );

      await conn.query(
        `INSERT INTO stock_movements (ingredient_id, movement_type, quantity, unit_cost, balance_after, ref_type, ref_id, note, created_by)
         VALUES (?, 'adjustment', ?, ?, ?, 'orders', ?, ?, ?)`,
        [mov.ingredient_id, qty, mov.unit_cost, newBalance, orderId, `Hoàn nguyên liệu do hủy đơn ${orderCode}`, userId]
      );
    }
  }
}

module.exports = {
  checkStockAvailability,
  deductStockForOrder,
  restoreStockForOrder
};
