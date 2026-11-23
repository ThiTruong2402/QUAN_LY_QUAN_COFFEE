const router = require('express').Router();
const c = require('../controllers/workShiftController');
const { authenticate, authorize } = require('../middleware/auth');

// Ca làm việc: Nhân viên xem lịch ca; Admin và Quản lý toàn quyền xếp ca / duyệt ca / đổi người
router.get('/', authenticate, authorize('admin', 'manager', 'cashier', 'barista', 'waiter', 'warehouse'), c.getAll);
router.post('/swap', authenticate, authorize('admin', 'manager'), c.swapShifts);
router.post('/generate-week', authenticate, authorize('admin', 'manager'), c.generateWeek);
router.delete('/week', authenticate, authorize('admin', 'manager'), c.clearWeek);
router.post('/', authenticate, authorize('admin', 'manager'), c.create);
router.put('/:id/assign-staff', authenticate, authorize('admin', 'manager'), c.assignStaff);
router.put('/:id', authenticate, authorize('admin', 'manager'), c.update);
router.delete('/:id', authenticate, authorize('admin', 'manager'), c.remove);

module.exports = router;
