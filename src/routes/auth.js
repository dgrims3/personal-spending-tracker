'use strict';

const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { getUserCount, getUserByUsername, insertUser, revokeToken } = require('../db/queries');

const router = express.Router();

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET || JWT_SECRET === 'change-me-before-deploying') {
  throw new Error('JWT_SECRET must be set to a strong random value in .env (run: openssl rand -hex 32)');
}

const SALT_ROUNDS = 10;
const TOKEN_EXPIRY = '30d';

/**
 * Extract the raw JWT string from Authorization header or token cookie.
 * @param {import('express').Request} req
 * @returns {string|null}
 */
function extractToken(req) {
  const header = req.headers.authorization;
  if (header?.startsWith('Bearer ')) return header.slice(7);
  const cookie = req.headers.cookie;
  if (!cookie) return null;
  const match = cookie.split(';').map(c => c.trim()).find(c => c.startsWith('token='));
  return match ? match.slice(6) : null;
}

/**
 * Set a JWT as an httpOnly cookie.
 */
function setTokenCookie(res, token) {
  res.cookie('token', token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.COOKIE_SECURE === 'true',
    maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
  });
}

/**
 * POST /api/auth/register
 * Body: { username: string, password: string }
 * Only works if no users exist yet (first-run setup).
 */
router.post('/register', async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required' });
    }

    if (getUserCount() > 0) {
      return res.status(403).json({ error: 'Registration is closed. A user already exists.' });
    }

    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
    const userId = insertUser(username, passwordHash);

    const jti = crypto.randomUUID();
    const token = jwt.sign({ userId, username, jti }, JWT_SECRET, { expiresIn: TOKEN_EXPIRY });
    setTokenCookie(res, token);
    res.json({ token, userId, username });
  } catch (err) {
    console.error('Register error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/auth/login
 * Body: { username: string, password: string }
 * Returns: { token: string }
 */
router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required' });
    }

    const user = getUserByUsername(username);
    if (!user) {
      return res.status(401).json({ error: 'Invalid username or password' });
    }

    const match = await bcrypt.compare(password, user.password_hash);
    if (!match) {
      return res.status(401).json({ error: 'Invalid username or password' });
    }

    const jti = crypto.randomUUID();
    const token = jwt.sign({ userId: user.id, username: user.username, jti }, JWT_SECRET, { expiresIn: TOKEN_EXPIRY });
    setTokenCookie(res, token);
    res.json({ token, userId: user.id, username: user.username });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/auth/logout
 * Revokes the current token server-side, then clears the cookie.
 */
router.post('/logout', (req, res) => {
  const rawToken = extractToken(req);
  if (rawToken) {
    try {
      // decode without verifying — we just need the jti and exp to revoke it
      const decoded = jwt.decode(rawToken);
      if (decoded?.jti && decoded?.exp) {
        revokeToken(decoded.jti, new Date(decoded.exp * 1000).toISOString());
      }
    } catch (_) {
      // malformed token — nothing to revoke
    }
  }
  res.clearCookie('token');
  res.json({ ok: true });
});

/**
 * GET /api/auth/status
 * Returns whether registration is needed (no users yet).
 */
router.get('/status', (req, res) => {
  res.json({ needsRegistration: getUserCount() === 0 });
});

module.exports = router;
