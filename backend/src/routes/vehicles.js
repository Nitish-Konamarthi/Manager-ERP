const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const { getDb } = require('../middleware/auth');
const { auditLog } = require('../middleware/audit');

router.get('/', (req, res) => {
  const db = getDb();
  const { status } = req.query;
  let sql = `SELECT v.*, u.full_name as driver_name FROM vehicles v LEFT JOIN users u ON v.assigned_driver = u.id WHERE 1=1`;
  const params = [];
  if (status) { sql += ` AND v.status = ?`; params.push(status); }
  sql += ` ORDER BY v.registration_no`;
  res.json(db.prepare(sql).all(...params));
  db.close();
});

router.post('/', (req, res) => {
  const { registration_no, vehicle_type, make, model, year, capacity_kg, has_temperature_control, insurance_expiry, notes } = req.body;
  if (!registration_no) return res.status(400).json({ error: 'Registration number required' });
  const db = getDb();
  const id = uuidv4();
  db.prepare(`INSERT INTO vehicles (id, registration_no, vehicle_type, make, model, year, capacity_kg, has_temperature_control, insurance_expiry, notes)
    VALUES (?,?,?,?,?,?,?,?,?,?)`).run(id, registration_no, vehicle_type||'delivery_van', make, model, year, capacity_kg, has_temperature_control||0, insurance_expiry, notes);
  db.close();
  res.json({ id, message: 'Vehicle created' });
});

router.put('/:id', (req, res) => {
  const fields = ['registration_no','vehicle_type','make','model','year','capacity_kg','has_temperature_control','insurance_expiry','last_maintenance_date','status','assigned_driver','notes'];
  const sets = fields.filter(f => req.body[f] !== undefined).map(f => `${f}=?`).join(',');
  if (!sets) return res.status(400).json({ error: 'No fields' });
  const vals = fields.filter(f => req.body[f] !== undefined).map(f => req.body[f]);
  vals.push(req.params.id);
  const db = getDb();
  db.prepare(`UPDATE vehicles SET ${sets} WHERE id=?`).run(...vals);
  db.close();
  res.json({ message: 'Vehicle updated' });
});

// Trips
router.get('/trips', (req, res) => {
  const db = getDb();
  const { vehicle_id, driver_id, from, to } = req.query;
  let sql = `SELECT vt.*, v.registration_no, u.full_name as driver_name FROM vehicle_trips vt JOIN vehicles v ON vt.vehicle_id = v.id LEFT JOIN users u ON vt.driver_id = u.id WHERE 1=1`;
  const params = [];
  if (vehicle_id) { sql += ` AND vt.vehicle_id = ?`; params.push(vehicle_id); }
  if (driver_id) { sql += ` AND vt.driver_id = ?`; params.push(driver_id); }
  if (from) { sql += ` AND vt.trip_date >= ?`; params.push(from); }
  if (to) { sql += ` AND vt.trip_date <= ?`; params.push(to); }
  sql += ` ORDER BY vt.trip_date DESC LIMIT 100`;
  res.json(db.prepare(sql).all(...params));
  db.close();
});

router.post('/trips', (req, res) => {
  const { vehicle_id, driver_id, trip_date, start_odometer, route_description, notes } = req.body;
  if (!vehicle_id) return res.status(400).json({ error: 'Vehicle required' });
  const db = getDb();
  const id = uuidv4();
  const tripNumber = `TRIP-${Date.now().toString(36).toUpperCase()}`;
  db.prepare(`INSERT INTO vehicle_trips (id, trip_number, vehicle_id, driver_id, trip_date, start_odometer, route_description, status, notes)
    VALUES (?,?,?,?,?,?,?,'planned',?)`).run(id, tripNumber, vehicle_id, driver_id||null, trip_date||new Date().toISOString().slice(0,10), start_odometer, route_description, notes);
  db.close();
  res.json({ id, message: 'Trip created' });
});

router.put('/trips/:id/complete', (req, res) => {
  const { end_odometer } = req.body;
  const db = getDb();
  const trip = db.prepare(`SELECT * FROM vehicle_trips WHERE id = ?`).get(req.params.id);
  if (!trip) { db.close(); return res.status(404).json({ error: 'Trip not found' }); }
  const totalKm = end_odometer - trip.start_odometer;
  db.prepare(`UPDATE vehicle_trips SET end_odometer=?, total_km=?, status='completed' WHERE id=?`).run(end_odometer, totalKm, req.params.id);
  db.close();
  res.json({ message: 'Trip completed', total_km: totalKm });
});

