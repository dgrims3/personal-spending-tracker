require('dotenv').config();

const express = require('express');
const path = require('path');
const initDb = require('./src/db/init');

const app = express();
const PORT = process.env.PORT || 3000;

// Initialize database on startup
initDb();

// Middleware
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Routes
app.use('/api/auth', require('./src/routes/auth'));
app.use('/api/upload', require('./src/routes/upload'));
app.use('/api/query', require('./src/routes/query'));

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' });
});

app.listen(PORT, () => {
  console.log(`Receipt tracker running on port ${PORT}`);
});
