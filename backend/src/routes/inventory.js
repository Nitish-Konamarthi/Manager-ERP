const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const { getDb } = require('../middleware/auth');
const { auditLog } = require('../middleware/audit');

// =========================================================================
// BATCH MANAGEMENT
// =========================================================================

// List batches with comprehensive filtering
router.get('/batches', (req, res) => {
  const db = getDb();
  const { store_id, produce_id, status, grade, age, expiring, location } = req.query;
  let sql = `SELECT sb.*, p.name as produce_name, p.code as produce_code, p.sku, 
    pc.name as category_name, s.name as store_name, su.name as supplier_name,
    (sb.available_qty - COALESCE(sb.reserved_qty,0)) as free_qty,
    CASE WHEN sb.expiry_date IS NOT NULL THEN ROUND(julianday(sb.expiry_date) - julianday('now')) ELSE NULL END as days_remaining
    FROM stock_batches sb
    JOIN produce p ON sb.produce_id = p.id
    JOIN produce_categories pc ON p.category_id = pc.id
    JOIN stores s ON sb.store_id = s.id
    LEFT JOIN suppliers su ON sb.supplier_id = su.id
    WHERE 1=1`;
  const params = [];
  if (store_id) { sql += ` AND sb.store_id = ?`; params.push(store_id); }
  if (produce_id) { sql += ` AND sb.produce_id = ?`; params.push(produce_id); }
  if (status) { sql += ` AND sb.status = ?`; params.push(status); }
  if (grade) { sql += ` AND sb.grade = ?`; params.push(grade); }
  if (age === 'expiring') { sql += ` AND sb.expiry_date IS NOT NULL AND julianday(sb.expiry_date) - julianday('now') BETWEEN 0 AND 2 AND sb.available_qty > 0`; }
  if (age === 'expired') { sql += ` AND sb.expiry_date IS NOT NULL AND julianday(sb.expiry_date) - julianday('now') < 0 AND sb.available_qty > 0`; }
  if (age === 'fresh') { sql += ` AND (sb.expiry_date IS NULL OR julianday(sb.expiry_date) - julianday('now') > 2) AND sb.available_qty > 0`; }
  if (expiring === 'true') { sql += ` AND sb.expiry_date IS NOT NULL AND julianday(sb.expiry_date) - julianday('now') <= 2 AND sb.available_qty > 0`; }
  if (location) { sql += ` AND sb.location_zone = ?`; params.push(location); }
  sql += ` ORDER BY sb.received_date DESC LIMIT 500`;
  const batches = db.prepare(sql).all(...params);
  db.close();
  res.json(batches);
});

// Single batch with full lifecycle
router.get('/batches/:id', (req, res) => {
  const db = getDb();
  const batch = db.prepare(`SELECT sb.*, p.name as produce_name, p.code as produce_code, p.sku, p.hsn_code,
    pc.name as category_name, s.name as store_name, su.name as supplier_name,
    (sb.available_qty - COALESCE(sb.reserved_qty,0)) as free_qty,
    CASE WHEN sb.expiry_date IS NOT NULL THEN ROUND(julianday(sb.expiry_date) - julianday('now')) ELSE NULL END as days_remaining,
    CASE WHEN sb.received_date IS NOT NULL AND sb.expiry_date IS NOT NULL THEN
      ROUND((julianday('now') - julianday(sb.received_date)) / (julianday(sb.expiry_date) - julianday(sb.received_date)) * 100)
      ELSE NULL END as shelf_life_pct_used
    FROM stock_batches sb
    JOIN produce p ON sb.produce_id = p.id
    JOIN produce_categories pc ON p.category_id = pc.id
    JOIN stores s ON sb.store_id = s.id
    LEFT JOIN suppliers su ON sb.supplier_id = su.id
    WHERE sb.id = ?`).get(req.params.id);
  if (!batch) { db.close(); return res.status(404).json({ error: 'Batch not found' }); }

  // Full movement ledger for this batch
  const movements = db.prepare(`SELECT sm.*, u.full_name as created_by_name,
    CASE WHEN sm.movement_type = 'sold_retail' THEN (SELECT transaction_number FROM retail_transactions WHERE id = sm.reference_id) 
         WHEN sm.movement_type = 'sold_hotel' THEN (SELECT order_number FROM sales_orders WHERE id = sm.reference_id)
         ELSE NULL END as reference_number
    FROM stock_movements sm LEFT JOIN users u ON sm.created_by = u.id
    WHERE sm.batch_id = ? ORDER BY sm.created_at ASC`).all(req.params.id);

  // Weight loss history
  const weightLoss = db.prepare(`SELECT * FROM weight_loss_records WHERE batch_id = ? ORDER BY record_date DESC`).all(req.params.id);

  // Active reservations
  const reservations = db.prepare(`SELECT sr.*, 
    CASE WHEN sr.reference_type = 'sales_order' THEN (SELECT order_number FROM sales_orders WHERE id = sr.reference_id)
         ELSE NULL END as reference_number
    FROM stock_reservations sr WHERE sr.batch_id = ? AND sr.status = 'active'`).all(req.params.id);

  // Daily snapshots
  const snapshots = db.prepare(`SELECT * FROM daily_stock_snapshots WHERE batch_id = ? ORDER BY snapshot_date DESC LIMIT 30`).all(req.params.id);

  db.close();
  res.json({ ...batch, movements, weight_loss: weightLoss, reservations, snapshots });
});

// =========================================================================
// STOCK MOVEMENT LEDGER (Complete audit trail)
// =========================================================================

