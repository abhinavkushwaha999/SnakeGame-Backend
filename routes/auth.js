const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');
const User = require('../models/User');
const { generateOTP, sendOTP } = require('../utils/email');

// ── Rate limiters ──
const otpLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 min
  max: 5,
  message: { message: 'Too many OTP requests. Try again in 15 minutes.' },
});
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { message: 'Too many login attempts. Try again in 15 minutes.' },
});

// ── Helper ──
function otpExpiry() {
  return new Date(Date.now() + 10 * 60 * 1000); // 10 minutes
}

// ═══════════════════════════════
//  POST /api/auth/signup
//  Body: { username, email, password }
//  → sends verify OTP to email
// ═══════════════════════════════
router.post('/signup', otpLimiter, async (req, res) => {
  try {
    const { username, email, password } = req.body;

    if (!username || username.length < 3)
      return res.status(400).json({ message: 'Username must be 3+ characters' });
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
      return res.status(400).json({ message: 'Valid email is required' });
    if (!password || password.length < 6)
      return res.status(400).json({ message: 'Password must be 6+ characters' });

    const existingUser = await User.findOne({ $or: [{ email }, { username }] });
    if (existingUser) {
      if (existingUser.username === username)
        return res.status(400).json({ message: 'Username already taken' });
      return res.status(400).json({ message: 'Email already registered' });
    }

    const hashedPassword = await bcrypt.hash(password, 12);
    const otp = generateOTP();

    const user = new User({
      username,
      email,
      password: hashedPassword,
      isVerified: false,
      otp: { code: otp, expiresAt: otpExpiry(), purpose: 'verify' },
    });
    await user.save();

    await sendOTP(email, otp, 'verify');

    res.status(201).json({
      message: 'OTP sent to your email. Verify to activate your account.',
      email,
    });
  } catch (err) {
    console.error('Signup error:', err);
    res.status(500).json({ message: 'Server error. Please try again.' });
  }
});

// ═══════════════════════════════
//  POST /api/auth/verify-signup
//  Body: { email, otp }
//  → marks account verified, returns JWT
// ═══════════════════════════════
router.post('/verify-signup', async (req, res) => {
  try {
    const { email, otp } = req.body;
    const user = await User.findOne({ email });

    if (!user) return res.status(400).json({ message: 'User not found' });
    if (user.otp.purpose !== 'verify')
      return res.status(400).json({ message: 'No pending verification for this account' });
    if (!user.otp.code || user.otp.code !== otp)
      return res.status(400).json({ message: 'Invalid OTP' });
    if (new Date() > user.otp.expiresAt)
      return res.status(400).json({ message: 'OTP expired. Please sign up again.' });

    user.isVerified = true;
    user.otp = { code: null, expiresAt: null, purpose: null };
    await user.save();

    const token = jwt.sign(
      { id: user._id, username: user.username },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.json({
      message: 'Account verified successfully!',
      token,
      user: { username: user.username, email: user.email, highScore: user.highScore },
    });
  } catch (err) {
    console.error('Verify signup error:', err);
    res.status(500).json({ message: 'Server error. Please try again.' });
  }
});

// ═══════════════════════════════
//  POST /api/auth/login
//  Body: { emailOrUsername, password }
//  → sends login OTP to email
// ═══════════════════════════════
router.post('/login', loginLimiter, async (req, res) => {
  try {
    const { emailOrUsername, password } = req.body;
    if (!emailOrUsername || !password)
      return res.status(400).json({ message: 'All fields are required' });

    const user = await User.findOne({
      $or: [{ email: emailOrUsername.toLowerCase() }, { username: emailOrUsername }],
    });

    if (!user) return res.status(400).json({ message: 'Invalid credentials' });
    if (!user.isVerified)
      return res.status(400).json({ message: 'Account not verified. Please check your email.' });

    const match = await bcrypt.compare(password, user.password);
    if (!match) return res.status(400).json({ message: 'Invalid credentials' });

    const otp = generateOTP();
    user.otp = { code: otp, expiresAt: otpExpiry(), purpose: 'login' };
    await user.save();

    await sendOTP(user.email, otp, 'login');

    res.json({
      message: 'OTP sent to your email. Enter it to complete login.',
      email: user.email,
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ message: 'Server error. Please try again.' });
  }
});

// ═══════════════════════════════
//  POST /api/auth/verify-login
//  Body: { email, otp }
//  → returns JWT
// ═══════════════════════════════
router.post('/verify-login', async (req, res) => {
  try {
    const { email, otp } = req.body;
    const user = await User.findOne({ email });

    if (!user) return res.status(400).json({ message: 'User not found' });
    if (user.otp.purpose !== 'login')
      return res.status(400).json({ message: 'No pending login OTP for this account' });
    if (!user.otp.code || user.otp.code !== otp)
      return res.status(400).json({ message: 'Invalid OTP' });
    if (new Date() > user.otp.expiresAt)
      return res.status(400).json({ message: 'OTP expired. Please login again.' });

    user.otp = { code: null, expiresAt: null, purpose: null };
    await user.save();

    const token = jwt.sign(
      { id: user._id, username: user.username },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.json({
      message: 'Login successful!',
      token,
      user: { username: user.username, email: user.email, highScore: user.highScore },
    });
  } catch (err) {
    console.error('Verify login error:', err);
    res.status(500).json({ message: 'Server error. Please try again.' });
  }
});

// ═══════════════════════════════
//  POST /api/auth/forgot-password
//  Body: { email }
//  → sends reset OTP
// ═══════════════════════════════
router.post('/forgot-password', otpLimiter, async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ message: 'Email is required' });

    const user = await User.findOne({ email: email.toLowerCase() });
    // Always respond OK to prevent email enumeration
    if (!user) return res.json({ message: 'If that email exists, an OTP has been sent.' });

    const otp = generateOTP();
    user.otp = { code: otp, expiresAt: otpExpiry(), purpose: 'reset' };
    await user.save();

    await sendOTP(user.email, otp, 'reset');

    res.json({ message: 'Password reset OTP sent to your email.', email });
  } catch (err) {
    console.error('Forgot password error:', err);
    res.status(500).json({ message: 'Server error. Please try again.' });
  }
});

