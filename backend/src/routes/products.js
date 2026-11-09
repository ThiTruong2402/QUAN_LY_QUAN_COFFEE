const router = require('express').Router();
const c = require('../controllers/productController');
const { authenticate, optionalAuthenticate, authorize } = require('../middleware/auth');

// Menu sản phẩm: Khách và nhân viên được xem; Quản lý (Manager) toàn quyền CRUD thêm/sửa/xóa
router.get('/', optionalAuthenticate, c.getAll);
router.post('/', authenticate, authorize('manager'), c.create);
router.put('/:id', authenticate, authorize('manager'), c.update);
router.delete('/:id', authenticate, authorize('manager'), c.remove);

module.exports = router;
