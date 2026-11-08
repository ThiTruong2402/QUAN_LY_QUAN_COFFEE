const router = require('express').Router();
const c = require('../controllers/reportController');
const { authenticate, authorize } = require('../middleware/auth');

// Phân hệ báo cáo: Phân quyền theo nghiệp vụ thực tế
router.get('/dashboard', authenticate, authorize('admin', 'cashier'), c.dashboard);
router.get('/revenue', authenticate, authorize('admin', 'cashier'), c.revenue);
router.get('/stock', authenticate, authorize('admin', 'warehouse'), c.stock);

module.exports = router;