router.get('/ledger', (req, res) => {
  const db = getDb();
  const { store_id, produce_id, movement_type, batch_id, from, to, limit } = req.query;
  let sql = `SELECT sm.*, p.name as produce_name, p.code as produce_code, s.name as store_name, u.full_name as created_by_name,
    CASE WHEN sm.reference_type = 'retail_txn' THEN (SELECT transaction_number FROM retail_transactions WHERE id = sm.reference_id)
         WHEN sm.reference_type = 'sales_order' THEN (SELECT order_number FROM sales_orders WHERE id = sm.reference_id)
         WHEN sm.reference_type = 'purchase_order' THEN (SELECT po_number FROM purchase_orders WHERE id = sm.reference_id)
         WHEN sm.reference_type = 'transfer' THEN (SELECT transfer_number FROM transfer_orders WHERE id = sm.reference_id)
         ELSE NULL END as reference_number
    FROM stock_movements sm
    JOIN produce p ON sm.produce_id = p.id
    JOIN stores s ON sm.store_id = s.id
    LEFT JOIN users u ON sm.created_by = u.id
    WHERE 1=1`;
  const params = [];
  if (store_id) { sql += ` AND sm.store_id = ?`; params.push(store_id); }
  if (produce_id) { sql += ` AND sm.produce_id = ?`; params.push(produce_id); }
  if (movement_type) { sql += ` AND sm.movement_type = ?`; params.push(movement_type); }
  if (batch_id) { sql += ` AND sm.batch_id = ?`; params.push(batch_id); }
  if (from) { sql += ` AND sm.created_at >= ?`; params.push(from); }
  if (to) { sql += ` AND sm.created_at <= ?`; params.push(to); }
  sql += ` ORDER BY sm.created_at DESC LIMIT ?`;
  params.push(parseInt(limit) || 500);
  res.json(db.prepare(sql).all(...params));
  db.close();
});

// =========================================================================
// STOCK ADJUSTMENTS (Weight Loss, Shrinkage, Spoilage, Damage, Returns)
// =========================================================================

