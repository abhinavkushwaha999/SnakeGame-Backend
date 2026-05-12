const express = require('express');
const router  = express.Router();
const User    = require('../models/User');
const authMiddleware = require('../middleware/auth');

// GET /api/game/profile
router.get('/profile', authMiddleware, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select('-password -otp');
    if (!user) return res.status(404).json({ message: 'User not found' });
    res.json({ username: user.username, email: user.email, highScore: user.highScore });
  } catch (err) {
    console.error('Profile error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// POST /api/game/score
router.post('/score', authMiddleware, async (req, res) => {
  try {
    const { score } = req.body;
    if (typeof score !== 'number' || score < 0)
      return res.status(400).json({ message: 'Invalid score' });

    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ message: 'User not found' });

    let updated = false;
    if (score > user.highScore) {
      user.highScore = score;
      await user.save();
      updated = true;
    }

    res.json({ highScore: user.highScore, updated });
  } catch (err) {
    console.error('Score error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;