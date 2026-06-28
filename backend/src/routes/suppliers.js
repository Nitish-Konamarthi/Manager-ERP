const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const { getDb } = require('../middleware/auth');
const { auditLog } = require('../middleware/audit');

router.get('/', (req, res) => {
  const db = getDb();
  const { is_active } = req.query;
  let sql = `SELECT s.*, 
    (SELECT COUNT(*) FROM purchase_orders WHERE supplier_id = s.id AND date(order_date) >= date('now', '-30 days')) as orders_30d 
    FROM suppliers s WHERE 1=1`;
  const params = [];
  if (is_active !== undefined) { sql += ` AND s.is_active = ?`; params.push(is_active); }
  sql += ` ORDER BY s.name`;
  res.json(db.prepare(sql).all(...params));
  db.close();
});

router.get('/:id', (req, res) => {
  const db = getDb();
  const supplier = db.prepare(`SELECT * FROM suppliers WHERE id = ?`).get(req.params.id);
  if (!supplier) { db.close(); return res.status(404).json({ error: 'Supplier not found' }); }
  const produce = db.prepare(`SELECT sp.*, p.name as produce_name FROM supplier_produce sp JOIN produce p ON sp.produce_id = p.id WHERE sp.supplier_id = ?`).all(req.params.id);
  const orders = db.prepare(`SELECT po.* FROM purchase_orders po WHERE po.supplier_id = ? ORDER BY po.order_date DESC LIMIT 50`).all(req.params.id);
  const payments = db.prepare(`SELECT * FROM supplier_payments WHERE supplier_id = ? ORDER BY payment_date DESC LIMIT 50`).all(req.params.id);
  db.close();
  res.json({ ...supplier, produce, purchase_orders: orders, payments });
});

router.post('/', (req, res) => {
  const { code, name, contact_person, phone, email, address, city, gstin, payment_terms, credit_days, notes } = req.body;
  if (!code || !name) return res.status(400).json({ error: 'Code and name required' });
  const db = getDb();
  const id = uuidv4();
  db.prepare(`INSERT INTO suppliers (id, code, name, contact_person, phone, email, address, city, gstin, payment_terms, credit_days, notes)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`).run(id, code, name, contact_person, phone, email, address, city, gstin, payment_terms||'COD', credit_days||0, notes);
  db.close();
  res.json({ id, message: 'Supplier created' });
});

router.put('/:id', (req, res) => {
  const fields = ['code','name','contact_person','phone','email','address','city','gstin','payment_terms','credit_days','is_active','rating','notes'];
  const sets = fields.filter(f => req.body[f] !== undefined).map(f => `${f}=?`).join(',');
  if (!sets) return res.status(400).json({ error: 'No fields' });
  const vals = fields.filter(f => req.body[f] !== undefined).map(f => req.body[f]);
  vals.push(req.params.id);
  const db = getDb();
  db.prepare(`UPDATE suppliers SET ${sets} WHERE id=?`).run(...vals);
  db.close();
  res.json({ message: 'Supplier updated' });
});

// Supplier-Produce mapping
router.post('/produce', (req, res) => {
  const { supplier_id, produce_id, is_primary, last_price } = req.body;
  if (!supplier_id || !produce_id) return res.status(400).json({ error: 'Supplier and produce required' });
  const db = getDb();
  db.prepare(`INSERT OR REPLACE INTO supplier_produce (id, supplier_id, produce_id, is_primary, last_price) VALUES (?,?,?,?,?)`).run(uuidv4(), supplier_id, produce_id, is_primary||0, last_price);
  db.close();
  res.json({ message: 'Supplier produce mapped' });
});

module.exports = router;
