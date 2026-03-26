const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { getUserCount, getUserByUsername, insertUser } = require('../db/queries');

const router = express.Router();

const JWT_SECRET = process.env.JWT_SECRET || 'change-me';
const SALT_ROUNDS = 10;
const TOKEN_EXPIRY = '30d';

/**
 * Set a JWT as an httpOnly cookie.
 */
function setTokenCookie(res, token) {
  res.cookie('token', token, {
    httpOnly: true,
    sameSite: 'lax',
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

    const token = jwt.sign({ userId, username }, JWT_SECRET, { expiresIn: TOKEN_EXPIRY });
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

    const token = jwt.sign({ userId: user.id, username: user.username }, JWT_SECRET, { expiresIn: TOKEN_EXPIRY });
    setTokenCookie(res, token);
    res.json({ token, userId: user.id, username: user.username });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/auth/logout
 * Clears the token cookie.
 */
router.post('/logout', (req, res) => {
  res.clearCookie('token');
  res.json({ ok: true });
});

/**
 * GET /api/auth/status
 * Returns whether registration is needed (no users yet).
 */
router.get('/status', (req, res) => {
  const userCount = getUserCount();
  res.json({ needsRegistration: userCount === 0 });
});

module.exports = router;
