/**
 * orderCalculator.js
 * Hàm tính toán giá trị đơn hàng, khuyến mãi, điểm tích lũy và thuế phí
 * Tuân thủ đúng 3 tầng chiết khấu Zero-Trust
 */

export const calculateOrderTotal = ({
  subtotal = 0,
  promoDiscount = 0,
  pointsToRedeem = 0, // 1 điểm = 1.000đ
  tax = 0,
  shippingFee = 0,
}) => {
  const cleanSubtotal = Math.max(0, Number(subtotal || 0));
  const finalTax = Math.max(0, Number(tax || 0));
  const finalShipping = Math.max(0, Number(shippingFee || 0));

  // Tầng 1: Khuyến mãi / Voucher
  const effectivePromoDiscount = Math.min(cleanSubtotal, Math.max(0, Number(promoDiscount || 0)));
  const afterPromo = cleanSubtotal - effectivePromoDiscount;

  // Tầng 2: Điểm thưởng (1 điểm = 1.000đ, không vượt quá phần còn lại sau promo)
  const maxPointsAllowed = Math.floor(afterPromo / 1000);
  const actualPointsRedeemed = Math.min(Math.max(0, Number(pointsToRedeem || 0)), maxPointsAllowed);
  const pointsDiscount = actualPointsRedeemed * 1000;
  const totalDiscount = effectivePromoDiscount + pointsDiscount;

  // Tầng 3: Thuế VAT & Phí vận chuyển
  const finalTotal = Math.max(0, cleanSubtotal - totalDiscount + finalTax + finalShipping);

  return {
    subtotal: cleanSubtotal,
    promoDiscount: effectivePromoDiscount,
    pointsToRedeem: actualPointsRedeemed,
    pointsDiscount,
    totalDiscount,
    tax: finalTax,
    shippingFee: finalShipping,
    finalTotal,
  };
};

export default calculateOrderTotal;
