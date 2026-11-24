/**
 * orderService.js
 * Điều phối toàn bộ quy trình tạo đơn hàng trực tiếp, POS và Online
 */

const pricingService = require('./pricingService');
const loyaltyService = require('./loyaltyService');
const inventoryService = require('./inventoryService');
const storeService = require('./storeSettingsService');
const { getVietnamDateString, getVietnamDateNumber } = require('../utils/date');

// In-memory idempotency & anti-spam lock (ngăn chặn race-condition, double-click / spam request liên tục trong 3s)
const recentOrderLocks = new Map();

// Map phương thức thanh toán sang enum chuẩn database
const PAYMENT_METHOD_MAP = {
  'Tiền mặt': 'cash',
  'cash': 'cash',
  'Thẻ ngân hàng': 'card',
  'card': 'card',
  'Chuyển khoản': 'bank_transfer',
  'QR Banking': 'bank_transfer',
  'Ví MoMo': 'bank_transfer',
  'ZaloPay': 'bank_transfer',
  'bank_transfer': 'bank_transfer',
  'points': 'points',
};

/**
 * Tạo đơn hàng trực tiếp (POS tại quầy hoặc Khách đặt Online)
 */
async function createDirectOrder(conn, { orderData, reqUser, io }) {
  // 0. CHỐT CHẶN BẮT BUỘC (AUTH-ORDER-01): Không có tài khoản đăng nhập -> Từ chối HTTP 401 ngay lập tức
  if (!reqUser || !reqUser.id || !reqUser.role) {
    const authErr = new Error('Vui lòng đăng nhập hoặc đăng ký tài khoản để đặt hàng và thanh toán.');
    authErr.status = 401;
    throw authErr;
  }

  // Kiểm tra tài khoản thực tế trong CSDL còn hoạt động (is_active = 1)
  const [userRows] = await conn.query(
    `SELECT u.id, u.username, u.full_name, u.phone, u.is_active, r.name AS role_name 
     FROM users u 
     JOIN roles r ON r.id = u.role_id 
     WHERE u.id = ? LIMIT 1`,
    [reqUser.id]
  );
  if (!userRows.length || Number(userRows[0].is_active) !== 1) {
    const lockErr = new Error('Tài khoản không tồn tại hoặc đã bị tạm khóa. Vui lòng đăng nhập lại.');
    lockErr.status = 401;
    throw lockErr;
  }

  const dbUser = userRows[0];
  const isStaff = ['admin', 'manager', 'cashier', 'waiter'].includes(dbUser.role_name);
  const isOnlineCustomer = dbUser.role_name === 'customer';

  if (!isStaff && !isOnlineCustomer) {
    const roleErr = new Error('Vai trò tài khoản hiện tại không có quyền đặt hàng.');
    roleErr.status = 403;
    throw roleErr;
  }

  const {
    items,
    customer_name,
    customer_phone,
    order_type = 'takeaway',
    table_id = null,
    delivery_address = null,
    shipping_fee = 0,
    recipient_phone = null,
    coupon_code = null,
    payment_method = 'Tiền mặt',
    note,
    tax = 0,
    pickup_time = null,
    points_to_redeem,
    points_redeemed,
    status: requestedStatus,
  } = orderData;

  // 1. Zero-Trust Định giá và kiểm tra danh sách món
  const { validatedItems, subtotal } = await pricingService.validateAndPriceItems(conn, items);

  // 2. Pre-check tồn kho chống âm kho
  await inventoryService.checkStockAvailability(conn, validatedItems);

  // 3. KHÓA DANH TÍNH KHÁCH HÀNG THEO TÀI KHOẢN ĐÃ ĐĂNG NHẬP (Anti-Spoofing & Zero-Trust)
  // - Nếu là khách hàng (role = 'customer'): Bắt buộc lấy SĐT và Họ tên từ chính tài khoản đã đăng ký (chống mạo danh SĐT / trộm điểm người khác)
  // - Nếu là nhân viên thu ngân tại quầy POS: Cho phép nhập SĐT hội viên của khách đến mua trực tiếp
  const effectivePhone = isOnlineCustomer
    ? (dbUser.phone || dbUser.username)
    : (customer_phone ? String(customer_phone).trim() : null);

  const effectiveName = isOnlineCustomer
    ? (dbUser.full_name || dbUser.username)
    : (customer_name ? String(customer_name).trim() : 'Khách lẻ');

  // Chống spam / double-click tức thì theo chính user.id (Idempotency in-memory lock)
  const lockKey = `user:${dbUser.id}`;
  const now = Date.now();
  const lastTime = recentOrderLocks.get(lockKey);
  if (lastTime && now - lastTime < 3000) {
    const spamErr = new Error('Bạn đang thao tác quá nhanh! Vui lòng chờ 3 giây trước khi tạo đơn mới.');
    spamErr.status = 429;
    throw spamErr;
  }
  recentOrderLocks.set(lockKey, now);
  if (recentOrderLocks.size > 500) {
    for (const [p, t] of recentOrderLocks.entries()) {
      if (now - t > 10000) recentOrderLocks.delete(p);
    }
  }

  let customerId = null;
  let customerTierDiscountPct = 0;
  if (effectivePhone) {
    const [cRows] = await conn.query(
      `SELECT c.id, c.points_balance, c.tier_id, t.discount_pct 
       FROM customers c 
       LEFT JOIN membership_tiers t ON t.id = c.tier_id 
       WHERE c.phone = ?`,
      [effectivePhone]
    );
    if (cRows.length) {
      customerId = cRows[0].id;
      customerTierDiscountPct = Number(cRows[0].discount_pct || 0);
    } else {
      try {
        const [newC] = await conn.query('INSERT INTO customers (phone, name, tier_id) VALUES (?, ?, 1)', [effectivePhone, effectiveName]);
        customerId = newC.insertId;
      } catch (cErr) {
        if (cErr.code === 'ER_DUP_ENTRY' || cErr.errno === 1062) {
          const [reQuery] = await conn.query(
            `SELECT c.id, c.points_balance, c.tier_id, t.discount_pct 
             FROM customers c 
             LEFT JOIN membership_tiers t ON t.id = c.tier_id 
             WHERE c.phone = ?`,
            [effectivePhone]
          );
          if (reQuery.length) {
            customerId = reQuery[0].id;
            customerTierDiscountPct = Number(reQuery[0].discount_pct || 0);
          }
        } else {
          throw cErr;
        }
      }
    }
  }

  // 4. Tính toán khuyến mãi (Tầng 1)
  const { validCouponCode, promoDiscount } = await pricingService.calculatePromotions(conn, {
    couponCode: coupon_code,
    subtotal,
    customerId,
    orderType: order_type,
    isOnlineCustomer
  });

  // 4.1. BIZ-03: Tính chiết khấu hạng hội viên (Tầng 2)
  const subtotalAfterPromo = Math.max(0, subtotal - promoDiscount);
  const tierDiscount = customerTierDiscountPct > 0
    ? Math.round((subtotalAfterPromo * customerTierDiscountPct) / 100)
    : 0;

  // 5. Tính toán điểm đổi (Tầng 3)
  // SEC-03: Bảo vệ điểm tích lũy - Chống trộm điểm
  // Khách online bắt buộc phải đăng nhập và SĐT phải trùng với tài khoản chính chủ
  const subtotalAfterTier = Math.max(0, subtotalAfterPromo - tierDiscount);
  const rawRequestedPts = points_to_redeem || points_redeemed || 0;
  let pointsToRedeem = 0;
  let pointsDiscount = 0;

  if (rawRequestedPts > 0) {
    if (isOnlineCustomer) {
      if (!reqUser || reqUser.role !== 'customer') {
        const authErr = new Error('Quý khách vui lòng đăng nhập tài khoản để sử dụng điểm tích lũy!');
        authErr.status = 401;
        throw authErr;
      }
      const userPhone = reqUser.phone || reqUser.username;
      if (!userPhone || (effectivePhone && effectivePhone !== userPhone)) {
        const bolaErr = new Error('Số điện thoại đổi điểm không khớp với tài khoản đang đăng nhập!');
        bolaErr.status = 403;
        throw bolaErr;
      }
    }
    const redemptionRes = await loyaltyService.validateAndCalculateRedemption(conn, {
      customerId,
      requestedPoints: rawRequestedPts,
      currentSubtotalAfterPromo: subtotalAfterTier
    });
    pointsToRedeem = redemptionRes.pointsToRedeem;
    pointsDiscount = redemptionRes.pointsDiscount;
  }

  // 6. Tính tổng tiền cuối cùng (Tầng 4 - Thuế VAT & Phí vận chuyển)
  const pricingResult = pricingService.calculateFinalTotal({
    subtotal,
    promoDiscount,
    tierDiscount,
    pointsDiscount,
    tax,
    shippingFee: shipping_fee
  });
  const { total, tax: finalTax, totalDiscount } = pricingResult;

  // 7. Xử lý giờ mở cửa & đặt trước (SCHEDULED vs PENDING)
  const config = await storeService.getStoreSettings();
  const vnNow = storeService.getVietnamNow();
  const storeIsOpen = storeService.isStoreOpen(config, vnNow);

  let finalOrderStatus = 'pending';
  let effectivePickupDate = null;
  let pickupDisplayLabel = null;

  if (!storeIsOpen) {
    if (!pickup_time) {
      throw new Error(`Quán hiện đang đóng cửa (Giờ phục vụ: ${config.open_time} – ${config.close_time}). Quý khách vui lòng chọn giờ nhận hàng trong khung giờ mở cửa để đặt trước!`);
    }
    const check = storeService.validatePickupTime(pickup_time, config, vnNow);
    if (!check.valid) throw new Error(check.message);
    finalOrderStatus = 'scheduled';
    effectivePickupDate = check.pickupDate;
    pickupDisplayLabel = check.displayTime;
  } else {
    if (pickup_time) {
      const check = storeService.validatePickupTime(pickup_time, config, vnNow);
      if (!check.valid) throw new Error(check.message);
      finalOrderStatus = 'scheduled';
      effectivePickupDate = check.pickupDate;
      pickupDisplayLabel = check.displayTime;
    } else {
      // Chỉ nhân viên quầy (staff) mới có quyền đánh dấu đơn hoàn tất thanh toán ngay tại POS
      finalOrderStatus = (isStaff && requestedStatus === 'paid') ? 'paid' : 'pending';
    }
  }

  // 8. Trạng thái thanh toán:
  // SEC-02 & BIZ-01: Khách đặt online (isOnlineCustomer) BẮT BUỘC có payment_status = 'unpaid'
  // Chỉ nhân viên thu ngân tại quầy (isStaff) tạo đơn tại POS mới được phép gán 'paid' khi thu tiền trực tiếp
  const finalPaymentStatus = isOnlineCustomer
    ? 'unpaid'
    : ((isStaff && (requestedStatus === 'paid' || orderData.payment_status === 'paid')) ? 'paid' : 'unpaid');

  // 9. Sinh số hóa đơn và mã đơn hàng tuần tự
  const today = getVietnamDateString();
  const dateNum = getVietnamDateNumber();
  await conn.query(
    `INSERT INTO document_counters (prefix, last_date, seq) VALUES ('HD', ?, 1)
     ON DUPLICATE KEY UPDATE seq = IF(last_date=VALUES(last_date), seq+1, 1), last_date = VALUES(last_date)`,
    [today]
  );
  const [counter] = await conn.query("SELECT seq FROM document_counters WHERE prefix='HD'");
  let orderCode = `HD${dateNum}-${String(counter[0].seq).padStart(4, '0')}`;
  let invoiceNo = orderCode;

  const [existOrder] = await conn.query('SELECT id FROM orders WHERE code = ?', [orderCode]);
  if (existOrder.length) {
    orderCode = `HD${dateNum}-${String(counter[0].seq).padStart(4, '0')}-${Date.now().toString().slice(-4)}`;
    invoiceNo = orderCode;
  }

  // SEC-04: Khách đặt online (isOnlineCustomer) BẮT BUỘC là takeaway, không được chọn dine_in hay chiếm bàn quán
  const normalizedOrderType = (!isOnlineCustomer && order_type === 'dine_in') ? 'dine_in' : 'takeaway';
  const effectiveTableId = normalizedOrderType === 'dine_in' ? (table_id || null) : null;
  const closedAt = finalOrderStatus === 'paid' && finalPaymentStatus === 'paid' ? 'NOW()' : 'NULL';

  // 10. Chèn bản ghi Orders (created_by ghi chính xác ID tài khoản đang tạo đơn, không fallback về Admin)
  let orderRes;
  try {
    [orderRes] = await conn.query(
      `INSERT INTO orders (code, order_type, table_id, customer_id, status, payment_status, subtotal, discount_total, service_fee, vat_amount, total, note, delivery_address, shipping_fee, recipient_phone, coupon_code, created_by, opened_at, closed_at, pickup_time)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), ${closedAt}, ?)`,
      [orderCode, normalizedOrderType, effectiveTableId, customerId, finalOrderStatus, finalPaymentStatus, subtotal, totalDiscount, finalTax, total, note || null, delivery_address || null, shipping_fee || 0, recipient_phone || null, validCouponCode, dbUser.id, effectivePickupDate]
    );
  } catch (insErr) {
    if (insErr.message?.includes('pickup_time')) {
      [orderRes] = await conn.query(
        `INSERT INTO orders (code, order_type, table_id, customer_id, status, payment_status, subtotal, discount_total, service_fee, vat_amount, total, note, delivery_address, shipping_fee, recipient_phone, coupon_code, created_by, opened_at, closed_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), ${closedAt})`,
        [orderCode, normalizedOrderType, effectiveTableId, customerId, finalOrderStatus, finalPaymentStatus, subtotal, totalDiscount, finalTax, total, note || null, delivery_address || null, shipping_fee || 0, recipient_phone || null, validCouponCode, dbUser.id]
      );
    } else {
      throw insErr;
    }
  }
  const orderId = orderRes.insertId;

  // 11. Chèn Order Items và Toppings
  const itemStatus = finalOrderStatus === 'paid' ? 'done' : (finalOrderStatus === 'scheduled' ? 'scheduled' : 'pending');
  for (const item of validatedItems) {
    const [itemRes] = await conn.query(
      `INSERT INTO order_items (order_id, product_size_id, product_name, size_name, unit_price, quantity, toppings_total, line_total, note, status, sent_at, done_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ${finalOrderStatus === 'scheduled' ? 'NULL' : 'NOW()'}, ${finalOrderStatus === 'paid' ? 'NOW()' : 'NULL'})`,
      [orderId, item.product_size_id, item.name, item.size_name, item.price, item.quantity, item.toppings_total || 0, item.line_total, item.note, itemStatus]
    );
    const orderItemId = itemRes.insertId;

    if (Array.isArray(item.toppings) && item.toppings.length > 0) {
      for (const top of item.toppings) {
        await conn.query(
          `INSERT INTO order_item_toppings (order_item_id, topping_id, topping_name, price, quantity)
           VALUES (?, ?, ?, ?, ?)`,
          [orderItemId, top.topping_id, top.topping_name, top.price, top.quantity]
        );
      }
    }
  }

  // 12. Chèn Hóa đơn Invoices
  await conn.query(
    `INSERT INTO invoices (invoice_no, order_id, subtotal, discount, service_fee, vat, total)
     VALUES (?, ?, ?, ?, 0, ?, ?)`,
    [invoiceNo, orderId, subtotal, totalDiscount, finalTax, total]
  );

  // 13. Chèn Payments nếu đã thanh toán
  const mappedMethod = PAYMENT_METHOD_MAP[payment_method] || 'cash';
  if (total > 0 && finalPaymentStatus === 'paid') {
    await conn.query(
      `INSERT INTO payments (order_id, method, amount, created_by)
       VALUES (?, ?, ?, ?)`,
      [orderId, mappedMethod, total, reqUser?.id || 1]
    );
  }

  // 14. Trừ tồn kho nếu đã thanh toán
  if (finalPaymentStatus === 'paid') {
    await inventoryService.deductStockForOrder(conn, {
      orderId,
      orderCode,
      validatedItems,
      userId: reqUser?.id || 1
    });
  }

  // 15. Tích điểm & Trừ điểm khách hàng
  if (customerId) {
    await loyaltyService.processEarnAndRedeem(conn, {
      customerId,
      orderId,
      pointsToRedeem,
      finalPaidAmount: total,
      isPaid: finalPaymentStatus === 'paid'
    });
  }

  // 16. Cập nhật trạng thái bàn nếu tại quán
  if (effectiveTableId) {
    await conn.query("UPDATE `tables` SET status='occupied' WHERE id=?", [effectiveTableId]);
  }

  // 17. Phát Socket.IO
  if (io) {
    // Masking SĐT khi phát broadcast để bảo vệ quyền riêng tư
    const maskedPhone = effectivePhone
      ? (effectivePhone.length > 6 ? effectivePhone.slice(0, 3) + '****' + effectivePhone.slice(-3) : '***')
      : null;

    io.emit('order:created', {
      orderId,
      orderCode,
      invoiceNo,
      customerName: effectiveName,
      customerPhone: maskedPhone,
      items: validatedItems,
      orderType: normalizedOrderType,
      tableId: effectiveTableId,
      paymentMethod: mappedMethod,
      paymentStatus: finalPaymentStatus,
      total,
      status: finalOrderStatus,
      pickupTime: effectivePickupDate,
      pickupDisplayLabel,
    });

    // Phát đầy đủ chi tiết cho nhân viên quầy thu ngân (cashier room)
    io.to('cashier').emit('cashier:new_order', {
      orderId,
      orderCode,
      invoiceNo,
      customerName: effectiveName,
      customerPhone: effectivePhone,
      total,
      orderType: normalizedOrderType,
      paymentStatus: finalPaymentStatus,
    });

    // Chỉ phát sang KDS Barista khi:
    // 1. Đơn tại bàn (dine_in), HOẶC
    // 2. Đơn ĐÃ THANH TOÁN (payment_status === 'paid')
    // Đơn online chưa thanh toán (unpaid) KHÔNG phát sang Barista!
    if (finalOrderStatus === 'pending' && (normalizedOrderType === 'dine_in' || finalPaymentStatus === 'paid')) {
      io.emit('barista:new_order', {
        orderId,
        orderCode,
        customerName: effectiveName,
        tableId: effectiveTableId,
        orderType: normalizedOrderType,
      });
    }
  }

  let successMsg = 'Xác nhận đơn thành công! Đơn hàng đang ở trạng thái Đang chờ làm.';
  if (finalOrderStatus === 'scheduled') {
    successMsg = `Đặt trước thành công! Quán đã ghi nhận lịch hẹn nhận đơn lúc ${pickupDisplayLabel || effectivePickupDate}.`;
  } else if (finalOrderStatus === 'paid') {
    successMsg = 'Thanh toán và hoàn thành đơn thành công!';
  }

  return {
    invoiceNo,
    orderId,
    orderCode,
    subtotal,
    discount_total: totalDiscount,
    total,
    status: finalOrderStatus,
    payment_status: finalPaymentStatus,
    pickup_time: effectivePickupDate,
    pickup_display_label: pickupDisplayLabel,
    message: successMsg
  };
}

module.exports = {
  createDirectOrder,
  PAYMENT_METHOD_MAP
};
