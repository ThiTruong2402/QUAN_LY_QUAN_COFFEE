const router = require('express').Router();
const c = require('../controllers/reportController');
const { authenticate, authorize } = require('../middleware/auth');

// Phân hệ báo cáo: Admin và Quản lý toàn quyền xem doanh thu, lợi nhuận, chi phí; Nhân viên không có quyền
router.get('/dashboard', authenticate, authorize('admin', 'manager'), c.dashboard);
router.get('/revenue', authenticate, authorize('admin', 'manager'), c.revenue);
router.get('/stock', authenticate, authorize('admin', 'manager', 'warehouse'), c.stock);

module.exports = router;
