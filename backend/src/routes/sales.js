const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const { getDb } = require('../middleware/auth');
const { auditLog } = require('../middleware/audit');

// Retail Transactions
router.get('/retail', (req, res) => {
  const db = getDb();
  const { store_id, from, to, limit } = req.query;
  let sql = `SELECT rt.*, u.full_name as cashier_name, s.name as store_name FROM retail_transactions rt JOIN users u ON rt.cashier_id = u.id JOIN stores s ON rt.store_id = s.id WHERE 1=1`;
  const params = [];
  if (store_id) { sql += ` AND rt.store_id = ?`; params.push(store_id); }
  if (from) { sql += ` AND rt.transaction_date >= ?`; params.push(from); }
  if (to) { sql += ` AND rt.transaction_date <= ?`; params.push(to); }
  sql += ` ORDER BY rt.created_at DESC LIMIT ?`;
  params.push(parseInt(limit) || 100);
  const txns = db.prepare(sql).all(...params);
  db.close();
  res.json(txns);
});

router.get('/retail/:id', (req, res) => {
  const db = getDb();
  const txn = db.prepare(`SELECT rt.*, u.full_name as cashier_name FROM retail_transactions rt JOIN users u ON rt.cashier_id = u.id WHERE rt.id = ?`).get(req.params.id);
  if (!txn) { db.close(); return res.status(404).json({ error: 'Transaction not found' }); }
  const items = db.prepare(`SELECT rti.*, p.name as produce_name, p.code as produce_code FROM retail_transaction_items rti JOIN produce p ON rti.produce_id = p.id WHERE rti.transaction_id = ?`).all(req.params.id);
  db.close();
  res.json({ ...txn, items });
});

router.post('/retail', (req, res) => {
  const { store_id, customer_id, items, payment_method, payment_ref, net_amount } = req.body;
  if (!store_id || !items || !items.length) return res.status(400).json({ error: 'Store and items required' });
  const db = getDb();
  const txnId = uuidv4();
  const txnNumber = `RT-${Date.now().toString(36).toUpperCase()}`;
  let total = 0;
  items.forEach(i => { total += i.quantity * i.unit_price; });
  const discount = (total - net_amount) || 0;

  db.prepare(`INSERT INTO retail_transactions (id, transaction_number, store_id, customer_id, transaction_date, total_amount, discount_amount, net_amount, payment_method, payment_ref, cashier_id)
    VALUES (?,?,?,?,datetime('now'),?,?,?,?,?,?)`).run(txnId, txnNumber, store_id, customer_id||null, total, discount, net_amount||total, payment_method||'cash', payment_ref, req.user.userId);

  const insertItem = db.prepare(`INSERT INTO retail_transaction_items (id, transaction_id, produce_id, batch_id, quantity, unit_price, total_price) VALUES (?,?,?,?,?,?,?)`);
  items.forEach(item => {
    insertItem.run(uuidv4(), txnId, item.produce_id, item.batch_id||null, item.quantity, item.unit_price, item.quantity * item.unit_price);
    if (item.batch_id) {
      db.prepare(`UPDATE stock_batches SET available_qty = available_qty - ? WHERE id = ? AND available_qty >= ?`).run(item.quantity, item.batch_id, item.quantity);
      db.prepare(`INSERT INTO stock_movements (id, batch_id, produce_id, store_id, movement_type, quantity, total_value, ref_id, ref_type, created_by)
        VALUES (?,?,?,?,?,?,?,?,?,?)`).run(uuidv4(), item.batch_id, item.produce_id, store_id, 'sold', item.quantity, item.quantity * item.unit_price, txnId, 'sale', req.user.userId);
    }
  });

  auditLog(req, 'create', 'sales', 'retail_transaction', txnId, null, { amount: net_amount||total, items: items.length });
  db.close();
  res.json({ id: txnId, transaction_number: txnNumber, message: 'Sale completed' });
});

