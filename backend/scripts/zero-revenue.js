/**
 * Reset Revenue paid to Rs. 0 (all bills → pending, clear payments).
 * Usage: node scripts/zero-revenue.js
 */
import sqlite3 from 'sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath = path.join(__dirname, '..', 'data', 'bills.db');

if (!fs.existsSync(dbPath)) {
  console.log('No bills.db yet — revenue is already 0 (fresh DB on next server start).');
  process.exit(0);
}

const db = new sqlite3.Database(dbPath);
const run = (sql) =>
  new Promise((resolve, reject) => {
    db.run(sql, function (err) {
      if (err) reject(err);
      else resolve(this.changes);
    });
  });
const get = (sql) =>
  new Promise((resolve, reject) => {
    db.get(sql, (err, row) => (err ? reject(err) : resolve(row)));
  });

try {
  await run('DELETE FROM bill_payments');
  await run("UPDATE bills SET status = 'pending', amount_paid = 0");
  const rev = await get("SELECT COALESCE(SUM(total_amount),0) as total FROM bills WHERE status = 'paid'");
  console.log('Done. Revenue paid =', rev.total);
} catch (e) {
  console.error(e.message);
  process.exit(1);
} finally {
  db.close();
}
