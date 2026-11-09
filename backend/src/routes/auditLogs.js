const router = require('express').Router();
const c = require('../controllers/auditLogController');
const { authenticate, authorize } = require('../middleware/auth');

// Theo dõi hoạt động (Audit Logs): Dành riêng cho Quản Trị Hệ Thống (Admin)
router.get('/', authenticate, authorize('admin'), c.getLogs);

module.exports = router;
