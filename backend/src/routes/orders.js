const router = require('express').Router();
const c = require('../controllers/orderController');
const { authenticate, optionalAuthenticate, authorize } = require('../middleware/auth');

// Danh sách đơn hàng
router.get('/my-history', authenticate, c.getMyOrders);
router.get('/', authenticate, authorize('admin', 'manager', 'cashier', 'waiter', 'barista', 'warehouse'), c.getOpen);
router.get('/all', authenticate, authorize('admin', 'manager', 'cashier', 'waiter', 'barista', 'warehouse'), c.getAllOrders);
router.get('/:id', authenticate, authorize('admin', 'manager', 'cashier', 'waiter', 'barista', 'warehouse', 'customer'), c.getOne);

// Tạo & bán đơn hàng tại quầy (POS) & Đặt món trực tuyến (Khách hàng Online & Khách vãng lai)
router.post('/direct-checkout', optionalAuthenticate, c.directCheckout);
router.post('/', authenticate, authorize('admin', 'manager', 'cashier', 'waiter', 'barista', 'warehouse'), c.create);

// Thao tác món & quầy
router.post('/:id/items', authenticate, authorize('admin', 'manager', 'cashier', 'waiter', 'barista'), c.addItem);
router.post('/:id/send', authenticate, authorize('admin', 'manager', 'cashier', 'waiter', 'barista'), c.sendItems);
router.post('/:id/cancel-item/:itemId', authenticate, authorize('admin', 'manager', 'cashier'), c.cancelItem);

// Luồng trạng thái & Hủy đơn
router.put('/:id/status', authenticate, authorize('admin', 'manager', 'cashier', 'barista', 'waiter'), c.updateStatus);
router.put('/:id/cancel', authenticate, authorize('admin', 'manager', 'cashier', 'customer'), c.cancelOrder);
router.post('/:id/confirm-payment', authenticate, authorize('admin', 'manager', 'cashier'), c.confirmPayment);
router.post('/:id/pay', authenticate, authorize('admin', 'manager', 'cashier', 'waiter', 'barista'), c.pay);

module.exports = router;
