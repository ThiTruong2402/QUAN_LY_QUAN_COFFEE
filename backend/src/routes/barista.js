const router = require('express').Router();
const c = require('../controllers/baristaController');
const { authenticate, authorize } = require('../middleware/auth');

// Hàng đợi pha chế: Admin, Quản lý, Pha chế (Barista), Thu ngân có quyền truy cập & điều phối
router.get('/queue', authenticate, authorize('admin', 'manager', 'barista', 'cashier'), c.getQueue);
router.put('/items/:id/status', authenticate, authorize('admin', 'manager', 'barista', 'cashier'), c.updateItemStatus);
router.put('/orders/:orderId/status', authenticate, authorize('admin', 'manager', 'barista', 'cashier'), c.updateOrderStatus);

module.exports = router;
