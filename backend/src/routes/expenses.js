const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const { getDb } = require('../middleware/auth');
const { auditLog } = require('../middleware/audit');

router.get('/', (req, res) => {
  const db = getDb();
  const { store_id, category_id, from, to } = req.query;
  let sql = `SELECT e.*, ec.name as category_name, s.name as store_name, u.full_name as entered_by_name FROM expenses e JOIN expense_categories ec ON e.category_id = ec.id JOIN stores s ON e.store_id = s.id LEFT JOIN users u ON e.entered_by = u.id WHERE 1=1`;
  const params = [];
  if (store_id) { sql += ` AND e.store_id = ?`; params.push(store_id); }
  if (category_id) { sql += ` AND e.category_id = ?`; params.push(category_id); }
  if (from) { sql += ` AND e.expense_date >= ?`; params.push(from); }
  if (to) { sql += ` AND e.expense_date <= ?`; params.push(to); }
  sql += ` ORDER BY e.expense_date DESC LIMIT 200`;
  res.json(db.prepare(sql).all(...params));
  db.close();
});

router.post('/', (req, res) => {
  const { store_id, category_id, expense_date, description, vendor_name, bill_number, amount, payment_method, notes } = req.body;
  if (!store_id || !category_id || !description || !amount) return res.status(400).json({ error: 'Missing required fields' });
  const db = getDb();
  const id = uuidv4();
  const expNumber = `EXP-${Date.now().toString(36).toUpperCase()}`;
  db.prepare(`INSERT INTO expenses (id, expense_number, store_id, category_id, expense_date, description, vendor_name, bill_number, amount, payment_method, notes, entered_by)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`).run(id, expNumber, store_id, category_id, expense_date||new Date().toISOString().slice(0,10), description, vendor_name, bill_number, amount, payment_method||'cash', notes, req.user.userId);
  auditLog(req, 'create', 'expenses', 'expense', id, null, { store_id, category_id, amount, description });
  db.close();
  res.json({ id, message: 'Expense recorded' });
});

router.put('/:id', (req, res) => {
  const { description, vendor_name, bill_number, amount, category_id, notes } = req.body;
  const db = getDb();
  db.prepare(`UPDATE expenses SET description=COALESCE(?,description), vendor_name=COALESCE(?,vendor_name), bill_number=COALESCE(?,bill_number), amount=COALESCE(?,amount), category_id=COALESCE(?,category_id), notes=COALESCE(?,notes) WHERE id=?`).run(description, vendor_name, bill_number, amount, category_id, notes, req.params.id);
  db.close();
  res.json({ message: 'Expense updated' });
});

router.delete('/:id', (req, res) => {
  const db = getDb();
  db.prepare(`DELETE FROM expenses WHERE id = ?`).run(req.params.id);
  auditLog(req, 'delete', 'expenses', 'expense', req.params.id);
  db.close();
  res.json({ message: 'Expense deleted' });
});

// Categories
router.get('/categories', (req, res) => {
  const db = getDb();
  res.json(db.prepare(`SELECT * FROM expense_categories ORDER BY name`).all());
  db.close();
});

module.exports = router;
