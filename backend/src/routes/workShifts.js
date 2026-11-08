const router = require('express').Router();
const c = require('../controllers/workShiftController');
const { authenticate, authorize } = require('../middleware/auth');

// Ca làm việc: Nhân viên được xem lịch; chỉ Quản lý (Admin) được phân ca / tạo ca / sửa ca
router.get('/', authenticate, c.getAll);
router.post('/', authenticate, authorize('admin'), c.create);
router.put('/:id', authenticate, authorize('admin'), c.update);
router.delete('/:id', authenticate, authorize('admin'), c.remove);

module.exports = router;
