const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'change-me';

/**
 * Parse a specific cookie value from the Cookie header.
 * @param {string} cookieHeader
 * @param {string} name
 * @returns {string|undefined}
 */
function parseCookie(cookieHeader, name) {
  if (!cookieHeader) return undefined;
  const match = cookieHeader.split(';').map(c => c.trim()).find(c => c.startsWith(name + '='));
  return match ? match.slice(name.length + 1) : undefined;
}

/**
 * Express middleware that verifies a JWT from the Authorization header or a cookie.
 * Checks Authorization: Bearer <token> first, then falls back to a "token" cookie.
 */
function authenticate(req, res, next) {
  let token;

  const header = req.headers.authorization;
  if (header && header.startsWith('Bearer ')) {
    token = header.slice(7);
  } else {
    token = parseCookie(req.headers.cookie, 'token');
  }

  if (!token) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

module.exports = { authenticate };
