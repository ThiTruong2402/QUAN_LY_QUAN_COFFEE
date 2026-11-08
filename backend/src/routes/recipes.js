const router = require('express').Router();
const c = require('../controllers/recipeController');
const { authenticate, authorize } = require('../middleware/auth');

// Định lượng công thức: Quản lý, Pha chế, Thủ kho được xem; chỉ Quản lý (Admin) được thiết lập/xóa
router.get('/', authenticate, authorize('admin', 'barista', 'warehouse'), c.getAll);
router.post('/', authenticate, authorize('admin'), c.create);
router.delete('/:id', authenticate, authorize('admin'), c.remove);

module.exports = router;
