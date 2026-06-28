const express = require('express');
const router = express.Router();
const { getDb } = require('../middleware/auth');

// Top Selling Products
router.get('/top-products', (req, res) => {
  const db = getDb();
  const { store_id, from, to, limit } = req.query;
  let sql = `SELECT p.id, p.name, p.code, pc.name as category, SUM(rti.quantity) as total_qty, SUM(rti.total_price) as total_revenue, COUNT(DISTINCT rti.transaction_id) as sales_count
    FROM retail_transaction_items rti JOIN produce p ON rti.produce_id = p.id JOIN produce_categories pc ON p.category_id = pc.id
    JOIN retail_transactions rt ON rti.transaction_id = rt.id WHERE rt.status='completed'`;
  const params = [];
  if (store_id) { sql += ` AND rt.store_id = ?`; params.push(store_id); }
  if (from) { sql += ` AND rt.transaction_date >= ?`; params.push(from); }
  if (to) { sql += ` AND rt.transaction_date <= ?`; params.push(to); }
  sql += ` GROUP BY p.id ORDER BY total_revenue DESC LIMIT ?`;
  params.push(parseInt(limit) || 20);
  res.json(db.prepare(sql).all(...params));
  db.close();
});

// Peak Hours
router.get('/peak-hours', (req, res) => {
  const db = getDb();
  const { store_id, days } = req.query;
  const d = parseInt(days) || 7;
  let sql = `SELECT CAST(strftime('%H', transaction_date) AS INTEGER) as hour, COUNT(*) as transactions, SUM(net_amount) as revenue
    FROM retail_transactions WHERE status='completed' AND transaction_date >= date('now', '-' || ? || ' days')`;
  const params = [d];
  if (store_id) { sql += ` AND store_id = ?`; params.push(store_id); }
  sql += ` GROUP BY hour ORDER BY hour`;
  res.json(db.prepare(sql).all(...params));
  db.close();
});

// Payment Method Split
router.get('/payment-split', (req, res) => {
  const db = getDb();
  const { store_id, from, to } = req.query;
  let sql = `SELECT payment_method, COUNT(*) as count, SUM(net_amount) as total FROM retail_transactions WHERE status='completed'`;
  const params = [];
  if (store_id) { sql += ` AND store_id = ?`; params.push(store_id); }
  if (from) { sql += ` AND transaction_date >= ?`; params.push(from); }
  if (to) { sql += ` AND transaction_date <= ?`; params.push(to); }
  sql += ` GROUP BY payment_method`;
  res.json(db.prepare(sql).all(...params));
  db.close();
});

// Waste Trend
router.get('/waste-trend', (req, res) => {
  const db = getDb();
  const { store_id, days } = req.query;
  const d = parseInt(days) || 30;
  let sql = `SELECT date(recorded_date) as date, SUM(total_value) as waste_value, COUNT(*) as incidents
    FROM waste_records WHERE recorded_date >= date('now', '-' || ? || ' days')`;
  const params = [d];
  if (store_id) { sql += ` AND store_id = ?`; params.push(store_id); }
  sql += ` GROUP BY date(recorded_date) ORDER BY date`;
  res.json(db.prepare(sql).all(...params));
  db.close();
});

// Category Performance
router.get('/category-performance', (req, res) => {
  const db = getDb();
  const { store_id, from, to } = req.query;
  let sql = `SELECT pc.id, pc.name, COUNT(DISTINCT rti.id) as items_sold, SUM(rti.quantity) as total_qty, SUM(rti.total_price) as revenue,
    AVG(sb.cost_price) as avg_cost, (SUM(rti.total_price) - SUM(rti.quantity * sb.cost_price)) as estimated_margin
    FROM retail_transaction_items rti JOIN produce p ON rti.produce_id = p.id JOIN produce_categories pc ON p.category_id = pc.id
    LEFT JOIN stock_batches sb ON rti.batch_id = sb.id
    JOIN retail_transactions rt ON rti.transaction_id = rt.id WHERE rt.status='completed'`;
  const params = [];
  if (store_id) { sql += ` AND rt.store_id = ?`; params.push(store_id); }
  if (from) { sql += ` AND rt.transaction_date >= ?`; params.push(from); }
  if (to) { sql += ` AND rt.transaction_date <= ?`; params.push(to); }
  sql += ` GROUP BY pc.id ORDER BY revenue DESC`;
  res.json(db.prepare(sql).all(...params));
  db.close();
});

// Store Comparison
router.get('/store-comparison', (req, res) => {
  const db = getDb();
  const { from, to } = req.query;
  let sql = `SELECT s.id, s.name, COALESCE(SUM(df.total_sales),0) as revenue, COALESCE(SUM(df.total_purchases),0) as cogs, COALESCE(SUM(df.total_waste_value),0) as waste, COALESCE(SUM(df.gross_margin),0) as gross_profit, COALESCE(SUM(df.net_margin),0) as net_profit
    FROM stores s LEFT JOIN daily_flash df ON s.id = df.store_id WHERE 1=1`;
  const params = [];
  if (from) { sql += ` AND df.flash_date >= ?`; params.push(from); }
  if (to) { sql += ` AND df.flash_date <= ?`; params.push(to); }
  sql += ` GROUP BY s.id ORDER BY revenue DESC`;
  res.json(db.prepare(sql).all(...params));
  db.close();
});

// Revenue Forecast (simple moving average)
router.get('/forecast', (req, res) => {
  const db = getDb();
  const { store_id, days } = req.query;
  const d = parseInt(days) || 30;
  let sql = `SELECT date(transaction_date) as date, SUM(net_amount) as revenue FROM retail_transactions WHERE status='completed'`;
  const params = [];
  if (store_id) { sql += ` AND store_id = ?`; params.push(store_id); }
  sql += ` AND transaction_date >= date('now', '-' || ? || ' days') GROUP BY date(transaction_date) ORDER BY date`;
  params.push(d);
  const data = db.prepare(sql).all(...params);
  const values = data.map(d => d.revenue);
  const avg = values.length > 0 ? values.reduce((a, b) => a + b, 0) / values.length : 0;
  const last7 = values.slice(-7);
  const trend = last7.length >= 7 ? (last7[6] - last7[0]) / 6 : 0;
  db.close();
  res.json({ daily_revenue: data, avg_daily: Math.round(avg), trend, forecast_tomorrow: Math.round(avg + trend) });
});

module.exports = router;
