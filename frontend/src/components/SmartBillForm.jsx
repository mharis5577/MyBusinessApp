import React, { useState, useEffect } from 'react';
import { Plus, Trash2, Zap, Save, RefreshCw, UserCheck, PackageCheck, Calculator, FilePlus2 } from 'lucide-react';
import { parseNaturalBillText } from '../utils/naturalParser';
import { pakistanToday, addDaysToDateString } from '../utils/pakistan';
import { apiFetch } from '../api/client';

export default function SmartBillForm({ onBillGenerated, currencySymbol = 'Rs.', defaultTaxRate = 0, draftBill = null, onDraftConsumed }) {
  const [billType, setBillType] = useState('customer'); // 'customer' or 'supplier'
  const [naturalText, setNaturalText] = useState('');
  const [customers, setCustomers] = useState([]);
  const [products, setProducts] = useState([]);
  const [customerRates, setCustomerRates] = useState([]);
  const [selectedCustomerId, setSelectedCustomerId] = useState(null);
  const [loading, setLoading] = useState(false);
  const [skuQuery, setSkuQuery] = useState('');
  const [saveMode, setSaveMode] = useState('view'); // 'view' | 'new'

  // Form State
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [customerEmail, setCustomerEmail] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [customerAddress, setCustomerAddress] = useState('');
  const [billDate, setBillDate] = useState(() => pakistanToday());
  const [dueDate, setDueDate] = useState(() => addDaysToDateString(pakistanToday(), 14));
  const [taxRate, setTaxRate] = useState(defaultTaxRate);
  const [discountRate, setDiscountRate] = useState(0);
  const [paymentMethod, setPaymentMethod] = useState('Bank Transfer / Raast');
  const [cashTendered, setCashTendered] = useState('');
  const [notes, setNotes] = useState('Thank you for your order!');
  const [payeeBankName, setPayeeBankName] = useState('');
  const [payeeAccountTitle, setPayeeAccountTitle] = useState('');
  const [payeeAccountNumber, setPayeeAccountNumber] = useState('');
  const [payeePaymentNotes, setPayeePaymentNotes] = useState('');

  // Items State
  const [items, setItems] = useState([
    { product_id: null, description: '', quantity: 1, unit_price: 0 },
  ]);

  // Fetch initial helper data
  useEffect(() => {
    fetchNextInvoiceNumber(billType);
    fetchCustomersAndProducts();
  }, [billType]);

  useEffect(() => {
    setTaxRate(defaultTaxRate);
  }, [defaultTaxRate]);

  // Apply duplicate / draft bill once
  useEffect(() => {
    if (!draftBill) return;
    const b = draftBill;
    setBillType(b.bill_type === 'supplier' ? 'supplier' : 'customer');
    setCustomerName(b.customer_name || '');
    setCustomerEmail(b.customer_email || '');
    setCustomerPhone(b.customer_phone || '');
    setCustomerAddress(b.customer_address || '');
    setBillDate(pakistanToday());
    setDueDate(addDaysToDateString(pakistanToday(), 14));
    setTaxRate(b.tax_rate ?? defaultTaxRate);
    setDiscountRate(b.discount_rate ?? 0);
    setPaymentMethod(b.payment_method || (b.bill_type === 'supplier' ? 'Bank Transfer / Remittance' : 'Bank Transfer / Raast'));
    setNotes(b.notes || (b.bill_type === 'supplier' ? 'Purchase remittance / payment advice' : 'Thank you for your order!'));
    setPayeeBankName(b.payee_bank_name || '');
    setPayeeAccountTitle(b.payee_account_title || '');
    setPayeeAccountNumber(b.payee_account_number || '');
    setPayeePaymentNotes(b.payee_payment_notes || '');
    if (b.items && b.items.length) {
      setItems(
        b.items.map((it) => ({
          product_id: it.product_id || null,
          description: it.description || '',
          quantity: it.quantity || 1,
          unit_price: it.unit_price || 0,
        }))
      );
    }
    fetchNextInvoiceNumber(b.bill_type === 'supplier' ? 'supplier' : 'customer');
    if (onDraftConsumed) onDraftConsumed();
  }, [draftBill]);

  const fetchNextInvoiceNumber = async (bType = 'customer') => {
    try {
      const res = await apiFetch(`/api/bills/next-number?type=${bType}`);
      const data = await res.json();
      if (data.invoice_number) setInvoiceNumber(data.invoice_number);
    } catch (err) {
      console.error('Error fetching invoice number:', err);
    }
  };

  const fetchCustomersAndProducts = async () => {
    try {
      const [cRes, pRes] = await Promise.all([
        apiFetch('/api/customers'),
        apiFetch('/api/products')
      ]);
      const cData = await cRes.json();
      const pData = await pRes.json();
      setCustomers(cData || []);
      setProducts(pData || []);
    } catch (err) {
      console.error('Error fetching dropdown data:', err);
    }
  };

  // Fetch Customer Special Rates on Customer Select
  const fetchCustomerRates = async (cId) => {
    if (!cId) {
      setCustomerRates([]);
      return;
    }
    try {
      const res = await apiFetch(`/api/customers/${cId}/rates`);
      const data = await res.json();
      setCustomerRates(data || []);
    } catch (err) {
      console.error('Error fetching customer rates:', err);
    }
  };

  // Select Customer from Saved DB list
  const handleSelectCustomer = (e) => {
    const custId = e.target.value;
    if (!custId) {
      setSelectedCustomerId(null);
      setCustomerRates([]);
      return;
    }
    const found = customers.find((c) => c.id === parseInt(custId, 10));
    if (found) {
      setSelectedCustomerId(found.id);
      setCustomerName(found.name);
      setCustomerEmail(found.email || '');
      setCustomerPhone(found.phone || '');
      setCustomerAddress(found.address || '');
      setPayeeBankName(found.payee_bank_name || '');
      setPayeeAccountTitle(found.payee_account_title || '');
      setPayeeAccountNumber(found.payee_account_number || '');
      setPayeePaymentNotes(found.payee_payment_notes || '');
      fetchCustomerRates(found.id);
    }
  };

  // Select Product for an Item Row (Check for Customer Special Rate)
  const handleSelectProduct = (index, productId) => {
    if (!productId) return;
    const pId = parseInt(productId, 10);
    const found = products.find((p) => p.id === pId);
    if (found) {
      // Check if selected customer has a special custom rate for this product
      let effectivePrice = found.price;
      const customRateObj = customerRates.find((r) => r.product_id === pId);
      if (customRateObj && customRateObj.custom_price !== undefined) {
        effectivePrice = customRateObj.custom_price;
      }

      const stock = Number(found.stock);
      if (billType === 'customer' && !Number.isNaN(stock) && stock <= 0) {
        alert(`Low stock warning: "${found.name}" has ${stock} in stock.`);
      } else if (billType === 'customer' && !Number.isNaN(stock) && stock <= 5) {
        alert(`Low stock: only ${stock} left for "${found.name}".`);
      }

      const updated = [...items];
      updated[index] = {
        product_id: found.id,
        description: found.name,
        quantity: 1,
        unit_price: effectivePrice,
      };
      setItems(updated);
    }
  };

  const getStockWarnings = () => {
    if (billType !== 'customer') return [];
    const warnings = [];
    for (const item of items) {
      if (!item.product_id) continue;
      const product = products.find((p) => p.id === item.product_id);
      if (!product) continue;
      const stock = Number(product.stock);
      const qty = Number(item.quantity) || 0;
      if (Number.isNaN(stock)) continue;
      if (qty > stock) {
        warnings.push(`"${product.name}" — need ${qty}, only ${stock} in stock`);
      } else if (stock - qty <= 5) {
        warnings.push(`"${product.name}" — after this sale stock will be ${Math.max(0, stock - qty)}`);
      }
    }
    return warnings;
  };

  // Line Item Handlers
  const handleItemChange = (index, field, value) => {
    const updated = [...items];
    updated[index][field] = value;
    setItems(updated);
  };

  const addItemRow = () => {
    setItems([...items, { product_id: null, description: '', quantity: 1, unit_price: 0 }]);
  };

  const removeItemRow = (index) => {
    if (items.length <= 1) return;
    setItems(items.filter((_, i) => i !== index));
  };

  // Smart Quick-Parse: fill customer + line items from free text
  const handleNaturalParse = () => {
    const parsed = parseNaturalBillText(naturalText);
    if (!parsed || (!parsed.customerName && (!parsed.items || parsed.items.length === 0))) {
      alert('Could not parse that text. Try: "2 Ferrero Rocher @ 2450 for Al-Fatah"');
      return;
    }

    if (parsed.customerName) {
      setCustomerName(parsed.customerName);
      setSelectedCustomerId(null);
    }

    if (parsed.items && parsed.items.length > 0) {
      setItems(
        parsed.items.map((item) => ({
          product_id: null,
          description: item.description || '',
          quantity: item.quantity || 1,
          unit_price: item.unit_price || 0,
        }))
      );
    }
  };

  const parseJsonSafe = async (res) => {
    const contentType = res?.headers?.get?.('content-type') || '';
    const text = await res.text();
    if (!text) return null;
    if (contentType.includes('application/json') || text.trim().startsWith('{') || text.trim().startsWith('[')) {
      try {
        return JSON.parse(text);
      } catch {
        return null;
      }
    }
    try {
      return JSON.parse(text);
    } catch {
      return { error: text.slice(0, 200) || `HTTP ${res.status}` };
    }
  };

  // Math Calculations
  const subtotal = items.reduce((sum, item) => sum + (parseFloat(item.quantity || 0) * parseFloat(item.unit_price || 0)), 0);
  const taxAmount = (subtotal * (parseFloat(taxRate) || 0)) / 100;
  const discountAmount = (subtotal * (parseFloat(discountRate) || 0)) / 100;
  const totalAmount = Math.max(0, subtotal + taxAmount - discountAmount);
  const isCashSale = String(paymentMethod).toLowerCase().includes('cash');
  const tenderedNum = parseFloat(cashTendered);
  const changeDue =
    isCashSale && Number.isFinite(tenderedNum) && tenderedNum > 0
      ? Math.round((tenderedNum - totalAmount) * 100) / 100
      : null;
  const stockWarnings = getStockWarnings();

  const resetFormForNew = async () => {
    setNaturalText('');
    setSelectedCustomerId(null);
    setCustomerRates([]);
    setCustomerName(billType === 'supplier' ? 'Saudia Arabia Supplier' : '');
    setCustomerEmail('');
    setCustomerPhone('');
    setCustomerAddress('');
    setPayeeBankName('');
    setPayeeAccountTitle('');
    setPayeeAccountNumber('');
    setPayeePaymentNotes('');
    setBillDate(pakistanToday());
    setDueDate(addDaysToDateString(pakistanToday(), 14));
    setTaxRate(defaultTaxRate);
    setDiscountRate(0);
    setPaymentMethod(billType === 'supplier' ? 'Bank Transfer / Remittance' : 'Bank Transfer / Raast');
    setCashTendered('');
    setNotes(billType === 'supplier' ? 'Purchase remittance / payment advice' : 'Thank you for your order!');
    setItems([{ product_id: null, description: '', quantity: 1, unit_price: 0 }]);
    setSkuQuery('');
    await fetchNextInvoiceNumber(billType);
  };

  const applySkuLookup = () => {
    const q = skuQuery.trim().toLowerCase();
    if (!q) return;
    const found = products.find(
      (p) =>
        String(p.sku || '').toLowerCase() === q ||
        String(p.name || '').toLowerCase().includes(q)
    );
    if (!found) {
      alert(`No item matched "${skuQuery}"`);
      return;
    }

    let effectivePrice = found.price;
    const customRateObj = customerRates.find((r) => r.product_id === found.id);
    if (customRateObj && customRateObj.custom_price !== undefined) {
      effectivePrice = customRateObj.custom_price;
    }
    const newRow = {
      product_id: found.id,
      description: found.name,
      quantity: 1,
      unit_price: effectivePrice,
    };

    setItems((prev) => {
      const emptyIdx = prev.findIndex((it) => !String(it.description || '').trim());
      if (emptyIdx >= 0) {
        const next = [...prev];
        next[emptyIdx] = newRow;
        return next;
      }
      return [...prev, newRow];
    });
    setSkuQuery('');
  };

  // Submit and Save to SQLite DB
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!customerName.trim()) {
      alert(billType === 'supplier' ? 'Please enter or select a supplier / pay-to name.' : 'Please enter or select a customer name.');
      return;
    }
    if (items.length === 0 || items.some((i) => !i.description.trim())) {
      alert('Please ensure all item descriptions are filled out.');
      return;
    }

    const oversell = stockWarnings.filter((w) => w.includes('need'));
    if (oversell.length > 0) {
      const proceed = window.confirm(
        `Stock warning:\n\n${oversell.join('\n')}\n\nSave bill anyway? Stock will not go below 0.`
      );
      if (!proceed) return;
    }

    const mode = saveMode;
    setLoading(true);
    try {
      const payload = {
        bill_type: billType,
        invoice_number: invoiceNumber,
        customer_name: customerName,
        customer_email: customerEmail,
        customer_phone: customerPhone,
        customer_address: customerAddress,
        bill_date: billDate,
        due_date: dueDate,
        subtotal,
        tax_rate: parseFloat(taxRate) || 0,
        tax_amount: taxAmount,
        discount_rate: parseFloat(discountRate) || 0,
        discount_amount: discountAmount,
        total_amount: totalAmount,
        status: 'pending',
        notes:
          isCashSale && changeDue != null
            ? `${notes}${notes?.trim() ? '\n' : ''}Cash tendered: ${currencySymbol}${tenderedNum.toFixed(2)} · Change: ${currencySymbol}${Math.max(0, changeDue).toFixed(2)}${changeDue < 0 ? ' (short)' : ''}`
            : notes,
        payment_method: paymentMethod,
        payee_bank_name: billType === 'supplier' ? payeeBankName : '',
        payee_account_title: billType === 'supplier' ? payeeAccountTitle : '',
        payee_account_number: billType === 'supplier' ? payeeAccountNumber : '',
        payee_payment_notes: billType === 'supplier' ? payeePaymentNotes : '',
        items,
      };

      const res = await apiFetch('/api/bills', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await parseJsonSafe(res);

      if (!res.ok) {
        throw new Error(
          (data && data.error) ||
            `Failed to save bill (HTTP ${res.status}). Is the backend running on port 11000?`
        );
      }

      if (!data) {
        throw new Error('Server returned an empty response after saving the bill.');
      }

      if (data.invoice_number && data.invoice_number !== invoiceNumber) {
        setInvoiceNumber(data.invoice_number);
      }

      if (mode === 'new') {
        await resetFormForNew();
        alert(`Saved ${data.invoice_number}. Form cleared for next bill.`);
      } else {
        onBillGenerated(data);
      }
    } catch (err) {
      const msg =
        err.message === 'Failed to fetch'
          ? 'Cannot reach the API. Start the backend (port 11000) and keep the Vite proxy running.'
          : err.message;
      alert('Error saving bill: ' + msg);
    } finally {
      setLoading(false);
      setSaveMode('view');
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      {/* Prominent 2-Option Bill Category Selector */}
      <div className="glass-panel panel-hero" style={{ padding: '1.5rem' }}>
        <div style={{ marginBottom: '1rem' }}>
          <h3 style={{ fontSize: '1.2rem', fontWeight: 800, marginBottom: '0.2rem' }}>SELECT BILL TYPE</h3>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
            Choose whether this bill is a <b>Customer Sale Invoice</b> or a <b>Saudia Arabia Stock Buying Cost Bill</b>:
          </p>
        </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '1rem' }} className="grid-2-mobile-1">
          {/* Option 1: Customer Bill */}
          <div
            onClick={() => {
              setBillType('customer');
              if (customerName === 'Saudia Arabia Supplier') setCustomerName('');
              setPaymentMethod((pm) => (pm === 'Bank Transfer / Remittance' ? 'Bank Transfer / Raast' : pm));
            }}
            style={{
              padding: '1.2rem',
              borderRadius: 'var(--radius-md)',
              border: billType === 'customer' ? '2px solid var(--accent-teal)' : '1px solid var(--border-color)',
              background: billType === 'customer' ? 'var(--surface-muted)' : 'var(--bg-card)',
              cursor: 'pointer',
              transition: 'all 0.2s ease',
              display: 'flex',
              alignItems: 'center',
              gap: '0.85rem',
            }}
          >
            <div style={{ fontSize: '1.8rem' }}>🛒</div>
            <div>
              <div style={{ fontWeight: 800, fontSize: '1rem', color: billType === 'customer' ? 'var(--accent-teal)' : 'var(--text-primary)' }}>
                1. Customer Bill (Sale)
              </div>
              <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginTop: '0.25rem' }}>
                Selling invoice for clients in Peshawar, Lahore, Islamabad, etc. (#INV)
              </div>
            </div>
          </div>

          {/* Option 2: Saudia Arabia Bill */}
          <div
            onClick={() => {
              setBillType('supplier');
              const blankOrDefault =
                !customerName.trim() || customerName.trim() === 'Saudia Arabia Supplier';
              if (blankOrDefault) setCustomerName('Saudia Arabia Supplier');
              setPaymentMethod('Bank Transfer / Remittance');
              if (!notes || notes === 'Thank you for your order!') {
                setNotes('Purchase remittance / payment advice');
              }
            }}
            style={{
              padding: '1.2rem',
              borderRadius: 'var(--radius-md)',
              border: billType === 'supplier' ? '2px solid var(--accent-purple)' : '1px solid var(--border-color)',
              background: billType === 'supplier' ? 'var(--surface-muted)' : 'var(--bg-card)',
              cursor: 'pointer',
              transition: 'all 0.2s ease',
              display: 'flex',
              alignItems: 'center',
              gap: '0.85rem',
            }}
          >
            <div style={{ fontSize: '1.8rem' }}>🇸🇦</div>
            <div>
              <div style={{ fontWeight: 800, fontSize: '1rem', color: billType === 'supplier' ? 'var(--accent-purple)' : 'var(--text-primary)' }}>
                2. Saudia Arabia Bill (Buying Cost)
              </div>
              <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginTop: '0.25rem' }}>
                Supplier inventory bill representing stock purchase cost (#SAU)
              </div>
            </div>
          </div>
        </div>
      </div>
      {/* Smart Quick-Parse Banner */}
      <div className="glass-panel" style={{ padding: '1.25rem', border: '1px solid var(--border-color)', background: 'var(--surface-inset)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
          <Zap size={18} style={{ color: 'var(--accent-primary)' }} />
          <h3 style={{ fontSize: '1rem', fontWeight: 700 }}>Smart Quick Bill Auto-Fill</h3>
        </div>
        <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '0.75rem' }}>
          Type or paste quick text like: <i>"2 Ferrero Rocher @ Rs. 2450, 1 Perfume @ 4850 for Al-Fatah"</i>
        </p>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <input
            type="text"
            className="form-input"
            placeholder="Type items and customer info..."
            value={naturalText}
            onChange={(e) => setNaturalText(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleNaturalParse()}
          />
          <button className="btn-primary" type="button" onClick={handleNaturalParse} style={{ whiteSpace: 'nowrap' }}>
            Auto-Fill Form
          </button>
        </div>
      </div>

      {/* Main Bill Generator Form */}
      <form onSubmit={handleSubmit} className="glass-panel" style={{ padding: '1.75rem' }}>
        <div style={{ marginBottom: '1.5rem', borderBottom: '1px solid var(--border-color)', paddingBottom: '1rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem' }}>
            <div>
              <h2 style={{ fontSize: '1.3rem', fontWeight: 800 }}>Auto Bill Generator</h2>
              <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Fill invoice details & save directly to database</p>
            </div>
          </div>

          <div className="surface-block" style={{ marginTop: '1rem', padding: '0.9rem 1rem', display: 'flex', flexWrap: 'wrap', alignItems: 'flex-end', gap: '0.75rem' }}>
            <div style={{ flex: '1 1 220px' }}>
              <label className="form-label" htmlFor="bill-serial-number">Bill Serial Number *</label>
              <input
                id="bill-serial-number"
                type="text"
                className="form-input"
                style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, letterSpacing: '0.02em' }}
                value={invoiceNumber}
                onChange={(e) => setInvoiceNumber(e.target.value)}
                placeholder="e.g. INV-2026-0001 or custom serial"
                required
              />
              <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.35rem' }}>
                Auto-suggested — edit freely before saving. Refresh loads the next unused number.
              </p>
            </div>
            <button
              type="button"
              className="btn-secondary"
              title="Load next unused serial"
              onClick={() => fetchNextInvoiceNumber(billType)}
              style={{ padding: '0.7rem 1rem' }}
            >
              <RefreshCw size={14} /> Next #
            </button>
          </div>
        </div>

        {/* Customer / Supplier & Date Section */}
        <div className="grid-2-mobile-1" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1.25rem', marginBottom: '1.5rem' }}>
          <div>
            <label className="form-label">{billType === 'supplier' ? 'Supplier / Pay To *' : 'Customer Name *'}</label>
            {customers.length > 0 && (
              <select className="form-select" style={{ marginBottom: '0.5rem' }} onChange={handleSelectCustomer} defaultValue="">
                <option value="">{billType === 'supplier' ? '-- Load Saved Supplier --' : '-- Load Saved Client --'}</option>
                {customers.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            )}
            <input
              type="text"
              className="form-input"
              placeholder={billType === 'supplier' ? 'e.g. Jeddah Trading Co.' : 'e.g. Acme Corporation'}
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
              required
            />

            <div className="grid-2-mobile-1" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginTop: '0.75rem' }}>
              <div>
                <label className="form-label">{billType === 'supplier' ? 'Supplier Email' : 'Customer Email'}</label>
                <input
                  type="email"
                  className="form-input"
                  placeholder={billType === 'supplier' ? 'supplier@example.com' : 'billing@acme.com'}
                  value={customerEmail}
                  onChange={(e) => setCustomerEmail(e.target.value)}
                />
              </div>
              <div>
                <label className="form-label">{billType === 'supplier' ? 'Supplier Phone' : 'Phone Number'}</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="03XX-XXXXXXX / +966…"
                  value={customerPhone}
                  onChange={(e) => setCustomerPhone(e.target.value)}
                />
              </div>
            </div>

            <div style={{ marginTop: '0.75rem' }}>
              <label className="form-label">{billType === 'supplier' ? 'Supplier Address' : 'Billing Address'}</label>
              <textarea
                className="form-textarea"
                rows={2}
                placeholder={billType === 'supplier' ? 'City, Kingdom of Saudi Arabia' : 'Street, City (e.g. Peshawar, Lahore, Islamabad)'}
                value={customerAddress}
                onChange={(e) => setCustomerAddress(e.target.value)}
              />
            </div>

            {billType === 'supplier' && (
              <div style={{ marginTop: '0.9rem', padding: '0.85rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)', background: 'var(--surface-inset)' }}>
                <p style={{ fontSize: '0.8rem', fontWeight: 700, marginBottom: '0.65rem', color: 'var(--text-secondary)' }}>
                  Supplier Pay To bank (shown on payment advice)
                </p>
                <div className="form-group">
                  <label className="form-label">Bank Name</label>
                  <input
                    type="text"
                    className="form-input"
                    placeholder="e.g. Al Rajhi Bank"
                    value={payeeBankName}
                    onChange={(e) => setPayeeBankName(e.target.value)}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Account Title</label>
                  <input
                    type="text"
                    className="form-input"
                    placeholder="Payee account title"
                    value={payeeAccountTitle}
                    onChange={(e) => setPayeeAccountTitle(e.target.value)}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">IBAN / Account Number</label>
                  <input
                    type="text"
                    className="form-input"
                    placeholder="SA…"
                    value={payeeAccountNumber}
                    onChange={(e) => setPayeeAccountNumber(e.target.value)}
                  />
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">Payment Notes (SWIFT, etc.)</label>
                  <input
                    type="text"
                    className="form-input"
                    placeholder="SWIFT / remittance reference"
                    value={payeePaymentNotes}
                    onChange={(e) => setPayeePaymentNotes(e.target.value)}
                  />
                </div>
              </div>
            )}
          </div>

          <div>
            <div className="grid-2-mobile-1" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
              <div className="form-group">
                <label className="form-label">{billType === 'supplier' ? 'Bill Date' : 'Invoice Date'}</label>
                <input
                  type="date"
                  className="form-input"
                  value={billDate}
                  onChange={(e) => setBillDate(e.target.value)}
                />
              </div>
              <div className="form-group">
                <label className="form-label">Due Date</label>
                <input
                  type="date"
                  className="form-input"
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                />
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">Payment Method</label>
              <select
                className="form-select"
                value={paymentMethod}
                onChange={(e) => {
                  setPaymentMethod(e.target.value);
                  if (!String(e.target.value).toLowerCase().includes('cash')) setCashTendered('');
                }}
              >
                {billType === 'supplier' ? (
                  <>
                    <option value="Bank Transfer / Remittance">Bank Transfer / Remittance</option>
                    <option value="Bank Transfer / Raast">Bank Transfer / Raast</option>
                    <option value="Cash">Cash</option>
                  </>
                ) : (
                  <>
                    <option value="Bank Transfer / Raast">Bank Transfer / Raast</option>
                    <option value="JazzCash / EasyPaisa">JazzCash / EasyPaisa</option>
                    <option value="Cash Counter Sale">Cash Counter Sale</option>
                    <option value="Credit / Debit Card">Credit / Debit Card</option>
                  </>
                )}
              </select>
            </div>

            {isCashSale && (
              <div className="cash-change-box form-group">
                <label className="form-label">Cash tendered ({currencySymbol})</label>
                <input
                  type="number"
                  step="1"
                  min="0"
                  className="form-input"
                  placeholder="Customer handed you…"
                  value={cashTendered}
                  onChange={(e) => setCashTendered(e.target.value)}
                />
                <div className="cash-chip-row">
                  <button type="button" className="cash-chip" onClick={() => setCashTendered(String(Math.ceil(totalAmount)))}>
                    Exact
                  </button>
                  {[500, 1000, 5000].map((n) => (
                    <button key={n} type="button" className="cash-chip" onClick={() => setCashTendered(String(n))}>
                      {currencySymbol}{n}
                    </button>
                  ))}
                  <button
                    type="button"
                    className="cash-chip"
                    onClick={() => setCashTendered(String(Math.ceil(totalAmount / 100) * 100 || 100))}
                  >
                    Round ↑100
                  </button>
                </div>
                {changeDue != null && (
                  <div className={`cash-change-result ${changeDue < 0 ? 'is-short' : 'is-ok'}`}>
                    {changeDue < 0
                      ? `Short by ${currencySymbol}${Math.abs(changeDue).toFixed(2)}`
                      : `Change due: ${currencySymbol}${changeDue.toFixed(2)}`}
                  </div>
                )}
              </div>
            )}

            <div className="form-group">
              <label className="form-label">Notes & Terms</label>
              <textarea
                className="form-textarea"
                rows={2}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </div>
          </div>
        </div>

        {/* Line Items */}
        <div style={{ marginBottom: '1.5rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem', gap: '0.5rem', flexWrap: 'wrap' }}>
            <h4 style={{ fontSize: '1rem', fontWeight: 700 }}>Line Items & Services</h4>
            <button type="button" className="btn-secondary" onClick={addItemRow} style={{ padding: '0.45rem 0.85rem', fontSize: '0.8rem', width: 'auto' }}>
              <Plus size={14} /> Add Line Item
            </button>
          </div>

          <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.85rem', flexWrap: 'wrap' }}>
            <input
              type="text"
              className="form-input"
              style={{ flex: 1, minWidth: 160 }}
              placeholder="Quick add by SKU or name…"
              value={skuQuery}
              onChange={(e) => setSkuQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  applySkuLookup();
                }
              }}
            />
            <button type="button" className="btn-secondary" style={{ width: 'auto' }} onClick={applySkuLookup}>
              <PackageCheck size={16} /> Add
            </button>
          </div>

          {/* Desktop table */}
          <div className="table-container desktop-only-table">
            <table className="data-table">
              <thead>
                <tr>
                  <th style={{ width: '40%' }}>Description</th>
                  <th style={{ width: '15%' }}>Qty</th>
                  <th style={{ width: '20%' }}>Unit Price ({currencySymbol})</th>
                  <th style={{ width: '20%' }}>Total ({currencySymbol})</th>
                  <th style={{ width: '5%', textAlign: 'center' }}></th>
                </tr>
              </thead>
              <tbody>
                {items.map((item, index) => {
                  const lineTotal = (parseFloat(item.quantity) || 0) * (parseFloat(item.unit_price) || 0);
                  return (
                    <tr key={index}>
                      <td>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
                          {products.length > 0 && (
                            <select
                              className="form-select"
                              style={{ padding: '0.2rem 0.4rem', fontSize: '0.75rem', marginBottom: '0.2rem' }}
                              onChange={(e) => handleSelectProduct(index, e.target.value)}
                            >
                              <option value="">-- Load Preset Item --</option>
                              {products.map((p) => (
                                <option key={p.id} value={p.id}>
                                  {p.sku ? `[${p.sku}] ` : ''}{p.name} ({currencySymbol}{p.price}) · stock {p.stock ?? '?'}
                                </option>
                              ))}
                            </select>
                          )}
                          <input
                            type="text"
                            className="form-input"
                            placeholder="Item description or service..."
                            value={item.description}
                            onChange={(e) => handleItemChange(index, 'description', e.target.value)}
                            required
                          />
                        </div>
                      </td>
                      <td>
                        <input
                          type="number"
                          min="1"
                          className="form-input"
                          value={item.quantity}
                          onChange={(e) => handleItemChange(index, 'quantity', Math.max(1, parseInt(e.target.value) || 1))}
                          required
                        />
                      </td>
                      <td>
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          className="form-input"
                          value={item.unit_price}
                          onChange={(e) => handleItemChange(index, 'unit_price', parseFloat(e.target.value) || 0)}
                          required
                        />
                      </td>
                      <td style={{ fontWeight: 700, fontFamily: 'var(--font-mono)' }}>
                        {currencySymbol}{lineTotal.toFixed(2)}
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        <button
                          type="button"
                          className="btn-danger"
                          onClick={() => removeItemRow(index)}
                          disabled={items.length <= 1}
                          style={{ opacity: items.length <= 1 ? 0.4 : 1 }}
                        >
                          <Trash2 size={14} />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Mobile stacked cards */}
          <div className="mobile-only line-item-cards">
            {items.map((item, index) => {
              const lineTotal = (parseFloat(item.quantity) || 0) * (parseFloat(item.unit_price) || 0);
              return (
                <div className="line-item-card" key={`m-${index}`}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.45rem' }}>
                    <span style={{ fontWeight: 700, fontSize: '0.85rem' }}>Item {index + 1}</span>
                    <button
                      type="button"
                      className="btn-danger"
                      onClick={() => removeItemRow(index)}
                      disabled={items.length <= 1}
                      style={{ opacity: items.length <= 1 ? 0.4 : 1, width: 'auto', minHeight: 36 }}
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                  {products.length > 0 && (
                    <select
                      className="form-select"
                      style={{ marginBottom: '0.45rem' }}
                      onChange={(e) => handleSelectProduct(index, e.target.value)}
                    >
                      <option value="">-- Load Preset Item --</option>
                      {products.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name} ({currencySymbol}{p.price}) · stock {p.stock ?? '?'}
                        </option>
                      ))}
                    </select>
                  )}
                  <input
                    type="text"
                    className="form-input"
                    placeholder="Item description..."
                    value={item.description}
                    onChange={(e) => handleItemChange(index, 'description', e.target.value)}
                    required
                  />
                  <div className="qty-price-row">
                    <div>
                      <label className="form-label">Qty</label>
                      <input
                        type="number"
                        min="1"
                        inputMode="numeric"
                        className="form-input"
                        value={item.quantity}
                        onChange={(e) => handleItemChange(index, 'quantity', Math.max(1, parseInt(e.target.value) || 1))}
                        required
                      />
                    </div>
                    <div>
                      <label className="form-label">Unit Price</label>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        inputMode="decimal"
                        className="form-input"
                        value={item.unit_price}
                        onChange={(e) => handleItemChange(index, 'unit_price', parseFloat(e.target.value) || 0)}
                        required
                      />
                    </div>
                  </div>
                  <div className="line-total-row">
                    <span style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>Line total</span>
                    <span style={{ fontFamily: 'var(--font-mono)' }}>{currencySymbol}{lineTotal.toFixed(2)}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Math Summary & Submit Section */}
        <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1.5rem', borderTop: '1px solid var(--border-color)', paddingTop: '1.25rem' }}>
          <div style={{ minWidth: '240px', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            <div style={{ display: 'flex', gap: '1rem' }}>
              <div className="form-group" style={{ flex: 1 }}>
                <label className="form-label">Tax Rate (%)</label>
                <input
                  type="number"
                  step="0.1"
                  min="0"
                  className="form-input"
                  value={taxRate}
                  onChange={(e) => setTaxRate(e.target.value)}
                />
              </div>
              <div className="form-group" style={{ flex: 1 }}>
                <label className="form-label">Discount Rate (%)</label>
                <input
                  type="number"
                  step="0.1"
                  min="0"
                  className="form-input"
                  value={discountRate}
                  onChange={(e) => setDiscountRate(e.target.value)}
                />
              </div>
            </div>
          </div>

          <div className="glass-panel surface-block" style={{ padding: '1.25rem', minWidth: '300px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.35rem 0', color: 'var(--text-secondary)' }}>
              <span>Subtotal:</span>
              <span style={{ fontWeight: 600, fontFamily: 'var(--font-mono)' }}>{currencySymbol}{subtotal.toFixed(2)}</span>
            </div>

            {parseFloat(taxRate) > 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.35rem 0', color: 'var(--text-secondary)' }}>
                <span>Tax ({taxRate}%):</span>
                <span style={{ fontWeight: 600, fontFamily: 'var(--font-mono)' }}>+{currencySymbol}{taxAmount.toFixed(2)}</span>
              </div>
            )}

            {parseFloat(discountRate) > 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.35rem 0', color: 'var(--success)' }}>
                <span>Discount ({discountRate}%):</span>
                <span style={{ fontWeight: 600, fontFamily: 'var(--font-mono)' }}>-{currencySymbol}{discountAmount.toFixed(2)}</span>
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.75rem 0 0 0', marginTop: '0.5rem', borderTop: '1px solid var(--border-color)', fontSize: '1.2rem', fontWeight: 800 }}>
              <span>Grand Total:</span>
              <span style={{ color: 'var(--accent-primary)', fontFamily: 'var(--font-mono)' }}>
                {currencySymbol}{totalAmount.toFixed(2)}
              </span>
            </div>
          </div>
        </div>

        <div style={{ marginTop: '1.5rem', display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'center' }} className="stack-on-mobile">
          {stockWarnings.length > 0 && billType === 'customer' && (
            <div style={{ flex: 1, minWidth: '220px', fontSize: '0.85rem', color: 'var(--warning)', fontWeight: 600 }}>
              Stock: {stockWarnings.join(' · ')}
            </div>
          )}
          <button
            type="submit"
            className="btn-secondary"
            style={{ padding: '0.85rem 1.25rem', fontSize: '0.95rem', width: 'auto' }}
            disabled={loading}
            onClick={() => setSaveMode('new')}
          >
            <FilePlus2 size={18} /> {loading && saveMode === 'new' ? 'Saving…' : 'Save & New'}
          </button>
          <button
            type="submit"
            className="btn-primary"
            style={{ padding: '0.85rem 1.75rem', fontSize: '1rem', width: 'auto' }}
            disabled={loading}
            onClick={() => setSaveMode('view')}
          >
            <Save size={18} /> {loading && saveMode === 'view' ? 'Saving…' : 'Save & View'}
          </button>
        </div>
      </form>
    </div>
  );
}
