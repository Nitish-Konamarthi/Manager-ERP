const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const { getDb } = require('../middleware/auth');
const { auditLog } = require('../middleware/audit');

// Produce
router.get('/produce', (req, res) => {
  const db = getDb();
  const items = db.prepare(`SELECT p.*, pc.name as category_name, pc.target_waste_pct, pc.min_margin_pct FROM produce p LEFT JOIN produce_categories pc ON p.category_id = pc.id WHERE p.is_active = 1 ORDER BY p.name`).all();
  db.close();
  res.json(items);
});

router.post('/produce', (req, res) => {
  const { code, name, category_id, default_uom, alternate_uom, uom_conversion, hsn_code, is_seasonal, season_start_month, season_end_month } = req.body;
  if (!code || !name || !category_id) return res.status(400).json({ error: 'Code, name and category required' });
  const db = getDb();
  const id = uuidv4();
  db.prepare(`INSERT INTO produce (id, code, name, category_id, default_uom, alternate_uom, uom_conversion, hsn_code, is_seasonal, season_start_month, season_end_month) VALUES (?,?,?,?,?,?,?,?,?,?,?)`).run(id, code, name, category_id, default_uom||'kg', alternate_uom, uom_conversion, hsn_code, is_seasonal||0, season_start_month, season_end_month);
  auditLog(req, 'create', 'masterdata', 'produce', id, null, { code, name });
  db.close();
  res.json({ id, message: 'Produce created' });
});

router.put('/produce/:id', (req, res) => {
  const fields = ['code','name','category_id','default_uom','alternate_uom','uom_conversion','hsn_code','is_seasonal','season_start_month','season_end_month','is_active'];
  const sets = fields.filter(f => req.body[f] !== undefined).map(f => `${f}=?`).join(',');
  if (!sets) return res.status(400).json({ error: 'No fields to update' });
  const vals = fields.filter(f => req.body[f] !== undefined).map(f => req.body[f]);
  vals.push(req.params.id);
  const db = getDb();
  db.prepare(`UPDATE produce SET ${sets} WHERE id=?`).run(...vals);
  auditLog(req, 'update', 'masterdata', 'produce', req.params.id, null, req.body);
  db.close();
  res.json({ message: 'Produce updated' });
});

router.delete('/produce/:id', (req, res) => {
  const db = getDb();
  db.prepare(`UPDATE produce SET is_active=0 WHERE id=?`).run(req.params.id);
  auditLog(req, 'delete', 'masterdata', 'produce', req.params.id);
  db.close();
  res.json({ message: 'Produce deactivated' });
});

// Categories
router.get('/categories', (req, res) => {
  const db = getDb();
  const cats = db.prepare(`SELECT * FROM produce_categories WHERE is_active = 1 ORDER BY name`).all();
  db.close();
  res.json(cats);
});

router.post('/categories', (req, res) => {
  const { name, description, shelf_life_days, storage_temp_min, storage_temp_max, target_waste_pct, min_margin_pct } = req.body;
  if (!name) return res.status(400).json({ error: 'Name required' });
  const db = getDb();
  const id = uuidv4();
  db.prepare(`INSERT INTO produce_categories VALUES (?,?,?,?,?,?,?,?,1)`).run(id, name, description, shelf_life_days, storage_temp_min, storage_temp_max, target_waste_pct||5, min_margin_pct||20);
  db.close();
  res.json({ id, message: 'Category created' });
});

router.put('/categories/:id', (req, res) => {
  const fields = ['name','description','shelf_life_days','storage_temp_min','storage_temp_max','target_waste_pct','min_margin_pct','is_active'];
  const sets = fields.filter(f => req.body[f] !== undefined).map(f => `${f}=?`).join(',');
  if (!sets) return res.status(400).json({ error: 'No fields' });
  const vals = fields.filter(f => req.body[f] !== undefined).map(f => req.body[f]);
  vals.push(req.params.id);
  const db = getDb();
  db.prepare(`UPDATE produce_categories SET ${sets} WHERE id=?`).run(...vals);
  db.close();
  res.json({ message: 'Category updated' });
});

// Stores
router.get('/stores', (req, res) => {
  const db = getDb();
  const stores = db.prepare(`SELECT s.*, u.full_name as manager_name FROM stores s LEFT JOIN users u ON s.manager_id = u.id WHERE s.is_active = 1 ORDER BY s.name`).all();
  db.close();
  res.json(stores);
});

router.post('/stores', (req, res) => {
  const { code, name, address, city, state, pincode, phone, email, gstin, opening_time, closing_time } = req.body;
  if (!code || !name) return res.status(400).json({ error: 'Code and name required' });
  const db = getDb();
  const id = uuidv4();
  db.prepare(`INSERT INTO stores (id, code, name, address, city, state, pincode, phone, email, gstin, opening_time, closing_time) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`).run(id, code, name, address, city, state, pincode, phone, email, gstin, opening_time||'07:00', closing_time||'20:00');
  db.close();
  res.json({ id, message: 'Store created' });
});

router.put('/stores/:id', (req, res) => {
  const fields = ['code','name','address','city','state','pincode','phone','email','gstin','opening_time','closing_time','manager_id','is_active'];
  const sets = fields.filter(f => req.body[f] !== undefined).map(f => `${f}=?`).join(',');
  if (!sets) return res.status(400).json({ error: 'No fields' });
  const vals = fields.filter(f => req.body[f] !== undefined).map(f => req.body[f]);
  vals.push(req.params.id);
  const db = getDb();
  db.prepare(`UPDATE stores SET ${sets} WHERE id=?`).run(...vals);
  db.close();
  res.json({ message: 'Store updated' });
});

// UOM
router.get('/uom', (req, res) => {
  const db = getDb();
  const uoms = db.prepare(`SELECT * FROM units_of_measure ORDER BY name`).all();
  db.close();
  res.json(uoms);
});

module.exports = router;
