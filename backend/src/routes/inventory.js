const router = require('express').Router();
const c = require('../controllers/inventoryController');
const { authenticate, authorize } = require('../middleware/auth');

// Phân hệ kho: Thủ kho & Quản lý toàn quyền CRUD, Pha chế & Thu ngân được xem tồn nguyên liệu
router.get('/ingredients', authenticate, authorize('manager', 'warehouse', 'barista', 'cashier'), c.getIngredients);
router.post('/ingredients', authenticate, authorize('manager', 'warehouse'), c.createIngredient);
router.put('/ingredients/:id', authenticate, authorize('manager', 'warehouse'), c.updateIngredient);
router.post('/adjust', authenticate, authorize('manager', 'warehouse'), c.adjustStock);
router.get('/suppliers', authenticate, authorize('manager', 'warehouse'), c.getSuppliers);
router.get('/movements', authenticate, authorize('manager', 'warehouse'), c.getMovements);

module.exports = router;
