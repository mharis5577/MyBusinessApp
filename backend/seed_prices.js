import { dbRun } from './db.js';

async function seedData() {
  try {
    console.log('Seeding prices list into database...');

    // Clear previous items, customers, and customer product rates
    await dbRun('DELETE FROM customer_product_rates');
    await dbRun('DELETE FROM products');
    await dbRun('DELETE FROM customers');

    // 1. Insert Catalog Products
    const products = [
      { name: 'KitKat 2F 17g', price: 4350, unit: 'carton' },
      { name: 'KitKat 2F 20g', price: 4550, unit: 'carton' },
      { name: 'KitKat 4F', price: 6350, unit: 'carton' },
      { name: 'KitKat 4F 36.6g', price: 5800, unit: 'carton' },
      { name: 'KitKat 4F 41.5g', price: 6200, unit: 'carton' },
      { name: 'Toblerone', price: 12300, unit: 'carton' },
      { name: 'Toblerone Small', price: 6800, unit: 'carton' },
      { name: 'Toblerone Flavour', price: 13000, unit: 'carton' },
      { name: 'Galaxy', price: 7050, unit: 'carton' },
      { name: 'M&M', price: 6350, unit: 'carton' },
      { name: 'Twix', price: 6000, unit: 'carton' },
      { name: 'Raffaello', price: 6000, unit: 'carton' },
      { name: 'Kinder Bueno', price: 8700, unit: 'carton' },
      { name: 'Nutella', price: 8000, unit: 'carton' },
      { name: 'Snickers', price: 7100, unit: 'carton' },
      { name: 'Mars', price: 7300, unit: 'carton' },
      { name: 'Ferrero Rocher', price: 7100, unit: 'carton' },
      { name: 'Minis', price: 2700, unit: 'carton' },
    ];

    const prodMap = {};
    for (let p of products) {
      const res = await dbRun(
        'INSERT INTO products (name, description, price, unit, stock) VALUES (?, ?, ?, ?, ?)',
        [p.name, p.name, p.price, p.unit, 1000]
      );
      prodMap[p.name] = res.lastID;
    }

    // 2. Insert Cities / Regional Clients
    const cities = [
      { name: 'Saudia Arabia Region', email: 'saudia@elitechocolate.pk', phone: '+923337669709', address: 'Saudia Arabia Market' },
      { name: 'Peshawar Region', email: 'peshawar@elitechocolate.pk', phone: '+923337669709', address: 'Peshawar Market' },
      { name: 'Lahore Region', email: 'lahore@elitechocolate.pk', phone: '+923337669709', address: 'Lahore Market' },
      { name: 'Islamabad Region', email: 'islamabad@elitechocolate.pk', phone: '+923337669709', address: 'Islamabad Market' },
    ];

    const custMap = {};
    for (let c of cities) {
      const res = await dbRun(
        'INSERT INTO customers (name, email, phone, address) VALUES (?, ?, ?, ?)',
        [c.name, c.email, c.phone, c.address]
      );
      custMap[c.name] = res.lastID;
    }

    // 3. City Specific Rates Mapping
    const saRates = {
      'KitKat 2F 17g': 3600,
      'KitKat 2F 20g': 3800,
      'KitKat 4F': 5800,
      'Toblerone': 11270,
      'Galaxy': 6150,
      'M&M': 5800,
      'Twix': 5500,
      'Raffaello': 5200,
      'Kinder Bueno': 7900,
      'Nutella': 6500,
      'Toblerone Small': 5900,
    };

    const peshRates = {
      'KitKat 2F 17g': 4350,
      'KitKat 4F 36.6g': 5800,
      'KitKat 4F 41.5g': 6200,
      'Toblerone': 12300,
      'Galaxy': 7050,
      'M&M': 6500,
      'Twix': 6500,
      'Raffaello': 6400,
      'Snickers': 7100,
      'Mars': 7300,
      'Kinder Bueno': 8700,
      'Ferrero Rocher': 7100,
      'Nutella': 8300,
      'Toblerone Small': 6800,
      'KitKat 2F 20g': 4550,
    };

    const lahRates = {
      'KitKat 2F 17g': 4350,
      'KitKat 4F': 6350,
      'Toblerone': 12300,
      'Galaxy': 7050,
      'M&M': 6350,
      'Twix': 6000,
      'Raffaello': 6000,
      'Kinder Bueno': 8800,
      'Nutella': 8000,
      'Minis': 2700,
    };

    const islbRates = {
      'KitKat 2F 17g': 4450,
      'M&M': 6500,
      'Twix': 6500,
      'Toblerone': 12500,
      'Galaxy': 7300,
      'Toblerone Small': 6800,
      'Toblerone Flavour': 13000,
      'KitKat 2F 20g': 4650,
    };

    async function insertRates(custName, ratesObj) {
      const custId = custMap[custName];
      for (let [pName, price] of Object.entries(ratesObj)) {
        const pId = prodMap[pName];
        if (pId && custId) {
          await dbRun(
            'INSERT INTO customer_product_rates (customer_id, product_id, custom_price) VALUES (?, ?, ?)',
            [custId, pId, price]
          );
        }
      }
    }

    await insertRates('Saudia Arabia Region', saRates);
    await insertRates('Peshawar Region', peshRates);
    await insertRates('Lahore Region', lahRates);
    await insertRates('Islamabad Region', islbRates);

    console.log('✅ SUCCESSFULLY LOADED ALL PRICE LISTS AND REGIONAL CUSTOMER RATES INTO DATABASE!');
    process.exit(0);
  } catch (err) {
    console.error('Error seeding prices:', err);
    process.exit(1);
  }
}

seedData();
