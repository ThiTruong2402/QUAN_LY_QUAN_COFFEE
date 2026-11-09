const router = require('express').Router();
const c = require('../controllers/staffController');
const { authenticate, authorize } = require('../middleware/auth');

// Danh sách nhân sự: Nhân viên và Quản lý được xem để phối hợp; Phân quyền/Tạo/Sửa/Xóa/Đổi vai trò chỉ Quản Trị Viên (Admin)
router.get('/', authenticate, authorize('admin', 'manager', 'cashier', 'waiter', 'barista', 'warehouse'), c.getAll);
router.post('/', authenticate, authorize('admin'), c.create);
router.put('/:id', authenticate, authorize('admin'), c.update);
router.delete('/:id', authenticate, authorize('admin'), c.remove);

module.exports = router;
