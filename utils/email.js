const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  host: process.env.EMAIL_HOST,
  port: parseInt(process.env.EMAIL_PORT),
  secure: false,
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

function generateOTP() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

function otpEmailHTML(otp, purpose) {
  const titles = {
    verify:  'Verify Your Account',
    login:   'Your Login OTP',
    reset:   'Password Reset OTP',
  };
  const subtitles = {
    verify:  'Enter this code to activate your Serpent account.',
    login:   'Use this code to log in to Serpent.',
    reset:   'Use this code to reset your password.',
  };

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8"/>
  <style>
    body { margin:0; padding:0; background:#020408; font-family:'Courier New',monospace; }
    .wrap { max-width:480px; margin:40px auto; background:#0a140e; border:1px solid rgba(0,255,136,0.25); border-radius:12px; overflow:hidden; }
    .header { background:linear-gradient(135deg,#001a0d,#002a14); padding:32px; text-align:center; border-bottom:1px solid rgba(0,255,136,0.15); }
    .logo { font-size:2.2rem; font-weight:900; letter-spacing:0.2em; color:#00ff88; text-shadow:0 0 20px rgba(0,255,136,0.5); }
    .body { padding:32px; text-align:center; }
    .subtitle { color:#4a7a5a; font-size:0.8rem; letter-spacing:0.15em; text-transform:uppercase; margin-bottom:8px; }
    .title { color:#e8fff4; font-size:1.1rem; margin-bottom:28px; }
    .otp-box { display:inline-block; background:#001a0d; border:2px solid #00ff88; border-radius:8px; padding:18px 36px; letter-spacing:0.5em; font-size:2rem; font-weight:700; color:#00ff88; text-shadow:0 0 15px rgba(0,255,136,0.6); box-shadow:0 0 30px rgba(0,255,136,0.1); margin:12px 0; }
    .expiry { color:#4a7a5a; font-size:0.72rem; margin-top:18px; letter-spacing:0.1em; }
    .warning { color:#ff2244; }
    .footer { border-top:1px solid rgba(0,255,136,0.1); padding:18px; text-align:center; font-size:0.65rem; color:#2a4a34; letter-spacing:0.1em; }
  </style>
</head>
<body>
  <div class="wrap">
    <div class="header">
      <div class="logo">SERPENT</div>
      <div style="color:#4a7a5a;font-size:0.65rem;letter-spacing:0.3em;margin-top:6px">SNAKE · EVOLVED · REBORN</div>
    </div>
    <div class="body">
      <p class="subtitle">${titles[purpose] || 'OTP Code'}</p>
      <p class="title">${subtitles[purpose] || 'Your one-time code:'}</p>
      <div class="otp-box">${otp}</div>
      <p class="expiry">This code expires in <span class="warning">10 minutes</span>.<br/>Never share this code with anyone.</p>
    </div>
    <div class="footer">SERPENT GAME &nbsp;·&nbsp; DO NOT REPLY TO THIS EMAIL</div>
  </div>
</body>
</html>`;
}

async function sendOTP(email, otp, purpose) {
  const subjects = {
    verify: '🐍 Serpent — Verify Your Account',
    login:  '🐍 Serpent — Your Login OTP',
    reset:  '🐍 Serpent — Password Reset Code',
  };

  await transporter.sendMail({
    from: `"Serpent Game" <${process.env.EMAIL_USER}>`,
    to: email,
    subject: subjects[purpose] || 'Serpent OTP',
    html: otpEmailHTML(otp, purpose),
  });
}

module.exports = { generateOTP, sendOTP };