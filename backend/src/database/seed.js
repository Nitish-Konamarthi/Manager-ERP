const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, '..', '..', 'data', 'erp.db');
const fs = require('fs');
const dataDir = path.dirname(dbPath);
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

const db = new Database(dbPath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
db.exec(schema);

const passwordHash = bcrypt.hashSync('admin123', 10);

const seed = db.transaction(() => {
  // Roles
  db.prepare(`INSERT OR IGNORE INTO roles (id, name, description) VALUES (?, ?, ?)`).run(
    uuidv4(), 'admin', 'Full system access'
  );
  const roleAdmin = db.prepare(`SELECT id FROM roles WHERE name = 'admin'`).get();
  
  db.prepare(`INSERT OR IGNORE INTO roles (id, name, description) VALUES (?, ?, ?)`).run(
    uuidv4(), 'store_manager', 'Store level management access'
  );
  db.prepare(`INSERT OR IGNORE INTO roles (id, name, description) VALUES (?, ?, ?)`).run(
    uuidv4(), 'cashier', 'Billing and basic operations'
  );
  db.prepare(`INSERT OR IGNORE INTO roles (id, name, description) VALUES (?, ?, ?)`).run(
    uuidv4(), 'accountant', 'Financial operations'
  );
  db.prepare(`INSERT OR IGNORE INTO roles (id, name, description) VALUES (?, ?, ?)`).run(
    uuidv4(), 'driver', 'Delivery operations'
  );

  // Admin user
  const adminUser = db.prepare(`SELECT id FROM users WHERE username = 'admin'`).get();
  if (!adminUser) {
    db.prepare(`INSERT INTO users (id, username, password_hash, full_name, email, role_id, is_active)
      VALUES (?, ?, ?, ?, ?, ?, ?)`).run(
      uuidv4(), 'admin', passwordHash, 'System Administrator', 'admin@managererp.com', roleAdmin.id, 1
    );
  }

  // Stores
  const store1Id = uuidv4();
  const existingStore = db.prepare(`SELECT id FROM stores WHERE code = 'STORE-01'`).get();
  if (!existingStore) {
    db.prepare(`INSERT INTO stores (id, code, name, address, city, state, pincode, phone, opening_time, closing_time)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
      store1Id, 'STORE-01', 'Main Store', '123 Market Road', 'Mumbai', 'Maharashtra', '400001', '9876543210', '07:00', '20:00'
    );
    db.prepare(`INSERT INTO stores (id, code, name, address, city, state, phone, opening_time, closing_time)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
      uuidv4(), 'STORE-02', 'Branch Store', '456 Avenue Road', 'Mumbai', 'Maharashtra', '9876543211', '07:30', '20:00'
    );
  }

  // Produce Categories
  const catCommon = uuidv4();
  const catLeafy = uuidv4();
  const catEnglish = uuidv4();
  const catMushroom = uuidv4();
  const catFruit = uuidv4();
  
  const existingCat = db.prepare(`SELECT id FROM produce_categories WHERE name = 'Common Vegetables'`).get();
  if (!existingCat) {
    db.prepare(`INSERT INTO produce_categories (id, name, description, shelf_life_days, storage_temp_min, storage_temp_max, target_waste_pct, min_margin_pct)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run(catCommon, 'Common Vegetables', 'Onion, Potato, Tomato, Brinjal etc.', 7, 10, 30, 5, 20);
    db.prepare(`INSERT INTO produce_categories (id, name, description, shelf_life_days, storage_temp_min, storage_temp_max, target_waste_pct, min_margin_pct)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run(catLeafy, 'Leafy Greens', 'Spinach, Coriander, Lettuce, Methi', 2, 2, 8, 8, 25);
    db.prepare(`INSERT INTO produce_categories (id, name, description, shelf_life_days, storage_temp_min, storage_temp_max, target_waste_pct, min_margin_pct)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run(catEnglish, 'English Vegetables', 'Broccoli, Zucchini, Bell Pepper, Cabbage', 7, 4, 12, 3, 40);
    db.prepare(`INSERT INTO produce_categories (id, name, description, shelf_life_days, storage_temp_min, storage_temp_max, target_waste_pct, min_margin_pct)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run(catMushroom, 'Mushrooms', 'Button, Oyster, Shiitake', 4, 1, 4, 5, 40);
    db.prepare(`INSERT INTO produce_categories (id, name, description, shelf_life_days, storage_temp_min, storage_temp_max, target_waste_pct, min_margin_pct)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run(catFruit, 'Fruits', 'Seasonal and imported fruits', 5, 8, 15, 6, 25);
  }

  // Produce Items
  const existingProduce = db.prepare(`SELECT id FROM produce WHERE code = 'TOM'`).get();
  if (!existingProduce) {
    const cats = db.prepare(`SELECT id, name FROM produce_categories`).all();
    const catMap = {};
    cats.forEach(c => { catMap[c.name] = c.id; });

    const items = [
      ['TOM', 'Tomato', catMap['Common Vegetables'], 'kg', 'piece', 0.08, '0702'],
      ['POT', 'Potato', catMap['Common Vegetables'], 'kg', null, null, '0701'],
      ['ONN', 'Onion', catMap['Common Vegetables'], 'kg', null, null, '0703'],
      ['BRJ', 'Brinjal', catMap['Common Vegetables'], 'kg', 'piece', 0.15, '0709'],
      ['SPN', 'Spinach', catMap['Leafy Greens'], 'bunch', 'kg', 0.25, '0709'],
      ['COR', 'Coriander', catMap['Leafy Greens'], 'bunch', 'kg', 0.1, '0709'],
      ['LET', 'Lettuce', catMap['Leafy Greens'], 'piece', 'kg', 0.3, '0705'],
      ['BRO', 'Broccoli', catMap['English Vegetables'], 'piece', 'kg', 0.25, '0704'],
      ['ZUC', 'Zucchini', catMap['English Vegetables'], 'kg', 'piece', 0.2, '0709'],
      ['CAP', 'Capsicum', catMap['English Vegetables'], 'kg', 'piece', 0.12, '0709'],
      ['CAB', 'Cabbage', catMap['English Vegetables'], 'piece', 'kg', 0.5, '0704'],
      ['BTN', 'Button Mushroom', catMap['Mushrooms'], 'kg', null, null, '0709'],
      ['OYS', 'Oyster Mushroom', catMap['Mushrooms'], 'kg', null, null, '0709'],
      ['APL', 'Apple', catMap['Fruits'], 'kg', 'piece', 0.2, '0808'],
      ['BNN', 'Banana', catMap['Fruits'], 'dozen', 'piece', 12, '0803'],
      ['GRP', 'Grapes', catMap['Fruits'], 'kg', null, null, '0806'],
    ];

    const insert = db.prepare(`INSERT INTO produce (id, code, name, category_id, default_uom, alternate_uom, uom_conversion, hsn_code)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`);
    items.forEach(item => insert.run(uuidv4(), ...item));
  }

  // Expense Categories
  const existingExpCat = db.prepare(`SELECT id FROM expense_categories WHERE name = 'Transport'`).get();
  if (!existingExpCat) {
    db.prepare(`INSERT INTO expense_categories (id, name, description) VALUES (?, ?, ?)`).run(uuidv4(), 'Transport', 'Delivery vehicle fuel, driver wages');
    db.prepare(`INSERT INTO expense_categories (id, name, description) VALUES (?, ?, ?)`).run(uuidv4(), 'Packaging', 'Polybags, crates, stickers, rubber bands');
    db.prepare(`INSERT INTO expense_categories (id, name, description) VALUES (?, ?, ?)`).run(uuidv4(), 'Utilities', 'Electricity, water, phone, internet');
    db.prepare(`INSERT INTO expense_categories (id, name, description) VALUES (?, ?, ?)`).run(uuidv4(), 'Labour', 'Casual workers, loading/unloading');
    db.prepare(`INSERT INTO expense_categories (id, name, description) VALUES (?, ?, ?)`).run(uuidv4(), 'Maintenance', 'Store fixtures, scales, equipment repairs');
    db.prepare(`INSERT INTO expense_categories (id, name, description) VALUES (?, ?, ?)`).run(uuidv4(), 'Stationery', 'Billing books, pens, labels, printing');
    db.prepare(`INSERT INTO expense_categories (id, name, description) VALUES (?, ?, ?)`).run(uuidv4(), 'Miscellaneous', 'Tea, cleaning, sundry');
  }

  // Settings
  const existingSetting = db.prepare(`SELECT id FROM settings WHERE setting_key = 'company_name'`).get();
  if (!existingSetting) {
    db.prepare(`INSERT INTO settings (id, setting_key, setting_value, setting_type, category, description) VALUES (?, ?, ?, ?, ?, ?)`).run(uuidv4(), 'company_name', 'Manager ERP Fresh Produce', 'string', 'general', 'Company/Business Name');
    db.prepare(`INSERT INTO settings (id, setting_key, setting_value, setting_type, category, description) VALUES (?, ?, ?, ?, ?, ?)`).run(uuidv4(), 'currency', 'INR', 'string', 'general', 'Default currency');
    db.prepare(`INSERT INTO settings (id, setting_key, setting_value, setting_type, category, description) VALUES (?, ?, ?, ?, ?, ?)`).run(uuidv4(), 'tax_rate', '5', 'number', 'tax', 'Default GST rate (%)');
    db.prepare(`INSERT INTO settings (id, setting_key, setting_value, setting_type, category, description) VALUES (?, ?, ?, ?, ?, ?)`).run(uuidv4(), 'default_margin', '25', 'number', 'pricing', 'Default target margin (%)');
    db.prepare(`INSERT INTO settings (id, setting_key, setting_value, setting_type, category, description) VALUES (?, ?, ?, ?, ?, ?)`).run(uuidv4(), 'waste_alert_threshold', '10', 'number', 'alerts', 'Waste % alert threshold');
    db.prepare(`INSERT INTO settings (id, setting_key, setting_value, setting_type, category, description) VALUES (?, ?, ?, ?, ?, ?)`).run(uuidv4(), 'low_stock_threshold', '20', 'number', 'alerts', 'Low stock alert threshold (kg)');
    db.prepare(`INSERT INTO settings (id, setting_key, setting_value, setting_type, category, description) VALUES (?, ?, ?, ?, ?, ?)`).run(uuidv4(), 'credit_limit_default', '50000', 'number', 'credit', 'Default credit limit for new hotel accounts');
    db.prepare(`INSERT INTO settings (id, setting_key, setting_value, setting_type, category, description) VALUES (?, ?, ?, ?, ?, ?)`).run(uuidv4(), 'credit_days_default', '15', 'number', 'credit', 'Default credit period (days)');
  }

  // Sample Supplier
  const existingSupplier = db.prepare(`SELECT id FROM suppliers WHERE code = 'SUP-001'`).get();
  if (!existingSupplier) {
    db.prepare(`INSERT INTO suppliers (id, code, name, contact_person, phone, city, payment_terms, credit_days) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run(uuidv4(), 'SUP-001', 'Mumbai Mandi Traders', 'Rajesh Patel', '9876500001', 'Mumbai', 'COD', 0);
    db.prepare(`INSERT INTO suppliers (id, code, name, contact_person, phone, city, payment_terms, credit_days) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run(uuidv4(), 'SUP-002', 'Fresh Farm Produce', 'Suresh Kumar', '9876500002', 'Nashik', 'weekly', 7);
    db.prepare(`INSERT INTO suppliers (id, code, name, contact_person, phone, city, payment_terms, credit_days) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run(uuidv4(), 'SUP-003', 'Green Valley Mushrooms', 'Amit Shah', '9876500003', 'Mumbai', 'monthly', 15);
  }

  // Sample Hotel Customer
  const existingCustomer = db.prepare(`SELECT id FROM customers WHERE code = 'HTL-001'`).get();
  if (!existingCustomer) {
    db.prepare(`INSERT INTO customers (id, code, name, phone, customer_type, gstin, credit_limit, credit_days) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run(uuidv4(), 'HTL-001', 'Hotel Taj Palace', '9876600001', 'hotel', '27AABCU1234D1Z5', 100000, 30);
    db.prepare(`INSERT INTO customers (id, code, name, phone, customer_type, gstin, credit_limit, credit_days) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run(uuidv4(), 'HTL-002', 'Radisson Blu', '9876600002', 'hotel', '27AABCU5678E1Z5', 75000, 15);
    db.prepare(`INSERT INTO customers (id, code, name, phone, customer_type, credit_limit, credit_days) VALUES (?, ?, ?, ?, ?, ?, ?)`).run(uuidv4(), 'RET-001', 'Regular Walk-in', '9876600003', 'retail', 0, 0);
  }

  // Permissions
  const adminRole = db.prepare(`SELECT id FROM roles WHERE name = 'admin'`).get();
  const existingPerm = adminRole ? db.prepare(`SELECT id FROM permissions WHERE role_id = ? AND module = 'dashboard'`).get(adminRole.id) : null;
  if (!existingPerm && adminRole) {
    const modules = ['dashboard', 'masterdata', 'inventory', 'sales', 'procurement', 'finance', 
      'expenses', 'customers', 'suppliers', 'vehicles', 'reports', 'analytics', 
      'notifications', 'settings', 'audit', 'iam'];
    
    const insert = db.prepare(`INSERT INTO permissions (id, role_id, module, can_read, can_create, can_update, can_delete, can_approve)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`);
    modules.forEach(m => insert.run(uuidv4(), adminRole.id, m, 1, 1, 1, 1, 1));

    const smRole = db.prepare(`SELECT id FROM roles WHERE name = 'store_manager'`).get();
    if (smRole) {
      const smModules = ['dashboard', 'masterdata', 'inventory', 'sales', 'procurement', 'expenses', 'customers', 'suppliers', 'notifications'];
      smModules.forEach(m => insert.run(uuidv4(), smRole.id, m, 1, 1, 1, 0, 0));
    }
  }
});

seed();
console.log('Database seeded successfully!');
db.close();
