/**
 * loyaltyService.js
 * Quản lý đổi điểm, tích điểm, hoàn điểm khi hủy đơn và thăng hạng thành viên
 */

/**
 * 1. Kiểm tra và tính toán số điểm được phép đổi (Tối đa 1 điểm = 1.000đ, không vượt quá giá trị đơn hàng)
 */
async function validateAndCalculateRedemption(conn, { customerId, requestedPoints = 0, currentSubtotalAfterPromo = 0 }) {
  const reqPts = Math.max(0, parseInt(requestedPoints, 10) || 0);
  if (!customerId || reqPts <= 0 || currentSubtotalAfterPromo <= 0) {
    return { pointsToRedeem: 0, pointsDiscount: 0 };
  }

  const [custRows] = await conn.query(
    'SELECT points_balance FROM customers WHERE id = ? FOR UPDATE',
    [customerId]
  );

  if (!custRows.length || custRows[0].points_balance <= 0) {
    return { pointsToRedeem: 0, pointsDiscount: 0 };
  }

  const availablePoints = custRows[0].points_balance;
  // Giới hạn: Số điểm đổi không được lớn hơn tổng tiền sau khuyến mãi (1 điểm = 1.000đ)
  const maxPointsAllowedByOrder = Math.floor(currentSubtotalAfterPromo / 1000);
  const actualPointsRedeemed = Math.min(reqPts, availablePoints, maxPointsAllowedByOrder);
  const pointsDiscount = actualPointsRedeemed * 1000;

  return {
    pointsToRedeem: actualPointsRedeemed,
    pointsDiscount
  };
}

/**
 * 2. Thực hiện trừ điểm đổi và cộng điểm thưởng khi đơn ĐÃ THANH TOÁN
 */
async function processEarnAndRedeem(conn, { customerId, orderId, pointsToRedeem = 0, finalPaidAmount = 0, isPaid = false }) {
  if (!customerId) return { earnedPoints: 0, redeemedPoints: 0 };

  // Trừ điểm đã đổi
  if (pointsToRedeem > 0) {
    await conn.query(
      'UPDATE customers SET points_balance = GREATEST(0, points_balance - ?) WHERE id = ?',
      [pointsToRedeem, customerId]
    );
    await conn.query(
      'INSERT INTO loyalty_transactions (customer_id, order_id, type, points) VALUES (?, ?, "redeem", ?)',
      [customerId, orderId, pointsToRedeem]
    );
  }

  // TÍCH ĐIỂM: CHỈ TÍCH ĐIỂM KHI ĐƠN ĐÃ THANH TOÁN THÀNH CÔNG (isPaid === true)
  let earnedPoints = 0;
  if (isPaid && finalPaidAmount > 0) {
    earnedPoints = Math.floor(finalPaidAmount / 10000); // 10.000đ = 1 điểm
    await conn.query(
      'UPDATE customers SET points_balance = points_balance + ?, total_spent = total_spent + ? WHERE id = ?',
      [earnedPoints, finalPaidAmount, customerId]
    );

    if (earnedPoints > 0) {
      await conn.query(
        'INSERT INTO loyalty_transactions (customer_id, order_id, type, points) VALUES (?, ?, "earn", ?)',
        [customerId, orderId, earnedPoints]
      );
    }

    // Tự động thăng hạng thành viên dựa trên total_spent tích lũy
    const [custData] = await conn.query('SELECT total_spent FROM customers WHERE id = ?', [customerId]);
    if (custData.length) {
      const spent = Number(custData[0].total_spent || 0);
      const [tierRows] = await conn.query(
        'SELECT id FROM membership_tiers WHERE min_spent <= ? ORDER BY min_spent DESC LIMIT 1',
        [spent]
      );
      if (tierRows.length) {
        await conn.query('UPDATE customers SET tier_id = ? WHERE id = ?', [tierRows[0].id, customerId]);
      }
    }
  }

  return { earnedPoints, redeemedPoints: pointsToRedeem };
}

/**
 * 3. Hoàn trả điểm thưởng và đảo ngược tích điểm khi đơn hàng bị HỦY
 */
async function refundPointsOnCancel(conn, { orderId, customerId }) {
  if (!orderId || !customerId) return;

  await conn.query('SELECT id FROM customers WHERE id = ? FOR UPDATE', [customerId]);

  const [transactions] = await conn.query(
    'SELECT type, points FROM loyalty_transactions WHERE order_id = ?',
    [orderId]
  );

  const alreadyRefunded = transactions.some((t) => t.type === 'refund');
  const alreadyClawedBack = transactions.some((t) => t.type === 'clawback');

  for (const tx of transactions) {
    if (tx.type === 'redeem' && !alreadyRefunded) {
      // Hoàn lại điểm đã đổi cho khách
      await conn.query(
        'UPDATE customers SET points_balance = points_balance + ? WHERE id = ?',
        [tx.points, customerId]
      );
      await conn.query(
        'INSERT INTO loyalty_transactions (customer_id, order_id, type, points) VALUES (?, ?, "refund", ?)',
        [customerId, orderId, tx.points]
      );
    } else if (tx.type === 'earn' && !alreadyClawedBack) {
      // Trừ lại điểm đã cộng sai trước đó (nếu có)
      await conn.query(
        'UPDATE customers SET points_balance = GREATEST(0, points_balance - ?) WHERE id = ?',
        [tx.points, customerId]
      );
      await conn.query(
        'INSERT INTO loyalty_transactions (customer_id, order_id, type, points) VALUES (?, ?, "clawback", ?)',
        [customerId, orderId, -tx.points]
      );
    }
  }
}

/**
 * 4. Tự động tính toán và cập nhật lại hạng thành viên (Tier) dựa trên total_spent (Cả khi nâng và hạ hạng)
 */
async function recalculateCustomerTier(conn, customerId) {
  if (!customerId) return;
  const [custData] = await conn.query('SELECT total_spent FROM customers WHERE id = ?', [customerId]);
  if (!custData.length) return;
  const spent = Number(custData[0].total_spent || 0);
  const [tierRows] = await conn.query(
    'SELECT id FROM membership_tiers WHERE min_spent <= ? ORDER BY min_spent DESC LIMIT 1',
    [spent]
  );
  if (tierRows.length) {
    await conn.query('UPDATE customers SET tier_id = ? WHERE id = ?', [tierRows[0].id, customerId]);
  }
}

module.exports = {
  validateAndCalculateRedemption,
  processEarnAndRedeem,
  refundPointsOnCancel,
  recalculateCustomerTier
};
