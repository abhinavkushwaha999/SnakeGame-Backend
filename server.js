require('dotenv').config();
const express   = require('express');
const mongoose  = require('mongoose');
const cors      = require('cors');
const rateLimit = require('express-rate-limit');

const authRoutes = require('./routes/auth');
const gameRoutes = require('./routes/game');

const app = express();

// ══════════════════════════════════════════════
//  MONGOOSE CONNECTION CACHING
//  Must be defined BEFORE it is used in middleware
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

// ── 1. CORS ── (must be first)
const allowedOrigins = [
  process.env.FRONTEND_URL,
  'http://localhost:3000',
  'http://127.0.0.1:5500',
  'http://127.0.0.1:5173',
].filter(Boolean);

app.use(cors({
  origin: (origin, cb) => {
    if (!origin) return cb(null, true);
    if (allowedOrigins.includes(origin)) return cb(null, true);
    cb(new Error('Not allowed by CORS: ' + origin));
  },
  credentials: true,
}));

// ── 2. BODY PARSER ──
app.use(express.json());

// ── 3. GLOBAL RATE LIMIT ──
app.use(rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
}));

// ── 4. DB CONNECT MIDDLEWARE ── (MUST come before routes)
app.use(async (req, res, next) => {
  try {
    await connectDB();
    next();
  } catch (err) {
    console.error('DB connection failed:', err.message);
    res.status(503).json({ message: 'Database unavailable. Please try again.' });
  }
});

// ── 5. HEALTH CHECK ──
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    db: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
  });
});

// ── 6. ROUTES ── (after DB middleware)
app.use('/api/auth', authRoutes);
app.use('/api/game', gameRoutes);

// ── 7. 404 — catches anything not matched above ──
app.use((req, res) => {
  res.status(404).json({ message: 'Route not found', path: req.originalUrl });
});

// ── 8. GLOBAL ERROR HANDLER ──
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err.stack);
  res.status(500).json({ message: 'Internal server error' });
});

// ══════════════════════════════════════════════
//  VERCEL EXPORT — do NOT call app.listen() here
// ══════════════════════════════════════════════
module.exports = app;

// ── LOCAL DEV ONLY ──
if (require.main === module) {
  const PORT = process.env.PORT || 5000;
  connectDB()
    .then(() => app.listen(PORT, () => console.log('Server on port ' + PORT)))
    .catch(err => { console.error(err.message); process.exit(1); });
}