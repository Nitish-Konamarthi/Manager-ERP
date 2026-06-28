const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const { getDb } = require('../middleware/auth');
const { auditLog } = require('../middleware/audit');

// Invoices
router.get('/invoices', (req, res) => {
  const db = getDb();
  const { customer_id, status, from, to } = req.query;
  let sql = `SELECT i.*, c.name as customer_name FROM invoices i JOIN customers c ON i.customer_id = c.id WHERE 1=1`;
  const params = [];
  if (customer_id) { sql += ` AND i.customer_id = ?`; params.push(customer_id); }
  if (status) { sql += ` AND i.status = ?`; params.push(status); }
  if (from) { sql += ` AND i.invoice_date >= ?`; params.push(from); }
  if (to) { sql += ` AND i.invoice_date <= ?`; params.push(to); }
  sql += ` ORDER BY i.invoice_date DESC LIMIT 200`;
  res.json(db.prepare(sql).all(...params));
  db.close();
});

router.get('/invoices/:id', (req, res) => {
  const db = getDb();
  const inv = db.prepare(`SELECT i.*, c.name as customer_name, c.gstin as customer_gstin, c.address as customer_address, c.phone as customer_phone FROM invoices i JOIN customers c ON i.customer_id = c.id WHERE i.id = ?`).get(req.params.id);
  if (!inv) { db.close(); return res.status(404).json({ error: 'Invoice not found' }); }
  const items = db.prepare(`SELECT ii.*, p.name as produce_name, p.hsn_code FROM invoice_items ii JOIN produce p ON ii.produce_id = p.id WHERE ii.invoice_id = ?`).all(req.params.id);
  const payments = db.prepare(`SELECT p.* FROM payments_received p JOIN payment_allocations pa ON p.id = pa.payment_id WHERE pa.invoice_id = ?`).all(req.params.id);
  const dns = db.prepare(`SELECT * FROM debit_notes WHERE invoice_id = ?`).all(req.params.id);
  const cns = db.prepare(`SELECT * FROM credit_notes WHERE invoice_id = ?`).all(req.params.id);
  db.close();
  res.json({ ...inv, items, payments, debit_notes: dns, credit_notes: cns });
});

router.post('/invoices/generate', (req, res) => {
  const { customer_id, order_id, from_date, to_date } = req.body;
  if (!customer_id) return res.status(400).json({ error: 'Customer required' });
  const db = getDb();
  
  // Get undelivered delivery notes for this customer
  let dns;
  if (order_id) {
    dns = db.prepare(`SELECT * FROM delivery_notes WHERE order_id = ? AND status IN ('delivered','partially_delivered')`).all(order_id);
  } else {
    dns = db.prepare(`SELECT * FROM delivery_notes WHERE customer_id = ? AND status IN ('delivered','partially_delivered') AND id NOT IN (SELECT reference_id FROM invoices WHERE reference_type = 'delivery')`).all(customer_id);
  }
  
  if (!dns.length) { db.close(); return res.status(400).json({ error: 'No undelivered delivery notes found' }); }

  // Get items from delivery notes
  const dnIds = dns.map(d => d.id);
  const placeholders = dnIds.map(() => '?').join(',');
  const items = db.prepare(`SELECT dni.*, p.name as produce_name, p.hsn_code FROM delivery_note_items dni JOIN produce p ON dni.produce_id = p.id WHERE dni.dn_id IN (${placeholders}) AND dni.delivered_qty > 0`).all(...dnIds);

  if (!items.length) { db.close(); return res.status(400).json({ error: 'No delivered items found' }); }

  // Group by produce
  const grouped = {};
  items.forEach(item => {
    const key = item.produce_id;
    if (!grouped[key]) grouped[key] = { produce_id: item.produce_id, produce_name: item.produce_name, hsn_code: item.hsn_code, quantity: 0, unit_price: item.unit_price, total: 0 };
    grouped[key].quantity += item.delivered_qty;
    grouped[key].total += item.delivered_qty * item.unit_price;
  });

  const invoiceId = uuidv4();
  const invoiceNumber = `INV-${Date.now().toString(36).toUpperCase()}`;
  const subtotal = Object.values(grouped).reduce((s, g) => s + g.total, 0);
  const customer = db.prepare(`SELECT * FROM customers WHERE id = ?`).get(customer_id);
  const gstRate = 5; // Default 5% for vegetables
  const gstAmount = subtotal * gstRate / 100;
  const netAmount = subtotal + gstAmount;
  const dueDate = new Date();
  dueDate.setDate(dueDate.getDate() + (customer?.credit_days || 15));

  db.prepare(`INSERT INTO invoices (id, invoice_number, customer_id, order_id, invoice_type, invoice_date, due_date, subtotal, taxable_amount, gst_rate, gst_amount, net_amount, balance_due, status)
    VALUES (?,?,?,?,?,datetime('now'),?,?,?,?,?,?,?,'unpaid')`).run(invoiceId, invoiceNumber, customer_id, order_id||null, 'b2b', dueDate.toISOString().slice(0,10), subtotal, subtotal, gstRate, gstAmount, netAmount, netAmount);

  const insertItem = db.prepare(`INSERT INTO invoice_items (id, invoice_id, produce_id, quantity, unit_price, total_price, hsn_code) VALUES (?,?,?,?,?,?,?)`);
  Object.values(grouped).forEach(g => insertItem.run(uuidv4(), invoiceId, g.produce_id, g.quantity, g.unit_price, g.total, g.hsn_code));

  // Link delivery notes to invoice
  dns.forEach(dn => {
    db.prepare(`UPDATE delivery_notes SET status = 'invoiced' WHERE id = ?`).run(dn.id);
  });

  // Update order status
  if (order_id) {
    db.prepare(`UPDATE sales_orders SET payment_status='invoiced', updated_at=datetime('now') WHERE id=?`).run(order_id);
  }

  auditLog(req, 'create', 'finance', 'invoice', invoiceId, null, { customer_id, net_amount, deliveries: dns.length });
  db.close();
  res.json({ id: invoiceId, invoice_number: invoiceNumber, net_amount, message: 'Invoice generated' });
});

