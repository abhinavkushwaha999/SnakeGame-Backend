require('dotenv').config();
const express   = require('express');
const mongoose  = require('mongoose');
const rateLimit = require('express-rate-limit');

const authRoutes = require('./routes/auth');
const gameRoutes = require('./routes/game');

const app = express();

// ══════════════════════════════════════════════════════
//  STEP 1 — CORS HEADERS (set unconditionally, FIRST)
//
//  WHY: If we use the `cors` npm package with a custom
//  origin function that throws, Express sends the error
//  BEFORE any headers are written → browser sees no
//  Access-Control-Allow-Origin → CORS error.
//
//  FIX: Manually write CORS headers on EVERY response
//  so they are always present, even on 500 errors.
// ══════════════════════════════════════════════════════
app.use((req, res, next) => {
  const origin = req.headers.origin || '';

  const allowedOrigins = [
    (process.env.FRONTEND_URL || '').replace(/\/$/, ''), // strip trailing slash
    'http://localhost:3000',
    'http://127.0.0.1:5500',
    'http://127.0.0.1:5173',
  ].filter(Boolean);

  // Allow the requesting origin if it is in the list,
  // otherwise fall back to the first allowed origin.
  // Never throw — always send a valid CORS header.
  const allowOrigin = allowedOrigins.includes(origin)
    ? origin
    : (allowedOrigins[0] || '*');

  res.setHeader('Access-Control-Allow-Origin', allowOrigin);
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization');

  // Handle preflight OPTIONS request immediately
  if (req.method === 'OPTIONS') {
    return res.sendStatus(204);
  }

  next();
});

// ══════════════════════════════════════════════
//  STEP 2 — BODY PARSER
// ══════════════════════════════════════════════
app.use(express.json());

// ══════════════════════════════════════════════
//  STEP 3 — GLOBAL RATE LIMIT
// ══════════════════════════════════════════════
app.use(rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
}));

// ══════════════════════════════════════════════
//  STEP 4 — MONGOOSE CONNECTION CACHING
//  Reuses connection across Vercel warm invocations
// ══════════════════════════════════════════════
let isConnected = false;

async function connectDB() {
  if (isConnected) return;
  await mongoose.connect(process.env.MONGODB_URI, {
    bufferCommands: false,
    serverSelectionTimeoutMS: 10000,
    socketTimeoutMS: 45000,
  });
  isConnected = true;
  console.log('MongoDB connected');
}

// DB connect middleware — runs before every route
// CORS headers are already set above, so even if this
// throws a 503, the browser can read the response.
app.use(async (req, res, next) => {
  try {
    await connectDB();
    next();
  } catch (err) {
    console.error('DB connection failed:', err.message);
    return res.status(503).json({ message: 'Database unavailable. Please try again.' });
  }
});

// ══════════════════════════════════════════════
//  STEP 5 — HEALTH CHECK
// ══════════════════════════════════════════════
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    db: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
    frontend: process.env.FRONTEND_URL || 'NOT SET',
  });
});

// ══════════════════════════════════════════════
//  STEP 6 — ROUTES
// ══════════════════════════════════════════════
app.use('/api/auth', authRoutes);
app.use('/api/game', gameRoutes);

// ══════════════════════════════════════════════
//  STEP 7 — 404
// ══════════════════════════════════════════════
app.use((req, res) => {
  res.status(404).json({ message: 'Route not found', path: req.originalUrl });
});

// ══════════════════════════════════════════════
//  STEP 8 — GLOBAL ERROR HANDLER
// ══════════════════════════════════════════════
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err.stack);
  res.status(500).json({ message: 'Internal server error', error: err.message });
});

// ══════════════════════════════════════════════
//  VERCEL EXPORT — never call app.listen() here
// ══════════════════════════════════════════════
module.exports = app;

// LOCAL DEV ONLY
if (require.main === module) {
  const PORT = process.env.PORT || 5000;
  connectDB()
    .then(() => app.listen(PORT, () => console.log('Server on http://localhost:' + PORT)))
    .catch(err => { console.error(err.message); process.exit(1); });
}