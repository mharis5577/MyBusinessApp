const BASE = `http://localhost:${process.env.PORT || 11056}`;

const body = {
  customer_name: 'TAXTEST Delete Me',
  bill_type: 'customer',
  tax_rate: 5,
  discount_rate: 10,
  // Deliberately wrong client-supplied totals — the server must ignore these.
  subtotal: 999999,
  tax_amount: 999999,
  discount_amount: 0,
  total_amount: 999999,
  items: [{ description: 'Widget', quantity: 1, unit_price: 1000 }],
};

const post = await fetch(`${BASE}/api/bills`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});
const created = await post.json();
console.log('created  subtotal=%s discount=%s tax=%s TOTAL=%s',
  created.subtotal, created.discount_amount, created.tax_amount, created.total_amount);

const reread = await (await fetch(`${BASE}/api/bills/${created.id}`)).json();
console.log('reread   TOTAL=%s', reread.total_amount);
console.log('expected 945 for both (client sent 999999)');
console.log(created.total_amount === 945 && reread.total_amount === 945 ? 'PASS' : 'FAIL');

await fetch(`${BASE}/api/bills/${created.id}`, { method: 'DELETE' });
console.log('cleaned up');
