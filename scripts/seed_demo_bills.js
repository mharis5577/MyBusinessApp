import sqlite3 from 'sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const dbPath = path.join(__dirname, '..', 'backend', 'data', 'bills.db');

const db = new sqlite3.Database(dbPath);

const sampleParties = [
  { name: 'Marriott Islamabad Luxury Suite', phone: '+92 300 1122334', type: 'customer' },
  { name: 'Avari Towers Confectionery', phone: '+92 321 9988776', type: 'customer' },
  { name: 'Mona Boutique Chocolates F-7', phone: '+92 333 5544332', type: 'customer' },
  { name: 'Al-Bustan Cargo Services, Riyadh', phone: '+966 50 889 1122', type: 'supplier' },
  { name: 'Gulf Air Freight Logistics', phone: '+966 54 332 1199', type: 'supplier' },
  { name: 'Sana Sheikh (Wedding Favors)', phone: '+92 312 4455667', type: 'customer' },
  { name: 'Cocoa Bean Artisan Lounge', phone: '+92 345 8877665', type: 'customer' },
  { name: 'Boutique Patisserie DHA Lahore', phone: '+92 322 1144778', type: 'customer' },
];

const sampleDates = [
  '2026-08-01', '2026-08-02', '2026-08-03', '2026-08-04',
  '2026-08-05', '2026-08-06', '2026-08-07', '2026-08-08',
  '2026-08-09', '2026-08-10', '2026-08-11', '2026-08-12',
  '2026-08-13', '2026-08-14', '2026-08-15', '2026-08-16',
  '2026-08-17', '2026-08-18', '2026-08-19', '2026-08-20',
  '2026-08-21',
];

db.serialize(() => {
  console.log('Seeding 25 demo bills for pagination testing...');

  const stmt = db.prepare(`
    INSERT INTO bills (
      invoice_number, customer_name, customer_phone, bill_date, due_date,
      subtotal, tax_rate, discount_rate, total_amount, amount_paid,
      status, bill_type, notes, items
    ) VALUES (?, ?, ?, ?, ?, ?, 0, 0, ?, ?, ?, ?, ?, ?)
  `);

  for (let i = 1; i <= 25; i++) {
    const party = sampleParties[i % sampleParties.length];
    const date = sampleDates[i % sampleDates.length];
    const invNum = party.type === 'supplier' ? `TEST-BUY-${1000 + i}` : `TEST-INV-${2000 + i}`;
    const total = Math.round((15000 + (i * 3500)) / 100) * 100;
    const paid = i % 3 === 0 ? total : i % 3 === 1 ? total * 0.5 : 0;
    const status = paid >= total ? 'paid' : 'pending';
    const notes = `[DEMO SEED ${i}] For pagination & layout testing`;
    const items = JSON.stringify([
      { name: 'Callebaut 70% Dark Callets', quantity: 5, unit_price: total / 5, total_price: total }
    ]);

    stmt.run(
      invNum, party.name, party.phone, date, date,
      total, total, paid,
      status, party.type, notes, items
    );
  }

  stmt.finalize((err) => {
    if (err) {
      console.error('Error seeding bills:', err.message);
    } else {
      console.log('✅ Successfully seeded 25 test bills! Total pages is now 7.');
    }
    db.close();
  });
});