// Payments Received
router.get('/payments', (req, res) => {
  const db = getDb();
  const { customer_id, status, from, to } = req.query;
  let sql = `SELECT pr.*, c.name as customer_name FROM payments_received pr JOIN customers c ON pr.customer_id = c.id WHERE 1=1`;
  const params = [];
  if (customer_id) { sql += ` AND pr.customer_id = ?`; params.push(customer_id); }
  if (status) { sql += ` AND pr.status = ?`; params.push(status); }
  if (from) { sql += ` AND pr.payment_date >= ?`; params.push(from); }
  if (to) { sql += ` AND pr.payment_date <= ?`; params.push(to); }
  sql += ` ORDER BY pr.payment_date DESC LIMIT 200`;
  res.json(db.prepare(sql).all(...params));
  db.close();
});

router.post('/payments', (req, res) => {
  const { customer_id, invoice_id, amount, payment_date, payment_method, reference_no, bank_name, cheque_number, cheque_date, notes } = req.body;
  if (!customer_id || !amount) return res.status(400).json({ error: 'Customer and amount required' });
  const db = getDb();
  const id = uuidv4();
  const paymentNumber = `PAY-${Date.now().toString(36).toUpperCase()}`;
  db.prepare(`INSERT INTO payments_received (id, payment_number, customer_id, invoice_id, payment_date, amount, payment_method, reference_no, bank_name, cheque_number, cheque_date, notes, received_by)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(id, paymentNumber, customer_id, invoice_id||null, payment_date||new Date().toISOString().slice(0,10), amount, payment_method||'bank_transfer', reference_no, bank_name, cheque_number, cheque_date, notes, req.user.userId);

  // Allocate to invoice
  if (invoice_id) {
    db.prepare(`INSERT INTO payment_allocations (id, payment_id, invoice_id, amount) VALUES (?,?,?,?)`).run(uuidv4(), id, invoice_id, amount);
    const inv = db.prepare(`SELECT * FROM invoices WHERE id = ?`).get(invoice_id);
    if (inv) {
      const newPaid = inv.amount_paid + amount;
      const newBalance = inv.net_amount - newPaid;
      const newStatus = newBalance <= 0 ? 'paid' : 'partially_paid';
      db.prepare(`UPDATE invoices SET amount_paid=?, balance_due=?, status=? WHERE id=?`).run(newPaid, newBalance, newStatus, invoice_id);
    }
    // Update customer outstanding
    const totalOutstanding = db.prepare(`SELECT COALESCE(SUM(balance_due), 0) as total FROM invoices WHERE customer_id = ? AND status IN ('unpaid','partially_paid')`).get(customer_id);
    db.prepare(`UPDATE customers SET current_outstanding = ? WHERE id = ?`).run(totalOutstanding.total, customer_id);
  }

  auditLog(req, 'create', 'finance', 'payment', id, null, { customer_id, amount, method: payment_method });
  db.close();
  res.json({ id, message: 'Payment recorded' });
});

router.put('/payments/:id/status', (req, res) => {
  const { status } = req.body;
  const db = getDb();
  db.prepare(`UPDATE payments_received SET status=? WHERE id=?`).run(status, req.params.id);
  db.close();
  res.json({ message: 'Payment status updated' });
});

// Debit Notes
router.post('/debit-notes', (req, res) => {
  const { invoice_id, customer_id, amount, reason } = req.body;
  if (!invoice_id || !customer_id || !amount || !reason) return res.status(400).json({ error: 'Missing required fields' });
  const db = getDb();
  const id = uuidv4();
  const dnNumber = `DN-${Date.now().toString(36).toUpperCase()}`;
  db.prepare(`INSERT INTO debit_notes (id, dn_number, invoice_id, customer_id, amount, reason) VALUES (?,?,?,?,?,?)`).run(id, dnNumber, invoice_id, customer_id, amount, reason);
  // Adjust invoice
  const inv = db.prepare(`SELECT * FROM invoices WHERE id = ?`).get(invoice_id);
  if (inv) {
    const newNet = inv.net_amount - amount;
    const newBalance = inv.balance_due - amount;
    db.prepare(`UPDATE invoices SET net_amount=?, balance_due=?, gst_amount=? WHERE id=?`).run(newNet, newBalance, inv.gst_amount - (amount * inv.gst_rate / (100 + inv.gst_rate || 1)), invoice_id);
  }
  db.close();
  res.json({ id, message: 'Debit note issued' });
});

// Credit Notes
router.post('/credit-notes', (req, res) => {
  const { invoice_id, customer_id, amount, reason } = req.body;
  if (!invoice_id || !customer_id || !amount || !reason) return res.status(400).json({ error: 'Missing required fields' });
  const db = getDb();
  const id = uuidv4();
  const cnNumber = `CN-${Date.now().toString(36).toUpperCase()}`;
  db.prepare(`INSERT INTO credit_notes (id, cn_number, invoice_id, customer_id, amount, reason) VALUES (?,?,?,?,?,?)`).run(id, cnNumber, invoice_id, customer_id, amount, reason);
  const inv = db.prepare(`SELECT * FROM invoices WHERE id = ?`).get(invoice_id);
  if (inv) {
    const newNet = inv.net_amount + amount;
    const newBalance = inv.balance_due + amount;
    db.prepare(`UPDATE invoices SET net_amount=?, balance_due=? WHERE id=?`).run(newNet, newBalance, invoice_id);
  }
  db.close();
  res.json({ id, message: 'Credit note issued' });
});

// Daily Flash
router.get('/daily-flash', (req, res) => {
  const db = getDb();
  const { store_id, from, to } = req.query;
  let sql = `SELECT * FROM v_daily_performance WHERE 1=1`;
  const params = [];
  if (store_id) { sql += ` AND store_id = ?`; params.push(store_id); }
  if (from) { sql += ` AND flash_date >= ?`; params.push(from); }
  if (to) { sql += ` AND flash_date <= ?`; params.push(to); }
  sql += ` ORDER BY flash_date DESC LIMIT 100`;
  res.json(db.prepare(sql).all(...params));
  db.close();
});

router.post('/daily-flash/compute', (req, res) => {
  const { store_id, flash_date } = req.body;
  if (!store_id || !flash_date) return res.status(400).json({ error: 'Store and date required' });
  const db = getDb();
  
  // Compute from transactions
  const sales = db.prepare(`SELECT COALESCE(SUM(net_amount),0) as total FROM retail_transactions WHERE store_id=? AND date(transaction_date)=? AND status='completed'`).get(store_id, flash_date);
  const hotelSales = db.prepare(`SELECT COALESCE(SUM(net_amount),0) as total FROM sales_orders WHERE store_id=? AND date(order_date)=? AND status IN ('delivered','dispatched')`).get(store_id, flash_date);
  const purchases = db.prepare(`SELECT COALESCE(SUM(total_cost),0) as total FROM purchase_orders WHERE store_id=? AND date(order_date)=? AND status IN ('received','partially_received')`).get(store_id, flash_date);
  const expenses = db.prepare(`SELECT COALESCE(SUM(amount),0) as total FROM expenses WHERE store_id=? AND date(expense_date)=?`).get(store_id, flash_date);
  const waste = db.prepare(`SELECT COALESCE(SUM(total_value),0) as total FROM waste_records WHERE store_id=? AND date(recorded_date)=?`).get(store_id, flash_date);
  const cash = db.prepare(`SELECT COALESCE(SUM(net_amount),0) as total FROM retail_transactions WHERE store_id=? AND date(transaction_date)=? AND payment_method='cash'`).get(store_id, flash_date);
  const upi = db.prepare(`SELECT COALESCE(SUM(net_amount),0) as total FROM retail_transactions WHERE store_id=? AND date(transaction_date)=? AND payment_method='upi'`).get(store_id, flash_date);
  const card = db.prepare(`SELECT COALESCE(SUM(net_amount),0) as total FROM retail_transactions WHERE store_id=? AND date(transaction_date)=? AND payment_method='card'`).get(store_id, flash_date);

  const totalSales = sales.total + hotelSales.total;
  const wastePct = purchases.total > 0 ? (waste.total / purchases.total) * 100 : 0;
  const grossMargin = totalSales - purchases.total;
  const grossMarginPct = totalSales > 0 ? (grossMargin / totalSales) * 100 : 0;
  const netMargin = grossMargin - expenses.total - waste.total;
  const netMarginPct = totalSales > 0 ? (netMargin / totalSales) * 100 : 0;

  const existing = db.prepare(`SELECT id FROM daily_flash WHERE store_id=? AND flash_date=?`).get(store_id, flash_date);
  if (existing) {
    db.prepare(`UPDATE daily_flash SET total_sales=?, total_purchases=?, total_expenses=?, total_waste_value=?, waste_pct=?, gross_margin=?, gross_margin_pct=?, net_margin=?, net_margin_pct=?, cash_collected=?, upi_collected=?, card_collected=?, hotel_revenue=?, retail_revenue=?, computed_at=datetime('now') WHERE id=?`).run(totalSales, purchases.total, expenses.total, waste.total, wastePct, grossMargin, grossMarginPct, netMargin, netMarginPct, cash.total, upi.total, card.total, hotelSales.total, sales.total, existing.id);
  } else {
    const id = uuidv4();
    db.prepare(`INSERT INTO daily_flash (id, store_id, flash_date, total_sales, total_purchases, total_expenses, total_waste_value, waste_pct, gross_margin, gross_margin_pct, net_margin, net_margin_pct, cash_collected, upi_collected, card_collected, hotel_revenue, retail_revenue) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(id, store_id, flash_date, totalSales, purchases.total, expenses.total, waste.total, wastePct, grossMargin, grossMarginPct, netMargin, netMarginPct, cash.total, upi.total, card.total, hotelSales.total, sales.total);
  }

  db.close();
  res.json({ message: 'Daily flash computed', data: { totalSales, grossMargin, netMargin, wastePct } });
});