router.post('/adjust', (req, res) => {
  const { store_id, batch_id, produce_id, adjustment_type, quantity, reason, reference_type, reference_id, unit_cost } = req.body;
  if (!store_id || !batch_id || !produce_id || !quantity || !adjustment_type || !reason) {
    return res.status(400).json({ error: 'Missing required fields: store_id, batch_id, produce_id, quantity, adjustment_type, reason' });
  }

  const db = getDb();

  // Lock batch row
  const batch = db.prepare(`SELECT * FROM stock_batches WHERE id = ?`).get(batch_id);
  if (!batch) { db.close(); return res.status(404).json({ error: 'Batch not found' }); }
  if (batch.available_qty < quantity) { db.close(); return res.status(400).json({ error: `Insufficient stock. Available: ${batch.available_qty}, Requested: ${quantity}` }); }

  const qtyBefore = batch.available_qty;
  const qtyAfter = qtyBefore - quantity;
  const cost = unit_cost || batch.cost_price;
  const totalValue = quantity * cost;

  // Create adjustment record
  const adjId = uuidv4();
  db.prepare(`INSERT INTO inventory_adjustments (id, store_id, batch_id, produce_id, adjustment_type, quantity, quantity_before, quantity_after, unit_cost, total_value, reason, reference_type, reference_id, created_by)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(adjId, store_id, batch_id, produce_id, adjustment_type, quantity, qtyBefore, qtyAfter, cost, totalValue, reason, reference_type, reference_id, req.user.userId);

  // Update batch
  const newStatus = qtyAfter <= 0 ? 'wasted' : batch.status;
  db.prepare(`UPDATE stock_batches SET available_qty = ?, status = ?, 
    weight_loss_qty = COALESCE(weight_loss_qty,0) + CASE WHEN ? IN ('weight_loss','natural_shrinkage','moisture_loss') THEN ? ELSE 0 END,
    updated_at = datetime('now')
    WHERE id = ?`).run(qtyAfter, newStatus, adjustment_type, quantity, batch_id);

  // Record movement
  const movementType = adjustment_type === 'spoilage' ? 'wasted' : 
    adjustment_type === 'damage' ? 'wasted' : 
    adjustment_type === 'natural_shrinkage' ? 'adjusted' :
    adjustment_type === 'weight_loss' ? 'adjusted' : 'adjusted';
  
  db.prepare(`INSERT INTO stock_movements (id, batch_id, produce_id, store_id, movement_type, quantity, quantity_before, quantity_after, unit_cost, total_value, reference_id, ref_type, is_weight_loss, notes, created_by)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(uuidv4(), batch_id, produce_id, store_id, movementType, -quantity, qtyBefore, qtyAfter, cost, totalValue, adjId, 'adjustment', 
    adjustment_type === 'weight_loss' || adjustment_type === 'natural_shrinkage' ? 1 : 0,
    reason, req.user.userId);

  // Also record weight loss separately
  if (['weight_loss','natural_shrinkage','moisture_loss','trimming'].includes(adjustment_type)) {
    db.prepare(`INSERT INTO weight_loss_records (id, store_id, batch_id, produce_id, record_date, opening_weight, current_weight, loss_type, notes, recorded_by)
      VALUES (?,?,?,?,date('now'),?,?,?,?,?)`).run(uuidv4(), store_id, batch_id, produce_id, qtyBefore, qtyAfter, adjustment_type, reason, req.user.userId);
  }

  auditLog(req, 'create', 'inventory', 'adjustment', adjId, null, { adjustment_type, quantity, batch_id, reason });
  db.close();
  res.json({ id: adjId, quantity_before: qtyBefore, quantity_after: qtyAfter, message: `Stock adjusted: ${quantity} ${adjustment_type}` });
});

// =========================================================================
// STOCK RESERVATION (Hold stock for hotel orders / transfers)
// =========================================================================

router.post('/reserve', (req, res) => {
  const { batch_id, produce_id, store_id, reference_type, reference_id, quantity } = req.body;
  if (!batch_id || !produce_id || !store_id || !reference_type || !reference_id || !quantity) {
    return res.status(400).json({ error: 'Missing required fields' });
  }
  const db = getDb();
  const batch = db.prepare(`SELECT * FROM stock_batches WHERE id = ?`).get(batch_id);
  if (!batch) { db.close(); return res.status(404).json({ error: 'Batch not found' }); }
  
  const freeQty = batch.available_qty - (batch.reserved_qty || 0);
  if (freeQty < quantity) { db.close(); return res.status(400).json({ error: `Insufficient free stock. Free: ${freeQty}, Requested: ${quantity}` }); }

  const id = uuidv4();
  db.prepare(`INSERT INTO stock_reservations (id, batch_id, produce_id, store_id, reference_type, reference_id, quantity, created_by)
    VALUES (?,?,?,?,?,?,?,?)`).run(id, batch_id, produce_id, store_id, reference_type, reference_id, quantity, req.user.userId);
  db.prepare(`UPDATE stock_batches SET reserved_qty = COALESCE(reserved_qty,0) + ?, updated_at = datetime('now') WHERE id = ?`).run(quantity, batch_id);

  db.close();
  res.json({ id, message: `Reserved ${quantity} from batch ${batch.batch_code}` });
});

router.post('/reserve/best-batch', (req, res) => {
  // FIFO-aware reservation: reserves from oldest suitable batch first
  const { produce_id, store_id, quantity, reference_type, reference_id, grade_required } = req.body;
  if (!produce_id || !store_id || !quantity || !reference_type || !reference_id) {
    return res.status(400).json({ error: 'Missing required fields' });
  }
  const db = getDb();
  const gradeFilter = grade_required || 'A';
  
  // Get available batches ordered by FIFO (oldest first), filtering by grade
  const batches = db.prepare(`SELECT * FROM stock_batches 
    WHERE produce_id = ? AND store_id = ? AND status = 'available' AND available_qty > 0 
    AND grade >= ? 
    ORDER BY received_date ASC`).all(produce_id, store_id, gradeFilter);

  let remaining = quantity;
  const reservations = [];

  for (const batch of batches) {
    if (remaining <= 0) break;
    const freeQty = batch.available_qty - (batch.reserved_qty || 0);
    if (freeQty <= 0) continue;
    const reserveQty = Math.min(freeQty, remaining);
    const id = uuidv4();
    db.prepare(`INSERT INTO stock_reservations (id, batch_id, produce_id, store_id, reference_type, reference_id, quantity, created_by)
      VALUES (?,?,?,?,?,?,?,?)`).run(id, batch.id, produce_id, store_id, reference_type, reference_id, reserveQty, req.user.userId);
    db.prepare(`UPDATE stock_batches SET reserved_qty = COALESCE(reserved_qty,0) + ?, updated_at = datetime('now') WHERE id = ?`).run(reserveQty, batch.id);
    reservations.push({ batch_id: batch.id, batch_code: batch.batch_code, quantity: reserveQty, cost_price: batch.cost_price });
    remaining -= reserveQty;
  }

  db.close();
  if (remaining > 0) {
    return res.json({ reservations, shortfall: remaining, message: `Partially reserved. Shortfall: ${remaining}` });
  }
  res.json({ reservations, shortfall: 0, message: `Fully reserved ${quantity} from ${reservations.length} batch(es)` });
});

router.post('/release', (req, res) => {
  const { reservation_id, batch_id, quantity, reference_type, reference_id } = req.body;
  const db = getDb();
  if (reservation_id) {
    const resv = db.prepare(`SELECT * FROM stock_reservations WHERE id = ?`).get(reservation_id);
    if (!resv) { db.close(); return res.status(404).json({ error: 'Reservation not found' }); }
    db.prepare(`UPDATE stock_reservations SET status = 'released', released_at = datetime('now') WHERE id = ?`).run(reservation_id);
    db.prepare(`UPDATE stock_batches SET reserved_qty = MAX(0, COALESCE(reserved_qty,0) - ?), updated_at = datetime('now') WHERE id = ?`).run(resv.quantity, resv.batch_id);
  } else if (batch_id && quantity && reference_type && reference_id) {
    db.prepare(`UPDATE stock_reservations SET status = 'released', released_at = datetime('now') WHERE batch_id = ? AND reference_type = ? AND reference_id = ? AND status = 'active'`).run(batch_id, reference_type, reference_id);
    db.prepare(`UPDATE stock_batches SET reserved_qty = MAX(0, COALESCE(reserved_qty,0) - ?), updated_at = datetime('now') WHERE id = ?`).run(quantity, batch_id);
  } else {
    db.close(); return res.status(400).json({ error: 'Provide reservation_id OR (batch_id + quantity + reference_type + reference_id)' });
  }
  db.close();
  res.json({ message: 'Reservation released' });
});

router.get('/reservations', (req, res) => {
  const db = getDb();
  const { store_id, status, reference_type, reference_id } = req.query;
  let sql = `SELECT sr.*, p.name as produce_name, s.name as store_name,
    CASE WHEN sr.reference_type = 'sales_order' THEN (SELECT order_number FROM sales_orders WHERE id = sr.reference_id)
         WHEN sr.reference_type = 'transfer' THEN (SELECT transfer_number FROM transfer_orders WHERE id = sr.reference_id)
         ELSE NULL END as reference_number
    FROM stock_reservations sr
    JOIN produce p ON sr.produce_id = p.id
    JOIN stores s ON sr.store_id = s.id
    WHERE 1=1`;
  const params = [];
  if (store_id) { sql += ` AND sr.store_id = ?`; params.push(store_id); }
  if (status) { sql += ` AND sr.status = ?`; params.push(status); }
  else { sql += ` AND sr.status = 'active'`; }
  if (reference_type) { sql += ` AND sr.reference_type = ?`; params.push(reference_type); }
  if (reference_id) { sql += ` AND sr.reference_id = ?`; params.push(reference_id); }
  sql += ` ORDER BY sr.reserved_at DESC`;
  res.json(db.prepare(sql).all(...params));
  db.close();
});

// =========================================================================
// DAILY STOCK SNAPSHOTS (Opening/Closing Stock Computation)
// =========================================================================

router.post('/daily-closing', (req, res) => {
  const { store_id, closing_date } = req.body;
  if (!store_id || !closing_date) return res.status(400).json({ error: 'Store and date required' });
  const db = getDb();
  const date = closing_date;
  const prevDate = new Date(date);
  prevDate.setDate(prevDate.getDate() - 1);
  const prevDateStr = prevDate.toISOString().slice(0,10);

  // Get all batches that had stock on this date
  const batches = db.prepare(`SELECT sb.* FROM stock_batches sb WHERE sb.store_id = ? AND sb.received_date <= ? AND (sb.expiry_date IS NULL OR sb.expiry_date >= ?) AND sb.status != 'exhausted'`).all(store_id, date, date);

  let totalClosing = 0;
  let totalValue = 0;
  let snapshotCount = 0;

  const insertSnapshot = db.prepare(`INSERT OR REPLACE INTO daily_stock_snapshots 
    (id, store_id, snapshot_date, batch_id, produce_id, opening_qty, purchases_qty, sales_qty,
     transfers_in_qty, transfers_out_qty, spoilage_qty, weight_loss_qty, returns_qty, adjustments_qty, closing_qty, cost_price)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);

  for (const batch of batches) {
    // Get previous day's snapshot for this batch
    const prevSnapshot = db.prepare(`SELECT closing_qty FROM daily_stock_snapshots WHERE store_id = ? AND snapshot_date = ? AND batch_id = ?`).get(store_id, prevDateStr, batch.id);
    const openingQty = prevSnapshot ? prevSnapshot.closing_qty : batch.received_qty;

    // Movements for this batch on this date
    const movements = db.prepare(`SELECT movement_type, SUM(ABS(quantity)) as total FROM stock_movements 
      WHERE batch_id = ? AND store_id = ? AND date(created_at) = ? GROUP BY movement_type`).all(batch.id, store_id, date);
    const movMap = {};
    movements.forEach(m => { movMap[m.movement_type] = m.total; });

    const salesQty = (movMap['sold_retail'] || 0) + (movMap['sold_hotel'] || 0);
    const purchasesQty = batch.received_date === date ? batch.received_qty : 0;
    const spoilageQty = movMap['wasted'] || 0;
    const adjQty = movMap['adjusted'] || 0;

    // Weight loss for this batch on this date
    const wl = db.prepare(`SELECT COALESCE(SUM(loss_weight),0) as total FROM weight_loss_records WHERE batch_id = ? AND record_date = ?`).get(batch.id, date);
    const weightLossQty = wl.total;

    // Transfers
    const transfersOut = db.prepare(`SELECT COALESCE(SUM(ABS(quantity)),0) as total FROM stock_movements WHERE batch_id = ? AND store_id = ? AND date(created_at) = ? AND movement_type = 'transferred_out'`).get(batch.id, store_id, date);
    const transfersIn = db.prepare(`SELECT COALESCE(SUM(quantity),0) as total FROM stock_movements WHERE batch_id = ? AND store_id = ? AND date(created_at) = ? AND movement_type = 'transferred_in'`).get(batch.id, store_id, date);

    const closingQty = openingQty + purchasesQty - salesQty - spoilageQty - weightLossQty - (transfersOut?.total||0) + (transfersIn?.total||0) + (movMap['customer_returned'] || 0);

    insertSnapshot.run(uuidv4(), store_id, date, batch.id, batch.produce_id, openingQty, purchasesQty, salesQty,
      transfersIn?.total||0, transfersOut?.total||0, spoilageQty, weightLossQty, movMap['customer_returned']||0, adjQty, Math.max(0, closingQty), batch.cost_price);

    totalClosing += Math.max(0, closingQty);
    totalValue += Math.max(0, closingQty) * batch.cost_price;
    snapshotCount++;
  }

  // Update batch opening_qty for next day
  db.prepare(`UPDATE stock_batches SET opening_qty = available_qty, last_count_date = ? WHERE store_id = ?`).run(date, store_id);

  db.close();
  res.json({ message: `Daily closing computed for ${date}`, batches: snapshotCount, total_closing_qty: totalClosing, total_stock_value: totalValue });
});

router.get('/daily-closing', (req, res) => {
  const db = getDb();
  const { store_id, from, to } = req.query;
  let sql = `SELECT * FROM v_daily_stock_summary WHERE 1=1`;
  const params = [];
  if (store_id) { sql += ` AND store_id = ?`; params.push(store_id); }
  if (from) { sql += ` AND snapshot_date >= ?`; params.push(from); }
  if (to) { sql += ` AND snapshot_date <= ?`; params.push(to); }
  sql += ` ORDER BY snapshot_date DESC LIMIT 100`;
  res.json(db.prepare(sql).all(...params));
  db.close();
});

router.get('/daily-closing/:date/:store_id?', (req, res) => {
  const db = getDb();
  const { date, store_id } = req.params;
  let sql = `SELECT dss.*, p.name as produce_name, p.code as produce_code, pc.name as category FROM daily_stock_snapshots dss
    JOIN produce p ON dss.produce_id = p.id
    JOIN produce_categories pc ON p.category_id = pc.id
    WHERE dss.snapshot_date = ?`;
  const params = [date];
  if (store_id) { sql += ` AND dss.store_id = ?`; params.push(store_id); }
  sql += ` ORDER BY dss.stock_value DESC`;
  res.json(db.prepare(sql).all(...params));
  db.close();
});

// =========================================================================
// INVENTORY VALUATION (FIFO, Weighted Average)
// =========================================================================

router.get('/valuation', (req, res) => {
  const db = getDb();
  const { store_id, produce_id } = req.query;
  let sql = `SELECT * FROM v_inventory_valuation WHERE 1=1`;
  const params = [];
  if (store_id) { sql += ` AND store_id = ?`; params.push(store_id); }
  if (produce_id) { sql += ` AND produce_id = ?`; params.push(produce_id); }
  sql += ` ORDER BY category, produce_name`;
  const valuation = db.prepare(sql).all(...params);
  const totals = {
    total_qty: valuation.reduce((s, r) => s + r.total_qty, 0),
    fifo_value: valuation.reduce((s, r) => s + r.fifo_value, 0),
    weighted_avg_value: valuation.reduce((s, r) => s + (r.weighted_avg_cost * r.total_qty), 0)
  };
  db.close();
  res.json({ items: valuation, totals });
});

router.get('/fifo-cost', (req, res) => {
  const { produce_id, store_id, quantity } = req.query;
  if (!produce_id || !store_id) return res.status(400).json({ error: 'Produce and store required' });
  const db = getDb();
  const qty = parseFloat(quantity) || 0;
  
  const layers = db.prepare(`SELECT * FROM v_fifo_layers WHERE produce_id = ? AND store_id = ? ORDER BY fifo_layer`).all(produce_id, store_id);
  
  let totalCost = 0;
  let remainingQty = qty;
  const layersUsed = [];

  for (const layer of layers) {
    if (remainingQty <= 0) break;
    const useQty = Math.min(layer.available_qty, remainingQty);
    const layerCost = useQty * layer.cost_price;
    totalCost += layerCost;
    remainingQty -= useQty;
    layersUsed.push({
      batch_id: layer.batch_id, batch_code: layer.batch_code, grade: layer.grade,
      received_date: layer.received_date, qty_used: useQty, unit_cost: layer.cost_price,
      layer_cost: layerCost
    });
  }

  const avgCost = qty > 0 ? totalCost / qty : 0;
  const avgCostAll = layers.length > 0 ? layers.reduce((s, l) => s + l.cost_price, 0) / layers.length : 0;

  db.close();
  res.json({
    produce_id, produce_name: layers[0]?.produce_name,
    requested_qty: qty, total_fifo_cost: totalCost, avg_fifo_cost: avgCost,
    weighted_avg_cost: avgCostAll,
    layers_used: layersUsed, available_layers: layers.length,
    shortfall: Math.max(0, remainingQty)
  });
});

router.get('/avg-cost', (req, res) => {
  const { produce_id, store_id } = req.query;
  if (!produce_id) return res.status(400).json({ error: 'Produce required' });
  const db = getDb();
  const result = db.prepare(`SELECT 
    sb.produce_id, p.name as produce_name, p.code as produce_code,
    COUNT(sb.id) as batch_count,
    SUM(sb.available_qty) as total_qty,
    SUM(sb.available_qty * sb.cost_price) as total_value,
    CASE WHEN SUM(sb.available_qty) > 0 THEN SUM(sb.available_qty * sb.cost_price) / SUM(sb.available_qty) ELSE 0 END as weighted_avg_cost,
    AVG(sb.cost_price) as simple_avg_cost,
    MIN(sb.cost_price) as min_cost,
    MAX(sb.cost_price) as max_cost
    FROM stock_batches sb JOIN produce p ON sb.produce_id = p.id
    WHERE sb.produce_id = ? AND sb.available_qty > 0 AND sb.status = 'available'`).get(produce_id);
  db.close();
  res.json(result);
});

// =========================================================================
// INVENTORY SNAPSHOT (Real-time + Historical)
// =========================================================================

router.get('/snapshot', (req, res) => {
  const db = getDb();
  const { store_id, date } = req.query;

  if (date) {
    // Historical snapshot
    const snapshots = db.prepare(`SELECT dss.*, p.name as produce_name, p.code as produce_code, pc.name as category,
      s.name as store_name FROM daily_stock_snapshots dss
      JOIN produce p ON dss.produce_id = p.id
      JOIN produce_categories pc ON p.category_id = pc.id
      JOIN stores s ON dss.store_id = s.id
      WHERE dss.snapshot_date = ?`).all(date);
    const totals = {
      total_qty: snapshots.reduce((s, r) => s + r.closing_qty, 0),
      total_value: snapshots.reduce((s, r) => s + r.stock_value, 0),
      total_spoilage: snapshots.reduce((s, r) => s + r.spoilage_qty, 0),
      total_weight_loss: snapshots.reduce((s, r) => s + r.weight_loss_qty, 0)
    };
    db.close();
    return res.json({ date, items: snapshots, totals });
  }

  // Real-time current snapshot
  const batches = db.prepare(`SELECT sb.*, p.name as produce_name, p.code as produce_code, pc.name as category,
    s.name as store_name, su.name as supplier_name,
    (sb.available_qty - COALESCE(sb.reserved_qty,0)) as free_qty,
    CASE WHEN sb.expiry_date IS NOT NULL THEN ROUND(julianday(sb.expiry_date) - julianday('now')) ELSE NULL END as days_remaining
    FROM stock_batches sb
    JOIN produce p ON sb.produce_id = p.id
    JOIN produce_categories pc ON p.category_id = pc.id
    JOIN stores s ON sb.store_id = s.id
    LEFT JOIN suppliers su ON sb.supplier_id = su.id
    WHERE sb.available_qty > 0 AND sb.status = 'available'`).all();
  
  const summary = db.prepare(`SELECT 
    COUNT(DISTINCT produce_id) as unique_products,
    COUNT(id) as active_batches,
    SUM(available_qty) as total_qty,
    SUM(available_qty * cost_price) as total_value,
    SUM(reserved_qty) as total_reserved,
    AVG(cost_price) as avg_cost
    FROM stock_batches WHERE available_qty > 0 AND status = 'available'`).get();

  db.close();
  res.json({ timestamp: new Date().toISOString(), summary, items: batches });
});

// =========================================================================
// STOCK AGING & FRESHNESS ANALYSIS
// =========================================================================

router.get('/aging', (req, res) => {
  const db = getDb();
  const { store_id } = req.query;
  let sql = `SELECT * FROM v_stock_aging WHERE 1=1`;
  const params = [];
  if (store_id) { sql += ` AND store_id = ?`; params.push(store_id); }
  sql += ` ORDER BY category, age_bucket`;
  const items = db.prepare(sql).all(...params);
  
  const bucketSummary = {};
  items.forEach(i => {
    if (!bucketSummary[i.age_bucket]) bucketSummary[i.age_bucket] = { qty: 0, value: 0, count: 0 };
    bucketSummary[i.age_bucket].qty += i.available_qty;
    bucketSummary[i.age_bucket].value += i.stock_value;
    bucketSummary[i.age_bucket].count++;
  });

  const freshnessSummary = {};
  items.forEach(i => {
    if (!freshnessSummary[i.freshness_status]) freshnessSummary[i.freshness_status] = { qty: 0, value: 0, count: 0 };
    freshnessSummary[i.freshness_status].qty += i.available_qty;
    freshnessSummary[i.freshness_status].value += i.stock_value;
    freshnessSummary[i.freshness_status].count++;
  });

  db.close();
  res.json({ items, bucket_summary: bucketSummary, freshness_summary: freshnessSummary });
});

// =========================================================================
// WEIGHT LOSS TRACKING (Fresh produce specific)
// =========================================================================

router.get('/weight-loss', (req, res) => {
  const db = getDb();
  const { store_id, batch_id, produce_id, from, to } = req.query;
  let sql = `SELECT wl.*, p.name as produce_name, s.name as store_name, b.batch_code FROM weight_loss_records wl
    JOIN produce p ON wl.produce_id = p.id
    JOIN stores s ON wl.store_id = s.id
    JOIN stock_batches b ON wl.batch_id = b.id
    WHERE 1=1`;
  const params = [];
  if (store_id) { sql += ` AND wl.store_id = ?`; params.push(store_id); }
  if (batch_id) { sql += ` AND wl.batch_id = ?`; params.push(batch_id); }
  if (produce_id) { sql += ` AND wl.produce_id = ?`; params.push(produce_id); }
  if (from) { sql += ` AND wl.record_date >= ?`; params.push(from); }
  if (to) { sql += ` AND wl.record_date <= ?`; params.push(to); }
  sql += ` ORDER BY wl.record_date DESC LIMIT 200`;
  res.json(db.prepare(sql).all(...params));
  db.close();
});

// =========================================================================
// INVENTORY TURNOVER
// =========================================================================

router.get('/turnover', (req, res) => {
  const db = getDb();
  const { store_id, days } = req.query;
  const d = parseInt(days) || 30;
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - d);
  const start = startDate.toISOString().slice(0,10);

  const results = db.prepare(`
    SELECT sb.produce_id, p.name as produce_name, pc.name as category,
      SUM(CASE WHEN sm.movement_type IN ('sold_retail','sold_hotel') THEN ABS(sm.quantity) ELSE 0 END) as total_sold_qty,
      AVG(sb.cost_price) as avg_cost,
      SUM(CASE WHEN sm.movement_type IN ('sold_retail','sold_hotel') THEN ABS(sm.quantity) * sb.cost_price ELSE 0 END) as cogs,
      (SELECT AVG(available_qty) FROM stock_batches WHERE produce_id = sb.produce_id AND status = 'available') as avg_inventory_qty,
      CASE WHEN (SELECT AVG(available_qty) FROM stock_batches WHERE produce_id = sb.produce_id AND status = 'available') > 0 
        THEN ROUND(SUM(CASE WHEN sm.movement_type IN ('sold_retail','sold_hotel') THEN ABS(sm.quantity) ELSE 0 END) / 
          NULLIF((SELECT AVG(available_qty) FROM stock_batches WHERE produce_id = sb.produce_id AND status = 'available'), 0), 2)
        ELSE 0 END as turnover_ratio,
      (SELECT COUNT(*) FROM stock_batches WHERE produce_id = sb.produce_id AND status = 'available') as current_batches,
      (SELECT SUM(available_qty * cost_price) FROM stock_batches WHERE produce_id = sb.produce_id AND status = 'available') as current_stock_value
    FROM stock_movements sm
    JOIN stock_batches sb ON sm.batch_id = sb.id
    JOIN produce p ON sb.produce_id = p.id
    JOIN produce_categories pc ON p.category_id = pc.id
    WHERE sm.created_at >= ? AND sm.movement_type IN ('sold_retail','sold_hotel')
    GROUP BY sb.produce_id ORDER BY total_sold_qty DESC
  `).all(start);

  db.close();
  res.json({ period_days: d, items: results });
});

// =========================================================================
// TRANSFER MANAGEMENT (Inter-store / Warehouse)
// =========================================================================

router.post('/transfer', (req, res) => {
  const { source_store_id, dest_store_id, items, notes } = req.body;
  if (!source_store_id || !dest_store_id || !items || !items.length) {
    return res.status(400).json({ error: 'Source, destination stores and items required' });
  }
  const db = getDb();
  const transferId = uuidv4();
  const transferNumber = `TRF-${Date.now().toString(36).toUpperCase()}`;
  let totalValue = 0;

  db.prepare(`INSERT INTO transfer_orders (id, transfer_number, source_store_id, dest_store_id, transfer_date, status, total_items, total_value, initiated_by, notes)
    VALUES (?,?,?,?,date('now'),'draft',?,?,?,?)`).run(transferId, transferNumber, source_store_id, dest_store_id, items.length, totalValue, req.user.userId, notes);

  const insertItem = db.prepare(`INSERT INTO transfer_order_items (id, transfer_id, batch_id, produce_id, transfer_qty, unit_cost, total_cost) VALUES (?,?,?,?,?,?,?)`);
  items.forEach(item => {
    const batch = db.prepare(`SELECT * FROM stock_batches WHERE id = ?`).get(item.batch_id);
    if (!batch) { return; }
    const cost = item.unit_cost || batch.cost_price;
    totalValue += item.qty * cost;
    insertItem.run(uuidv4(), transferId, item.batch_id, item.produce_id, item.qty, cost, item.qty * cost);
  });

  db.prepare(`UPDATE transfer_orders SET total_value = ? WHERE id = ?`).run(totalValue, transferId);
  auditLog(req, 'create', 'inventory', 'transfer', transferId, null, { source_store_id, dest_store_id, items: items.length });
  db.close();
  res.json({ id: transferId, transfer_number: transferNumber, message: 'Transfer initiated' });
});

router.put('/transfer/:id/dispatch', (req, res) => {
  const db = getDb();
  const transfer = db.prepare(`SELECT * FROM transfer_orders WHERE id = ?`).get(req.params.id);
  if (!transfer) { db.close(); return res.status(404).json({ error: 'Transfer not found' }); }

  const items = db.prepare(`SELECT * FROM transfer_order_items WHERE transfer_id = ?`).all(req.params.id);
  for (const item of items) {
    const batch = db.prepare(`SELECT * FROM stock_batches WHERE id = ?`).get(item.batch_id);
    if (!batch || batch.available_qty < item.transfer_qty) {
      db.close(); return res.status(400).json({ error: `Insufficient stock for batch ${item.batch_id}` });
    }
    // Deduct from source
    const qtyBefore = batch.available_qty;
    const qtyAfter = qtyBefore - item.transfer_qty;
    db.prepare(`UPDATE stock_batches SET available_qty = ?, status = CASE WHEN ? <= 0 THEN 'exhausted' ELSE status END, updated_at = datetime('now') WHERE id = ?`).run(qtyAfter, qtyAfter, item.batch_id);
    db.prepare(`INSERT INTO stock_movements (id, batch_id, produce_id, store_id, movement_type, quantity, quantity_before, quantity_after, unit_cost, total_value, ref_id, ref_type, notes, created_by)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(uuidv4(), item.batch_id, item.produce_id, transfer.source_store_id, 'transferred_out', -item.transfer_qty, qtyBefore, qtyAfter, item.unit_cost, item.total_cost, req.params.id, 'transfer', `Transfer to ${transfer.dest_store_id}`, req.user.userId);

    // Create/update batch at destination
    const destBatch = db.prepare(`SELECT * FROM stock_batches WHERE produce_id = ? AND store_id = ? AND batch_code = ? AND status = 'available'`).get(item.produce_id, transfer.dest_store_id, `TRF-${item.batch_id.substring(0,8)}`);
    if (destBatch) {
      db.prepare(`UPDATE stock_batches SET available_qty = available_qty + ?, updated_at = datetime('now') WHERE id = ?`).run(item.transfer_qty, destBatch.id);
    } else {
      const newBatchId = uuidv4();
      db.prepare(`INSERT INTO stock_batches (id, batch_code, produce_id, store_id, received_date, expiry_date, received_qty, available_qty, cost_price, grade, status, batch_owner)
        VALUES (?,?,?,?,date('now'),?,?,?,?,?,'available','transit')`).run(newBatchId, `TRF-${item.batch_id.substring(0,8)}`, item.produce_id, transfer.dest_store_id, batch.expiry_date, item.transfer_qty, item.transfer_qty, item.unit_cost, batch.grade || 'B');
    }
    db.prepare(`INSERT INTO stock_movements (id, batch_id, produce_id, store_id, movement_type, quantity, unit_cost, total_value, ref_id, ref_type, notes, created_by)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`).run(uuidv4(), item.batch_id || newBatchId, item.produce_id, transfer.dest_store_id, 'transferred_in', item.transfer_qty, item.unit_cost, item.total_cost, req.params.id, 'transfer', `Transfer from ${transfer.source_store_id}`, req.user.userId);
  }

  db.prepare(`UPDATE transfer_orders SET status = 'dispatched', updated_at = datetime('now') WHERE id = ?`).run(req.params.id);
  auditLog(req, 'update', 'inventory', 'transfer', req.params.id, { status: 'draft' }, { status: 'dispatched' });
  db.close();
  res.json({ message: 'Transfer dispatched' });
});

router.put('/transfer/:id/receive', (req, res) => {
  const db = getDb();
  db.prepare(`UPDATE transfer_orders SET status = 'received', completed_date = date('now'), received_by = ?, updated_at = datetime('now') WHERE id = ?`).run(req.user.userId, req.params.id);
  db.close();
  res.json({ message: 'Transfer received at destination' });
});

router.get('/transfers', (req, res) => {
  const db = getDb();
  const { source_store_id, dest_store_id, status } = req.query;
  let sql = `SELECT to2.*, src.name as source_name, dst.name as dest_name, u.full_name as initiated_by_name FROM transfer_orders to2
    JOIN stores src ON to2.source_store_id = src.id
    JOIN stores dst ON to2.dest_store_id = dst.id
    LEFT JOIN users u ON to2.initiated_by = u.id
    WHERE 1=1`;
  const params = [];
  if (source_store_id) { sql += ` AND to2.source_store_id = ?`; params.push(source_store_id); }
  if (dest_store_id) { sql += ` AND to2.dest_store_id = ?`; params.push(dest_store_id); }
  if (status) { sql += ` AND to2.status = ?`; params.push(status); }
  sql += ` ORDER BY to2.created_at DESC LIMIT 100`;
  const transfers = db.prepare(sql).all(...params);
  db.close();
  res.json(transfers);
});

router.get('/transfers/:id', (req, res) => {
  const db = getDb();
  const transfer = db.prepare(`SELECT to2.*, src.name as source_name, dst.name as dest_name FROM transfer_orders to2
    JOIN stores src ON to2.source_store_id = src.id
    JOIN stores dst ON to2.dest_store_id = dst.id
    WHERE to2.id = ?`).get(req.params.id);
  if (!transfer) { db.close(); return res.status(404).json({ error: 'Transfer not found' }); }
  const items = db.prepare(`SELECT ti.*, p.name as produce_name, p.code as produce_code, b.batch_code, b.grade FROM transfer_order_items ti
    JOIN produce p ON ti.produce_id = p.id
    JOIN stock_batches b ON ti.batch_id = b.id
    WHERE ti.transfer_id = ?`).all(req.params.id);
  db.close();
  res.json({ ...transfer, items });
});

// =========================================================================
// BARCODE / QR / RFID SCANNING (Future-ready)
// =========================================================================

router.post('/scan', (req, res) => {
  const { identifier, identifier_type, produce_id, batch_id, org_unit_id } = req.body;
  if (!identifier) return res.status(400).json({ error: 'Identifier required' });
  const db = getDb();
  
  // Look up the identifier
  const existing = db.prepare(`SELECT * FROM item_identifiers WHERE identifier = ?`).get(identifier);
  if (existing) {
    // Found — return the associated entity
    const batch = existing.batch_id ? db.prepare(`SELECT sb.*, p.name as produce_name FROM stock_batches sb JOIN produce p ON sb.produce_id = p.id WHERE sb.id = ?`).get(existing.batch_id) : null;
    db.close();
    return res.json({ found: true, identifier: existing, batch });
  }

  // Register new identifier
  const id = uuidv4();
  db.prepare(`INSERT INTO item_identifiers (id, identifier, identifier_type, produce_id, batch_id, org_unit_id) VALUES (?,?,?,?,?,?)`).run(id, identifier, identifier_type||'barcode', produce_id, batch_id, org_unit_id);
  auditLog(req, 'create', 'inventory', 'identifier', id, null, { identifier, identifier_type });
  db.close();
  res.json({ found: false, id, message: 'Identifier registered' });
});

router.get('/identifiers', (req, res) => {
  const db = getDb();
  const { identifier_type, produce_id, batch_id } = req.query;
  let sql = `SELECT ii.*, p.name as produce_name, b.batch_code FROM item_identifiers ii
    LEFT JOIN produce p ON ii.produce_id = p.id
    LEFT JOIN stock_batches b ON ii.batch_id = b.id
    WHERE 1=1`;
  const params = [];
  if (identifier_type) { sql += ` AND ii.identifier_type = ?`; params.push(identifier_type); }
  if (produce_id) { sql += ` AND ii.produce_id = ?`; params.push(produce_id); }
  if (batch_id) { sql += ` AND ii.batch_id = ?`; params.push(batch_id); }
  sql += ` ORDER BY ii.created_at DESC`;
  res.json(db.prepare(sql).all(...params));
  db.close();
});

// =========================================================================
// COMPREHENSIVE STOCK LEDGER (Single report for all movements)
// =========================================================================

router.get('/stock-ledger', (req, res) => {
  const db = getDb();
  const { store_id, produce_id, from, to } = req.query;
  const startDate = from || new Date(Date.now() - 30*24*60*60*1000).toISOString().slice(0,10);
  const endDate = to || new Date().toISOString().slice(0,10);

  let sql = `SELECT sm.*, p.name as produce_name, p.code as produce_code, pc.name as category,
    s.name as store_name, b.batch_code, b.grade, b.cost_price,
    CASE WHEN sm.movement_type = 'received' THEN 'IN'
         WHEN sm.movement_type IN ('sold_retail','sold_hotel','transferred_out','wasted','expired','adjusted') THEN 'OUT'
         WHEN sm.movement_type = 'transferred_in' THEN 'IN'
         WHEN sm.movement_type = 'customer_returned' THEN 'IN'
         ELSE 'ADJ' END as direction
    FROM stock_movements sm
    JOIN stock_batches b ON sm.batch_id = b.id
    JOIN produce p ON sm.produce_id = p.id
    JOIN produce_categories pc ON p.category_id = pc.id
    JOIN stores s ON sm.store_id = s.id
    WHERE date(sm.created_at) >= ? AND date(sm.created_at) <= ?`;
  const params = [startDate, endDate];
  if (store_id) { sql += ` AND sm.store_id = ?`; params.push(store_id); }
  if (produce_id) { sql += ` AND sm.produce_id = ?`; params.push(produce_id); }
  sql += ` ORDER BY sm.created_at ASC`;

  const movements = db.prepare(sql).all(...params);
  
  // Compute running balance
  let runningQty = 0;
  const withBalance = movements.map(m => {
    const qty = m.direction === 'IN' ? Math.abs(m.quantity) : m.direction === 'OUT' ? -Math.abs(m.quantity) : 0;
    runningQty += qty;
    return { ...m, running_balance: runningQty, movement_qty: qty };
  });

  const summary = {
    total_in: movements.filter(m => m.direction === 'IN').reduce((s, m) => s + Math.abs(m.quantity), 0),
    total_out: movements.filter(m => m.direction === 'OUT').reduce((s, m) => s + Math.abs(m.quantity), 0),
    opening_balance: withBalance.length > 0 ? withBalance[0].running_balance - withBalance[0].movement_qty : 0,
    closing_balance: runningQty,
    transaction_count: movements.length
  };

  db.close();
  res.json({ period: { from: startDate, to: endDate }, summary, items: withBalance });
});

// =========================================================================
// INVENTORY DASHBOARD (Aggregate KPIs)
// =========================================================================

router.get('/dashboard', (req, res) => {
  const db = getDb();
  const { store_id } = req.query;

  const totalBatches = db.prepare(`SELECT COUNT(*) as count, SUM(available_qty) as qty, SUM(available_qty * cost_price) as value FROM stock_batches WHERE available_qty > 0 AND status = 'available'`).get();
  const totalReserved = db.prepare(`SELECT COALESCE(SUM(quantity),0) as qty FROM stock_reservations WHERE status = 'active'`).get();
  const expiringBatches = db.prepare(`SELECT COUNT(*) as count, COALESCE(SUM(available_qty),0) as qty, COALESCE(SUM(available_qty * cost_price),0) as value FROM stock_batches WHERE available_qty > 0 AND expiry_date IS NOT NULL AND julianday(expiry_date) - julianday('now') BETWEEN 0 AND 2`).get();
  const expiredBatches = db.prepare(`SELECT COUNT(*) as count, COALESCE(SUM(available_qty),0) as qty, COALESCE(SUM(available_qty * cost_price),0) as value FROM stock_batches WHERE available_qty > 0 AND expiry_date IS NOT NULL AND julianday(expiry_date) - julianday('now') < 0`).get();
  const topProducts = db.prepare(`SELECT produce_id, p.name as produce_name, SUM(available_qty) as qty, SUM(available_qty * cost_price) as value FROM stock_batches sb JOIN produce p ON sb.produce_id = p.id WHERE sb.available_qty > 0 AND sb.status = 'available' GROUP BY produce_id ORDER BY value DESC LIMIT 10`).all();
  const stockByCategory = db.prepare(`SELECT pc.name as category, SUM(sb.available_qty) as qty, SUM(sb.available_qty * sb.cost_price) as value FROM stock_batches sb JOIN produce p ON sb.produce_id = p.id JOIN produce_categories pc ON p.category_id = pc.id WHERE sb.available_qty > 0 AND sb.status = 'available' GROUP BY pc.name ORDER BY value DESC`).all();
  const todayMovements = db.prepare(`SELECT movement_type, COUNT(*) as count, SUM(ABS(quantity)) as qty FROM stock_movements WHERE date(created_at) = date('now') GROUP BY movement_type`).all();

  db.close();
  res.json({
    total_batches: totalBatches.count,
    total_qty: totalBatches.qty,
    total_value: totalBatches.value,
    total_reserved_qty: totalReserved.qty,
    expiring: expiringBatches,
    expired: expiredBatches,
    top_products: topProducts,
    stock_by_category: stockByCategory,
    today_movements: todayMovements,
    timestamp: new Date().toISOString()
  });
});

module.exports = router;
