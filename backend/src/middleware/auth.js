const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const Database = require('better-sqlite3');
const path = require('path');

const JWT_SECRET = process.env.JWT_SECRET || 'manager-erp-secret-key-2026';
const dbPath = path.join(__dirname, '..', '..', 'data', 'erp.db');

function getDb() {
  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  return db;
}

function authenticate(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

function authorize(...modules) {
  return (req, res, next) => {
    if (req.user.role === 'admin') return next();
    
    const db = getDb();
    const perm = db.prepare(
      `SELECT can_read FROM permissions WHERE role_id = (SELECT role_id FROM users WHERE id = ?) AND module = ?`
    ).get(req.user.userId, modules[0] || req.path.split('/')[1]);
    db.close();

    if (perm && perm.can_read) return next();
    return res.status(403).json({ error: 'Insufficient permissions' });
  };
}

function login(username, password) {
  const db = getDb();
  const user = db.prepare(`
    SELECT u.id, u.username, u.full_name, u.email, u.role_id, u.store_id, u.password_hash, r.name as role_name
    FROM users u JOIN roles r ON u.role_id = r.id
    WHERE u.username = ? AND u.is_active = 1
  `).get(username);
  
  if (!user) {
    db.close();
    return null;
  }

  const valid = bcrypt.compareSync(password, user.password_hash);
  if (!valid) {
    db.close();
    return null;
  }

  // Update last login
  db.prepare(`UPDATE users SET last_login = datetime('now') WHERE id = ?`).run(user.id);

  const token = jwt.sign(
    { userId: user.id, username: user.username, role: user.role_name, storeId: user.store_id, fullName: user.full_name },
    JWT_SECRET,
    { expiresIn: '24h' }
  );

  const permissions = db.prepare(`
    SELECT module, can_read, can_create, can_update, can_delete, can_approve
    FROM permissions WHERE role_id = ?
  `).all(user.role_id);
  db.close();

  return {
    token,
    user: {
      id: user.id,
      username: user.username,
      fullName: user.full_name,
      email: user.email,
      role: user.role_name,
      storeId: user.store_id
    },
    permissions
  };
}

module.exports = { authenticate, authorize, login, getDb, JWT_SECRET };
