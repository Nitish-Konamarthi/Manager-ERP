const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const { getDb } = require('../middleware/auth');
const { auditLog } = require('../middleware/audit');

// =========================================================================
// ACCOUNTS (Chart of Accounts)
// =========================================================================

router.get('/accounts', (req, res) => {
  const db = getDb();
  const { type, store_id } = req.query;
  let sql = `SELECT * FROM accounts WHERE is_active=1`;
  const params = [];
  if (type) { sql += ` AND account_type = ?`; params.push(type); }
  if (store_id) { sql += ` AND (store_id = ? OR store_id IS NULL)`; params.push(store_id); }
  sql += ` ORDER BY account_type, code`;
  res.json(db.prepare(sql).all(...params));
  db.close();
});

router.post('/accounts', (req, res) => {
  const { code, name, account_type, store_id, opening_balance, notes } = req.body;
  if (!code || !name || !account_type) return res.status(400).json({ error: 'code, name, account_type required' });
  const db = getDb();
  const id = uuidv4();
  db.prepare(`INSERT INTO accounts (id,code,name,account_type,store_id,opening_balance,current_balance,notes) VALUES (?,?,?,?,?,?,?,?)`)
    .run(id, code, name, account_type, store_id||null, opening_balance||0, opening_balance||0, notes||null);
  auditLog(req, 'create', 'accounting', 'account', id, null, { code, name, account_type });
  db.close();
  res.json({ id, message: 'Account created' });
});

// =========================================================================
// ACCOUNTING TRANSACTIONS (Core Journal)
// =========================================================================

router.get('/transactions', (req, res) => {
  const db = getDb();
  const { account_id, type, from, to, store_id, limit } = req.query;
  let sql = `SELECT t.*, a.name as account_name, a.account_type, oa.name as opposite_name,
    u.full_name as created_by_name
    FROM account_transactions t
    JOIN accounts a ON t.account_id = a.id
    LEFT JOIN accounts oa ON t.opposite_account_id = oa.id
    LEFT JOIN users u ON t.created_by = u.id
    WHERE t.deleted_at IS NULL`;
  const params = [];
  if (account_id) { sql += ` AND t.account_id = ?`; params.push(account_id); }
  if (type) { sql += ` AND t.txn_type = ?`; params.push(type); }
  if (from) { sql += ` AND t.txn_date >= ?`; params.push(from); }
  if (to) { sql += ` AND t.txn_date <= ?`; params.push(to); }
  if (store_id) { sql += ` AND t.store_id = ?`; params.push(store_id); }
  sql += ` ORDER BY t.txn_date DESC, t.created_at DESC LIMIT ?`;
  params.push(parseInt(limit) || 500);
  res.json(db.prepare(sql).all(...params));
  db.close();
});

