const express = require('express');
const router = express.Router();
const { getDb } = require('../middleware/auth');

// Sales Report
router.get('/sales', (req, res) => {
  const db = getDb();
  const { store_id, from, to, group_by } = req.query;
  const group = group_by || 'day'; // day, week, month, produce
  let sql;
  const params = [];
  if (group === 'produce') {
    sql = `SELECT p.id, p.name, p.code, pc.name as category, SUM(rti.quantity) as total_qty, SUM(rti.total_price) as total_revenue, COUNT(DISTINCT rti.transaction_id) as transaction_count
      FROM retail_transaction_items rti JOIN produce p ON rti.produce_id = p.id JOIN produce_categories pc ON p.category_id = pc.id
      JOIN retail_transactions rt ON rti.transaction_id = rt.id WHERE rt.status='completed'`;
    if (store_id) { sql += ` AND rt.store_id = ?`; params.push(store_id); }
    if (from) { sql += ` AND rt.transaction_date >= ?`; params.push(from); }
    if (to) { sql += ` AND rt.transaction_date <= ?`; params.push(to); }
    sql += ` GROUP BY p.id ORDER BY total_revenue DESC`;
  } else {
    const dateFn = group === 'month' ? "strftime('%Y-%m', rt.transaction_date)" : group === 'week' ? "strftime('%Y-%W', rt.transaction_date)" : "date(rt.transaction_date)";
    sql = `SELECT ${dateFn} as period, COUNT(*) as transactions, SUM(net_amount) as revenue, SUM(CASE WHEN payment_method='cash' THEN net_amount ELSE 0 END) as cash, SUM(CASE WHEN payment_method='upi' THEN net_amount ELSE 0 END) as upi, SUM(CASE WHEN payment_method='card' THEN net_amount ELSE 0 END) as card FROM retail_transactions rt WHERE status='completed'`;
    if (store_id) { sql += ` AND rt.store_id = ?`; params.push(store_id); }
    if (from) { sql += ` AND rt.transaction_date >= ?`; params.push(from); }
    if (to) { sql += ` AND rt.transaction_date <= ?`; params.push(to); }
    sql += ` GROUP BY period ORDER BY period DESC LIMIT 100`;
  }
  res.json(db.prepare(sql).all(...params));
  db.close();
});

// Purchase Report
router.get('/purchases', (req, res) => {
  const db = getDb();
  const { store_id, supplier_id, from, to, group_by } = req.query;
  const group = group_by || 'day';
  const dateFn = group === 'month' ? "strftime('%Y-%m', po.order_date)" : group === 'week' ? "strftime('%Y-%W', po.order_date)" : "date(po.order_date)";
  let sql = `SELECT ${dateFn} as period, COUNT(*) as orders, SUM(total_cost) as total_cost FROM purchase_orders po WHERE 1=1`;
  const params = [];
  if (store_id) { sql += ` AND po.store_id = ?`; params.push(store_id); }
  if (supplier_id) { sql += ` AND po.supplier_id = ?`; params.push(supplier_id); }
  if (from) { sql += ` AND po.order_date >= ?`; params.push(from); }
  if (to) { sql += ` AND po.order_date <= ?`; params.push(to); }
  sql += ` GROUP BY period ORDER BY period DESC LIMIT 100`;
  res.json(db.prepare(sql).all(...params));
  db.close();
});

// Waste Report
router.get('/waste', (req, res) => {
  const db = getDb();
  const { store_id, from, to, group_by } = req.query;
  const group = group_by || 'reason';
  let sql;
  const params = [];
  if (group === 'reason') {
    sql = `SELECT wri.spoilage_reason, COUNT(*) as incidents, SUM(wri.quantity) as total_qty, SUM(wri.total_value) as total_value FROM waste_record_items wri JOIN waste_records wr ON wri.waste_id = wr.id WHERE 1=1`;
    if (store_id) { sql += ` AND wr.store_id = ?`; params.push(store_id); }
    if (from) { sql += ` AND wr.recorded_date >= ?`; params.push(from); }
    if (to) { sql += ` AND wr.recorded_date <= ?`; params.push(to); }
    sql += ` GROUP BY wri.spoilage_reason ORDER BY total_value DESC`;
  } else {
    const dateFn = group === 'month' ? "strftime('%Y-%m', wr.recorded_date)" : "date(wr.recorded_date)";
    sql = `SELECT ${dateFn} as period, SUM(wr.total_value) as waste_value, COUNT(*) as records FROM waste_records wr WHERE 1=1`;
    if (store_id) { sql += ` AND wr.store_id = ?`; params.push(store_id); }
    if (from) { sql += ` AND wr.recorded_date >= ?`; params.push(from); }
    if (to) { sql += ` AND wr.recorded_date <= ?`; params.push(to); }
    sql += ` GROUP BY period ORDER BY period DESC LIMIT 100`;
  }
  res.json(db.prepare(sql).all(...params));
  db.close();
});

