import React, { useState, useEffect } from 'react';
import { Package, Plus, Trash2, Search, RefreshCw } from 'lucide-react';
import { apiFetch } from '../api/client';
import { useToast } from '../toast/ToastContext';
import EmptyState from './EmptyState';
import ConfirmDialog from './ConfirmDialog';

export default function ProductCatalog() {
  const toast = useToast();
  const [products, setProducts] = useState([]);
  const [name, setName] = useState('');
  const [sku, setSku] = useState('');
  const [query, setQuery] = useState('');
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);

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

  useEffect(() => {
    const t = setTimeout(apiFetchProducts, 200);
    return () => clearTimeout(t);
  }, [query]);

  const handleAdd = async (e) => {
    e.preventDefault();
    if (!name.trim()) return;
    try {
      const res = await apiFetch('/api/products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          description: name.trim(),
          price: 0,
          cost_price: 0,
          unit: 'item',
          stock: 100,
          sku: sku.trim(),
        }),
      });
      if (res.ok) {
        setName('');
        setSku('');
        apiFetchProducts();
        toast.success(`"${name.trim()}" added to catalog`);
      }
    } catch (err) {
      toast.error('Error adding product: ' + err.message);
    }
  };

  const askDelete = (product) => {
    setDeleteTarget(product);
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const res = await apiFetch(`/api/products/${deleteTarget.id}`, { method: 'DELETE' });
      if (res.ok) {
        setDeleteTarget(null);
        apiFetchProducts();
        toast.success('Item deleted');
      } else {
        const data = await res.json().catch(() => ({}));
        toast.error(data.error || 'Delete failed');
      }
    } catch (err) {
      toast.error(err.message);
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="responsive-grid" style={{ gap: '1.5rem' }}>
      <form onSubmit={handleAdd} className="glass-panel" style={{ padding: '1.5rem' }}>
        <h3 style={{ fontSize: '1.2rem', fontWeight: 800, marginBottom: '1.25rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <Package size={18} style={{ color: 'var(--accent-primary)' }} /> Add Item / Service Catalog
        </h3>

        <div className="form-group">
          <label className="form-label">Item / Service Name *</label>
          <input
            className="form-input"
            type="text"
            placeholder="e.g. Ferrero Rocher T24"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
        </div>

        <div className="form-group" style={{ marginBottom: '1.25rem' }}>
          <label className="form-label">SKU / Barcode</label>
          <input
            className="form-input"
            type="text"
            placeholder="e.g. FR-T24"
            value={sku}
            onChange={(e) => setSku(e.target.value)}
          />
        </div>

        <button type="submit" className="btn-primary" style={{ width: '100%' }}>
          <Plus size={16} /> Save to Catalog
        </button>
      </form>

      <div className="glass-panel" style={{ padding: '1.5rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.75rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
          <h3 style={{ fontSize: '1.2rem', fontWeight: 800 }}>Catalog ({products.length})</h3>
          <button type="button" className="btn-secondary" style={{ width: 'auto', padding: '0.4rem 0.7rem' }} onClick={apiFetchProducts} title="Refresh">
            <RefreshCw size={14} />
          </button>
        </div>

        <div style={{ position: 'relative', marginBottom: '0.85rem' }}>
          <Search size={16} style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
          <input
            type="text"
            className="form-input"
            style={{ paddingLeft: '2.4rem' }}
            placeholder="Search catalog items…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>

        {products.length === 0 ? (
          <EmptyState
            title="No items in catalog"
            body="Add items using the form on the left."
            icon={Package}
          />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', maxHeight: '520px', overflowY: 'auto' }}>
            {products.map((p) => (
              <div
                key={p.id}
                className="surface-block"
                style={{ padding: '0.85rem 1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.75rem' }}
              >
                <div style={{ minWidth: 0, flex: 1 }}>
                  <h4 style={{ fontWeight: 700, fontSize: '0.95rem', color: 'var(--text-primary)', margin: 0 }}>
                    {p.name}
                  </h4>
                  {p.sku && (
                    <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                      SKU: {p.sku}
                    </span>
                  )}
                </div>
                <button
                  type="button"
                  className="btn-danger"
                  style={{ padding: '0.4rem 0.6rem', width: 'auto' }}
                  onClick={() => askDelete(p)}
                  title="Delete item"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title={`Delete ${deleteTarget?.name || 'item'}?`}
        message="Remove this item from the catalog. Existing bills will keep their records."
        confirmLabel="Delete"
        cancelLabel="Cancel"
        danger
        busy={deleting}
        onCancel={() => setDeleteTarget(null)}
        onConfirm={confirmDelete}
      />
    </div>
  );
}
