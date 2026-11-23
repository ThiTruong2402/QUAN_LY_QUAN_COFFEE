const router = require('express').Router();
const c = require('../controllers/promotionController');
const { authenticate, optionalAuthenticate, authorize } = require('../middleware/auth');

// Phân hệ khuyến mãi: Quản trị viên (Admin) & Quản lý (Manager) toàn quyền CRUD; Thu ngân được xem danh sách
router.get('/', authenticate, authorize('admin', 'manager', 'cashier'), c.getAll);
router.get('/active', optionalAuthenticate, c.getActive);
router.post('/validate', optionalAuthenticate, c.validateCoupon);
router.post('/', authenticate, authorize('admin', 'manager'), c.create);
router.put('/:id/toggle', authenticate, authorize('admin', 'manager'), c.toggle);
router.delete('/:id', authenticate, authorize('admin', 'manager'), c.remove);

module.exports = router;
