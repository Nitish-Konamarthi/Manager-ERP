const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const { getDb } = require('../middleware/auth');
const { auditLog } = require('../middleware/audit');

// Purchase Orders
router.get('/purchase-orders', (req, res) => {
  const db = getDb();
  const { store_id, supplier_id, status } = req.query;
  let sql = `SELECT po.*, s.name as supplier_name, st.name as store_name, u.full_name as created_by_name
    FROM purchase_orders po JOIN suppliers s ON po.supplier_id = s.id JOIN stores st ON po.store_id = st.id LEFT JOIN users u ON po.created_by = u.id WHERE 1=1`;
  const params = [];
  if (store_id) { sql += ` AND po.store_id = ?`; params.push(store_id); }
  if (supplier_id) { sql += ` AND po.supplier_id = ?`; params.push(supplier_id); }
  if (status) { sql += ` AND po.status = ?`; params.push(status); }
  sql += ` ORDER BY po.order_date DESC LIMIT 200`;
  const pos = db.prepare(sql).all(...params);
  db.close();
  res.json(pos);
});

router.get('/purchase-orders/:id', (req, res) => {
  const db = getDb();
  const po = db.prepare(`SELECT po.*, s.name as supplier_name, s.phone as supplier_phone, st.name as store_name FROM purchase_orders po JOIN suppliers s ON po.supplier_id = s.id JOIN stores st ON po.store_id = st.id WHERE po.id = ?`).get(req.params.id);
  if (!po) { db.close(); return res.status(404).json({ error: 'Purchase order not found' }); }
  const items = db.prepare(`SELECT poi.*, p.name as produce_name, p.code as produce_code FROM purchase_order_items poi JOIN produce p ON poi.produce_id = p.id WHERE poi.po_id = ?`).all(req.params.id);
  const grns = db.prepare(`SELECT * FROM goods_receipts WHERE po_id = ? ORDER BY receipt_date DESC`).all(req.params.id);
  db.close();
  res.json({ ...po, items, goods_receipts: grns });
});

router.post('/purchase-orders', (req, res) => {
  const { store_id, supplier_id, expected_date, items, notes } = req.body;
  if (!store_id || !supplier_id || !items || !items.length) return res.status(400).json({ error: 'Store, supplier and items required' });
  const db = getDb();
  const poId = uuidv4();
  const poNumber = `PO-${Date.now().toString(36).toUpperCase()}`;
  let total = 0;
  items.forEach(i => { total += i.ordered_qty * i.unit_cost; });
  db.prepare(`INSERT INTO purchase_orders (id, po_number, store_id, supplier_id, order_date, expected_date, status, total_cost, notes, created_by)
    VALUES (?,?,?,?,datetime('now'),?,?,?,?,?)`).run(poId, poNumber, store_id, supplier_id, expected_date||null, 'placed', total, notes, req.user.userId);
  const insert = db.prepare(`INSERT INTO purchase_order_items (id, po_id, produce_id, ordered_qty, unit_cost, total_cost) VALUES (?,?,?,?,?,?)`);
  items.forEach(i => insert.run(uuidv4(), poId, i.produce_id, i.ordered_qty, i.unit_cost, i.ordered_qty * i.unit_cost));
  auditLog(req, 'create', 'procurement', 'purchase_order', poId, null, { supplier_id, total, items: items.length });
  db.close();
  res.json({ id: poId, po_number: poNumber, message: 'Purchase order created' });
});

router.put('/purchase-orders/:id/status', (req, res) => {
  const { status } = req.body;
  const db = getDb();
  const old = db.prepare(`SELECT status FROM purchase_orders WHERE id = ?`).get(req.params.id);
  db.prepare(`UPDATE purchase_orders SET status=?, updated_at=datetime('now') WHERE id=?`).run(status, req.params.id);
  auditLog(req, 'update', 'procurement', 'purchase_order', req.params.id, old, { status });
  db.close();
  res.json({ message: 'PO status updated' });
});

// Goods Receipts
router.get('/goods-receipts', (req, res) => {
  const db = getDb();
  const { po_id, store_id, status } = req.query;
  let sql = `SELECT gr.*, s.name as supplier_name, st.name as store_name, u.full_name as received_by_name FROM goods_receipts gr JOIN suppliers s ON gr.supplier_id = s.id JOIN stores st ON gr.store_id = st.id LEFT JOIN users u ON gr.received_by = u.id WHERE 1=1`;
  const params = [];
  if (po_id) { sql += ` AND gr.po_id = ?`; params.push(po_id); }
  if (store_id) { sql += ` AND gr.store_id = ?`; params.push(store_id); }
  if (status) { sql += ` AND gr.status = ?`; params.push(status); }
  sql += ` ORDER BY gr.receipt_date DESC LIMIT 200`;
  res.json(db.prepare(sql).all(...params));
  db.close();
});

