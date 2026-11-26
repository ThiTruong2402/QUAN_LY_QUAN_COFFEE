/**
 * pricingService.js
 * Quản lý tính giá Zero-Trust, Topping, Khuyến mãi và Tổng tiền đơn hàng
 */
const { getVietnamDateString } = require('../utils/date');

/**
 * 1. Định giá danh sách món và topping từ CSDL (Zero-Trust)
 */
async function validateAndPriceItems(conn, items) {
  if (!items || !items.length) {
    throw new Error('Đơn hàng chưa có món');
  }

  let subtotal = 0;
  const validatedItems = [];

  for (const item of items) {
    const productSizeId = item.product_size_id || null;
    const productId = item.product_id || null;
    let sizeRow = null;

    if (productSizeId) {
      const [sizeRows] = await conn.query(
        `SELECT ps.id, ps.price, ps.name AS size_name, p.id AS product_id, p.name AS product_name 
         FROM product_sizes ps
         JOIN products p ON p.id = ps.product_id
         WHERE ps.id = ? AND p.is_active = 1 AND p.is_available = 1`,
        [productSizeId]
      );
      if (sizeRows.length) sizeRow = sizeRows[0];
    }

    if (!sizeRow && productId) {
      const [sizeFallback] = await conn.query(
        `SELECT ps.id, ps.price, ps.name AS size_name, p.id AS product_id, p.name AS product_name
         FROM product_sizes ps
         JOIN products p ON p.id = ps.product_id
         WHERE ps.product_id = ? AND p.is_active = 1 AND p.is_available = 1
         ORDER BY ps.is_default DESC, ps.id ASC
         LIMIT 1`,
        [productId]
      );
      if (sizeFallback.length) sizeRow = sizeFallback[0];
    }

    if (!sizeRow) {
      throw new Error(`Món đồ uống "${item.name || 'chưa rõ'}" không tồn tại, đã ngừng kinh doanh hoặc kích thước không hợp lệ!`);
    }

    const unitPrice = Number(sizeRow.price);
    const productName = sizeRow.product_name;
    const sizeName = sizeRow.size_name;
    const finalSizeId = sizeRow.id;

    // Xử lý và tính giá Topping (Zero-Trust từ CSDL bảng toppings)
    let itemToppingsTotal = 0;
    const validatedItemToppings = [];
    const rawToppings = Array.isArray(item.toppings) ? item.toppings : [];

    for (const t of rawToppings) {
      const topId = t.topping_id || t.id;
      if (!topId) continue;
      const [topRows] = await conn.query('SELECT id, name, price FROM toppings WHERE id = ? AND is_active = 1', [topId]);
      if (topRows.length) {
        const topPrice = Number(topRows[0].price);
        const topQty = Math.min(10, Math.max(1, parseInt(t.quantity, 10) || 1));
        itemToppingsTotal += topPrice * topQty;
        validatedItemToppings.push({
          topping_id: topRows[0].id,
          topping_name: topRows[0].name,
          price: topPrice,
          quantity: topQty
        });
      }
    }

    const qty = Math.min(100, Math.max(1, parseInt(item.quantity, 10) || 1));
    const lineTotal = (unitPrice + itemToppingsTotal) * qty;
    subtotal += lineTotal;

    validatedItems.push({
      product_size_id: finalSizeId,
      product_id: sizeRow.product_id,
      name: productName,
      size_name: sizeName,
      price: unitPrice,
      quantity: qty,
      toppings_total: itemToppingsTotal,
      line_total: lineTotal,
      toppings: validatedItemToppings,
      note: item.note ? String(item.note).trim() : null
    });
  }

  return { validatedItems, subtotal };
}

/**
 * 2. Kiểm tra và tính toán giảm giá khuyến mãi (Zero-Trust)
 */
