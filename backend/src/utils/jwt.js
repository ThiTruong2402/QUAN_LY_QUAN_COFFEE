const jwt = require('jsonwebtoken');
require('dotenv').config();

const generateTokens = (user) => {
  const payload = { id: user.id, username: user.username, role: user.role_name };
  const accessToken = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRES_IN });
  const refreshToken = jwt.sign({ id: user.id }, process.env.JWT_REFRESH_SECRET, { expiresIn: process.env.JWT_REFRESH_EXPIRES_IN });
  return { accessToken, refreshToken };
};

const verifyAccess = (token) => jwt.verify(token, process.env.JWT_SECRET);
const verifyRefresh = (token) => jwt.verify(token, process.env.JWT_REFRESH_SECRET);

module.exports = { generateTokens, verifyAccess, verifyRefresh };
