const router = require('express').Router();
const c = require('../controllers/recipeController');
const { authenticate, authorize } = require('../middleware/auth');

// Định lượng công thức: Admin, Quản lý, Pha chế, Thủ kho được xem; Admin và Quản lý toàn quyền CRUD thêm/xóa
router.get('/', authenticate, authorize('admin', 'manager', 'barista', 'warehouse'), c.getAll);
router.post('/', authenticate, authorize('admin', 'manager'), c.create);
router.delete('/:id', authenticate, authorize('admin', 'manager'), c.remove);

module.exports = router;