router.post('/goods-receipts', (req, res) => {
  const { po_id, store_id, supplier_id, items } = req.body;
  if (!store_id || !supplier_id || !items || !items.length) return res.status(400).json({ error: 'Store, supplier and items required' });
  const db = getDb();
  const grnId = uuidv4();
  const grnNumber = `GRN-${Date.now().toString(36).toUpperCase()}`;
  db.prepare(`INSERT INTO goods_receipts (id, grn_number, po_id, store_id, supplier_id, receipt_date, received_by, inspected_by, status)
    VALUES (?,?,?,?,?,datetime('now'),?,?,'completed')`).run(grnId, grnNumber, po_id||null, store_id, supplier_id, req.user.userId, req.user.userId);

  const insertGRN = db.prepare(`INSERT INTO goods_receipt_items (id, grn_id, po_item_id, produce_id, ordered_qty, received_qty, rejected_qty, reject_reason, accepted_qty, grade, unit_cost, batch_code) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`);
  items.forEach(item => {
    const accepted = item.received_qty - (item.rejected_qty||0);
    const batchCode = `${item.produce_id.substring(0,4).toUpperCase()}-${new Date().toISOString().slice(5,10)}-${item.grade||'A'}`;
    insertGRN.run(uuidv4(), grnId, item.po_item_id||null, item.produce_id, item.ordered_qty||null, item.received_qty, item.rejected_qty||0, item.reject_reason||null, accepted, item.grade||'A', item.unit_cost, batchCode);

    // Create stock batch
    const batchId = uuidv4();
    const expiryDate = new Date();
    expiryDate.setDate(expiryDate.getDate() + (item.shelf_life_days || 7));
    db.prepare(`INSERT INTO stock_batches (id, batch_code, produce_id, store_id, supplier_id, grn_id, received_date, expiry_date, received_qty, available_qty, cost_price, selling_price, grade, status)
      VALUES (?,?,?,?,?,?,datetime('now'),?,?,?,?,?,?,?)`).run(batchId, batchCode, item.produce_id, store_id, supplier_id, grnId, expiryDate.toISOString(), accepted, accepted, item.unit_cost, item.selling_price||null, item.grade||'A', 'available');

    // Record movement
    db.prepare(`INSERT INTO stock_movements (id, batch_id, produce_id, store_id, movement_type, quantity, total_value, ref_id, ref_type, created_by)
      VALUES (?,?,?,?,?,?,?,?,?,?)`).run(uuidv4(), batchId, item.produce_id, store_id, 'received', accepted, accepted * item.unit_cost, grnId, 'grn', req.user.userId);

    // Update PO item received qty
    if (item.po_item_id) {
      db.prepare(`UPDATE purchase_order_items SET received_qty = received_qty + ?, rejected_qty = rejected_qty + ? WHERE id = ?`).run(item.received_qty, item.rejected_qty||0, item.po_item_id);
    }
  });

  // Update PO status
  if (po_id) {
    const poItems = db.prepare(`SELECT SUM(ordered_qty) as total, SUM(received_qty) as received FROM purchase_order_items WHERE po_id = ?`).get(po_id);
    if (poItems) {
      if (poItems.received >= poItems.total) {
        db.prepare(`UPDATE purchase_orders SET status='received', updated_at=datetime('now') WHERE id=?`).run(po_id);
      } else {
        db.prepare(`UPDATE purchase_orders SET status='partially_received', updated_at=datetime('now') WHERE id=?`).run(po_id);
      }
    }
  }

  auditLog(req, 'create', 'procurement', 'goods_receipt', grnId, null, { supplier_id, items: items.length });
  db.close();
  res.json({ id: grnId, grn_number: grnNumber, message: 'Goods receipt recorded' });
});

// Supplier Payments
router.get('/supplier-payments', (req, res) => {
  const db = getDb();
  const payments = db.prepare(`SELECT sp.*, s.name as supplier_name FROM supplier_payments sp JOIN suppliers s ON sp.supplier_id = s.id ORDER BY sp.payment_date DESC LIMIT 100`).all();
  db.close();
  res.json(payments);
});

