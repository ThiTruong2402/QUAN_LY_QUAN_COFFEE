const router = require('express').Router();
const c = require('../controllers/productController');
const { authenticate, optionalAuthenticate, authorize } = require('../middleware/auth');

// Menu sản phẩm: Khách và nhân viên được xem; Admin và Quản lý có toàn quyền CRUD thêm/sửa/xóa
router.get('/', optionalAuthenticate, c.getAll);
router.post('/', authenticate, authorize('admin', 'manager'), c.create);
router.put('/:id', authenticate, authorize('admin', 'manager'), c.update);
router.delete('/:id', authenticate, authorize('admin', 'manager'), c.remove);

module.exports = router;