// Sales Orders (Hotel B2B)
router.get('/orders', (req, res) => {
  const db = getDb();
  const { store_id, customer_id, status, from, to } = req.query;
  let sql = `SELECT so.*, c.name as customer_name, s.name as store_name, u.full_name as created_by_name FROM sales_orders so JOIN customers c ON so.customer_id = c.id JOIN stores s ON so.store_id = s.id LEFT JOIN users u ON so.created_by = u.id WHERE 1=1`;
  const params = [];
  if (store_id) { sql += ` AND so.store_id = ?`; params.push(store_id); }
  if (customer_id) { sql += ` AND so.customer_id = ?`; params.push(customer_id); }
  if (status) { sql += ` AND so.status = ?`; params.push(status); }
  if (from) { sql += ` AND so.order_date >= ?`; params.push(from); }
  if (to) { sql += ` AND so.order_date <= ?`; params.push(to); }
  sql += ` ORDER BY so.created_at DESC LIMIT 200`;
  const orders = db.prepare(sql).all(...params);
  db.close();
  res.json(orders);
});

router.get('/orders/:id', (req, res) => {
  const db = getDb();
  const order = db.prepare(`SELECT so.*, c.name as customer_name, c.phone as customer_phone, c.address as customer_address, s.name as store_name FROM sales_orders so JOIN customers c ON so.customer_id = c.id JOIN stores s ON so.store_id = s.id WHERE so.id = ?`).get(req.params.id);
  if (!order) { db.close(); return res.status(404).json({ error: 'Order not found' }); }
  const items = db.prepare(`SELECT soi.*, p.name as produce_name, p.code as produce_code FROM sales_order_items soi JOIN produce p ON soi.produce_id = p.id WHERE soi.order_id = ?`).all(req.params.id);
  const dns = db.prepare(`SELECT * FROM delivery_notes WHERE order_id = ? ORDER BY dispatch_date DESC`).all(req.params.id);
  db.close();
  res.json({ ...order, items, delivery_notes: dns });
});

router.post('/orders', (req, res) => {
  const { customer_id, contract_id, store_id, delivery_date, items, notes } = req.body;
  if (!customer_id || !store_id || !items || !items.length) return res.status(400).json({ error: 'Customer, store and items required' });
  const db = getDb();
  const orderId = uuidv4();
  const orderNumber = `SO-${Date.now().toString(36).toUpperCase()}`;
  let total = 0;
  items.forEach(i => { total += i.ordered_qty * i.unit_price; });
  db.prepare(`INSERT INTO sales_orders (id, order_number, customer_id, contract_id, store_id, order_type, order_date, delivery_date, status, total_amount, net_amount, notes, created_by)
    VALUES (?,?,?,?,?,?,datetime('now'),?,?,?,?,?,?)`).run(orderId, orderNumber, customer_id, contract_id||null, store_id, 'hotel', delivery_date, 'confirmed', total, total, notes, req.user.userId);
  const insert = db.prepare(`INSERT INTO sales_order_items (id, order_id, produce_id, ordered_qty, unit_price, total_price, grade_required) VALUES (?,?,?,?,?,?,?)`);
  items.forEach(i => insert.run(uuidv4(), orderId, i.produce_id, i.ordered_qty, i.unit_price, i.ordered_qty * i.unit_price, i.grade_required||'A'));
  auditLog(req, 'create', 'sales', 'sales_order', orderId, null, { customer_id, total, items: items.length });
  db.close();
  res.json({ id: orderId, order_number: orderNumber, message: 'Order created' });
});

router.put('/orders/:id/status', (req, res) => {
  const { status } = req.body;
  const db = getDb();
  const old = db.prepare(`SELECT status FROM sales_orders WHERE id = ?`).get(req.params.id);
  if (!old) { db.close(); return res.status(404).json({ error: 'Order not found' }); }
  db.prepare(`UPDATE sales_orders SET status=?, updated_at=datetime('now') WHERE id=?`).run(status, req.params.id);
  auditLog(req, 'update', 'sales', 'sales_order', req.params.id, { status: old.status }, { status });
  db.close();
  res.json({ message: 'Order status updated' });
});

