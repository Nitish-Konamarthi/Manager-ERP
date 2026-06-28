const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const path = require('path');
const fs = require('fs');

const { authenticate } = require('./middleware/auth');

const app = express();
const PORT = process.env.PORT || 3042;

// Ensure data directory
const dataDir = path.join(__dirname, '..', 'data');
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

// Initialize database
const Database = require('better-sqlite3');
const dbPath = path.join(dataDir, 'erp.db');
const dbExists = fs.existsSync(dbPath) && fs.statSync(dbPath).size > 100;
const initDb = new Database(dbPath);
initDb.pragma('journal_mode = WAL');
initDb.pragma('foreign_keys = ON');

if (!dbExists) {
  const schema = fs.readFileSync(path.join(__dirname, 'database', 'schema.sql'), 'utf8');
  initDb.exec(schema);
  require('./database/seed');
}

const migrationV2 = path.join(__dirname, 'database', 'migration_inventory_v2.sql');
const migrationAcc = path.join(__dirname, 'database', 'migration_accounting.sql');

// Helper: safely run a migration SQL file, tolerating ALTER TABLE errors
function safeMigrate(db, filePath, label) {
  if (!fs.existsSync(filePath)) return;
  const migSql = fs.readFileSync(filePath, 'utf8');
  // Split on semicolons to execute statement-by-statement
  const statements = migSql.split(';').map(s => s.trim()).filter(s => s);
  let count = 0;
  for (const stmt of statements) {
    try {
      db.exec(stmt + ';');
      count++;
    } catch (e) {
      // Ignore ALTER TABLE errors (duplicate column, etc.)
      if (stmt.toUpperCase().includes('ALTER TABLE')) {
        console.warn(`  [${label}] Skipped: ${e.message.substring(0, 80)}`);
      } else {
        throw e; // Re-throw non-ALTER errors
      }
    }
  }
  console.log(`${label} applied (${count} statements)`);
}

safeMigrate(initDb, migrationV2, 'Inventory v2 migration');
safeMigrate(initDb, migrationAcc, 'Accounting migration');
initDb.close();

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(morgan('dev'));

// Static files
app.use(express.static(path.join(__dirname, '..', 'public')));

// Public routes
const authRoutes = require('./routes/auth');
app.use('/api/auth', authRoutes);

// Protected routes
app.use('/api/*', authenticate);

const routes = [
  'dashboard', 'masterdata', 'inventory', 'sales', 'procurement', 'finance',
  'accounting', 'expenses', 'customers', 'suppliers', 'vehicles', 'reports', 'analytics',
  'notifications', 'settings', 'audit', 'iam'
];

routes.forEach(route => {
  try {
    app.use(`/api/${route}`, require(`./routes/${route}`));
  } catch (e) {
    console.warn(`Route /api/${route} not loaded: ${e.message}`);
  }
});

// SPA fallback
app.get('*', (req, res) => {
  const indexPath = path.join(__dirname, '..', 'public', 'index.html');
  if (fs.existsSync(indexPath)) {
    res.sendFile(indexPath);
  } else {
    res.json({ message: 'Manager ERP API', version: '1.0.0', status: 'running' });
  }
});

app.listen(PORT, () => {
  console.log(`Manager ERP Backend running on http://localhost:${PORT}`);
});
