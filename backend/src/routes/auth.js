const express = require('express');
const router = express.Router();
const { login } = require('../middleware/auth');
const { auditLog } = require('../middleware/audit');

router.post('/login', (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password required' });
  }
  const result = login(username, password);
  if (!result) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }
  auditLog(req, 'login', 'auth', 'user', result.user.id);
  res.json(result);
});

router.post('/verify', (req, res) => {
  const { token } = req.body;
  if (!token) return res.status(400).json({ valid: false });
  try {
    const jwt = require('jsonwebtoken');
    const decoded = jwt.verify(token, require('../middleware/auth').JWT_SECRET);
    res.json({ valid: true, user: decoded });
  } catch {
    res.json({ valid: false });
  }
});

module.exports = router;
