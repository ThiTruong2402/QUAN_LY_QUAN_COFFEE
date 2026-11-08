const jwt = require('jsonwebtoken');
require('dotenv').config();

const JWT_SECRET = process.env.JWT_SECRET || 'mycoffeehouse_jwt_secret_2025_very_long_key';
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'mycoffeehouse_refresh_secret_2025';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '1d';
const JWT_REFRESH_EXPIRES_IN = process.env.JWT_REFRESH_EXPIRES_IN || '7d';

const generateTokens = (user) => {
  const payload = { id: user.id, username: user.username, role: user.role_name || user.role };
  const accessToken = jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
  const refreshToken = jwt.sign({ id: user.id }, JWT_REFRESH_SECRET, { expiresIn: JWT_REFRESH_EXPIRES_IN });
  return { accessToken, refreshToken };
};

const verifyAccess = (token) => jwt.verify(token, JWT_SECRET);
const verifyRefresh = (token) => jwt.verify(token, JWT_REFRESH_SECRET);

module.exports = { generateTokens, verifyAccess, verifyRefresh };
