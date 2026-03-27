'use strict';

const jwt = require('jsonwebtoken');
const { isTokenRevoked } = require('../db/queries');

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET || JWT_SECRET === 'change-me-before-deploying') {
  throw new Error('JWT_SECRET must be set to a strong random value in .env (run: openssl rand -hex 32)');
}

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
 * Express middleware that verifies a JWT from the Authorization header or a cookie,
 * then confirms the token has not been revoked server-side.
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
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }

  // Reject tokens that were explicitly revoked (e.g. via logout)
  if (req.user.jti && isTokenRevoked(req.user.jti)) {
    return res.status(401).json({ error: 'Token has been revoked' });
  }

  next();
}

module.exports = { authenticate };
