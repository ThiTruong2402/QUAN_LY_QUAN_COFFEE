const router = require('express').Router();
const c = require('../controllers/reportController');
const { authenticate, authorize } = require('../middleware/auth');

// Phân hệ báo cáo: Quản lý (Manager) toàn quyền xem doanh thu, lợi nhuận, chi phí; Thủ kho xem tồn kho
router.get('/dashboard', authenticate, authorize('manager', 'cashier'), c.dashboard);
router.get('/revenue', authenticate, authorize('manager', 'cashier'), c.revenue);
router.get('/stock', authenticate, authorize('manager', 'warehouse'), c.stock);

module.exports = router;
