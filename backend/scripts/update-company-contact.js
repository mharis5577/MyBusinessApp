import sqlite3 from 'sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath = path.join(__dirname, 'data', 'bills.db');
const db = new sqlite3.Database(dbPath);

db.run(
  `UPDATE settings SET company_email = ?, company_phone = ?, company_tax_id = ?
   WHERE id = (SELECT id FROM settings LIMIT 1)`,
  ['m.haris676@gmail.com', '+923337669709', '3110471785257'],
  function (err) {
    if (err) {
      console.error(err);
      process.exit(1);
    }
    db.get(
      'SELECT company_email, company_phone, company_tax_id FROM settings LIMIT 1',
      (e, row) => {
        console.log(JSON.stringify(row, null, 2));
        db.close();
      }
    );
  }
);
