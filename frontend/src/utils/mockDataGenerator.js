/**
 * Seed Mock Data Helper for ELITE CHOCOLATE POS
 * Generates realistic chocolate products, customers, bills, and payments
 * Works in both local IndexedDB mode and Express REST server mode.
 */
import { apiFetch } from '../api/client';
import { pakistanToday, addDaysToDateString } from './pakistan';

export const MOCK_PRODUCTS = [
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

export const MOCK_CUSTOMERS = [
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

export async function populateMockDatabase() {
  const createdProducts = [];
  const createdCustomers = [];
  const createdBills = [];

  // 1. Create Products
  for (const p of MOCK_PRODUCTS) {
    try {
      const res = await apiFetch('/api/products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(p),
      });
      const data = await res.json();
      if (res.ok && data?.id) createdProducts.push(data);
    } catch (e) {
      console.warn('Seed product failed:', e);
    }
  }

  // 2. Create Customers
  for (const c of MOCK_CUSTOMERS) {
    try {
      const res = await apiFetch('/api/customers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(c),
      });
      const data = await res.json();
      if (res.ok && data?.id) createdCustomers.push(data);
    } catch (e) {
      console.warn('Seed customer failed:', e);
    }
  }

  const today = pakistanToday();
  const pastDate = addDaysToDateString(today, -5);
  const futureDate = addDaysToDateString(today, 7);

  // 3. Create Customer Sales Bill 1 (Fully Paid)
  if (createdCustomers[0] && createdProducts.length >= 2) {
    try {
      const items = [
        {
          product_id: createdProducts[0].id,
          description: createdProducts[0].name,
          quantity: 2,
          unit_price: createdProducts[0].price,
          total: createdProducts[0].price * 2,
        },
        {
          product_id: createdProducts[1].id,
          description: createdProducts[1].name,
          quantity: 3,
          unit_price: createdProducts[1].price,
          total: createdProducts[1].price * 3,
        },
      ];
      const subtotal = items.reduce((s, i) => s + i.total, 0);

      const billRes = await apiFetch('/api/bills', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          bill_type: 'customer',
          customer_name: createdCustomers[0].name,
          customer_email: createdCustomers[0].email,
          customer_phone: createdCustomers[0].phone,
          customer_address: createdCustomers[0].address,
          bill_date: pastDate,
          due_date: today,
          subtotal,
          tax_rate: 0,
          tax_amount: 0,
          discount_rate: 0,
          discount_amount: 0,
          total_amount: subtotal,
          notes: 'Mock order for retail display shelf',
          items,
        }),
      });
      const billData = await billRes.json();
      if (billRes.ok && billData?.id) {
        createdBills.push(billData);
        // Record payment for Bill 1
        await apiFetch(`/api/bills/${billData.id}/payments`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            amount: subtotal,
            method: 'Meezan Bank Transfer',
            payment_date: pastDate,
            notes: 'Full payment cleared via Raast / Bank transfer',
          }),
        });
      }
    } catch (e) {
      console.warn('Seed Bill 1 failed:', e);
    }
  }

  // 4. Create Customer Sales Bill 2 (Pending Dues)
  if (createdCustomers[1] && createdProducts.length >= 3) {
    try {
      const items = [
        {
          product_id: createdProducts[2].id,
          description: createdProducts[2].name,
          quantity: 1,
          unit_price: createdProducts[2].price,
          total: createdProducts[2].price,
        },
        {
          product_id: createdProducts[3].id,
          description: createdProducts[3].name,
          quantity: 4,
          unit_price: createdProducts[3].price,
          total: createdProducts[3].price * 4,
        },
      ];
      const subtotal = items.reduce((s, i) => s + i.total, 0);

      const billRes = await apiFetch('/api/bills', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          bill_type: 'customer',
          customer_name: createdCustomers[1].name,
          customer_email: createdCustomers[1].email,
          customer_phone: createdCustomers[1].phone,
          customer_address: createdCustomers[1].address,
          bill_date: today,
          due_date: futureDate,
          subtotal,
          tax_rate: 0,
          tax_amount: 0,
          discount_rate: 0,
          discount_amount: 0,
          total_amount: subtotal,
          notes: 'Cafe wholesale supply batch #4',
          items,
        }),
      });
      const billData = await billRes.json();
      if (billRes.ok && billData?.id) {
        createdBills.push(billData);
        // Record partial payment
        await apiFetch(`/api/bills/${billData.id}/payments`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            amount: 2000,
            method: 'Cash',
            payment_date: today,
            notes: 'Advance deposit paid in cash',
          }),
        });
      }
    } catch (e) {
      console.warn('Seed Bill 2 failed:', e);
    }
  }

  return {
    products: createdProducts.length,
    customers: createdCustomers.length,
    bills: createdBills.length,
  };
}
