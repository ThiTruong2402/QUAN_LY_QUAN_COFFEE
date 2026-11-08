const router = require('express').Router();
const c = require('../controllers/inventoryController');
const { authenticate, authorize } = require('../middleware/auth');

// Phân hệ kho: Thủ kho & Quản lý toàn quyền, Pha chế & Thu ngân được xem tồn nguyên liệu
router.get('/ingredients', authenticate, authorize('admin', 'warehouse', 'barista', 'cashier'), c.getIngredients);
router.post('/ingredients', authenticate, authorize('admin', 'warehouse'), c.createIngredient);
router.put('/ingredients/:id', authenticate, authorize('admin', 'warehouse'), c.updateIngredient);
router.post('/adjust', authenticate, authorize('admin', 'warehouse'), c.adjustStock);
router.get('/suppliers', authenticate, authorize('admin', 'warehouse'), c.getSuppliers);
router.get('/movements', authenticate, authorize('admin', 'warehouse'), c.getMovements);

module.exports = router;