router.post('/transactions', (req, res) => {
  const { txn_date, txn_type, description, account_id, opposite_account_id, amount, direction, payment_mode, reference_type, reference_id, cheque_id, store_id } = req.body;
  if (!txn_date || !description || !account_id || !amount || !direction || !txn_type) {
    return res.status(400).json({ error: 'Missing required fields' });
  }
  const db = getDb();
  const id = uuidv4();
  const txnNumber = `ACT-${Date.now().toString(36).toUpperCase()}`;
  
  db.prepare(`INSERT INTO account_transactions (id,txn_number,txn_date,txn_type,description,account_id,opposite_account_id,amount,direction,payment_mode,reference_type,reference_id,cheque_id,store_id,created_by)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(id, txnNumber, txn_date, txn_type, description, account_id, opposite_account_id||null, amount, direction, payment_mode||null, reference_type||null, reference_id||null, cheque_id||null, store_id||null, req.user.userId);
  
  // Update account balance
  const balChange = direction === 'in' ? amount : -amount;
  db.prepare(`UPDATE accounts SET current_balance = current_balance + ?, updated_at = datetime('now') WHERE id = ?`).run(balChange, account_id);
  
  auditLog(req, 'create', 'accounting', 'transaction', id, null, { txn_type, amount, direction, account_id });
  db.close();
  res.json({ id, txn_number: txnNumber, message: 'Transaction recorded' });
});

// =========================================================================
// CASH BOOK
// =========================================================================

router.get('/cash-book', (req, res) => {
  const db = getDb();
  const { store_id, from, to } = req.query;
  let sql = `SELECT t.*, a.name as account_name, oa.name as opposite_name, u.full_name as created_by_name
    FROM account_transactions t
    JOIN accounts a ON t.account_id = a.id
    LEFT JOIN accounts oa ON t.opposite_account_id = oa.id
    LEFT JOIN users u ON t.created_by = u.id
    WHERE a.account_type = 'cash' AND t.deleted_at IS NULL`;
  const params = [];
  if (store_id) { sql += ` AND (t.store_id = ? OR t.store_id IS NULL)`; params.push(store_id); }
  if (from) { sql += ` AND t.txn_date >= ?`; params.push(from); }
  if (to) { sql += ` AND t.txn_date <= ?`; params.push(to); }
  sql += ` ORDER BY t.txn_date DESC, t.created_at DESC LIMIT 500`;
  const items = db.prepare(sql).all(...params);
  const cashAccts = db.prepare(`SELECT id, name, current_balance FROM accounts WHERE account_type = 'cash' AND is_active=1`).all();
  const summary = {
    opening_balance: cashAccts.reduce((s, a) => s + a.current_balance, 0) - items.filter(i => i.direction === 'in').reduce((s, i) => s + i.amount, 0) + items.filter(i => i.direction === 'out').reduce((s, i) => s + i.amount, 0),
    total_in: items.filter(i => i.direction === 'in').reduce((s, i) => s + i.amount, 0),
    total_out: items.filter(i => i.direction === 'out').reduce((s, i) => s + i.amount, 0),
    closing_balance: cashAccts.reduce((s, a) => s + a.current_balance, 0)
  };
  db.close();
  res.json({ accounts: cashAccts, summary, items });
});

// =========================================================================
// BANK BOOK
// =========================================================================

router.get('/bank-book', (req, res) => {
  const db = getDb();
  const { store_id, from, to } = req.query;
  let sql = `SELECT t.*, a.name as account_name, a.account_number, a.bank_name, oa.name as opposite_name, u.full_name as created_by_name
    FROM account_transactions t
    JOIN accounts a ON t.account_id = a.id
    LEFT JOIN accounts oa ON t.opposite_account_id = oa.id
    LEFT JOIN users u ON t.created_by = u.id
    WHERE a.account_type = 'bank' AND t.deleted_at IS NULL`;
  const params = [];
  if (store_id) { sql += ` AND (t.store_id = ? OR t.store_id IS NULL)`; params.push(store_id); }
  if (from) { sql += ` AND t.txn_date >= ?`; params.push(from); }
  if (to) { sql += ` AND t.txn_date <= ?`; params.push(to); }
  sql += ` ORDER BY t.txn_date DESC, t.created_at DESC LIMIT 500`;
  const items = db.prepare(sql).all(...params);
  const bankAccts = db.prepare(`SELECT id, name, account_type, current_balance FROM accounts WHERE account_type = 'bank' AND is_active=1`).all();
  const summary = {
    total_in: items.filter(i => i.direction === 'in').reduce((s, i) => s + i.amount, 0),
    total_out: items.filter(i => i.direction === 'out').reduce((s, i) => s + i.amount, 0),
    closing_balance: bankAccts.reduce((s, a) => s + a.current_balance, 0)
  };
  db.close();
  res.json({ accounts: bankAccts, summary, items });
});

// =========================================================================
// INCOME
// =========================================================================

router.get('/income', (req, res) => {
  const db = getDb();
  const { store_id, from, to, head_id } = req.query;
  let sql = `SELECT t.*, a.name as account_name, oa.name as income_head, s.name as store_name,
    u.full_name as created_by_name
    FROM account_transactions t
    JOIN accounts a ON t.account_id = a.id
    LEFT JOIN accounts oa ON t.opposite_account_id = oa.id
    LEFT JOIN stores s ON t.store_id = s.id
    LEFT JOIN users u ON t.created_by = u.id
    WHERE t.txn_type IN ('income','receipt') AND (oa.account_type = 'income' OR a.account_type = 'income') AND t.deleted_at IS NULL`;
  const params = [];
  if (store_id) { sql += ` AND (t.store_id = ? OR t.store_id IS NULL)`; params.push(store_id); }
  if (from) { sql += ` AND t.txn_date >= ?`; params.push(from); }
  if (to) { sql += ` AND t.txn_date <= ?`; params.push(to); }
  if (head_id) { sql += ` AND (t.opposite_account_id = ? OR t.account_id = ?)`; params.push(head_id, head_id); }
  sql += ` ORDER BY t.txn_date DESC LIMIT 500`;
  const items = db.prepare(sql).all(...params);
  const incomeHeads = db.prepare(`SELECT * FROM income_heads WHERE is_active=1 ORDER BY name`).all();
  const byHead = {};
  items.forEach(i => {
    const head = i.income_head || i.account_name;
    if (!byHead[head]) byHead[head] = { total: 0, count: 0 };
    byHead[head].total += i.amount;
    byHead[head].count++;
  });
  const totalIncome = items.reduce((s, i) => s + i.amount, 0);
  db.close();
  res.json({ total: totalIncome, by_head: byHead, heads: incomeHeads, items });
});

// Record income
router.post('/income', (req, res) => {
  const { txn_date, description, income_head_id, account_id, amount, payment_mode, store_id, reference_type, reference_id } = req.body;
  if (!txn_date || !description || !income_head_id || !account_id || !amount) {
    return res.status(400).json({ error: 'Missing required fields' });
  }
  const db = getDb();
  // Get or create the income account
  let incomeAcct = db.prepare(`SELECT id FROM accounts WHERE id = ?`).get(income_head_id);
  if (!incomeAcct) {
    // Try income_heads table
    const head = db.prepare(`SELECT * FROM income_heads WHERE id = ?`).get(income_head_id);
    if (head) {
      const acctId = `acc-inc-${head.code}`;
      db.prepare(`INSERT OR IGNORE INTO accounts (id,code,name,account_type,is_system) VALUES (?,?,?,'income',1)`)
        .run(acctId, `INC-${head.code}`, head.name);
      incomeAcct = { id: acctId };
    } else {
      db.close(); return res.status(400).json({ error: 'Income head not found' });
    }
  }
  const txnId = uuidv4();
  const txnNumber = `INC-${Date.now().toString(36).toUpperCase()}`;
  db.prepare(`INSERT INTO account_transactions (id,txn_number,txn_date,txn_type,description,account_id,opposite_account_id,amount,direction,payment_mode,reference_type,reference_id,store_id,created_by)
    VALUES (?,?,?,?,?,?,?,?,'in',?,?,?,?,?)`).run(txnId, txnNumber, txn_date, 'income', description, account_id, incomeAcct.id, amount, payment_mode||'cash', reference_type||null, reference_id||null, store_id||null, req.user.userId);
  db.prepare(`UPDATE accounts SET current_balance = current_balance + ?, updated_at = datetime('now') WHERE id = ?`).run(amount, account_id);
  auditLog(req, 'create', 'accounting', 'income', txnId, null, { amount, head: income_head_id });
  db.close();
  res.json({ id: txnId, txn_number: txnNumber, message: 'Income recorded' });
});

// =========================================================================
// CUSTOMER LEDGER
// =========================================================================

router.get('/customer-ledger/:customer_id', (req, res) => {
  const db = getDb();
  const { from, to } = req.query;
  let sql = `SELECT cl.*, u.full_name as created_by_name FROM customer_ledger cl
    LEFT JOIN users u ON cl.created_by = u.id
    WHERE cl.customer_id = ?`;
  const params = [req.params.customer_id];
  if (from) { sql += ` AND cl.txn_date >= ?`; params.push(from); }
  if (to) { sql += ` AND cl.txn_date <= ?`; params.push(to); }
  sql += ` ORDER BY cl.txn_date ASC, cl.created_at ASC`;
  const items = db.prepare(sql).all(...params);
  const customer = db.prepare(`SELECT id, name, current_outstanding, credit_limit, credit_days FROM customers WHERE id = ?`).get(req.params.customer_id);
  const currentBalance = items.length > 0 ? items[items.length - 1].balance : 0;
  db.close();
  res.json({ customer, current_balance: currentBalance, items });
});

router.post('/customer-transaction', (req, res) => {
  const { customer_id, store_id, txn_date, txn_type, description, amount, reference_type, reference_id } = req.body;
  if (!customer_id || !txn_date || !txn_type || !amount || !description) {
    return res.status(400).json({ error: 'Missing required fields' });
  }
  const db = getDb();
  const lastEntry = db.prepare(`SELECT balance FROM customer_ledger WHERE customer_id = ? ORDER BY txn_date DESC, created_at DESC LIMIT 1`).get(customer_id);
  const prevBalance = lastEntry ? lastEntry.balance : 0;
  let debit = 0, credit = 0;
  // invoice = customer owes us (debit), payment = customer pays us (credit)
  if (['invoice','debit_note','opening_balance'].includes(txn_type)) debit = amount;
  else credit = amount;
  const newBalance = prevBalance + debit - credit;
  const id = uuidv4();
  db.prepare(`INSERT INTO customer_ledger (id,customer_id,store_id,txn_date,txn_type,reference_type,reference_id,debit,credit,balance,description,created_by)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`).run(id, customer_id, store_id||null, txn_date, txn_type, reference_type||null, reference_id||null, debit, credit, newBalance, description, req.user.userId);
  db.prepare(`UPDATE customers SET current_outstanding = ? WHERE id = ?`).run(newBalance, customer_id);
  db.close();
  res.json({ id, balance: newBalance, message: 'Customer transaction recorded' });
});

// =========================================================================
// SUPPLIER LEDGER
// =========================================================================

router.get('/supplier-ledger/:supplier_id', (req, res) => {
  const db = getDb();
  const { from, to } = req.query;
  let sql = `SELECT sl.*, u.full_name as created_by_name FROM supplier_ledger sl
    LEFT JOIN users u ON sl.created_by = u.id
    WHERE sl.supplier_id = ?`;
  const params = [req.params.supplier_id];
  if (from) { sql += ` AND sl.txn_date >= ?`; params.push(from); }
  if (to) { sql += ` AND sl.txn_date <= ?`; params.push(to); }
  sql += ` ORDER BY sl.txn_date ASC, sl.created_at ASC`;
  const items = db.prepare(sql).all(...params);
  const supplier = db.prepare(`SELECT id, name FROM suppliers WHERE id = ?`).get(req.params.supplier_id);
  const currentBalance = items.length > 0 ? items[items.length - 1].balance : 0;
  db.close();
  res.json({ supplier, current_balance: currentBalance, items });
});

router.post('/supplier-transaction', (req, res) => {
  const { supplier_id, store_id, txn_date, txn_type, description, amount, reference_type, reference_id } = req.body;
  if (!supplier_id || !txn_date || !txn_type || !amount || !description) {
    return res.status(400).json({ error: 'Missing required fields' });
  }
  const db = getDb();
  const lastEntry = db.prepare(`SELECT balance FROM supplier_ledger WHERE supplier_id = ? ORDER BY txn_date DESC, created_at DESC LIMIT 1`).get(supplier_id);
  const prevBalance = lastEntry ? lastEntry.balance : 0;
  let debit = 0, credit = 0;
  // purchase = we owe supplier (credit), payment = we pay supplier (debit)
  if (['payment','debit_note','opening_balance'].includes(txn_type)) debit = amount;
  else credit = amount;
  const newBalance = prevBalance + credit - debit;
  const id = uuidv4();
  db.prepare(`INSERT INTO supplier_ledger (id,supplier_id,store_id,txn_date,txn_type,reference_type,reference_id,debit,credit,balance,description,created_by)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`).run(id, supplier_id, store_id||null, txn_date, txn_type, reference_type||null, reference_id||null, debit, credit, newBalance, description, req.user.userId);
  db.close();
  res.json({ id, balance: newBalance, message: 'Supplier transaction recorded' });
});

// =========================================================================
// OUTSTANDING (Customer + Supplier)
// =========================================================================

router.get('/outstanding', (req, res) => {
  const db = getDb();
  const { store_id } = req.query;
  const customers = db.prepare(`SELECT c.id, c.name, c.phone, c.current_outstanding, c.credit_limit, c.credit_days,
    COALESCE((SELECT SUM(balance_due) FROM invoices WHERE customer_id = c.id AND status IN ('unpaid','partially_paid')), 0) as invoice_outstanding,
    COALESCE((SELECT SUM(debit - credit) FROM customer_ledger WHERE customer_id = c.id), 0) as ledger_balance
    FROM customers c WHERE c.customer_type IN ('hotel','corporate') AND c.current_outstanding > 0
    ORDER BY c.current_outstanding DESC`).all();
  const suppliers = db.prepare(`SELECT s.id, s.name, s.phone,
    COALESCE((SELECT SUM(credit - debit) FROM supplier_ledger WHERE supplier_id = s.id), 0) as outstanding
    FROM suppliers s
    HAVING outstanding > 0
    ORDER BY outstanding DESC`).all();
  const totals = {
    customer_outstanding: customers.reduce((s, c) => s + c.current_outstanding, 0),
    supplier_outstanding: suppliers.reduce((s, sup) => s + sup.outstanding, 0)
  };
  db.close();
  res.json({ totals, customers, suppliers });
});

// =========================================================================
// CHEQUE LIFECYCLE
// =========================================================================

router.get('/cheques', (req, res) => {
  const db = getDb();
  const { status, type, from, to } = req.query;
  let sql = `SELECT c.*, u.full_name as created_by_name FROM cheque_registry c
    LEFT JOIN users u ON c.created_by = u.id WHERE 1=1`;
  const params = [];
  if (status) { sql += ` AND c.status = ?`; params.push(status); }
  if (type) { sql += ` AND c.cheque_type = ?`; params.push(type); }
  if (from) { sql += ` AND c.cheque_date >= ?`; params.push(from); }
  if (to) { sql += ` AND c.cheque_date <= ?`; params.push(to); }
  sql += ` ORDER BY c.created_at DESC LIMIT 500`;
  res.json(db.prepare(sql).all(...params));
  db.close();
});

router.post('/cheques', (req, res) => {
  const { cheque_number, cheque_type, party_name, party_type, party_id, amount, cheque_date, bank_name, drawer_name, payee_name, notes, account_id } = req.body;
  if (!cheque_number || !cheque_type || !party_name || !amount || !cheque_date) {
    return res.status(400).json({ error: 'cheque_number, cheque_type, party_name, amount, cheque_date required' });
  }
  const db = getDb();
  const id = uuidv4();
  db.prepare(`INSERT INTO cheque_registry (id,cheque_number,cheque_type,account_id,party_name,party_type,party_id,amount,cheque_date,bank_name,drawer_name,payee_name,notes,created_by)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(id, cheque_number, cheque_type, account_id||null, party_name, party_type||null, party_id||null, amount, cheque_date, bank_name||null, drawer_name||null, payee_name||null, notes||null, req.user.userId);
  auditLog(req, 'create', 'accounting', 'cheque', id, null, { cheque_number, cheque_type, amount });
  db.close();
  res.json({ id, message: 'Cheque registered' });
});

router.put('/cheques/:id/status', (req, res) => {
  const { status, deposit_date, clearance_date, bounce_reason, bounce_date } = req.body;
  if (!status) return res.status(400).json({ error: 'Status required' });
  const db = getDb();
  const cheque = db.prepare(`SELECT * FROM cheque_registry WHERE id = ?`).get(req.params.id);
  if (!cheque) { db.close(); return res.status(404).json({ error: 'Cheque not found' }); }
  
  const updates = { status };
  if (deposit_date) updates.deposit_date = deposit_date;
  if (clearance_date) updates.clearance_date = clearance_date;
  if (bounce_reason) updates.bounce_reason = bounce_reason;
  if (bounce_date) updates.bounce_date = bounce_date;
  
  const setClauses = Object.keys(updates).map(k => `${k}=?`).join(',');
  const values = Object.values(updates);
  db.prepare(`UPDATE cheque_registry SET ${setClauses}, updated_at=datetime('now') WHERE id=?`).run(...values, req.params.id);
  
  // Auto-record transaction on deposit/clearance/bounce
  if (status === 'deposited' && cheque.account_id) {
    // Record a contra entry
    const txnId = uuidv4();
    db.prepare(`INSERT INTO account_transactions (id,txn_number,txn_date,txn_type,description,account_id,amount,direction,payment_mode,cheque_id,created_by)
      VALUES (?,?,?,?,?,?,?,'in','cheque',?,?)`).run(txnId, `CHQ-${Date.now().toString(36).toUpperCase()}`, deposit_date||new Date().toISOString().slice(0,10), 'receipt', `Cheque deposit: ${cheque.cheque_number}`, cheque.account_id, cheque.amount, req.params.id, req.user.userId);
    db.prepare(`UPDATE accounts SET current_balance = current_balance + ? WHERE id = ?`).run(cheque.amount, cheque.account_id);
  }
  if (status === 'bounced') {
    const bounceTxn = db.prepare(`SELECT id FROM account_transactions WHERE cheque_id = ? AND txn_type = 'receipt'`).get(req.params.id);
    if (bounceTxn) {
      db.prepare(`UPDATE account_transactions SET deleted_at = datetime('now') WHERE id = ?`).run(bounceTxn.id);
      db.prepare(`UPDATE accounts SET current_balance = current_balance - ? WHERE id = ?`).run(cheque.amount, cheque.account_id);
    }
  }
  
  db.close();
  res.json({ message: `Cheque status updated to ${status}` });
});

// =========================================================================
// SPLIT PAYMENTS
// =========================================================================

router.post('/split-payment', (req, res) => {
  const { txn_date, description, account_id, amount, splits, store_id, reference_type, reference_id } = req.body;
  if (!txn_date || !description || !account_id || !amount || !splits || !splits.length) {
    return res.status(400).json({ error: 'Missing required fields' });
  }
  const db = getDb();
  const txnId = uuidv4();
  const txnNumber = `SPL-${Date.now().toString(36).toUpperCase()}`;
  db.prepare(`INSERT INTO account_transactions (id,txn_number,txn_date,txn_type,description,account_id,amount,direction,payment_mode,reference_type,reference_id,store_id,created_by)
    VALUES (?,?,?,?,'receipt',?,?,?,'in','mixed',?,?,?,?)`).run(txnId, txnNumber, txn_date, description, account_id, amount, reference_type||null, reference_id||null, store_id||null, req.user.userId);
  splits.forEach(split => {
    db.prepare(`INSERT INTO split_payments (id,transaction_id,payment_mode,amount,reference_no,notes) VALUES (?,?,?,?,?,?)`)
      .run(uuidv4(), txnId, split.payment_mode, split.amount, split.reference_no||null, split.notes||null);
  });
  db.prepare(`UPDATE accounts SET current_balance = current_balance + ? WHERE id = ?`).run(amount, account_id);
  db.close();
  res.json({ id: txnId, txn_number: txnNumber, message: 'Split payment recorded' });
});

// =========================================================================
// P&L STATEMENT
// =========================================================================

router.get('/pl', (req, res) => {
  const db = getDb();
  const { store_id, from, to } = req.query;
  const start = from || new Date(Date.now()-30*24*60*60*1000).toISOString().slice(0,10);
  const end = to || new Date().toISOString().slice(0,10);
  
  // Income from account_transactions
  const income = db.prepare(`SELECT COALESCE(SUM(t.amount),0) as total FROM account_transactions t
    JOIN accounts a ON t.account_id = a.id
    WHERE t.txn_type IN ('income','receipt') AND a.account_type = 'income' AND t.deleted_at IS NULL
    AND t.txn_date >= ? AND t.txn_date <= ?`).get(start, end);
  
  // Income from opposite side (income accounts credited)
  const incomeFromOpp = db.prepare(`SELECT COALESCE(SUM(t.amount),0) as total FROM account_transactions t
    JOIN accounts oa ON t.opposite_account_id = oa.id
    WHERE oa.account_type = 'income' AND t.deleted_at IS NULL
    AND t.txn_date >= ? AND t.txn_date <= ?`).get(start, end);
  
  // Expenses
  const expenses = db.prepare(`SELECT COALESCE(SUM(t.amount),0) as total FROM account_transactions t
    JOIN accounts a ON t.account_id = a.id
    WHERE t.txn_type = 'expense' AND t.deleted_at IS NULL
    AND t.txn_date >= ? AND t.txn_date <= ?`).get(start, end);
  
  // Expenses from daily flash
  const flash = db.prepare(`SELECT COALESCE(SUM(total_sales),0) as revenue, COALESCE(SUM(total_purchases),0) as cogs,
    COALESCE(SUM(total_expenses),0) as total_expenses, COALESCE(SUM(gross_margin),0) as gross_profit,
    COALESCE(SUM(net_margin),0) as net_profit
    FROM daily_flash WHERE flash_date >= ? AND flash_date <= ?`).get(start, end);
  
  // Income by head
  const incomeByHead = db.prepare(`SELECT oa.name as head, SUM(t.amount) as total FROM account_transactions t
    JOIN accounts oa ON t.opposite_account_id = oa.id
    WHERE oa.account_type = 'income' AND t.deleted_at IS NULL
    AND t.txn_date >= ? AND t.txn_date <= ?
    GROUP BY oa.name ORDER BY total DESC`).all(start, end);
  
  // Expenses by type
  const expenseByType = db.prepare(`SELECT t.txn_type, a.name as account, SUM(t.amount) as total FROM account_transactions t
    JOIN accounts a ON t.account_id = a.id
    WHERE t.txn_type = 'expense' AND t.deleted_at IS NULL
    AND t.txn_date >= ? AND t.txn_date <= ?
    GROUP BY t.account_id ORDER BY total DESC`).all(start, end);
  
  const totalIncome = parseFloat(income.total) + parseFloat(incomeFromOpp.total);
  const totalExpenses = parseFloat(expenses.total) + parseFloat(flash.total_expenses);
  const netProfit = (parseFloat(flash.revenue) - parseFloat(flash.cogs)) - totalExpenses;
  const netProfit2 = totalIncome - totalExpenses;
  
  db.close();
  res.json({
    period: { from: start, to: end },
    revenue: { total: flash.revenue, from_sales: flash.revenue, from_accounts: totalIncome },
    cogs: flash.cogs,
    gross_profit: flash.gross_profit,
    gross_margin_pct: flash.revenue > 0 ? (flash.gross_profit / flash.revenue * 100) : 0,
    total_expenses: totalExpenses,
    income_by_head: incomeByHead,
    expense_by_type: expenseByType,
    net_profit: flash.net_profit,
    net_margin_pct: flash.revenue > 0 ? (flash.net_profit / flash.revenue * 100) : 0
  });
});

// =========================================================================
// CASH FLOW
// =========================================================================

router.get('/cash-flow', (req, res) => {
  const db = getDb();
  const { store_id, from, to } = req.query;
  const start = from || new Date(Date.now()-30*24*60*60*1000).toISOString().slice(0,10);
  const end = to || new Date().toISOString().slice(0,10);
  
  const inflows = db.prepare(`SELECT t.txn_date, t.txn_number, t.description, t.amount, t.payment_mode,
    a.name as account_name, oa.name as source, t.txn_type
    FROM account_transactions t
    JOIN accounts a ON t.account_id = a.id
    LEFT JOIN accounts oa ON t.opposite_account_id = oa.id
    WHERE a.account_type IN ('cash','bank') AND t.direction = 'in' AND t.deleted_at IS NULL
    AND t.txn_date >= ? AND t.txn_date <= ?
    ORDER BY t.txn_date DESC`).all(start, end);
  
  const outflows = db.prepare(`SELECT t.txn_date, t.txn_number, t.description, t.amount, t.payment_mode,
    a.name as account_name, oa.name as category, t.txn_type
    FROM account_transactions t
    JOIN accounts a ON t.account_id = a.id
    LEFT JOIN accounts oa ON t.opposite_account_id = oa.id
    WHERE a.account_type IN ('cash','bank') AND t.direction = 'out' AND t.deleted_at IS NULL
    AND t.txn_date >= ? AND t.txn_date <= ?
    ORDER BY t.txn_date DESC`).all(start, end);
  
  const totalIn = inflows.reduce((s, i) => s + i.amount, 0);
  const totalOut = outflows.reduce((s, o) => s + o.amount, 0);
  
  // Group by category
  const byCategory = {};
  outflows.forEach(o => {
    const cat = o.category || o.txn_type;
    if (!byCategory[cat]) byCategory[cat] = { total: 0, count: 0 };
    byCategory[cat].total += o.amount;
    byCategory[cat].count++;
  });
  
  db.close();
  res.json({
    period: { from: start, to: end },
    total_inflow: totalIn,
    total_outflow: totalOut,
    net_flow: totalIn - totalOut,
    inflows,
    outflows,
    outflow_by_category: byCategory
  });
});

// =========================================================================
// EXPENSE HEADS
// =========================================================================

router.get('/expense-heads', (req, res) => {
  const db = getDb();
  res.json(db.prepare(`SELECT * FROM expense_heads WHERE is_active=1 ORDER BY name`).all());
  db.close();
});

// =========================================================================
// INCOME HEADS
// =========================================================================

router.get('/income-heads', (req, res) => {
  const db = getDb();
  res.json(db.prepare(`SELECT * FROM income_heads WHERE is_active=1 ORDER BY name`).all());
  db.close();
});

// =========================================================================
// FINANCIAL SUMMARY DASHBOARD
// =========================================================================

router.get('/summary', (req, res) => {
  const db = getDb();
  const { store_id } = req.query;
  const storeFilter = store_id ? `AND store_id = '${store_id}'` : '';
  
  const cashBalance = db.prepare(`SELECT COALESCE(SUM(current_balance),0) as total FROM accounts WHERE account_type='cash' AND is_active=1`).get();
  const bankBalance = db.prepare(`SELECT COALESCE(SUM(current_balance),0) as total FROM accounts WHERE account_type='bank' AND is_active=1`).get();
  const custOutstanding = db.prepare(`SELECT COALESCE(SUM(current_outstanding),0) as total FROM customers WHERE customer_type IN ('hotel','corporate')`).get();
  const supOutstanding = db.prepare(`SELECT COALESCE(SUM(credit - debit),0) as total FROM supplier_ledger`).get();
  const incomeToday = db.prepare(`SELECT COALESCE(SUM(CASE WHEN direction='in' THEN amount ELSE 0 END),0) as in_amt,
    COALESCE(SUM(CASE WHEN direction='out' THEN amount ELSE 0 END),0) as out_amt
    FROM account_transactions WHERE date(txn_date)=date('now') AND deleted_at IS NULL`).get();
  
  db.close();
  res.json({
    cash_balance: cashBalance.total,
    bank_balance: bankBalance.total,
    total_cash_and_bank: cashBalance.total + bankBalance.total,
    customer_outstanding: custOutstanding.total,
    supplier_outstanding: supOutstanding.total,
    today_income: incomeToday.in_amt,
    today_expenses: incomeToday.out_amt
  });
});

module.exports = router;
