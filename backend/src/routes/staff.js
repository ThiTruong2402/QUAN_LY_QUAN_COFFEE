const router = require('express').Router();
const c = require('../controllers/staffController');
const { authenticate, authorize } = require('../middleware/auth');

// Quản lý tài khoản: Admin toàn quyền; Quản lý chỉ tạo/sửa nhân viên vận hành; Nhân viên không có quyền
router.get('/', authenticate, authorize('admin', 'manager'), c.getAll);
router.post('/', authenticate, authorize('admin', 'manager'), c.create);
router.put('/:id', authenticate, authorize('admin', 'manager'), c.update);
router.delete('/:id', authenticate, authorize('admin'), c.remove);

module.exports = router;
