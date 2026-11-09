const router = require('express').Router();
const c = require('../controllers/workShiftController');
const { authenticate, authorize } = require('../middleware/auth');

// Ca làm việc: Nhân viên được xem lịch; Quản lý (Manager) toàn quyền phân ca / tạo ca / sửa ca
router.get('/', authenticate, c.getAll);
router.post('/', authenticate, authorize('manager'), c.create);
router.put('/:id', authenticate, authorize('manager'), c.update);
router.delete('/:id', authenticate, authorize('manager'), c.remove);

module.exports = router;