// Delivery Notes
router.get('/deliveries', (req, res) => {
  const db = getDb();
  const { status, customer_id, from, to } = req.query;
  let sql = `SELECT dn.*, so.order_number, c.name as customer_name, s.name as store_name FROM delivery_notes dn JOIN sales_orders so ON dn.order_id = so.id JOIN customers c ON dn.customer_id = c.id JOIN stores s ON dn.store_id = s.id WHERE 1=1`;
  const params = [];
  if (status) { sql += ` AND dn.status = ?`; params.push(status); }
  if (customer_id) { sql += ` AND dn.customer_id = ?`; params.push(customer_id); }
  if (from) { sql += ` AND dn.dispatch_date >= ?`; params.push(from); }
  if (to) { sql += ` AND dn.dispatch_date <= ?`; params.push(to); }
  sql += ` ORDER BY dn.dispatch_date DESC LIMIT 100`;
  res.json(db.prepare(sql).all(...params));
  db.close();
});

router.post('/deliveries', (req, res) => {
  const { order_id, customer_id, store_id, items, driver_id, vehicle_id } = req.body;
  if (!order_id || !customer_id || !store_id || !items) return res.status(400).json({ error: 'Missing required fields' });
  const db = getDb();
  const dnId = uuidv4();
  const dnNumber = `DN-${Date.now().toString(36).toUpperCase()}`;
  db.prepare(`INSERT INTO delivery_notes (id, dn_number, order_id, customer_id, store_id, dispatch_date, status, driver_id, vehicle_id)
    VALUES (?,?,?,?,?,datetime('now'),'dispatched',?,?)`).run(dnId, dnNumber, order_id, customer_id, store_id, driver_id||null, vehicle_id||null);
  const insert = db.prepare(`INSERT INTO delivery_note_items (id, dn_id, order_item_id, produce_id, delivered_qty, unit_price) VALUES (?,?,?,?,?,?)`);
  items.forEach(i => insert.run(uuidv4(), dnId, i.order_item_id, i.produce_id, i.delivered_qty, i.unit_price));
  db.prepare(`UPDATE sales_orders SET status='dispatched', updated_at=datetime('now') WHERE id=?`).run(order_id);
  db.close();
  res.json({ id: dnId, dn_number: dnNumber, message: 'Delivery dispatched' });
});

router.put('/deliveries/:id/receive', (req, res) => {
  const { delivered_items, rejected_items, recipient_name } = req.body;
  const db = getDb();
  const dn = db.prepare(`SELECT * FROM delivery_notes WHERE id = ?`).get(req.params.id);
  if (!dn) { db.close(); return res.status(404).json({ error: 'Delivery note not found' }); }

  // Update delivery note
  let finalStatus = 'delivered';
  if (rejected_items && rejected_items.length > 0) {
    if (rejected_items.length === delivered_items.length) finalStatus = 'rejected';
    else finalStatus = 'partially_delivered';
  }
  db.prepare(`UPDATE delivery_notes SET status=?, delivery_date=datetime('now'), recipient_name=? WHERE id=?`).run(finalStatus, recipient_name, req.params.id);

  // Update delivery items
  if (delivered_items) {
    delivered_items.forEach(i => {
      const existing = db.prepare(`SELECT * FROM delivery_note_items WHERE id = ?`).get(i.id);
      if (existing) {
        db.prepare(`UPDATE delivery_note_items SET delivered_qty=?, rejected_qty=0 WHERE id=?`).run(i.delivered_qty, i.id);
      }
    });
  }
  if (rejected_items) {
    rejected_items.forEach(i => {
      db.prepare(`UPDATE delivery_note_items SET rejected_qty=?, reject_reason=? WHERE id=?`).run(i.qty, i.reason, i.id);
    });
  }

  // Update order status
  const allDelivered = db.prepare(`SELECT COUNT(*) as total, SUM(CASE WHEN delivered_qty >= ordered_qty THEN 1 ELSE 0 END) as done FROM sales_order_items soi JOIN delivery_note_items dni ON soi.id = dni.order_item_id WHERE dni.dn_id = ?`).get(req.params.id);
  db.prepare(`UPDATE sales_orders SET status=?, updated_at=datetime('now') WHERE id=?`).run(allDelivered.total === allDelivered.done ? 'delivered' : 'partially_delivered', dn.order_id);

  auditLog(req, 'update', 'sales', 'delivery_note', req.params.id, { status: 'dispatched' }, { status: finalStatus });
  db.close();
  res.json({ message: 'Delivery received', status: finalStatus });
});

