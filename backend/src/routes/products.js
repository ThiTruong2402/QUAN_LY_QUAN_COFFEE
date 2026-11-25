const router = require('express').Router();
const c = require('../controllers/productController');
const { authenticate, optionalAuthenticate, authorize } = require('../middleware/auth');

// Menu sản phẩm: Khách và nhân viên được xem; Admin và Quản lý có toàn quyền CRUD thêm/sửa/xóa và tải ảnh
router.get('/uploaded-image/:imageId', c.getUploadedImage);
router.post('/upload-image', authenticate, authorize('admin', 'manager'), c.uploadImage);
router.get('/', optionalAuthenticate, c.getAll);
router.post('/', authenticate, authorize('admin', 'manager'), c.create);
router.put('/:id', authenticate, authorize('admin', 'manager'), c.update);
router.delete('/:id', authenticate, authorize('admin', 'manager'), c.remove);

module.exports = router;
