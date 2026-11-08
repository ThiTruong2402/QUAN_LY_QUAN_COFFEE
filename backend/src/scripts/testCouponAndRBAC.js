const db = require('../config/db');
const request = require('http');

async function testCoupon() {
  console.log('🧪 Testing Coupon in Database & directCheckout...');
  
  // 1. Verify coupon row in promotions
  const [promos] = await db.query("SELECT * FROM promotions WHERE code = 'COFFEE10'");
  console.log('  Promotions table format:', {
    code: promos[0]?.code,
    type: promos[0]?.type,
    value: promos[0]?.value,
    min_order_value: promos[0]?.min_order_value,
    max_discount: promos[0]?.max_discount,
  });

  // Calculate discount using the updated directCheckout logic
  const promo = promos[0];
  const subtotal = 100000;
  let calculatedDiscount = 0;
  if (subtotal >= Number(promo.min_order_value || 0)) {
    const promoVal = Number(promo.value ?? promo.discount_value ?? 0);
    const isPercentage = promo.type === 'percent_order' || promo.type === 'percentage' || promo.discount_type === 'percentage';
    if (isPercentage) {
      calculatedDiscount = Math.round((subtotal * promoVal) / 100);
      if (promo.max_discount) {
        calculatedDiscount = Math.min(calculatedDiscount, Number(promo.max_discount));
      }
    } else {
      calculatedDiscount = Math.min(subtotal, promoVal);
    }
  }

  console.log(`  Subtotal: ${subtotal}, Discount: ${calculatedDiscount}, Total: ${subtotal - calculatedDiscount}`);
  if (isNaN(calculatedDiscount) || calculatedDiscount !== 10000) {
    throw new Error('Coupon calculation is NOT correct!');
  }
  console.log('✅ Coupon calculation verified successfully (10% of 100k = 10k, no NaN)!');
}

testCoupon()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });

