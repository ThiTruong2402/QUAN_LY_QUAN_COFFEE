const router = require('express').Router();
const c = require('../controllers/productController');
const { authenticate, authorize } = require('../middleware/auth');

// Menu sản phẩm: Tất cả nhân viên được xem; chỉ Quản lý (Admin) được thêm/sửa/xóa
router.get('/', authenticate, c.getAll);
router.post('/', authenticate, authorize('admin'), c.create);
router.put('/:id', authenticate, authorize('admin'), c.update);
router.delete('/:id', authenticate, authorize('admin'), c.remove);

module.exports = router;
