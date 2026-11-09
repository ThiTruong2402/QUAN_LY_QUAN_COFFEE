const router = require('express').Router();
const c = require('../controllers/recipeController');
const { authenticate, authorize } = require('../middleware/auth');

// Định lượng công thức: Quản lý, Pha chế, Thủ kho được xem; Quản lý (Manager) toàn quyền CRUD thêm/xóa
router.get('/', authenticate, authorize('manager', 'barista', 'warehouse'), c.getAll);
router.post('/', authenticate, authorize('manager'), c.create);
router.delete('/:id', authenticate, authorize('manager'), c.remove);

module.exports = router;
