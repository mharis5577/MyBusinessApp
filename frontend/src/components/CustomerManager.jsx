import React, { useState, useEffect } from 'react';
import { Users, Plus, Trash2, Mail, Phone, Tag, Check, PackagePlus, BookOpen } from 'lucide-react';
import { formatCurrency } from '../utils/pakistan';
import { apiFetch } from '../api/client';

export default function CustomerManager({ currencySymbol = 'Rs.' }) {
  const [customers, setCustomers] = useState([]);
  const [products, setProducts] = useState([]);
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [customerRates, setCustomerRates] = useState([]);
  const [ledger, setLedger] = useState(null);

  // Form State for new customer
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [taxId, setTaxId] = useState('');

  // Form State for existing catalog custom rate
  const [rateProductId, setRateProductId] = useState('');
  const [rateCustomPrice, setRateCustomPrice] = useState('');
  const [rateMsg, setRateMsg] = useState('');

  // Form State for brand NEW product created directly for client
  const [newProdName, setNewProdName] = useState('');
  const [newProdStdPrice, setNewProdStdPrice] = useState('');
  const [newProdClientPrice, setNewProdClientPrice] = useState('');
  const [newProdMsg, setNewProdMsg] = useState('');

  const apiFetchCustomers = async () => {
    try {
      const res = await apiFetch('/api/customers');
      const data = await res.json();
      setCustomers(data || []);
    } catch (err) {
      console.error(err);
    }
  };

  const apiFetchProducts = async () => {
    try {
      const res = await apiFetch('/api/products');
      const data = await res.json();
      setProducts(data || []);
    } catch (err) {
      console.error(err);
    }
  };

  const apiFetchCustomerRates = async (customerId) => {
    try {
      const res = await apiFetch(`/api/customers/${customerId}/rates`);
      const data = await res.json();
      setCustomerRates(data || []);
    } catch (err) {
      console.error(err);
    }
  };

  const apiFetchLedger = async (customerName) => {
    try {
      const res = await apiFetch(`/api/ledger?name=${encodeURIComponent(customerName)}`);
      const data = await res.json();
      if (res.ok) setLedger(data);
      else setLedger(null);
    } catch (err) {
      console.error(err);
      setLedger(null);
    }
  };

  useEffect(() => {
    apiFetchCustomers();
    apiFetchProducts();
  }, []);

  const handleSelectCustomer = (c) => {
    setSelectedCustomer(c);
    apiFetchCustomerRates(c.id);
    apiFetchLedger(c.name);
  };

  const handleAddCustomer = async (e) => {
    e.preventDefault();
    if (!name.trim()) return;
    try {
      const res = await apiFetch('/api/customers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, phone, address, tax_id: taxId }),
      });
      if (res.ok) {
        setName('');
        setEmail('');
        setPhone('');
        setAddress('');
        setTaxId('');
        apiFetchCustomers();
      }
    } catch (err) {
      alert('Error adding customer: ' + err.message);
    }
  };

  const handleDeleteCustomer = async (id) => {
    try {
      const res = await apiFetch(`/api/customers/${id}`, { method: 'DELETE' });
      if (res.ok) {
        if (selectedCustomer?.id === id) setSelectedCustomer(null);
        apiFetchCustomers();
      }
    } catch (err) {
      alert(err.message);
    }
  };

  // Assign Custom Rate for existing product
  const handleSaveRate = async (e) => {
    e.preventDefault();
    if (!selectedCustomer || !rateProductId || rateCustomPrice === '') return;

    try {
      const res = await apiFetch(`/api/customers/${selectedCustomer.id}/rates`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          product_id: parseInt(rateProductId, 10),
          custom_price: parseFloat(rateCustomPrice),
        }),
      });

      if (res.ok) {
        const updatedRates = await res.json();
        setCustomerRates(Array.isArray(updatedRates) ? updatedRates : await (async () => {
          const r = await apiFetch(`/api/customers/${selectedCustomer.id}/rates`);
          return (await r.json()) || [];
        })());
        setRateProductId('');
        setRateCustomPrice('');
        setRateMsg('Custom rate saved!');
        setTimeout(() => setRateMsg(''), 3000);
      }
    } catch (err) {
      alert('Error saving rate: ' + err.message);
    }
  };

  // Create brand NEW product and assign custom rate for selected client
  const handleCreateNewProductForClient = async (e) => {
    e.preventDefault();
    if (!selectedCustomer || !newProdName.trim() || !newProdStdPrice || !newProdClientPrice) return;

    try {
      // 1. Create product in catalog
      const prodRes = await apiFetch('/api/products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newProdName.trim(),
          description: `Custom product for ${selectedCustomer.name}`,
          price: parseFloat(newProdStdPrice),
          unit: 'unit',
          stock: 1000,
        }),
      });

      if (!prodRes.ok) {
        const err = await prodRes.json();
        throw new Error(err.error || 'Failed to create product');
      }

      const createdProduct = await prodRes.json();

      // 2. Assign negotiated price for this customer
      const rateRes = await apiFetch(`/api/customers/${selectedCustomer.id}/rates`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          product_id: createdProduct.id,
          custom_price: parseFloat(newProdClientPrice),
        }),
      });

      if (rateRes.ok) {
        setNewProdName('');
        setNewProdStdPrice('');
        setNewProdClientPrice('');
        setNewProdMsg(`Added "${createdProduct.name}" for ${selectedCustomer.name}!`);
        setTimeout(() => setNewProdMsg(''), 3000);
        apiFetchProducts();
        apiFetchCustomerRates(selectedCustomer.id);
      }
    } catch (err) {
      alert('Error creating product for client: ' + err.message);
    }
  };

  // Delete Custom Rate
  const handleDeleteRate = async (productId) => {
    if (!selectedCustomer) return;
    try {
      const res = await apiFetch(`/api/customers/${selectedCustomer.id}/rates/${productId}`, { method: 'DELETE' });
      if (res.ok) {
        apiFetchCustomerRates(selectedCustomer.id);
      }
    } catch (err) {
      alert('Error deleting rate: ' + err.message);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '1.5rem' }}>
        {/* Add Customer Form */}
        <form onSubmit={handleAddCustomer} className="glass-panel" style={{ padding: '1.5rem' }}>
          <h3 style={{ fontSize: '1.2rem', fontWeight: 800, marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Users size={18} style={{ color: 'var(--accent-teal)' }} /> Add Client Profile
          </h3>

          <div className="form-group">
            <label className="form-label">Client / Company Name *</label>
            <input className="form-input" type="text" placeholder="e.g. Peshawar Retail Client" value={name} onChange={(e) => setName(e.target.value)} required />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
            <div className="form-group">
              <label className="form-label">Phone</label>
              <input className="form-input" type="text" placeholder="+92 300 0000000" value={phone} onChange={(e) => setPhone(e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">Email</label>
              <input className="form-input" type="email" placeholder="client@domain.pk" value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">Address</label>
            <textarea className="form-textarea" rows={2} placeholder="City, Location" value={address} onChange={(e) => setAddress(e.target.value)} />
          </div>

          <button type="submit" className="btn-primary" style={{ width: '100%', marginTop: '0.5rem' }}>
            <Plus size={16} /> Save Client Profile
          </button>
        </form>

        {/* Customer Directory */}
        <div className="glass-panel" style={{ padding: '1.5rem' }}>
          <h3 style={{ fontSize: '1.2rem', fontWeight: 800, marginBottom: '1rem' }}>Saved Client Directory</h3>
          {customers.length === 0 ? (
            <p style={{ color: 'var(--text-muted)' }}>No clients saved yet.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', maxHeight: '420px', overflowY: 'auto' }}>
              {customers.map((c) => {
                const isSelected = selectedCustomer?.id === c.id;
                return (
                  <div
                    key={c.id}
                    onClick={() => handleSelectCustomer(c)}
                    style={{
                      background: isSelected ? 'var(--surface-muted)' : 'var(--bg-card)',
                      borderColor: isSelected ? 'var(--accent-teal)' : 'var(--border-color)',
                      padding: '0.9rem',
                      borderRadius: 'var(--radius-sm)',
                      border: '1px solid',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      cursor: 'pointer',
                      transition: 'all 0.2s ease',
                    }}
                  >
                    <div>
                      <h4 style={{ fontWeight: 800, fontSize: '0.95rem', color: isSelected ? 'var(--accent-teal)' : 'var(--text-primary)' }}>
                        {c.name}
                      </h4>
                      {c.phone && <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}><Phone size={12} /> {c.phone}</div>}
                      {c.email && <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}><Mail size={12} /> {c.email}</div>}
                    </div>

                    <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                      <span className="badge" style={{ background: isSelected ? 'var(--accent-teal)' : 'var(--surface-muted)', color: isSelected ? '#ebeae1' : 'var(--text-secondary)' }}>
                        {isSelected ? 'Selected' : 'Rates'}
                      </span>
                      <button
                        className="btn-danger"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteCustomer(c.id);
                        }}
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Client Product & Negotiated Rates Manager */}
      <div className="glass-panel" style={{ padding: '1.5rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.85rem' }}>
          <div>
            <h3 style={{ fontSize: '1.2rem', fontWeight: 800, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Tag size={20} /> Client-Specific Products & Custom Rates
            </h3>
            <p style={{ fontSize: '0.825rem', color: 'var(--text-secondary)' }}>
              {selectedCustomer
                ? `Managing products & negotiated wholesale rates for: ${selectedCustomer.name}`
                : 'Select a client from directory above to add new products or assign negotiated rates'}
            </p>
          </div>
          {(rateMsg || newProdMsg) && (
            <div style={{ background: 'rgba(16,185,129,0.2)', color: 'var(--success)', padding: '0.35rem 0.75rem', borderRadius: 'var(--radius-sm)', fontSize: '0.8rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
              <Check size={14} /> {rateMsg || newProdMsg}
            </div>
          )}
        </div>

        {selectedCustomer ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            {ledger && (
              <div className="surface-block" style={{ padding: '1.1rem' }}>
                <h4 style={{ fontSize: '0.95rem', fontWeight: 800, marginBottom: '0.65rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                  <BookOpen size={16} /> Client ledger — {ledger.customer_name}
                </h4>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: '0.65rem', marginBottom: '0.85rem' }}>
                  <div>
                    <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Billed</div>
                    <div style={{ fontWeight: 800, fontFamily: 'var(--font-mono)' }}>{formatCurrency(currencySymbol, ledger.totals.billed)}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Paid</div>
                    <div style={{ fontWeight: 800, fontFamily: 'var(--font-mono)', color: 'var(--success)' }}>{formatCurrency(currencySymbol, ledger.totals.paid)}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Outstanding</div>
                    <div style={{ fontWeight: 800, fontFamily: 'var(--font-mono)', color: 'var(--warning)' }}>{formatCurrency(currencySymbol, ledger.totals.outstanding)}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Bills</div>
                    <div style={{ fontWeight: 800 }}>{ledger.totals.bill_count}</div>
                  </div>
                </div>
                <div style={{ maxHeight: 160, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                  {(ledger.bills || []).slice(0, 12).map((b) => (
                    <div key={b.id} style={{ fontSize: '0.78rem', display: 'flex', justifyContent: 'space-between', gap: '0.5rem', color: 'var(--text-secondary)' }}>
                      <span><span className="invoice-mono">{b.invoice_number}</span> · {b.bill_date} · {b.status}</span>
                      <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-primary)', fontWeight: 700 }}>{formatCurrency(currencySymbol, b.total_amount)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '1.5rem' }}>
              
              {/* Option A: Assign rate for existing catalog product */}
              <form onSubmit={handleSaveRate} className="surface-block" style={{ padding: '1.25rem' }}>
                <h4 style={{ fontSize: '0.95rem', fontWeight: 700, marginBottom: '0.85rem' }}>A. Set Rate for Existing Catalog Item</h4>

                <div className="form-group">
                  <label className="form-label">Select Catalog Product *</label>
                  <select className="form-select" value={rateProductId} onChange={(e) => setRateProductId(e.target.value)} required>
                    <option value="">-- Choose Product --</option>
                    {products.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name} (Standard Price: {currencySymbol}{p.price})
                      </option>
                    ))}
                  </select>
                </div>

                <div className="form-group">
                  <label className="form-label">Special Rate for {selectedCustomer.name} ({currencySymbol}) *</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    className="form-input"
                    placeholder="e.g. 2200"
                    value={rateCustomPrice}
                    onChange={(e) => setRateCustomPrice(e.target.value)}
                    required
                  />
                </div>

                <button type="submit" className="btn-primary" style={{ width: '100%', marginTop: '0.5rem' }}>
                  <Plus size={16} /> Save Negotiated Rate
                </button>
              </form>

              {/* Option B: Create BRAND NEW Product directly for this Client */}
              <form onSubmit={handleCreateNewProductForClient} style={{ background: 'rgba(99,102,241,0.08)', padding: '1.25rem', borderRadius: 'var(--radius-md)', border: '1px solid rgba(99,102,241,0.3)' }}>
                <h4 style={{ fontSize: '0.95rem', fontWeight: 800, marginBottom: '0.85rem', color: 'var(--accent-primary)', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                  <PackagePlus size={18} /> B. Add Brand New Product for {selectedCustomer.name}
                </h4>

                <div className="form-group">
                  <label className="form-label">New Product Name *</label>
                  <input
                    type="text"
                    className="form-input"
                    placeholder="e.g. Special Chocolate Gift Box"
                    value={newProdName}
                    onChange={(e) => setNewProdName(e.target.value)}
                    required
                  />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                  <div className="form-group">
                    <label className="form-label">Standard Catalog Price ({currencySymbol}) *</label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      className="form-input"
                      placeholder="e.g. 5000"
                      value={newProdStdPrice}
                      onChange={(e) => setNewProdStdPrice(e.target.value)}
                      required
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Price for {selectedCustomer.name} ({currencySymbol}) *</label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      className="form-input"
                      placeholder="e.g. 4500"
                      value={newProdClientPrice}
                      onChange={(e) => setNewProdClientPrice(e.target.value)}
                      required
                    />
                  </div>
                </div>

                <button type="submit" className="btn-primary" style={{ width: '100%', marginTop: '0.5rem', background: 'var(--accent-primary)' }}>
                  <PackagePlus size={16} /> Create & Assign Product
                </button>
              </form>

            </div>

            {/* Active Rates List */}
            <div className="surface-block" style={{ padding: '1.25rem' }}>
              <h4 style={{ fontSize: '0.95rem', fontWeight: 700, marginBottom: '0.85rem' }}>
                Active Special Rates for {selectedCustomer.name} ({customerRates.length})
              </h4>

              {customerRates.length === 0 ? (
                <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                  No custom product rates set for {selectedCustomer.name}. Standard catalog prices will apply.
                </p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem', maxHeight: '240px', overflowY: 'auto' }}>
                  {customerRates.map((r) => (
                    <div key={r.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(255,255,255,0.05)', padding: '0.65rem 0.85rem', borderRadius: 'var(--radius-sm)' }}>
                      <div>
                        <div style={{ fontWeight: 700, fontSize: '0.875rem' }}>{r.product_name}</div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                          Standard Catalog Price: <del>{currencySymbol}{r.standard_price}</del>
                        </div>
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                        <span style={{ fontWeight: 800, color: 'var(--success)', fontFamily: 'var(--font-mono)', fontSize: '0.95rem' }}>
                          {currencySymbol}{r.custom_price}
                        </span>
                        <button className="btn-danger" style={{ padding: '0.25rem 0.5rem' }} onClick={() => handleDeleteRate(r.product_id)}>
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        ) : (
          <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>
            👈 Click on any client profile from the directory above to add new products or manage negotiated rates.
          </div>
        )}
      </div>
    </div>
  );
}