// Contracts
router.get('/contracts', (req, res) => {
  const db = getDb();
  const contracts = db.prepare(`SELECT hc.*, c.name as customer_name FROM hotel_contracts hc JOIN customers c ON hc.customer_id = c.id ORDER BY hc.start_date DESC`).all();
  // Get contract items for each
  const enriched = contracts.map(ct => {
    const items = db.prepare(`SELECT ci.*, p.name as produce_name FROM contract_items ci JOIN produce p ON ci.produce_id = p.id WHERE ci.contract_id = ?`).all(ct.id);
    return { ...ct, items };
  });
  db.close();
  res.json(enriched);
});

router.post('/contracts', (req, res) => {
  const { customer_id, start_date, end_date, payment_term_days, credit_limit, discount_pct, items, delivery_schedule } = req.body;
  if (!customer_id || !start_date || !end_date) return res.status(400).json({ error: 'Customer, start and end dates required' });
  const db = getDb();
  const id = uuidv4();
  const contractNumber = `CT-${Date.now().toString(36).toUpperCase()}`;
  db.prepare(`INSERT INTO hotel_contracts (id, customer_id, contract_number, start_date, end_date, payment_term_days, credit_limit, discount_pct, delivery_schedule, status)
    VALUES (?,?,?,?,?,?,?,?,?,'active')`).run(id, customer_id, contractNumber, start_date, end_date, payment_term_days||15, credit_limit||0, discount_pct||0, delivery_schedule ? JSON.stringify(delivery_schedule) : null);
  if (items) {
    const insert = db.prepare(`INSERT INTO contract_items (id, contract_id, produce_id, agreed_price, min_qty, max_qty) VALUES (?,?,?,?,?,?)`);
    items.forEach(i => insert.run(uuidv4(), id, i.produce_id, i.agreed_price, i.min_qty||0, i.max_qty||null));
  }
  db.close();
  res.json({ id, message: 'Contract created' });
});

// Returns
router.get('/returns', (req, res) => {
  const db = getDb();
  const { store_id, from, to } = req.query;
  let sql = `SELECT cr.*, c.name as customer_name, s.name as store_name, u.full_name as approved_by_name FROM customer_returns cr LEFT JOIN customers c ON cr.customer_id = c.id JOIN stores s ON cr.store_id = s.id LEFT JOIN users u ON cr.approved_by = u.id WHERE 1=1`;
  const params = [];
  if (store_id) { sql += ` AND cr.store_id = ?`; params.push(store_id); }
  if (from) { sql += ` AND cr.return_date >= ?`; params.push(from); }
  if (to) { sql += ` AND cr.return_date <= ?`; params.push(to); }
  sql += ` ORDER BY cr.created_at DESC LIMIT 100`;
  res.json(db.prepare(sql).all(...params));
  db.close();
});

router.post('/returns', (req, res) => {
  const { customer_id, transaction_id, store_id, items, reason, resolution, total_refund } = req.body;
  if (!store_id || !items || !items.length) return res.status(400).json({ error: 'Store and items required' });
  const db = getDb();
  const id = uuidv4();
  const returnNumber = `RET-${Date.now().toString(36).toUpperCase()}`;
  db.prepare(`INSERT INTO customer_returns (id, return_number, customer_id, transaction_id, store_id, return_date, total_refund, reason, resolution, approved_by)
    VALUES (?,?,?,?,?,datetime('now'),?,?,?,?)`).run(id, returnNumber, customer_id||null, transaction_id||null, store_id, total_refund||0, reason, resolution||'full_refund', req.user.userId);
  const insert = db.prepare(`INSERT INTO customer_return_items (id, return_id, produce_id, quantity, unit_price, refund_amount, condition) VALUES (?,?,?,?,?,?,?)`);
  items.forEach(i => insert.run(uuidv4(), id, i.produce_id, i.quantity, i.unit_price||0, i.refund_amount||0, i.condition||'spoiled'));
  auditLog(req, 'create', 'sales', 'customer_return', id, null, { total_refund, items: items.length });
  db.close();
  res.json({ id, message: 'Return recorded' });
});

module.exports = router;
