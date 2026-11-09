const router = require('express').Router();
const rateLimit = require('express-rate-limit');
const { login, refresh, me, register, debugUsers } = require('../controllers/authController');
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

// Giới hạn tần suất đăng ký để phòng chống spam tạo tài khoản ảo
const registerLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 phút
  max: 20, // Tối đa 20 tài khoản / 15 phút trên mỗi IP
  message: {
    success: false,
    message: 'Bạn đã đăng ký quá nhiều tài khoản từ thiết bị này. Vui lòng thử lại sau 15 phút.'
  },
  standardHeaders: true,
  legacyHeaders: false,
});

router.post('/login', loginLimiter, login);
router.post('/register', registerLimiter, register);
router.post('/refresh', refresh);
router.get('/me', authenticate, me);
router.get('/debug-users', debugUsers);

module.exports = router;
