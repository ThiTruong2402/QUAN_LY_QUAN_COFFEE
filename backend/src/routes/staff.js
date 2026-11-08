const router = require('express').Router();
const c = require('../controllers/staffController');
const { authenticate, authorize } = require('../middleware/auth');

// Danh sách nhân sự: Mọi vai trò được xem để xem ca trực / phối hợp làm việc; Thao tác sửa xóa chỉ Quản Lý (Admin)
router.get('/', authenticate, authorize('admin', 'cashier', 'waiter', 'barista', 'warehouse'), c.getAll);
router.post('/', authenticate, authorize('admin'), c.create);
router.put('/:id', authenticate, authorize('admin'), c.update);
router.delete('/:id', authenticate, authorize('admin'), c.remove);

module.exports = router;
