const { verifyAccess } = require('../utils/jwt');

const authenticate = (req, res, next) => {
  const auth = req.headers['authorization'];
  if (!auth || !auth.startsWith('Bearer ')) {
    return res.status(401).json({ success: false, message: 'Chưa đăng nhập hoặc thiếu token' });
  }
  try {
    const token = auth.split(' ')[1];
    const decoded = verifyAccess(token);
    if (!decoded || !decoded.id || !decoded.role) {
      return res.status(401).json({ success: false, message: 'Token không hợp lệ hoặc thiếu thông tin vai trò' });
    }
    req.user = decoded;
    next();
  } catch {
    return res.status(401).json({ success: false, message: 'Token không hợp lệ hoặc đã hết hạn' });
  }
};

const optionalAuthenticate = (req, res, next) => {
  const auth = req.headers['authorization'];
  if (auth && auth.startsWith('Bearer ')) {
    try {
      const token = auth.split(' ')[1];
      const decoded = verifyAccess(token);
      if (decoded && decoded.id && decoded.role) {
        req.user = decoded;
      }
    } catch {
      // Khách vãng lai / token hết hạn vẫn cho phép đặt món trực tuyến
    }
  }
  next();
};

const authorize = (...roles) => (req, res, next) => {
  if (!req.user || !req.user.role) {
    return res.status(401).json({ success: false, message: 'Chưa xác thực người dùng' });
  }
  // Nếu vai trò không nằm trong danh sách cho phép (admin luôn được tính nếu có trong roles hoặc là superadmin)
  const allowed = roles.includes(req.user.role) || (req.user.role === 'admin');
  if (!allowed) {
    return res.status(403).json({
      success: false,
      message: `Truy cập bị từ chối: Yêu cầu vai trò [${roles.join(', ')}], vai trò hiện tại: [${req.user.role}]`
    });
  }
  next();
};

module.exports = { authenticate, optionalAuthenticate, authorize };
