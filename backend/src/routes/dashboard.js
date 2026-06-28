const express = require('express');
const router = express.Router();
const { getDb } = require('../middleware/auth');

router.get('/', (req, res) => {
  const db = getDb();

  // Today's sales
  const todaySales = db.prepare(`SELECT COALESCE(SUM(net_amount),0) as total, COUNT(*) as transactions FROM retail_transactions WHERE date(transaction_date)=date('now') AND status='completed'`).get();
  const todayHotelSales = db.prepare(`SELECT COALESCE(SUM(net_amount),0) as total, COUNT(*) as orders FROM sales_orders WHERE date(order_date)=date('now') AND status NOT IN ('cancelled','draft')`).get();
  
  // Today's purchases
  const todayPurchases = db.prepare(`SELECT COALESCE(SUM(total_cost),0) as total, COUNT(*) as orders FROM purchase_orders WHERE date(order_date)=date('now') AND status NOT IN ('cancelled','draft')`).get();
  
  // Today's waste
  const todayWaste = db.prepare(`SELECT COALESCE(SUM(total_value),0) as total, COUNT(*) as records FROM waste_records WHERE date(recorded_date)=date('now')`).get();
  
  // Expiring stock
  const expiringStock = db.prepare(`SELECT COUNT(*) as count, COALESCE(SUM(available_qty),0) as qty, COALESCE(SUM(available_qty * cost_price),0) as value FROM stock_batches WHERE available_qty > 0 AND expiry_date IS NOT NULL AND julianday(expiry_date) - julianday('now') <= 2 AND julianday(expiry_date) - julianday('now') >= 0`).get();
  
  // Low stock items
  const lowStock = db.prepare(`SELECT COUNT(*) as count FROM (SELECT SUM(available_qty) as total FROM stock_batches WHERE status='available' GROUP BY produce_id, store_id HAVING total < 10)`).get();
  
  // Overdue invoices
  const overdueInvoices = db.prepare(`SELECT COUNT(*) as count, COALESCE(SUM(balance_due),0) as amount FROM invoices WHERE status IN ('unpaid','partially_paid') AND julianday('now') > julianday(due_date)`).get();
  
  // Total outstanding
  const totalOutstanding = db.prepare(`SELECT COALESCE(SUM(current_outstanding),0) as total FROM customers WHERE customer_type IN ('hotel','corporate')`).get();
  
  // Stock value
  const stockValue = db.prepare(`SELECT COALESCE(SUM(available_qty * cost_price),0) as value FROM stock_batches WHERE status='available'`).get();
  
  // Today's flash
  const todayFlash = db.prepare(`SELECT * FROM daily_flash WHERE flash_date=date('now') ORDER BY store_id`).all();
  
  // Weekly trend (last 7 days)
  const weeklySales = db.prepare(`SELECT date(transaction_date) as date, SUM(net_amount) as revenue FROM retail_transactions WHERE transaction_date >= date('now', '-6 days') AND status='completed' GROUP BY date(transaction_date) ORDER BY date`).all();
  
  // Top selling products today
  const topProducts = db.prepare(`SELECT p.name, p.code, SUM(rti.quantity) as qty, SUM(rti.total_price) as revenue FROM retail_transaction_items rti JOIN produce p ON rti.produce_id = p.id JOIN retail_transactions rt ON rti.transaction_id = rt.id WHERE date(rt.transaction_date)=date('now') AND rt.status='completed' GROUP BY p.id ORDER BY revenue DESC LIMIT 5`).all();
  
  // Notifications
  const notifications = db.prepare(`SELECT * FROM notifications WHERE is_read = 0 AND (user_id = ? OR is_global = 1) ORDER BY created_at DESC LIMIT 10`).all(req.user.userId);
  
  // Store-wise today sales
  const storeSales = db.prepare(`SELECT s.name, COALESCE(SUM(rt.net_amount),0) as retail, COALESCE(SUM(so.net_amount),0) as hotel FROM stores s LEFT JOIN retail_transactions rt ON s.id = rt.store_id AND date(rt.transaction_date)=date('now') AND rt.status='completed' LEFT JOIN sales_orders so ON s.id = so.store_id AND date(so.order_date)=date('now') AND so.status NOT IN ('cancelled','draft') GROUP BY s.id`).all();

  db.close();

  res.json({
    today: {
      retail_sales: todaySales.total,
      retail_transactions: todaySales.transactions,
      hotel_sales: todayHotelSales.total,
      hotel_orders: todayHotelSales.orders,
      total_revenue: todaySales.total + todayHotelSales.total,
      purchases: todayPurchases.total,
      purchase_orders: todayPurchases.orders,
      waste: todayWaste.total,
      waste_records: todayWaste.records
    },
    alerts: {
      expiring_stock: expiringStock,
      low_stock: lowStock.count,
      overdue_invoices: overdueInvoices.count,
      overdue_amount: overdueInvoices.amount
    },
    financial: {
      total_outstanding: totalOutstanding.total,
      stock_value: stockValue.value,
      cash_in_hand: null  // requires cash count input
    },
    daily_flash: todayFlash,
    weekly_trend: weeklySales,
    top_products: topProducts,
    notifications,
    store_sales: storeSales,
    today_date: new Date().toISOString().slice(0,10),
    user: {
      name: req.user.fullName,
      role: req.user.role,
      store: req.user.storeId
    }
  });
});

module.exports = router;
