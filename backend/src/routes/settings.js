const express = require('express');
const router = express.Router();
const { getDb } = require('../middleware/auth');
const { auditLog } = require('../middleware/audit');

router.get('/', (req, res) => {
  const db = getDb();
  const { category } = req.query;
  let sql = `SELECT * FROM settings WHERE 1=1`;
  const params = [];
  if (category) { sql += ` AND category = ?`; params.push(category); }
  sql += ` ORDER BY category, setting_key`;
  res.json(db.prepare(sql).all(...params));
  db.close();
});

router.put('/', (req, res) => {
  const { settings } = req.body; // [{key, value}]
  if (!settings || !settings.length) return res.status(400).json({ error: 'No settings provided' });
  const db = getDb();
  settings.forEach(s => {
    const existing = db.prepare(`SELECT id FROM settings WHERE setting_key = ?`).get(s.key);
    if (existing) {
      const old = db.prepare(`SELECT setting_value FROM settings WHERE setting_key = ?`).get(s.key);
      db.prepare(`UPDATE settings SET setting_value=?, updated_by=?, updated_at=datetime('now') WHERE setting_key=?`).run(s.value, req.user.userId, s.key);
      auditLog(req, 'update', 'settings', 'setting', s.key, old, { value: s.value });
    } else {
      const { v4: uuidv4 } = require('uuid');
      db.prepare(`INSERT INTO settings (id, setting_key, setting_value, setting_type, updated_by) VALUES (?,?,?,?,?)`).run(uuidv4(), s.key, s.value, 'string', req.user.userId);
    }
  });
  db.close();
  res.json({ message: 'Settings updated', count: settings.length });
});

module.exports = router;
