require('dotenv').config();

const express = require('express');
const path = require('path');
const initDb = require('./src/db/init');
const db = require('./src/db/connection');
const { cleanupExpiredTokens } = require('./src/db/queries');

const app = express();
const PORT = process.env.PORT || 3000;

// Initialize database on startup
initDb();

// Remove revoked tokens whose natural expiry has already passed
const cleaned = cleanupExpiredTokens();
if (cleaned > 0) console.log(`Cleaned up ${cleaned} expired token revocation(s)`);

// Middleware
app.use(express.json({ limit: '10kb' }));
app.use(express.static(path.join(__dirname, 'public')));

// Routes
app.use('/api/auth', require('./src/routes/auth'));
app.use('/api/upload', require('./src/routes/upload'));
app.use('/api/query', require('./src/routes/query'));

// Config — exposes non-sensitive runtime settings to the frontend
app.get('/api/config', (req, res) => {
  res.json({ parserMode: process.env.RECEIPT_PARSER_MODE || 'local' });
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' });
});

const server = app.listen(PORT, () => {
  console.log(`Receipt tracker running on port ${PORT}`);
});

function shutdown() {
  server.close(() => {
    db.close();
    process.exit(0);
  });
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
