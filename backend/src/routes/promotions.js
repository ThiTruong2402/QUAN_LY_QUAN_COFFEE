const router = require('express').Router();
const c = require('../controllers/promotionController');
const { authenticate, authorize } = require('../middleware/auth');

// Phân hệ khuyến mãi: Admin toàn quyền; Thu ngân và Phục vụ được xem và áp dụng mã
router.get('/', authenticate, authorize('admin', 'cashier'), c.getAll);
router.get('/active', authenticate, authorize('admin', 'cashier', 'waiter'), c.getActive);
router.post('/validate', authenticate, authorize('admin', 'cashier', 'waiter'), c.validateCoupon);
router.post('/', authenticate, authorize('admin'), c.create);
router.put('/:id/toggle', authenticate, authorize('admin'), c.toggle);
router.delete('/:id', authenticate, authorize('admin'), c.remove);

module.exports = router;
