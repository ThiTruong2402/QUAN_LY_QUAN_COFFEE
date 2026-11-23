const router = require('express').Router();
const c = require('../controllers/customerController');
const { authenticate, authorize } = require('../middleware/auth');

// Khách hàng & Hội viên tích điểm: Quản trị viên (Admin), Quản lý (Manager), Thu ngân (Cashier) toàn quyền truy cập
router.get('/', authenticate, authorize('admin', 'manager', 'cashier'), c.getAll);
router.get('/lookup/:phone', authenticate, c.lookupPhone);
router.post('/', authenticate, authorize('admin', 'manager', 'cashier'), c.create);
router.put('/:id', authenticate, authorize('admin', 'manager', 'cashier'), c.update);

module.exports = router;
