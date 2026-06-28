const { getDb } = require('./auth');

function auditLog(req, action, module, entityType, entityId, oldValues, newValues) {
  try {
    const db = getDb();
    db.prepare(`
      INSERT INTO audit_logs (id, user_id, action, module, entity_type, entity_id, old_values, new_values, ip_address, store_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      require('uuid').v4(),
      req.user?.userId || null,
      action,
      module,
      entityType,
      entityId,
      oldValues ? JSON.stringify(oldValues) : null,
      newValues ? JSON.stringify(newValues) : null,
      req.ip,
      req.user?.storeId || null
    );
    db.close();
  } catch (e) {
    console.error('Audit log error:', e.message);
  }
}

module.exports = { auditLog };
