require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const http = require('http');
const { Server } = require('socket.io');

const PORT = process.env.PORT || 5000;
const allowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',').map((o) => o.trim())
  : [
      'http://localhost:5173',
      'http://127.0.0.1:5173',
      process.env.CLIENT_URL,
    ].filter(Boolean);

const corsOptions = {
  origin: function (origin, callback) {
    if (!origin) return callback(null, true);
    const isAllowed =
      allowedOrigins.includes(origin) ||
      /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin) ||
      /\.vercel\.app$/.test(origin) ||
      /\.onrender\.com$/.test(origin);
    if (isAllowed) {
      callback(null, true);
    } else {
      callback(new Error(`CORS blocked: Origin ${origin} is not allowed`));
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
app.use(express.json());
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

// Health check
app.get('/api/health', (_, res) => res.json({ status: 'ok', time: new Date() }));

// Global error handler
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ success: false, message: 'Lỗi server' });
});

// Socket.IO
io.on('connection', (socket) => {
  console.log('🔌 Client connected:', socket.id);
  socket.on('join_barista', () => socket.join('barista'));
  socket.on('join_cashier', () => socket.join('cashier'));
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