// Inventory Report
router.get('/inventory', (req, res) => {
  const db = getDb();
  const { store_id, category_id } = req.query;
  let sql = `SELECT sb.store_id, s.name as store_name, sb.produce_id, p.name as produce_name, pc.name as category, SUM(sb.available_qty) as total_qty, AVG(sb.cost_price) as avg_cost, SUM(sb.available_qty * sb.cost_price) as stock_value, 
    COUNT(sb.id) as batches, SUM(CASE WHEN julianday(sb.expiry_date) - julianday('now') <= 2 AND julianday(sb.expiry_date) - julianday('now') >= 0 THEN sb.available_qty ELSE 0 END) as expiring_qty
    FROM stock_batches sb JOIN produce p ON sb.produce_id = p.id JOIN produce_categories pc ON p.category_id = pc.id JOIN stores s ON sb.store_id = s.id
    WHERE sb.status = 'available' AND sb.available_qty > 0`;
  const params = [];
  if (store_id) { sql += ` AND sb.store_id = ?`; params.push(store_id); }
  if (category_id) { sql += ` AND p.category_id = ?`; params.push(category_id); }
  sql += ` GROUP BY sb.produce_id, sb.store_id ORDER BY stock_value DESC LIMIT 200`;
  res.json(db.prepare(sql).all(...params));
  db.close();
});

// P&L Report
router.get('/pl', (req, res) => {
  const db = getDb();
  const { store_id, from, to, group_by } = req.query;
  const group = group_by || 'month';
  const dateFn = group === 'month' ? "strftime('%Y-%m', flash_date)" : "date(flash_date)";
  let sql = `SELECT ${dateFn} as period, SUM(total_sales) as revenue, SUM(total_purchases) as cogs, SUM(total_expenses) as expenses, SUM(total_waste_value) as waste, SUM(gross_margin) as gross_profit, SUM(net_margin) as net_profit, 
    CASE WHEN SUM(total_sales) > 0 THEN ROUND(SUM(gross_margin) * 100.0 / SUM(total_sales), 1) ELSE 0 END as margin_pct
    FROM daily_flash WHERE 1=1`;
  const params = [];
  if (store_id) { sql += ` AND store_id = ?`; params.push(store_id); }
  if (from) { sql += ` AND flash_date >= ?`; params.push(from); }
  if (to) { sql += ` AND flash_date <= ?`; params.push(to); }
  sql += ` GROUP BY period ORDER BY period DESC LIMIT 24`;
  res.json(db.prepare(sql).all(...params));
  db.close();
});

// Hotel Sales Report
router.get('/hotel-sales', (req, res) => {
  const db = getDb();
  const { customer_id, from, to } = req.query;
  let sql = `SELECT c.id as customer_id, c.name as customer_name, COUNT(DISTINCT so.id) as orders, SUM(so.net_amount) as total_amount, AVG(so.net_amount) as avg_order_value,
    SUM(CASE WHEN so.status = 'delivered' THEN 1 ELSE 0 END) as completed, SUM(CASE WHEN so.status IN ('dispatched','confirmed') THEN 1 ELSE 0 END) as pending
    FROM sales_orders so JOIN customers c ON so.customer_id = c.id WHERE 1=1`;
  const params = [];
  if (customer_id) { sql += ` AND so.customer_id = ?`; params.push(customer_id); }
  if (from) { sql += ` AND so.order_date >= ?`; params.push(from); }
  if (to) { sql += ` AND so.order_date <= ?`; params.push(to); }
  sql += ` GROUP BY c.id ORDER BY total_amount DESC`;
  res.json(db.prepare(sql).all(...params));
  db.close();
});

module.exports = router;
