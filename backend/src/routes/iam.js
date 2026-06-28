const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const { getDb } = require('../middleware/auth');
const { auditLog } = require('../middleware/audit');

// Users CRUD
router.get('/users', (req, res) => {
  const db = getDb();
  const users = db.prepare(`SELECT u.id, u.username, u.full_name, u.email, u.phone, u.role_id, u.store_id, u.is_active, u.last_login, r.name as role_name, s.name as store_name FROM users u LEFT JOIN roles r ON u.role_id = r.id LEFT JOIN stores s ON u.store_id = s.id ORDER BY u.full_name`).all();
  db.close();
  res.json(users);
});

router.post('/users', (req, res) => {
  const { username, password, full_name, email, phone, role_id, store_id } = req.body;
  if (!username || !password || !full_name) return res.status(400).json({ error: 'Missing required fields' });
  const db = getDb();
  const existing = db.prepare(`SELECT id FROM users WHERE username = ?`).get(username);
  if (existing) { db.close(); return res.status(400).json({ error: 'Username already exists' }); }
  const id = uuidv4();
  const bcrypt = require('bcryptjs');
  const hash = bcrypt.hashSync(password, 10);
  db.prepare(`INSERT INTO users (id, username, password_hash, full_name, email, phone, role_id, store_id) VALUES (?,?,?,?,?,?,?,?)`).run(id, username, hash, full_name, email, phone, role_id, store_id || null);
  auditLog(req, 'create', 'iam', 'user', id, null, { username, full_name });
  db.close();
  res.json({ id, message: 'User created' });
});

router.put('/users/:id', (req, res) => {
  const { full_name, email, phone, role_id, store_id, is_active } = req.body;
  const db = getDb();
  const old = db.prepare(`SELECT * FROM users WHERE id = ?`).get(req.params.id);
  if (!old) { db.close(); return res.status(404).json({ error: 'User not found' }); }
  db.prepare(`UPDATE users SET full_name=?, email=?, phone=?, role_id=?, store_id=?, is_active=?, updated_at=datetime('now') WHERE id=?`).run(full_name||old.full_name, email||old.email, phone||old.phone, role_id||old.role_id, store_id||old.store_id, is_active !== undefined ? is_active : old.is_active, req.params.id);
  auditLog(req, 'update', 'iam', 'user', req.params.id, old, req.body);
  db.close();
  res.json({ message: 'User updated' });
});

router.delete('/users/:id', (req, res) => {
  const db = getDb();
  db.prepare(`DELETE FROM users WHERE id = ?`).run(req.params.id);
  auditLog(req, 'delete', 'iam', 'user', req.params.id);
  db.close();
  res.json({ message: 'User deleted' });
});

// Roles CRUD
router.get('/roles', (req, res) => {
  const db = getDb();
  const roles = db.prepare(`SELECT * FROM roles ORDER BY name`).all();
  const perms = db.prepare(`SELECT p.*, r.name as role_name FROM permissions p JOIN roles r ON p.role_id = r.id ORDER BY p.module`).all();
  db.close();
  res.json({ roles, permissions: perms });
});

router.post('/roles', (req, res) => {
  const { name, description } = req.body;
  if (!name) return res.status(400).json({ error: 'Role name required' });
  const db = getDb();
  const id = uuidv4();
  db.prepare(`INSERT INTO roles (id, name, description) VALUES (?,?,?)`).run(id, name, description);
  auditLog(req, 'create', 'iam', 'role', id, null, { name });
  db.close();
  res.json({ id, message: 'Role created' });
});

router.put('/permissions/:role_id', (req, res) => {
  const { permissions } = req.body; // [{module, can_read, can_create, can_update, can_delete, can_approve}]
  const db = getDb();
  db.prepare(`DELETE FROM permissions WHERE role_id = ?`).run(req.params.role_id);
  const insert = db.prepare(`INSERT INTO permissions (id, role_id, module, can_read, can_create, can_update, can_delete, can_approve) VALUES (?,?,?,?,?,?,?,?)`);
  permissions.forEach(p => insert.run(uuidv4(), req.params.role_id, p.module, p.can_read||0, p.can_create||0, p.can_update||0, p.can_delete||0, p.can_approve||0));
  auditLog(req, 'update', 'iam', 'permissions', req.params.role_id, null, permissions);
  db.close();
  res.json({ message: 'Permissions updated' });
});

module.exports = router;