router.post('/supplier-payments', (req, res) => {
  const { supplier_id, amount, payment_date, payment_mode, period_from, period_to, notes } = req.body;
  if (!supplier_id || !amount) return res.status(400).json({ error: 'Supplier and amount required' });
  const db = getDb();
  const id = uuidv4();
  db.prepare(`INSERT INTO supplier_payments (id, supplier_id, amount, payment_date, payment_mode, period_from, period_to, notes) VALUES (?,?,?,?,?,?,?,?)`).run(id, supplier_id, amount, payment_date||new Date().toISOString().slice(0,10), payment_mode||'cash', period_from, period_to, notes);
  auditLog(req, 'create', 'procurement', 'supplier_payment', id, null, { supplier_id, amount });
  db.close();
  res.json({ id, message: 'Payment recorded' });
});

// Waste Records
router.get('/waste', (req, res) => {
  const db = getDb();
  const { store_id, from, to } = req.query;
  let sql = `SELECT wr.*, s.name as store_name, u.full_name as recorded_by_name FROM waste_records wr JOIN stores s ON wr.store_id = s.id LEFT JOIN users u ON wr.recorded_by = u.id WHERE 1=1`;
  const params = [];
  if (store_id) { sql += ` AND wr.store_id = ?`; params.push(store_id); }
  if (from) { sql += ` AND wr.recorded_date >= ?`; params.push(from); }
  if (to) { sql += ` AND wr.recorded_date <= ?`; params.push(to); }
  sql += ` ORDER BY wr.recorded_date DESC LIMIT 100`;
  const records = db.prepare(sql).all(...params);
  // Get items for each
  const enriched = records.map(r => {
    const items = db.prepare(`SELECT wri.*, p.name as produce_name FROM waste_record_items wri JOIN produce p ON wri.produce_id = p.id WHERE wri.waste_id = ?`).all(r.id);
    return { ...r, items };
  });
  db.close();
  res.json(enriched);
});

router.post('/waste', (req, res) => {
  const { store_id, items, disposal_method, notes } = req.body;
  if (!store_id || !items || !items.length) return res.status(400).json({ error: 'Store and items required' });
  const db = getDb();
  const wasteId = uuidv4();
  const wasteNumber = `WS-${Date.now().toString(36).toUpperCase()}`;
  let totalValue = 0;
  items.forEach(i => { totalValue += i.quantity * (i.unit_cost||0); });

  db.prepare(`INSERT INTO waste_records (id, waste_number, store_id, recorded_date, recorded_by, total_value, disposal_method, notes)
    VALUES (?,?,?,datetime('now'),?,?,?,?)`).run(wasteId, wasteNumber, store_id, req.user.userId, totalValue, disposal_method||'landfill', notes);

  const insert = db.prepare(`INSERT INTO waste_record_items (id, waste_id, batch_id, produce_id, quantity, unit_cost, total_value, spoilage_reason, is_customer_return, original_transaction_id)
    VALUES (?,?,?,?,?,?,?,?,?,?)`);
  items.forEach(item => {
    insert.run(uuidv4(), wasteId, item.batch_id, item.produce_id, item.quantity, item.unit_cost||0, item.quantity * (item.unit_cost||0), item.spoilage_reason||'expired', item.is_customer_return||0, item.original_transaction_id||null);
    // Update batch
    if (item.batch_id) {
      db.prepare(`UPDATE stock_batches SET available_qty = available_qty - ?, status = CASE WHEN available_qty - ? <= 0 THEN 'wasted' ELSE status END WHERE id = ?`).run(item.quantity, item.quantity, item.batch_id);
      db.prepare(`INSERT INTO stock_movements (id, batch_id, produce_id, store_id, movement_type, quantity, total_value, ref_id, ref_type, created_by)
        VALUES (?,?,?,?,?,?,?,?,?,?)`).run(uuidv4(), item.batch_id, item.produce_id, store_id, 'wasted', item.quantity, item.quantity * (item.unit_cost||0), wasteId, 'waste', req.user.userId);
    }
  });

  auditLog(req, 'create', 'procurement', 'waste_record', wasteId, null, { total_value: totalValue, items: items.length });
  db.close();
  res.json({ id: wasteId, message: 'Waste recorded' });
});

module.exports = router;

// Create supplier_payments table if not exists
const db = getDb();
db.exec(`CREATE TABLE IF NOT EXISTS supplier_payments (
  id TEXT PRIMARY KEY, supplier_id TEXT REFERENCES suppliers(id), amount REAL, payment_date TEXT,
  payment_mode TEXT, period_from TEXT, period_to TEXT, notes TEXT, created_at TEXT DEFAULT (datetime('now'))
)`);
db.close();
