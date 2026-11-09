const router = require('express').Router();
const c = require('../controllers/promotionController');
const { authenticate, optionalAuthenticate, authorize } = require('../middleware/auth');

// Phân hệ khuyến mãi: Quản lý (Manager) toàn quyền CRUD; Khách hàng & nhân viên được xem mã
router.get('/', authenticate, authorize('manager', 'cashier'), c.getAll);
router.get('/active', optionalAuthenticate, c.getActive);
router.post('/validate', optionalAuthenticate, c.validateCoupon);
router.post('/', authenticate, authorize('manager'), c.create);
router.put('/:id/toggle', authenticate, authorize('manager'), c.toggle);
router.delete('/:id', authenticate, authorize('manager'), c.remove);

module.exports = router;
