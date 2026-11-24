const router = require('express').Router();
const rateLimit = require('express-rate-limit');
const c = require('../controllers/orderController');
const { authenticate, authorize } = require('../middleware/auth');

// BIZ-10: Rate limiter chống spam tạo đơn tự động cho cổng direct-checkout
const directCheckoutLimiter = rateLimit({
  windowMs: 5 * 60 * 1000, // 5 phút
  max: 30, // Tối đa 30 đơn / 5 phút trên một địa chỉ IP
  message: { success: false, message: 'Bạn đang thao tác quá nhiều đơn trong thời gian ngắn! Vui lòng thử lại sau vài phút.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// Danh sách đơn hàng
router.get('/my-history', authenticate, c.getMyOrders);
router.get('/', authenticate, authorize('admin', 'manager', 'cashier', 'waiter', 'barista'), c.getOpen);
router.get('/all', authenticate, authorize('admin', 'manager', 'cashier'), c.getAllOrders);
router.get('/:id', authenticate, authorize('admin', 'manager', 'cashier', 'waiter', 'barista', 'customer'), c.getOne);

// Tạo & bán đơn hàng tại quầy (POS) & Đặt món trực tuyến (Khách Hàng Online)
// AUTH-ORDER-01: BẮT BUỘC ĐĂNG NHẬP KHI ĐẶT HÀNG & THANH TOÁN (Khóa cứng JWT, chặn 100% khách vãng lai)
router.post(
  '/direct-checkout',
  directCheckoutLimiter,
  authenticate,
  authorize('admin', 'manager', 'cashier', 'waiter', 'customer'),
  c.directCheckout
);
router.post('/', authenticate, authorize('admin', 'manager', 'cashier', 'waiter'), c.create);

// Thao tác món & quầy
router.post('/:id/items', authenticate, authorize('admin', 'manager', 'cashier', 'waiter'), c.addItem);
router.post('/:id/send', authenticate, authorize('admin', 'manager', 'cashier', 'waiter'), c.sendItems);
router.post('/:id/cancel-item/:itemId', authenticate, authorize('admin', 'manager', 'cashier'), c.cancelItem);

// Luồng trạng thái & Hủy đơn
router.put('/:id/status', authenticate, authorize('admin', 'manager', 'cashier', 'barista', 'waiter'), c.updateStatus);
router.put('/:id/cancel', authenticate, authorize('admin', 'manager', 'cashier', 'customer'), c.cancelOrder);
router.post('/:id/confirm-payment', authenticate, authorize('admin', 'manager', 'cashier'), c.confirmPayment);
router.post('/:id/pay', authenticate, authorize('admin', 'manager', 'cashier'), c.pay);

module.exports = router;