// Vehicle Expenses
router.get('/expenses', (req, res) => {
  const db = getDb();
  const { vehicle_id, expense_type, from, to } = req.query;
  let sql = `SELECT ve.*, v.registration_no FROM vehicle_expenses ve JOIN vehicles v ON ve.vehicle_id = v.id WHERE 1=1`;
  const params = [];
  if (vehicle_id) { sql += ` AND ve.vehicle_id = ?`; params.push(vehicle_id); }
  if (expense_type) { sql += ` AND ve.expense_type = ?`; params.push(expense_type); }
  if (from) { sql += ` AND ve.expense_date >= ?`; params.push(from); }
  if (to) { sql += ` AND ve.expense_date <= ?`; params.push(to); }
  sql += ` ORDER BY ve.expense_date DESC LIMIT 200`;
  res.json(db.prepare(sql).all(...params));
  db.close();
});

router.post('/expenses', (req, res) => {
  const { vehicle_id, trip_id, expense_type, expense_date, amount, quantity, unit_price, odometer_reading, bill_number, vendor_name, description, notes } = req.body;
  if (!vehicle_id || !expense_type || !amount) return res.status(400).json({ error: 'Vehicle, expense type and amount required' });
  const db = getDb();
  const id = uuidv4();
  db.prepare(`INSERT INTO vehicle_expenses (id, vehicle_id, trip_id, expense_type, expense_date, amount, quantity, unit_price, odometer_reading, bill_number, vendor_name, description, notes, created_by)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(id, vehicle_id, trip_id||null, expense_type, expense_date||new Date().toISOString().slice(0,10), amount, quantity, unit_price, odometer_reading, bill_number, vendor_name, description, notes, req.user.userId);
  db.close();
  res.json({ id, message: 'Vehicle expense recorded' });
});

// Maintenance
router.get('/maintenance', (req, res) => {
  const db = getDb();
  const { vehicle_id, status } = req.query;
  let sql = `SELECT vm.*, v.registration_no FROM vehicle_maintenance vm JOIN vehicles v ON vm.vehicle_id = v.id WHERE 1=1`;
  const params = [];
  if (vehicle_id) { sql += ` AND vm.vehicle_id = ?`; params.push(vehicle_id); }
  if (status) { sql += ` AND vm.status = ?`; params.push(status); }
  sql += ` ORDER BY vm.service_date DESC LIMIT 100`;
  res.json(db.prepare(sql).all(...params));
  db.close();
});

router.post('/maintenance', (req, res) => {
  const { vehicle_id, maintenance_type, service_date, odometer_reading, description, amount, vendor_name, bill_number, next_service_km, next_service_date, notes } = req.body;
  if (!vehicle_id || !description || !amount) return res.status(400).json({ error: 'Vehicle, description and amount required' });
  const db = getDb();
  const id = uuidv4();
  db.prepare(`INSERT INTO vehicle_maintenance (id, vehicle_id, maintenance_type, service_date, odometer_reading, description, amount, vendor_name, bill_number, next_service_km, next_service_date, notes)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`).run(id, vehicle_id, maintenance_type||'scheduled', service_date||new Date().toISOString().slice(0,10), odometer_reading, description, amount, vendor_name, bill_number, next_service_km, next_service_date, notes);
  db.close();
  res.json({ id, message: 'Maintenance record created' });
});

// Vehicle Summary
router.get('/summary/:id', (req, res) => {
  const db = getDb();
  const vehicle = db.prepare(`SELECT * FROM vehicles WHERE id = ?`).get(req.params.id);
  if (!vehicle) { db.close(); return res.status(404).json({ error: 'Vehicle not found' }); }
  const fuelCost = db.prepare(`SELECT COALESCE(SUM(amount),0) as total FROM vehicle_expenses WHERE vehicle_id=? AND expense_type='fuel' AND expense_date >= date('now', '-30 days')`).get(req.params.id);
  const totalKm = db.prepare(`SELECT COALESCE(SUM(total_km),0) as total FROM vehicle_trips WHERE vehicle_id=? AND trip_date >= date('now', '-30 days') AND status='completed'`).get(req.params.id);
  const maintCost = db.prepare(`SELECT COALESCE(SUM(amount),0) as total FROM vehicle_maintenance WHERE vehicle_id=? AND service_date >= date('now', '-30 days')`).get(req.params.id);
  const lastTrip = db.prepare(`SELECT * FROM vehicle_trips WHERE vehicle_id=? ORDER BY trip_date DESC LIMIT 1`).get(req.params.id);
  const nextService = db.prepare(`SELECT * FROM vehicle_maintenance WHERE vehicle_id=? AND status='completed' ORDER BY service_date DESC LIMIT 1`).get(req.params.id);
  db.close();
  res.json({
    vehicle,
    fuel_cost_30d: fuelCost.total,
    total_km_30d: totalKm.total,
    maintenance_cost_30d: maintCost.total,
    cost_per_km: totalKm.total > 0 ? (fuelCost.total / totalKm.total).toFixed(2) : 0,
    last_trip: lastTrip,
    next_service: nextService
  });
});

module.exports = router;