// Receivables Aging
router.get('/aging', (req, res) => {
  const db = getDb();
  const aging = db.prepare(`
    SELECT c.id, c.name, c.credit_limit, c.current_outstanding,
      COALESCE(SUM(CASE WHEN i.status IN ('unpaid','partially_paid') AND julianday('now') - julianday(i.invoice_date) <= 15 THEN i.balance_due ELSE 0 END), 0) as bucket_0_15,
      COALESCE(SUM(CASE WHEN i.status IN ('unpaid','partially_paid') AND julianday('now') - julianday(i.invoice_date) BETWEEN 16 AND 30 THEN i.balance_due ELSE 0 END), 0) as bucket_16_30,
      COALESCE(SUM(CASE WHEN i.status IN ('unpaid','partially_paid') AND julianday('now') - julianday(i.invoice_date) BETWEEN 31 AND 45 THEN i.balance_due ELSE 0 END), 0) as bucket_31_45,
      COALESCE(SUM(CASE WHEN i.status IN ('unpaid','partially_paid') AND julianday('now') - julianday(i.invoice_date) > 45 THEN i.balance_due ELSE 0 END), 0) as bucket_45_plus
    FROM customers c LEFT JOIN invoices i ON c.id = i.customer_id
    WHERE c.customer_type IN ('hotel','corporate')
    GROUP BY c.id
  `).all();
  db.close();
  res.json(aging);
});

// P&L Summary
router.get('/pl', (req, res) => {
  const db = getDb();
  const { store_id, from, to } = req.query;
  let sql = `SELECT COALESCE(SUM(total_sales),0) as revenue, COALESCE(SUM(total_purchases),0) as cogs, COALESCE(SUM(total_expenses),0) as expenses, COALESCE(SUM(total_waste_value),0) as waste, COALESCE(SUM(gross_margin),0) as gross_profit, COALESCE(SUM(net_margin),0) as net_profit FROM daily_flash WHERE 1=1`;
  const params = [];
  if (store_id) { sql += ` AND store_id = ?`; params.push(store_id); }
  if (from) { sql += ` AND flash_date >= ?`; params.push(from); }
  if (to) { sql += ` AND flash_date <= ?`; params.push(to); }
  res.json(db.prepare(sql).all(...params)[0]);
  db.close();
});

module.exports = router;
