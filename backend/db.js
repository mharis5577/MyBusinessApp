import sqlite3 from 'sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const dataDir = path.join(__dirname, 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const dbPath = path.join(dataDir, 'bills.db');
const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('Error opening database:', err.message);
  } else {
    console.log('Connected to SQLite database at:', dbPath);
    initTables();
  }
});

function initTables() {
  db.serialize(() => {
    // Settings Table
    db.run(`
      CREATE TABLE IF NOT EXISTS settings (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        company_name TEXT DEFAULT 'ELITE CHOCOLATE',
        company_email TEXT DEFAULT 'm.haris676@gmail.com',
        company_phone TEXT DEFAULT '+923337669709',
        company_address TEXT DEFAULT 'House No 107E, ST 13, Mehria Town, Attock',
        company_tax_id TEXT DEFAULT '3110471785257',
        logo_url TEXT DEFAULT '',
        currency_symbol TEXT DEFAULT 'Rs.',
        default_tax_rate REAL DEFAULT 0.0,
        bank_name TEXT DEFAULT 'Meezan Bank / HBL',
        account_title TEXT DEFAULT 'ELITE CHOCOLATE',
        account_number TEXT DEFAULT '03337669709',
        mobile_wallet TEXT DEFAULT '03337669709 (Raast / JazzCash / EasyPaisa)',
        payment_instructions TEXT DEFAULT 'Please share payment screenshot on WhatsApp +923337669709',
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Column Migration Helpers for existing DB files
    const columnsToAdd = [
      { name: 'bank_name', type: 'TEXT DEFAULT "Meezan Bank / HBL"' },
      { name: 'account_title', type: 'TEXT DEFAULT "ELITE CHOCOLATE"' },
      { name: 'account_number', type: 'TEXT DEFAULT "03337669709"' },
      { name: 'mobile_wallet', type: 'TEXT DEFAULT "03337669709 (Raast / JazzCash / EasyPaisa)"' },
      { name: 'payment_instructions', type: 'TEXT DEFAULT "Please share payment screenshot on WhatsApp +923337669709"' },
      { name: 'app_pin', type: 'TEXT DEFAULT ""' },
      { name: 'urdu_labels', type: 'INTEGER DEFAULT 0' },
      { name: 'low_stock_threshold', type: 'INTEGER DEFAULT 5' },
      { name: 'biometric_lock', type: 'INTEGER DEFAULT 0' },
      { name: 'due_reminders', type: 'INTEGER DEFAULT 0' },
      { name: 'payment_methods', type: 'TEXT DEFAULT "[]"' },
      { name: 'show_developer_credit', type: 'INTEGER DEFAULT 1' },
    ];

    columnsToAdd.forEach((col) => {
      db.run(`ALTER TABLE settings ADD COLUMN ${col.name} ${col.type}`, () => {});
    });

    // Ensure initial settings row exists (do NOT overwrite user edits on every restart)
    db.get('SELECT * FROM settings LIMIT 1', [], (err, row) => {
      if (err) return;
      if (!row) {
        db.run(`
          INSERT INTO settings (company_name, company_email, company_phone, company_address, company_tax_id, currency_symbol, default_tax_rate, bank_name, account_title, account_number, mobile_wallet, payment_instructions)
          VALUES ('ELITE CHOCOLATE', 'm.haris676@gmail.com', '+923337669709', 'House No 107E, ST 13, Mehria Town, Attock', '3110471785257', 'Rs.', 0.0, 'Meezan Bank / HBL', 'ELITE CHOCOLATE', '03337669709', '03337669709 (Raast / JazzCash / EasyPaisa)', 'Please share payment screenshot on WhatsApp +923337669709')
        `);
        return;
      }
      // One-time fill for empty / old placeholder contact fields only
      db.run(
        `UPDATE settings SET
          company_email = CASE WHEN company_email IS NULL OR TRIM(company_email) = '' OR company_email = 'info@elitechocolate.pk' THEN 'm.haris676@gmail.com' ELSE company_email END,
          company_phone = CASE WHEN company_phone IS NULL OR TRIM(company_phone) = '' THEN '+923337669709' ELSE company_phone END,
          company_tax_id = CASE WHEN company_tax_id IS NULL OR TRIM(company_tax_id) = '' OR company_tax_id = 'PK-NTN-889911' THEN '3110471785257' ELSE company_tax_id END
         WHERE id = ?`,
        [row.id]
      );
    });

    // Customers Table
    db.run(`
      CREATE TABLE IF NOT EXISTS customers (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        email TEXT,
        phone TEXT,
        address TEXT,
        tax_id TEXT,
        payee_bank_name TEXT DEFAULT '',
        payee_account_title TEXT DEFAULT '',
        payee_account_number TEXT DEFAULT '',
        payee_payment_notes TEXT DEFAULT '',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);
    db.run(`ALTER TABLE customers ADD COLUMN payee_bank_name TEXT DEFAULT ''`, () => {});
    db.run(`ALTER TABLE customers ADD COLUMN payee_account_title TEXT DEFAULT ''`, () => {});
    db.run(`ALTER TABLE customers ADD COLUMN payee_account_number TEXT DEFAULT ''`, () => {});
    db.run(`ALTER TABLE customers ADD COLUMN payee_payment_notes TEXT DEFAULT ''`, () => {});
    db.run(`ALTER TABLE customers ADD COLUMN party_type TEXT DEFAULT 'customer'`, () => {
      // One-time backfill: parties that only appear on supplier bills → supplier
      db.run(
        `UPDATE customers SET party_type = 'supplier'
         WHERE COALESCE(NULLIF(TRIM(party_type), ''), 'customer') = 'customer'
           AND EXISTS (
             SELECT 1 FROM bills b
             WHERE LOWER(TRIM(b.customer_name)) = LOWER(TRIM(customers.name))
               AND b.bill_type = 'supplier'
           )
           AND NOT EXISTS (
             SELECT 1 FROM bills b2
             WHERE LOWER(TRIM(b2.customer_name)) = LOWER(TRIM(customers.name))
               AND COALESCE(b2.bill_type, 'customer') != 'supplier'
           )`
      );
    });

    // Products / Services Catalog Table
    db.run(`
      CREATE TABLE IF NOT EXISTS products (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        description TEXT,
        price REAL NOT NULL DEFAULT 0.0,
        unit TEXT DEFAULT 'item',
        stock INTEGER DEFAULT 100,
        sku TEXT DEFAULT '',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);
    db.run(`ALTER TABLE products ADD COLUMN sku TEXT DEFAULT ''`, () => {});
    db.run(`ALTER TABLE products ADD COLUMN cost_price REAL DEFAULT 0.0`, () => {});

    // Bills Table
    db.run(`
      CREATE TABLE IF NOT EXISTS bills (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        bill_type TEXT DEFAULT 'customer',
        invoice_number TEXT UNIQUE NOT NULL,
        customer_name TEXT NOT NULL,
        customer_email TEXT,
        customer_phone TEXT,
        customer_address TEXT,
        bill_date TEXT NOT NULL,
        due_date TEXT NOT NULL,
        subtotal REAL NOT NULL DEFAULT 0.0,
        tax_rate REAL DEFAULT 0.0,
        tax_amount REAL DEFAULT 0.0,
        discount_rate REAL DEFAULT 0.0,
        discount_amount REAL DEFAULT 0.0,
        total_amount REAL NOT NULL DEFAULT 0.0,
        amount_paid REAL DEFAULT 0.0,
        status TEXT DEFAULT 'pending',
        notes TEXT,
        payment_method TEXT DEFAULT 'Bank Transfer / Raast / Cash',
        bank_details TEXT,
        payee_bank_name TEXT DEFAULT '',
        payee_account_title TEXT DEFAULT '',
        payee_account_number TEXT DEFAULT '',
        payee_payment_notes TEXT DEFAULT '',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Migration helpers
    db.run(`ALTER TABLE bills ADD COLUMN bill_type TEXT DEFAULT 'customer'`, () => {});
    db.run(`ALTER TABLE bills ADD COLUMN amount_paid REAL DEFAULT 0.0`, () => {});
    db.run(`ALTER TABLE bills ADD COLUMN payee_bank_name TEXT DEFAULT ''`, () => {});
    db.run(`ALTER TABLE bills ADD COLUMN payee_account_title TEXT DEFAULT ''`, () => {});
    db.run(`ALTER TABLE bills ADD COLUMN payee_account_number TEXT DEFAULT ''`, () => {});
    db.run(`ALTER TABLE bills ADD COLUMN payee_payment_notes TEXT DEFAULT ''`, () => {});
    db.run(`ALTER TABLE bills ADD COLUMN cancel_reason TEXT DEFAULT ''`, () => {});
    db.run(`ALTER TABLE bills ADD COLUMN cancelled_at TEXT DEFAULT ''`, () => {});
    db.run(`ALTER TABLE bills ADD COLUMN bill_time TEXT DEFAULT ''`, () => {});

    // Bill Items Table
    db.run(`
      CREATE TABLE IF NOT EXISTS bill_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        bill_id INTEGER NOT NULL,
        product_id INTEGER,
        description TEXT NOT NULL,
        quantity INTEGER NOT NULL DEFAULT 1,
        unit_price REAL NOT NULL DEFAULT 0.0,
        total REAL NOT NULL DEFAULT 0.0,
        FOREIGN KEY (bill_id) REFERENCES bills(id) ON DELETE CASCADE
      )
    `);

    // Bill partial payments
    db.run(`
      CREATE TABLE IF NOT EXISTS bill_payments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        bill_id INTEGER NOT NULL,
        amount REAL NOT NULL DEFAULT 0.0,
        method TEXT DEFAULT 'Cash',
        payment_date TEXT NOT NULL,
        notes TEXT,
        screenshot_data TEXT DEFAULT '',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (bill_id) REFERENCES bills(id) ON DELETE CASCADE
      )
    `);
    db.run(`ALTER TABLE bill_payments ADD COLUMN screenshot_data TEXT DEFAULT ''`, () => {});
    db.run(`ALTER TABLE bill_payments ADD COLUMN screenshot_path TEXT DEFAULT ''`, () => {});
    db.run(`ALTER TABLE bill_payments ADD COLUMN screenshot_thumb TEXT DEFAULT ''`, () => {});
    db.run(`ALTER TABLE bill_items ADD COLUMN returned_qty INTEGER DEFAULT 0`, () => {});

    // Advance Payments Table
    db.run(`
      CREATE TABLE IF NOT EXISTS advance_payments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        amount REAL NOT NULL DEFAULT 0.0,
        remaining REAL,
        payment_date TEXT NOT NULL,
        client_name TEXT,
        notes TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);
    db.run(`ALTER TABLE advance_payments ADD COLUMN remaining REAL`, () => {
      db.run(
        `UPDATE advance_payments SET remaining = amount WHERE remaining IS NULL`
      );
    });

    // Customer Product Rates Table
    db.run(`
      CREATE TABLE IF NOT EXISTS customer_product_rates (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        customer_id INTEGER NOT NULL,
        product_id INTEGER NOT NULL,
        custom_price REAL NOT NULL DEFAULT 0.0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(customer_id, product_id)
      )
    `);

    // Stock adjustment log
    db.run(`
      CREATE TABLE IF NOT EXISTS stock_adjustments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        product_id INTEGER NOT NULL,
        delta INTEGER NOT NULL,
        reason TEXT DEFAULT 'adjustment',
        notes TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
      )
    `);
  });
}

// Helper promised database queries
export function dbAll(query, params = []) {
  return new Promise((resolve, reject) => {
    db.all(query, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
}

export function dbGet(query, params = []) {
  return new Promise((resolve, reject) => {
    db.get(query, params, (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
}

export function dbRun(query, params = []) {
  return new Promise((resolve, reject) => {
    db.run(query, params, function (err) {
      if (err) reject(err);
      else resolve({ lastID: this.lastID, changes: this.changes });
    });
  });
}

export default db;
