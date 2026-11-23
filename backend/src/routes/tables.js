const router = require('express').Router();
const c = require('../controllers/tableController');
const { authenticate, authorize } = require('../middleware/auth');

router.get('/', authenticate, c.getAll);
router.put('/:id/status', authenticate, authorize('admin', 'manager', 'cashier', 'waiter'), c.updateStatus);
router.post('/:id/reserve', authenticate, authorize('admin', 'manager', 'cashier', 'waiter'), c.reserveTable);
router.post('/:id/cancel-reservation', authenticate, authorize('admin', 'manager', 'cashier', 'waiter'), c.cancelReservation);
router.post('/:id/transfer', authenticate, authorize('admin', 'manager', 'cashier', 'waiter'), c.transferTable);

module.exports = router;
