require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const http = require('http');
const { Server } = require('socket.io');

const PORT = process.env.PORT || 5000;
const defaultOrigins = [
  'http://localhost:5173',
  'http://localhost:3000',
  'http://localhost:4173',
  'http://127.0.0.1:5173',
  'http://127.0.0.1:3000',
  'http://127.0.0.1:4173',
  'https://quan-ly-quan-coffee.vercel.app',
  'https://my-coffee-house.vercel.app',
  process.env.CLIENT_URL,
];

const envOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',').map((o) => o.trim())
  : [];

const allowedOrigins = [...new Set([...defaultOrigins, ...envOrigins])].filter(Boolean);

const corsOptions = {
  origin: function (origin, callback) {
    if (!origin) return callback(null, true);

    // SEC-07: Cho phép localhost/LAN, domain Vercel chính thức của dự án và các origin cấu hình tường minh
    // Chặn triệt để origin lạ hoặc wildcard không mong muốn (không crash server với Error)
    const isLocalNetwork = /^http:\/\/(localhost|127\.0\.0\.1|192\.168\.\d+\.\d+|10\.\d+\.\d+\.\d+)(:\d+)?$/.test(origin);
    const isOfficialVercel = /^https:\/\/(quan-ly-quan-coffee|my-coffee-house)(-[a-z0-9-]+)?\.vercel\.app$/i.test(origin);
    const isAllowed = allowedOrigins.includes(origin) || isLocalNetwork || isOfficialVercel;

    if (isAllowed) {
      callback(null, true);
    } else {
      console.warn(`[CORS] Denied origin: ${origin}`);
      callback(null, false);
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
};

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: corsOptions
});

// Middleware
app.use(helmet({ crossOriginResourcePolicy: false }));
app.use(cors(corsOptions));
app.use(express.json({ limit: '6mb' }));
app.use(morgan('dev'));

// Share io with controllers
app.set('io', io);

// Routes
app.use('/api/auth',       require('./src/routes/auth'));
app.use('/api/products',   require('./src/routes/products'));
app.use('/api/categories', require('./src/routes/categories'));
app.use('/api/inventory',  require('./src/routes/inventory'));
app.use('/api/customers',  require('./src/routes/customers'));
app.use('/api/staff',        require('./src/routes/staff'));
app.use('/api/work-shifts',  require('./src/routes/workShifts'));
app.use('/api/recipes',      require('./src/routes/recipes'));
app.use('/api/promotions',   require('./src/routes/promotions'));
app.use('/api/tables',     require('./src/routes/tables'));
app.use('/api/orders',     require('./src/routes/orders'));
app.use('/api/barista',    require('./src/routes/barista'));
app.use('/api/reports',    require('./src/routes/reports'));
app.use('/api/settings',   require('./src/routes/settings'));
app.use('/api/audit-logs', require('./src/routes/auditLogs'));

// Health check
app.get('/api/health', (_, res) => res.json({ status: 'ok', version: 'v2-auto-seed', time: new Date() }));

// Global error handler
app.use((err, req, res, next) => {
  if (err?.type === 'entity.too.large') {
    return res.status(413).json({ success: false, message: 'Dữ liệu ảnh tải lên quá lớn (tối đa 5MB).' });
  }
  console.error(err.stack);
  res.status(500).json({ success: false, message: 'Lỗi server' });
});

// Socket.IO: SEC-06 Xác thực Token và phân quyền Room
const { verifyAccess } = require('./src/utils/jwt');

io.use((socket, next) => {
  const token = socket.handshake.auth?.token || socket.handshake.headers?.authorization?.replace(/^Bearer\s+/i, '');
  if (!token) {
    socket.user = null;
    return next();
  }
  try {
    const decoded = verifyAccess(token);
    socket.user = decoded;
    return next();
  } catch (err) {
    socket.user = null;
    return next();
  }
});

io.on('connection', (socket) => {
  console.log('🔌 Client connected:', socket.id, socket.user ? `[${socket.user.username} - ${socket.user.role}]` : '[Guest]');
  
  // Chỉ nhân viên có vai trò phù hợp mới được join room nội bộ
  socket.on('join_barista', () => {
    if (socket.user && ['admin', 'manager', 'barista'].includes(socket.user.role)) {
      socket.join('barista');
    }
  });

  socket.on('join_cashier', () => {
    if (socket.user && ['admin', 'manager', 'cashier'].includes(socket.user.role)) {
      socket.join('cashier');
    }
  });

  socket.on('disconnect', () => console.log('🔌 Client disconnected:', socket.id));
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 MY COFFEE HOUSE Server running on http://localhost:${PORT}`);
  const { initOrderScheduler } = require('./src/services/orderScheduler');
  initOrderScheduler(io);

  // Auto-migrate schema & seed default staff accounts on boot
  const { autoMigrate } = require('./src/services/initDatabase');
  autoMigrate();
});

module.exports = { app, io };