async function calculatePromotions(conn, { couponCode, subtotal, customerId, orderType, isOnlineCustomer }) {
  if (!couponCode) {
    return { validCouponCode: null, promoDiscount: 0 };
  }

  const cleanCode = String(couponCode).trim().toUpperCase();

  // Phân quyền mã: Khách online chỉ được dùng mã dành cho khách
  const CUSTOMER_ALLOWED_COUPONS = ['COFFEE10', 'GIAM20K', 'BANMOI', 'BANMOI20', 'MYCOFFEE20', 'FREESHIP'];
  if (isOnlineCustomer && !CUSTOMER_ALLOWED_COUPONS.includes(cleanCode)) {
    throw new Error(`Mã giảm giá "${cleanCode}" là mã nội bộ / sự kiện đặc biệt, không áp dụng cho khách tự đặt đơn!`);
  }

  const todayVN = getVietnamDateString();
  const [promoRows] = await conn.query(
    `SELECT * FROM promotions 
     WHERE BINARY code = ? AND is_active = 1 
       AND (start_date IS NULL OR start_date <= ?)
       AND (end_date IS NULL OR end_date >= ?)`,
    [cleanCode, todayVN, todayVN]
  );

  if (!promoRows.length) {
    throw new Error(`Mã khuyến mãi "${cleanCode}" không tồn tại hoặc đã hết hạn áp dụng!`);
  }

  const promo = promoRows[0];

  // 1. Chặn FREESHIP nếu đơn mang về hoặc tại bàn
  if (cleanCode === 'FREESHIP' && (orderType === 'takeaway' || orderType === 'dine_in')) {
    throw new Error('Mã FREESHIP chỉ áp dụng cho đơn giao hàng tận nơi');
  }

  // 2. Chặn mã BANMOI nếu khách đã từng có đơn hàng thành công trước đó
  if (['BANMOI', 'BANMOI20'].includes(cleanCode) && customerId) {
    const [pastOrders] = await conn.query(
      "SELECT COUNT(*) AS cnt FROM orders WHERE customer_id = ? AND status != 'cancelled'",
      [customerId]
    );
    if (pastOrders[0]?.cnt > 0) {
      throw new Error('Mã chào bạn mới chỉ áp dụng cho đơn hàng đầu tiên của quý khách!');
    }
  }

  // 3. Kiểm tra khung giờ khuyến mãi (Happy Hour) nếu có
  if (promo.time_from && promo.time_to) {
    const nowTime = new Date().toLocaleTimeString('en-GB', { hour12: false, timeZone: 'Asia/Ho_Chi_Minh' });
    if (nowTime < promo.time_from || nowTime > promo.time_to) {
      throw new Error(`Mã ${cleanCode} chỉ áp dụng trong khung giờ vàng từ ${promo.time_from} đến ${promo.time_to}!`);
    }
  }

  const minOrder = Number(promo.min_order_value || 0);
  if (subtotal < minOrder) {
    throw new Error(`Mã ${cleanCode} yêu cầu đơn hàng tối thiểu ${minOrder.toLocaleString('vi-VN')} đ`);
  }

  let calculatedDiscount = 0;
  const promoVal = Number(promo.value ?? promo.discount_value ?? 0);
  const isPercentage = promo.type === 'percent_order' || promo.type === 'happy_hour' || promo.type === 'percentage' || promo.discount_type === 'percentage';

  if (isPercentage) {
    calculatedDiscount = Math.round((subtotal * promoVal) / 100);
    if (promo.max_discount) {
      calculatedDiscount = Math.min(calculatedDiscount, Number(promo.max_discount));
    }
  } else {
    calculatedDiscount = Math.min(subtotal, promoVal);
  }

  return {
    validCouponCode: cleanCode,
    promoDiscount: calculatedDiscount
  };
}

/**
 * 3. Tính toán 4 tầng chiết khấu và tổng thanh toán cuối cùng (Chống thuế âm)
 * BIZ-03: Áp dụng chiết khấu hạng hội viên (tierDiscount) chuẩn xác
 */
function calculateFinalTotal({ subtotal, promoDiscount = 0, tierDiscount = 0, pointsDiscount = 0, tax = 0, shippingFee = 0 }) {
  // Phòng chống tấn công thuế âm
  const finalTax = Math.max(0, Number(tax || 0));
  const finalShipping = Math.max(0, Number(shippingFee || 0));

  // Tầng 1: Chiết khấu mã khuyến mãi
  const effectivePromoDiscount = Math.min(subtotal, Math.max(0, Number(promoDiscount || 0)));
  const afterPromo = subtotal - effectivePromoDiscount;

  // Tầng 2: Chiết khấu hạng hội viên (BIZ-03)
  const effectiveTierDiscount = Math.min(afterPromo, Math.max(0, Number(tierDiscount || 0)));
  const afterTier = afterPromo - effectiveTierDiscount;

  // Tầng 3: Điểm thưởng (không vượt quá phần còn lại sau promo và tier)
  const effectivePointsDiscount = Math.min(afterTier, Math.max(0, Number(pointsDiscount || 0)));
  const totalDiscount = effectivePromoDiscount + effectiveTierDiscount + effectivePointsDiscount;

  // Tầng 4: Thuế VAT & Phí vận chuyển
  const total = Math.max(0, subtotal - totalDiscount + finalTax + finalShipping);

  return {
    subtotal,
    promoDiscount: effectivePromoDiscount,
    tierDiscount: effectiveTierDiscount,
    pointsDiscount: effectivePointsDiscount,
    totalDiscount,
    tax: finalTax,
    shippingFee: finalShipping,
    total
  };
}

module.exports = {
  validateAndPriceItems,
  calculatePromotions,
  calculateFinalTotal
};
