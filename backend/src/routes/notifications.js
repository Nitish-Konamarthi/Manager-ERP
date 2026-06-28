const express = require('express');
const router = express.Router();
const { getDb } = require('../middleware/auth');

router.get('/', (req, res) => {
  const db = getDb();
  const { unread_only } = req.query;
  let sql = `SELECT n.*, u.full_name as user_name FROM notifications n LEFT JOIN users u ON n.user_id = u.id WHERE (n.user_id = ? OR n.is_global = 1)`;
  const params = [req.user.userId];
  if (unread_only === 'true') { sql += ` AND n.is_read = 0`; }
  sql += ` ORDER BY n.created_at DESC LIMIT 100`;
  const notifications = db.prepare(sql).all(...params);
  const unreadCount = db.prepare(`SELECT COUNT(*) as count FROM notifications WHERE (user_id = ? OR is_global = 1) AND is_read = 0`).get(req.user.userId);
  db.close();
  res.json({ notifications, unread_count: unreadCount.count });
});

router.put('/:id/read', (req, res) => {
  const db = getDb();
  db.prepare(`UPDATE notifications SET is_read = 1 WHERE id = ? AND (user_id = ? OR is_global = 1)`).run(req.params.id, req.user.userId);
  db.close();
  res.json({ message: 'Marked as read' });
});

router.put('/read-all', (req, res) => {
  const db = getDb();
  db.prepare(`UPDATE notifications SET is_read = 1 WHERE (user_id = ? OR is_global = 1) AND is_read = 0`).run(req.user.userId);
  db.close();
  res.json({ message: 'All marked as read' });
});

// Auto-generate notifications
router.post('/generate', (req, res) => {
  const db = getDb();
  const { v4: uuidv4 } = require('uuid');

  // Check expiring stock
  const expiring = db.prepare(`SELECT sb.*, p.name as produce_name, s.name as store_name, s.id as store_id FROM stock_batches sb JOIN produce p ON sb.produce_id = p.id JOIN stores s ON sb.store_id = s.id WHERE sb.available_qty > 0 AND sb.expiry_date IS NOT NULL AND julianday(sb.expiry_date) - julianday('now') <= 2 AND julianday(sb.expiry_date) - julianday('now') >= 0`).all();
  expiring.forEach(e => {
    const existing = db.prepare(`SELECT id FROM notifications WHERE reference_id = ? AND type = 'warning' AND is_read = 0`).get(e.id);
    if (!existing) {
      db.prepare(`INSERT INTO notifications (id, user_id, store_id, title, message, type, module, reference_id, reference_type, is_global)
        VALUES (?,NULL,?,?,?,?,?,?,?,1)`).run(uuidv4(), e.store_id, 'Stock Expiring Soon', `${e.produce_name} (${e.batch_code}) expiring in ${Math.ceil((new Date(e.expiry_date) - new Date()) / (1000*60*60*24))} days - ${e.available_qty} ${e.default_uom||'kg'} remaining`, 'warning', 'inventory', e.id, 'stock_batch');
    }
  });

  // Check overdue invoices
  const overdue = db.prepare(`SELECT i.*, c.name as customer_name FROM invoices i JOIN customers c ON i.customer_id = c.id WHERE i.status IN ('unpaid','partially_paid') AND julianday('now') > julianday(i.due_date)`).all();
  overdue.forEach(inv => {
    const daysOverdue = Math.ceil((new Date() - new Date(inv.due_date)) / (1000*60*60*24));
    const existing = db.prepare(`SELECT id FROM notifications WHERE reference_id = ? AND type = 'error' AND is_read = 0`).get(inv.id);
    if (!existing) {
      db.prepare(`INSERT INTO notifications (id, user_id, title, message, type, module, reference_id, reference_type, is_global)
        VALUES (?,NULL,?,?,?,?,?,?,1)`).run(uuidv4(), `Payment Overdue`, `Invoice ${inv.invoice_number} from ${inv.customer_name} is ${daysOverdue} days overdue - Rs. ${inv.balance_due} pending`, 'error', 'finance', inv.id, 'invoice');
    }
  });

  // Check low stock
  const lowStock = db.prepare(`SELECT sb.produce_id, p.name as produce_name, sb.store_id, s.name as store_name, SUM(sb.available_qty) as total FROM stock_batches sb JOIN produce p ON sb.produce_id = p.id JOIN stores s ON sb.store_id = s.id WHERE sb.status = 'available' GROUP BY sb.produce_id, sb.store_id HAVING total < 10`).all();
  lowStock.forEach(ls => {
    const existing = db.prepare(`SELECT id FROM notifications WHERE reference_id = ? AND type = 'warning' AND is_read = 0 AND module = 'inventory'`).get(ls.produce_id + '_' + ls.store_id);
    if (!existing) {
      db.prepare(`INSERT INTO notifications (id, user_id, store_id, title, message, type, module, reference_id, reference_type, is_global)
        VALUES (?,NULL,?,?,?,?,?,?,?,1)`).run(uuidv4(), ls.store_id, 'Low Stock Alert', `${ls.produce_name} at ${ls.store_name} is low (${Math.round(ls.total)} ${ls.default_uom||'kg'} remaining)`, 'warning', 'inventory', ls.produce_id + '_' + ls.store_id, 'low_stock');
    }
  });

  db.close();
  res.json({ message: 'Notifications generated', expiring: expiring.length, overdue: overdue.length, low_stock: lowStock.length });
});

module.exports = router;
