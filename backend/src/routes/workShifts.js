const router = require('express').Router();
const c = require('../controllers/workShiftController');
const { authenticate, authorize } = require('../middleware/auth');

// Ca làm việc: Nhân viên xem lịch ca; Admin và Quản lý toàn quyền xếp ca / duyệt ca
router.get('/', authenticate, c.getAll);
router.post('/', authenticate, authorize('admin', 'manager'), c.create);
router.put('/:id', authenticate, authorize('admin', 'manager'), c.update);
router.delete('/:id', authenticate, authorize('admin', 'manager'), c.remove);

module.exports = router;
