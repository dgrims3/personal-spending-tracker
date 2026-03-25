const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');

const router = express.Router();

const JWT_SECRET = process.env.JWT_SECRET || 'change-me';
// Password hash is stored in an env var. Generate with:
//   node -e "require('bcrypt').hash('yourpassword', 10).then(console.log)"
const PASSWORD_HASH = process.env.PASSWORD_HASH || '';

/**
 * POST /api/auth/login
 * Body: { password: string }
 * Returns: { token: string }
 */
router.post('/login', async (req, res) => {
  try {
    const { password } = req.body;

    if (!password) {
      return res.status(400).json({ error: 'Password is required' });
    }

    if (!PASSWORD_HASH) {
      return res.status(500).json({ error: 'Server not configured: PASSWORD_HASH not set' });
    }

    const match = await bcrypt.compare(password, PASSWORD_HASH);
    if (!match) {
      return res.status(401).json({ error: 'Invalid password' });
    }

    const token = jwt.sign({ authenticated: true }, JWT_SECRET, { expiresIn: '30d' });
    res.json({ token });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
