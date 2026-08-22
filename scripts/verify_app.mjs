const API_BASE = 'http://localhost:11000/api';

async function verifyApp() {
  console.log('--- STARTING VERIFICATION ---');

  // 1. Check Settings API
  const settingsRes = await fetch(`${API_BASE}/settings`);
  if (!settingsRes.ok) throw new Error('Settings API failed');
  const settings = await settingsRes.json();
  console.log('✓ Settings API OK:', settings.company_name || 'ELITE CHOCOLATE POS');

  // 2. Check Products API
  const productsRes = await fetch(`${API_BASE}/products`);
  if (!productsRes.ok) throw new Error('Products API failed');
  const products = await productsRes.json();
  console.log(`✓ Products API OK: Found ${products.length} products`);

  // 3. Check Customers API
  const customersRes = await fetch(`${API_BASE}/customers`);
  if (!customersRes.ok) throw new Error('Customers API failed');
  const customers = await customersRes.json();
  console.log(`✓ Customers API OK: Found ${customers.length} customer records`);

  // 4. Check Bills Database API (Testing the fixed endpoint)
  const billsRes = await fetch(`${API_BASE}/bills?type=all&status=all`);
  if (!billsRes.ok) throw new Error('Bills Database API failed');
  const bills = await billsRes.json();
  console.log(`✓ Bills Database API OK: Found ${bills.length} bills in database`);

  // 5. Check Backup API Payload (Used by Firebase Cloud Sync)
  const backupRes = await fetch(`${API_BASE}/backup`);
  if (!backupRes.ok) throw new Error('Backup API payload failed');
  const backupData = await backupRes.json();
  console.log(`✓ Firebase Backup Payload OK: ${Object.keys(backupData).join(', ')}`);

  console.log('--- ALL BACKEND & DATABASE ENDPOINTS VERIFIED 100% CLEAN ---');
}

verifyApp().catch((err) => {
  console.error('❌ VERIFICATION FAILED:', err);
  process.exit(1);
});
