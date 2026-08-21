import sqlite3 from 'sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const dbPath = path.join(__dirname, '..', 'backend', 'data', 'bills.db');

const db = new sqlite3.Database(dbPath);

db.serialize(() => {
  console.log('Cleaning up demo test bills...');
  db.run("DELETE FROM bills WHERE notes LIKE '%[DEMO SEED%' OR invoice_number LIKE 'TEST-%'", function(err) {
    if (err) {
      console.error('Error cleaning demo bills:', err.message);
    } else {
      console.log(`✅ Removed ${this.changes} demo test bills. Database restored to real records.`);
    }
    db.close();
  });
});
