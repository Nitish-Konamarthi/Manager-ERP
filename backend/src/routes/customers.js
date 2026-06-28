const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const { getDb } = require('../middleware/auth');
const { auditLog } = require('../middleware/audit');

router.get('/', (req, res) => {
  const db = getDb();
  const { customer_type, is_active } = req.query;
  let sql = `SELECT c.*, 
    (SELECT COUNT(*) FROM sales_orders WHERE customer_id = c.id) as total_orders,
    (SELECT COALESCE(SUM(net_amount),0) FROM invoices WHERE customer_id = c.id AND status IN ('unpaid','partially_paid')) as outstanding
    FROM customers c WHERE 1=1`;
  const params = [];
  if (customer_type) { sql += ` AND c.customer_type = ?`; params.push(customer_type); }
  if (is_active !== undefined) { sql += ` AND c.is_active = ?`; params.push(is_active); }
  sql += ` ORDER BY c.name`;
  res.json(db.prepare(sql).all(...params));
  db.close();
});

router.get('/:id', (req, res) => {
  const db = getDb();
  const customer = db.prepare(`SELECT * FROM customers WHERE id = ?`).get(req.params.id);
  if (!customer) { db.close(); return res.status(404).json({ error: 'Customer not found' }); }
  const contracts = db.prepare(`SELECT hc.* FROM hotel_contracts hc WHERE hc.customer_id = ? ORDER BY hc.start_date DESC`).all(req.params.id);
  const orders = db.prepare(`SELECT so.* FROM sales_orders so WHERE so.customer_id = ? ORDER BY so.created_at DESC LIMIT 50`).all(req.params.id);
  const invoices = db.prepare(`SELECT i.* FROM invoices i WHERE i.customer_id = ? ORDER BY i.invoice_date DESC LIMIT 50`).all(req.params.id);
  const payments = db.prepare(`SELECT pr.* FROM payments_received pr WHERE pr.customer_id = ? ORDER BY pr.payment_date DESC LIMIT 50`).all(req.params.id);
  db.close();
  res.json({ ...customer, contracts, orders, invoices, payments });
});

router.post('/', (req, res) => {
  const { code, name, phone, email, address, customer_type, gstin, credit_limit, credit_days, notes } = req.body;
  if (!code || !name) return res.status(400).json({ error: 'Code and name required' });
  const db = getDb();
  const id = uuidv4();
  db.prepare(`INSERT INTO customers (id, code, name, phone, email, address, customer_type, gstin, credit_limit, credit_days, notes)
    VALUES (?,?,?,?,?,?,?,?,?,?,?)`).run(id, code, name, phone, email, address, customer_type||'retail', gstin, credit_limit||0, credit_days||0, notes);
  auditLog(req, 'create', 'customers', 'customer', id, null, { code, name, customer_type });
  db.close();
  res.json({ id, message: 'Customer created' });
});

router.put('/:id', (req, res) => {
  const fields = ['code','name','phone','email','address','customer_type','gstin','credit_limit','credit_days','is_active','notes'];
  const sets = fields.filter(f => req.body[f] !== undefined).map(f => `${f}=?`).join(',');
  if (!sets) return res.status(400).json({ error: 'No fields' });
  const vals = fields.filter(f => req.body[f] !== undefined).map(f => req.body[f]);
  vals.push(req.params.id);
  const db = getDb();
  db.prepare(`UPDATE customers SET ${sets} WHERE id=?`).run(...vals);
  db.close();
  res.json({ message: 'Customer updated' });
});

router.get('/outstanding/summary', (req, res) => {
  const db = getDb();
  const summary = db.prepare(`SELECT * FROM v_customer_outstanding ORDER BY total_outstanding DESC`).all();
  db.close();
  res.json(summary);
});

module.exports = router;
