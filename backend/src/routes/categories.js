const router = require('express').Router();
const c = require('../controllers/categoryController');
const { authenticate, optionalAuthenticate, authorize } = require('../middleware/auth');

// Danh mục: Khách & nhân viên được xem; Admin và Quản lý toàn quyền CRUD thêm/sửa/xóa
router.get('/', optionalAuthenticate, c.getAll);
router.post('/', authenticate, authorize('admin', 'manager'), c.create);
router.put('/:id', authenticate, authorize('admin', 'manager'), c.update);
router.delete('/:id', authenticate, authorize('admin', 'manager'), c.remove);

module.exports = router;