// ═══════════════════════════════
//  POST /api/auth/reset-password
//  Body: { email, otp, newPassword }
//  → resets password, returns JWT
// ═══════════════════════════════
router.post('/reset-password', async (req, res) => {
  try {
    const { email, otp, newPassword } = req.body;
    if (!email || !otp || !newPassword)
      return res.status(400).json({ message: 'All fields are required' });
    if (newPassword.length < 6)
      return res.status(400).json({ message: 'Password must be 6+ characters' });

    const user = await User.findOne({ email });
    if (!user) return res.status(400).json({ message: 'User not found' });
    if (user.otp.purpose !== 'reset')
      return res.status(400).json({ message: 'No pending reset for this account' });
    if (!user.otp.code || user.otp.code !== otp)
      return res.status(400).json({ message: 'Invalid OTP' });
    if (new Date() > user.otp.expiresAt)
      return res.status(400).json({ message: 'OTP expired. Request a new one.' });

    user.password = await bcrypt.hash(newPassword, 12);
    user.otp = { code: null, expiresAt: null, purpose: null };
    await user.save();

    const token = jwt.sign(
      { id: user._id, username: user.username },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.json({
      message: 'Password reset successfully!',
      token,
      user: { username: user.username, email: user.email, highScore: user.highScore },
    });
  } catch (err) {
    console.error('Reset password error:', err);
    res.status(500).json({ message: 'Server error. Please try again.' });
  }
});

// ═══════════════════════════════
//  POST /api/auth/resend-otp
//  Body: { email, purpose }
// ═══════════════════════════════
router.post('/resend-otp', otpLimiter, async (req, res) => {
  try {
    const { email, purpose } = req.body;
    const user = await User.findOne({ email });
    if (!user) return res.status(400).json({ message: 'User not found' });

    const otp = generateOTP();
    user.otp = { code: otp, expiresAt: otpExpiry(), purpose };
    await user.save();

    await sendOTP(email, otp, purpose);
    res.json({ message: 'New OTP sent to your email.' });
  } catch (err) {
    console.error('Resend OTP error:', err);
    res.status(500).json({ message: 'Server error. Please try again.' });
  }
});

module.exports = router;