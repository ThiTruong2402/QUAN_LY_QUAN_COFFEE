const router = require('express').Router();
const rateLimit = require('express-rate-limit');
const { login, refresh, me } = require('../controllers/authController');
const { authenticate } = require('../middleware/auth');

// Giới hạn tần suất đăng nhập để phòng chống tấn công dò mật khẩu (Brute-force)
const loginLimiter = rateLimit({
  windowMs: 5 * 60 * 1000, // 5 phút
  max: 30, // Tối đa 30 lần thử trên mỗi IP
  skipSuccessfulRequests: true, // Không tính lượt đăng nhập thành công vào hạn mức
  message: {
    success: false,
    message: 'Quá nhiều lần thử đăng nhập từ thiết bị của bạn. Vui lòng đợi 5 phút trước khi thử lại.'
  },
  standardHeaders: true,
  legacyHeaders: false,
});

router.post('/login', loginLimiter, login);
router.post('/refresh', refresh);
router.get('/me', authenticate, me);

module.exports = router;
