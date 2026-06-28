const express = require('express');
const router = express.Router();
const { getDb } = require('../middleware/auth');

router.get('/', (req, res) => {
  const db = getDb();
  const { module, action, user_id, from, to, limit } = req.query;
  let sql = `SELECT al.*, u.full_name as user_name FROM audit_logs al LEFT JOIN users u ON al.user_id = u.id WHERE 1=1`;
  const params = [];
  if (module) { sql += ` AND al.module = ?`; params.push(module); }
  if (action) { sql += ` AND al.action = ?`; params.push(action); }
  if (user_id) { sql += ` AND al.user_id = ?`; params.push(user_id); }
  if (from) { sql += ` AND al.created_at >= ?`; params.push(from); }
  if (to) { sql += ` AND al.created_at <= ?`; params.push(to); }
  sql += ` ORDER BY al.created_at DESC LIMIT ?`;
  params.push(parseInt(limit) || 200);
  res.json(db.prepare(sql).all(...params));
  db.close();
});

router.get('/summary', (req, res) => {
  const db = getDb();
  const { days } = req.query;
  const d = parseInt(days) || 7;
  const summary = {
    by_module: db.prepare(`SELECT module, COUNT(*) as count FROM audit_logs WHERE created_at >= date('now', '-' || ? || ' days') GROUP BY module ORDER BY count DESC`).all(d),
    by_action: db.prepare(`SELECT action, COUNT(*) as count FROM audit_logs WHERE created_at >= date('now', '-' || ? || ' days') GROUP BY action ORDER BY count DESC`).all(d),
    by_user: db.prepare(`SELECT al.user_id, u.full_name, COUNT(*) as count FROM audit_logs al LEFT JOIN users u ON al.user_id = u.id WHERE al.created_at >= date('now', '-' || ? || ' days') GROUP BY al.user_id ORDER BY count DESC`).all(d),
    total: db.prepare(`SELECT COUNT(*) as total FROM audit_logs WHERE created_at >= date('now', '-' || ? || ' days')`).all(d)[0]
  };
  db.close();
  res.json(summary);
});

module.exports = router;
