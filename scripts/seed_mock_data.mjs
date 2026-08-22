const API_BASE = 'http://localhost:11000/api';

const MOCK_PRODUCTS = [
  {
    name: 'Premium Dark Truffles (Box of 12)',
    description: '70% Belgian Dark Chocolate Truffles in luxury gift packaging',
    price: 2500,
    cost_price: 1400,
    unit: 'box',
    stock: 45,
    sku: 'EC-TRF-12',
  },
  {
    name: 'Artisanal Milk Chocolate Slab (250g)',
    description: 'Creamy Swiss milk chocolate slab with caramelized almonds',
    price: 1200,
    cost_price: 650,
    unit: 'piece',
    stock: 60,
    sku: 'EC-SLB-250',
  },
  {
    name: 'Hazelnut Praline Gift Box',
    description: 'Assorted pralines filled with roasted Piedmont hazelnuts',
    price: 3800,
    cost_price: 2100,
    unit: 'box',
    stock: 30,
    sku: 'EC-PRL-BOX',
  },
  {
    name: 'Roasted Almond Cocoa Clusters (150g)',
    description: 'Crunchy whole almonds dipped in dark cocoa coating',
    price: 950,
    cost_price: 480,
    unit: 'pack',
    stock: 80,
    sku: 'EC-CLS-150',
  },
  {
    name: 'White Chocolate Raspberry Bars (100g)',
    description: 'Velvety white chocolate infused with dried raspberry bits',
    price: 1100,
    cost_price: 550,
    unit: 'bar',
    stock: 50,
    sku: 'EC-WHT-RASP',
  },
  {
    name: 'Signature Dark Hot Cocoa Mix (500g)',
    description: 'Rich ceremonial grade hot chocolate drinking powder',
    price: 1600,
    cost_price: 850,
    unit: 'tin',
    stock: 40,
    sku: 'EC-HOT-500',
  },
];

const MOCK_CUSTOMERS = [
  {
    name: 'Zeeshan Khan (Attock Sweets)',
    email: 'zeeshan@attocksweets.pk',
    phone: '+923005123456',
    address: 'Main Bazaar, Near Clock Tower, Attock',
    tax_id: 'PK-NTN-998811',
    party_type: 'customer',
  },
  {
    name: 'Ayesha Malik (Sweet Tooth Cafe)',
    email: 'ayesha@sweettooth.pk',
    phone: '+923219876543',
    address: 'Shop 14, F-7 Markaz, Islamabad',
    tax_id: 'PK-NTN-554422',
    party_type: 'customer',
  },
  {
    name: 'Tariq Mahmood (Rawalpindi Mart)',
    email: 'tariq@rawalpindimart.com',
    phone: '+923335557788',
    address: 'Saddar Road, Near Metro Station, Rawalpindi',
    tax_id: 'PK-NTN-776633',
    party_type: 'customer',
  },
  {
    name: 'ChocoBeans Import Co. (Supplier)',
    email: 'orders@chocobeans.pk',
    phone: '+923008441122',
    address: 'Industrial Estate, Phase 3, Lahore',
    tax_id: 'PK-SUP-112233',
    party_type: 'supplier',
  },
];

async function seed() {
  console.log('Seeding mock data...');
  const products = [];
  const customers = [];

  for (const p of MOCK_PRODUCTS) {
    const res = await fetch(`${API_BASE}/products`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(p),
    });
    const d = await res.json();
    if (d?.id) products.push(d);
  }

  for (const c of MOCK_CUSTOMERS) {
    const res = await fetch(`${API_BASE}/customers`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(c),
    });
    const d = await res.json();
    if (d?.id) customers.push(d);
  }

  const today = new Date().toISOString().slice(0, 10);
  if (customers[0] && products.length >= 2) {
    const items = [
      { product_id: products[0].id, description: products[0].name, quantity: 2, unit_price: products[0].price, total: products[0].price * 2 },
      { product_id: products[1].id, description: products[1].name, quantity: 3, unit_price: products[1].price, total: products[1].price * 3 },
    ];
    const subtotal = items.reduce((s, i) => s + i.total, 0);
    const billRes = await fetch(`${API_BASE}/bills`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        bill_type: 'customer',
        customer_name: customers[0].name,
        customer_email: customers[0].email,
        customer_phone: customers[0].phone,
        customer_address: customers[0].address,
        bill_date: today,
        due_date: today,
        subtotal,
        total_amount: subtotal,
        notes: 'Wholesale order batch 1',
        items,
      }),
    });
    const billData = await billRes.json();
    if (billData?.id) {
      await fetch(`${API_BASE}/bills/${billData.id}/payments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount: subtotal,
          method: 'Meezan Bank Transfer',
          payment_date: today,
          notes: 'Full payment via Raast / Bank transfer',
        }),
      });
    }
  }

  console.log(`Successfully seeded ${products.length} products, ${customers.length} customers, and sales bills!`);
}

seed().catch(console.error);
