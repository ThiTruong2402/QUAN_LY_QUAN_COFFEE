const router = require('express').Router();
const c = require('../controllers/customerController');
const { authenticate, authorize } = require('../middleware/auth');

// Khách hàng: Nhân viên được tra cứu SĐT và điểm; Thu ngân & Quản lý được thêm/sửa khách
router.get('/', authenticate, authorize('admin', 'cashier'), c.getAll);
router.get('/lookup/:phone', authenticate, c.lookupPhone);
router.post('/', authenticate, authorize('admin', 'cashier'), c.create);
router.put('/:id', authenticate, authorize('admin', 'cashier'), c.update);

module.exports = router;
