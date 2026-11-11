const router = require('express').Router();
const c = require('../controllers/inventoryController');
const { authenticate, authorize } = require('../middleware/auth');

// Phân hệ kho: Admin & Quản lý toàn quyền; Thủ kho tạo phiếu; Pha chế & Thu ngân xem tồn nguyên liệu
router.get('/ingredients', authenticate, authorize('admin', 'manager', 'warehouse', 'barista', 'cashier'), c.getIngredients);
router.post('/ingredients', authenticate, authorize('admin', 'manager'), c.createIngredient);
router.put('/ingredients/:id', authenticate, authorize('admin', 'manager'), c.updateIngredient);
router.post('/adjust', authenticate, authorize('admin', 'manager', 'warehouse'), c.adjustStock);
router.get('/suppliers', authenticate, authorize('admin', 'manager', 'warehouse'), c.getSuppliers);
router.get('/movements', authenticate, authorize('admin', 'manager', 'warehouse'), c.getMovements);

module.exports = router;
