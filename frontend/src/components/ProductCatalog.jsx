import React, { useState, useEffect } from 'react';
import { Package, Plus, Trash2, Search, History, Minus, RefreshCw } from 'lucide-react';
import { formatCurrency } from '../utils/pakistan';
import { apiFetch } from '../api/client';
import { useToast } from '../toast/ToastContext';

export default function ProductCatalog({ currencySymbol = 'Rs.' }) {
  const toast = useToast();
  const [products, setProducts] = useState([]);
  const [adjustments, setAdjustments] = useState([]);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [price, setPrice] = useState('');
  const [costPrice, setCostPrice] = useState('');
  const [unit, setUnit] = useState('item');
  const [stock, setStock] = useState('100');
  const [sku, setSku] = useState('');
  const [query, setQuery] = useState('');
  const [showLog, setShowLog] = useState(false);

  const apiFetchProducts = async () => {
    try {
      const url = query.trim() ? `/api/products?q=${encodeURIComponent(query.trim())}` : '/api/products';
      const res = await apiFetch(url);
      const data = await res.json();
      setProducts(data || []);
    } catch (err) {
      console.error(err);
    }
  };

  const apiFetchAdjustments = async () => {
    try {
      const res = await apiFetch('/api/stock-adjustments');
      const data = await res.json();
      setAdjustments(data || []);
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    const t = setTimeout(apiFetchProducts, 200);
    return () => clearTimeout(t);
  }, [query]);

  useEffect(() => {
    apiFetchAdjustments();
  }, []);

  const handleAdd = async (e) => {
    e.preventDefault();
    if (!name.trim() || !price) return;
    try {
      const res = await apiFetch('/api/products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          description,
          price: parseFloat(price),
          cost_price: parseFloat(costPrice) || 0,
          unit,
          stock: parseInt(stock, 10),
          sku: sku.trim(),
        }),
      });
      if (res.ok) {
        setName('');
        setDescription('');
        setPrice('');
        setCostPrice('');
        setUnit('item');
        setStock('100');
        setSku('');
        apiFetchProducts();
      }
    } catch (err) {
      toast.error('Error adding product: ' + err.message);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this item from catalog?')) return;
    try {
      const res = await apiFetch(`/api/products/${id}`, { method: 'DELETE' });
      if (res.ok) apiFetchProducts();
    } catch (err) {
      toast.error(err.message);
    }
  };

  const saveCost = async (product, value) => {
    const cost_price = parseFloat(value);
    if (Number.isNaN(cost_price) || cost_price < 0) return;
    try {
      const res = await apiFetch(`/api/products/${product.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...product, cost_price }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `HTTP ${res.status}`);
      }
      apiFetchProducts();
    } catch (err) {
      toast.error(err.message);
    }
  };

  const adjustStock = async (id, delta, reason) => {
    try {
      const res = await apiFetch(`/api/products/${id}/adjust-stock`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ delta, reason }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      apiFetchProducts();
      apiFetchAdjustments();
    } catch (err) {
      toast.error(err.message);
    }
  };

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '1.5rem' }}>
      <form onSubmit={handleAdd} className="glass-panel" style={{ padding: '1.5rem' }}>
        <h3 style={{ fontSize: '1.2rem', fontWeight: 800, marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <Package size={18} style={{ color: 'var(--accent-primary)' }} /> Add Item / Service Catalog
        </h3>

        <div className="form-group">
          <label className="form-label">Item / Service Name *</label>
          <input className="form-input" type="text" placeholder="e.g. Ferrero Rocher T24" value={name} onChange={(e) => setName(e.target.value)} required />
        </div>

        <div className="form-group">
          <label className="form-label">SKU / Barcode</label>
          <input className="form-input" type="text" placeholder="e.g. FR-T24" value={sku} onChange={(e) => setSku(e.target.value)} />
        </div>

        <div className="form-group">
          <label className="form-label">Description</label>
          <input className="form-input" type="text" placeholder="Optional notes" value={description} onChange={(e) => setDescription(e.target.value)} />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
          <div className="form-group">
            <label className="form-label">Sell price ({currencySymbol}) *</label>
            <input className="form-input" type="number" step="0.01" placeholder="2450" value={price} onChange={(e) => setPrice(e.target.value)} required />
          </div>
          <div className="form-group">
            <label className="form-label">Cost price ({currencySymbol})</label>
            <input className="form-input" type="number" step="0.01" placeholder="Saudia cost" value={costPrice} onChange={(e) => setCostPrice(e.target.value)} />
          </div>
        </div>
        <div className="form-group">
          <label className="form-label">Unit Type</label>
          <input className="form-input" type="text" placeholder="box, item" value={unit} onChange={(e) => setUnit(e.target.value)} />
        </div>

        <div className="form-group">
          <label className="form-label">Initial Inventory Stock</label>
          <input className="form-input" type="number" value={stock} onChange={(e) => setStock(e.target.value)} />
        </div>

        <button type="submit" className="btn-primary" style={{ width: '100%', marginTop: '0.5rem' }}>
          <Plus size={16} /> Save to Catalog
        </button>
      </form>

      <div className="glass-panel" style={{ padding: '1.5rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.75rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
          <h3 style={{ fontSize: '1.2rem', fontWeight: 800 }}>Catalog</h3>
          <div style={{ display: 'flex', gap: '0.4rem' }}>
            <button type="button" className="btn-secondary" style={{ width: 'auto', padding: '0.4rem 0.7rem' }} onClick={() => { setShowLog((v) => !v); apiFetchAdjustments(); }}>
              <History size={14} /> {showLog ? 'Hide log' : 'Stock log'}
            </button>
            <button type="button" className="btn-secondary" style={{ width: 'auto', padding: '0.4rem 0.7rem' }} onClick={apiFetchProducts}>
              <RefreshCw size={14} />
            </button>
          </div>
        </div>

        <div style={{ position: 'relative', marginBottom: '0.85rem' }}>
          <Search size={16} style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
          <input
            type="text"
            className="form-input"
            style={{ paddingLeft: '2.4rem' }}
            placeholder="Search name, SKU…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>

        {showLog && (
          <div className="surface-block" style={{ padding: '0.75rem', marginBottom: '0.85rem', maxHeight: 180, overflowY: 'auto' }}>
            <h4 style={{ fontSize: '0.8rem', fontWeight: 750, marginBottom: '0.5rem' }}>Recent stock adjustments</h4>
            {adjustments.length === 0 ? (
              <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>No adjustments yet.</p>
            ) : (
              adjustments.slice(0, 30).map((a) => (
                <div key={a.id} style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', padding: '0.25rem 0', borderBottom: '1px solid var(--border-color)' }}>
                  <strong style={{ color: 'var(--text-primary)' }}>{a.product_name || 'Item'}</strong>
                  {' '}
                  <span className={a.delta < 0 ? 'stock-danger' : 'stock-warn'}>
                    {a.delta > 0 ? '+' : ''}{a.delta}
                  </span>
                  {' · '}{a.reason}
                </div>
              ))
            )}
          </div>
        )}

        {products.length === 0 ? (
          <p style={{ color: 'var(--text-muted)' }}>No items in catalog yet.</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', maxHeight: '520px', overflowY: 'auto' }}>
            {products.map((p) => {
              const low = Number(p.stock) <= 5;
              return (
                <div key={p.id} className="surface-block" style={{ padding: '0.9rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.75rem' }}>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <h4 style={{ fontWeight: 700, fontSize: '0.95rem', color: 'var(--text-primary)' }}>
                      {p.name}
                      {p.sku ? <span style={{ fontWeight: 500, color: 'var(--text-muted)', fontSize: '0.78rem' }}> · {p.sku}</span> : null}
                    </h4>
                    <div style={{ fontSize: '0.85rem', color: 'var(--accent-primary)', fontWeight: 800 }}>
                      Sell {formatCurrency(currencySymbol, p.price)}{' '}
                      <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 400 }}>/ {p.unit}</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginTop: '0.35rem' }}>
                      <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Cost</span>
                      <input
                        className="form-input"
                        type="number"
                        step="0.01"
                        defaultValue={p.cost_price || ''}
                        key={`${p.id}-${p.cost_price || 0}`}
                        onBlur={(e) => saveCost(p, e.target.value)}
                        style={{ width: 110, minHeight: 34, padding: '0.25rem 0.45rem', fontSize: '0.8rem' }}
                        placeholder="0"
                      />
                    </div>
                    {p.description && <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>{p.description}</div>}
                    <div style={{ fontSize: '0.75rem', marginTop: '0.2rem', color: low ? 'var(--warning)' : 'var(--text-muted)', fontWeight: low ? 700 : 400 }}>
                      Stock: {p.stock}{low ? ' · LOW' : ''}
                    </div>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', alignItems: 'stretch' }}>
                    <div style={{ display: 'flex', gap: '0.3rem' }}>
                      <button type="button" className="btn-secondary" style={{ padding: '0.35rem', width: 'auto' }} title="Remove 1" onClick={() => adjustStock(p.id, -1, 'damage/use')}>
                        <Minus size={14} />
                      </button>
                      <button type="button" className="btn-secondary" style={{ padding: '0.35rem', width: 'auto' }} title="Add 1" onClick={() => adjustStock(p.id, 1, 'restock')}>
                        <Plus size={14} />
                      </button>
                    </div>
                    <button className="btn-danger" style={{ padding: '0.35rem', width: 'auto' }} onClick={() => handleDelete(p.id)}>
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
  );
}
