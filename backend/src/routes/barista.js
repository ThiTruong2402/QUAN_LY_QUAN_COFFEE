const router = require('express').Router();
const c = require('../controllers/baristaController');
const { authenticate, authorize } = require('../middleware/auth');

// Hàng đợi pha chế: Quản lý và Pha chế (Barista) có quyền truy cập
router.get('/queue', authenticate, authorize('manager', 'barista'), c.getQueue);
router.put('/items/:id/status', authenticate, authorize('manager', 'barista'), c.updateItemStatus);

module.exports = router;
