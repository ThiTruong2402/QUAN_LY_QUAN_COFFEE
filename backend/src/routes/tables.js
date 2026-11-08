const router = require('express').Router();
const c = require('../controllers/tableController');
const { authenticate } = require('../middleware/auth');

router.get('/', authenticate, c.getAll);
router.put('/:id/status', authenticate, c.updateStatus);
router.post('/:id/reserve', authenticate, c.reserveTable);
router.post('/:id/cancel-reservation', authenticate, c.cancelReservation);
router.post('/:id/transfer', authenticate, c.transferTable);

module.exports = router;
