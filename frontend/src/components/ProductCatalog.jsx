import React, { useState, useEffect } from 'react';
import {
  Package,
  Plus,
  Trash2,
  Search,
  RefreshCw,
  Edit3,
  Sparkles,
  X
} from 'lucide-react';
import { apiFetch } from '../api/client';
import { useToast } from '../toast/ToastContext';
import EmptyState from './EmptyState';
import ConfirmDialog from './ConfirmDialog';

export default function ProductCatalog() {
  const toast = useToast();
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState('');

  // Add Product Form State
  const [name, setName] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Edit Modal State
  const [editProduct, setEditProduct] = useState(null);
  const [editName, setEditName] = useState('');
  const [savingEdit, setSavingEdit] = useState(false);

  // Delete State
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);

  const apiFetchProducts = async () => {
    setLoading(true);
    try {
      const url = query.trim() ? `/api/products?q=${encodeURIComponent(query.trim())}` : '/api/products';
      const res = await apiFetch(url);
      const data = await res.json();
      setProducts(data || []);
    } catch (err) {
      console.error(err);
      toast.error('Failed to load catalog: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const t = setTimeout(apiFetchProducts, 200);
    return () => clearTimeout(t);
  }, [query]);

  const handleAdd = async (e) => {
    e.preventDefault();
    if (!name.trim()) {
      toast.error('Item name is required');
      return;
    }
    setSubmitting(true);
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
          sku: '',
        }),
      });
      if (res.ok) {
        setName('');
        apiFetchProducts();
        toast.success(`"${name.trim()}" added to catalog!`);
      } else {
        const err = await res.json().catch(() => ({}));
        toast.error(err.error || 'Failed to add item');
      }
    } catch (err) {
      toast.error('Error adding item: ' + err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleOpenEdit = (p) => {
    setEditProduct(p);
    setEditName(p.name || '');
  };

  const handleSaveEdit = async (e) => {
    e.preventDefault();
    if (!editProduct || !editName.trim()) return;
    setSavingEdit(true);
    try {
      const res = await apiFetch(`/api/products/${editProduct.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: editName.trim(),
          description: editName.trim(),
          sku: editProduct.sku || '',
          price: editProduct.price || 0,
          cost_price: editProduct.cost_price || 0,
          stock: editProduct.stock ?? 100,
          unit: editProduct.unit || 'item',
        }),
      });
      if (res.ok) {
        toast.success('Item updated');
        setEditProduct(null);
        apiFetchProducts();
      } else {
        const data = await res.json().catch(() => ({}));
        toast.error(data.error || 'Update failed');
      }
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSavingEdit(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const res = await apiFetch(`/api/products/${deleteTarget.id}`, { method: 'DELETE' });
      if (res.ok) {
        setDeleteTarget(null);
        apiFetchProducts();
        toast.success('Item removed from catalog');
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
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      {/* Main Grid: Form on Left / Catalog on Right */}
      <div className="responsive-grid" style={{ gap: '1.5rem', alignItems: 'start' }}>
        {/* Add Product Card */}
        <form onSubmit={handleAdd} className="glass-panel" style={{ padding: '1.5rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '1.25rem' }}>
            <Sparkles size={20} style={{ color: 'var(--accent-primary)' }} />
            <h3 style={{ fontSize: '1.15rem', fontWeight: 800, margin: 0 }}>Add Item to Catalog</h3>
          </div>

          <div className="form-group" style={{ marginBottom: '1.5rem' }}>
            <label className="form-label" style={{ fontWeight: 700 }}>Item / Product Name *</label>
            <input
              className="form-input"
              type="text"
              placeholder="e.g. Ferrero Rocher T24 Gold Box"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              autoFocus
            />
          </div>

          <button
            type="submit"
            className="btn-primary"
            disabled={submitting || !name.trim()}
            style={{ width: '100%', padding: '0.75rem', fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}
          >
            <Plus size={18} /> {submitting ? 'Saving...' : 'Save to Catalog'}
          </button>
        </form>

        {/* Catalog Items List */}
        <div className="glass-panel" style={{ padding: '1.5rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.75rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Package size={20} style={{ color: 'var(--accent-primary)' }} />
              <h3 style={{ fontSize: '1.15rem', fontWeight: 800, margin: 0 }}>
                Catalog ({products.length})
              </h3>
            </div>

            <button
              type="button"
              className="btn-secondary"
              style={{ width: 'auto', padding: '0.45rem 0.85rem', display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.82rem' }}
              onClick={apiFetchProducts}
              disabled={loading}
              title="Refresh Catalog"
            >
              <RefreshCw size={14} className={loading ? 'spin' : ''} /> Refresh
            </button>
          </div>

          {/* Search Box */}
          <div style={{ position: 'relative', marginBottom: '1.25rem' }}>
            <Search
              size={16}
              style={{
                position: 'absolute',
                left: '0.85rem',
                top: '50%',
                transform: 'translateY(-50%)',
                color: 'var(--text-muted)',
                pointerEvents: 'none',
              }}
            />
            <input
              type="text"
              className="form-input"
              style={{ paddingLeft: '2.5rem', paddingRight: query ? '2.5rem' : '0.85rem' }}
              placeholder="Search catalog items…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery('')}
                style={{
                  position: 'absolute',
                  right: '0.75rem',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  background: 'none',
                  border: 'none',
                  color: 'var(--text-muted)',
                  cursor: 'pointer',
                  padding: '0.2rem',
                }}
              >
                <X size={16} />
              </button>
            )}
          </div>

          {products.length === 0 ? (
            <EmptyState
              title={query ? 'No matching items' : 'No items in catalog'}
              body={query ? `No item matching "${query}".` : 'Add items using the form on the left.'}
              icon={Package}
            />
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.55rem', maxHeight: '580px', overflowY: 'auto', paddingRight: '0.25rem' }}>
              {products.map((p) => (
                <div
                  key={p.id}
                  className="surface-block"
                  style={{
                    padding: '0.85rem 1.15rem',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    gap: '0.85rem',
                    borderRadius: 'var(--radius-md, 12px)',
                    border: '1px solid var(--border-color)',
                    transition: 'transform 0.15s ease, border-color 0.15s ease',
                  }}
                >
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <h4 style={{ fontWeight: 700, fontSize: '0.98rem', color: 'var(--text-primary)', margin: 0 }}>
                      {p.name}
                    </h4>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flexShrink: 0 }}>
                    <button
                      type="button"
                      className="btn-secondary"
                      style={{ padding: '0.45rem 0.65rem', width: 'auto', borderRadius: 'var(--radius-md, 8px)' }}
                      onClick={() => handleOpenEdit(p)}
                      title="Edit item name"
                    >
                      <Edit3 size={15} />
                    </button>
                    <button
                      type="button"
                      className="btn-danger"
                      style={{ padding: '0.45rem 0.65rem', width: 'auto', borderRadius: 'var(--radius-md, 8px)' }}
                      onClick={() => setDeleteTarget(p)}
                      title="Delete item"
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Edit Product Modal */}
      {editProduct && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0, 0, 0, 0.7)',
            backdropFilter: 'blur(6px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1200,
            padding: '1rem',
          }}
          onClick={(e) => {
            if (e.target === e.currentTarget) setEditProduct(null);
          }}
        >
          <form
            onSubmit={handleSaveEdit}
            className="glass-panel"
            style={{
              width: '100%',
              maxWidth: '440px',
              padding: '1.75rem',
              borderRadius: 'var(--radius-lg, 24px)',
              background: 'var(--bg-card)',
              boxShadow: '0 20px 40px rgba(0, 0, 0, 0.5)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Edit3 size={20} style={{ color: 'var(--accent-primary)' }} />
                <h3 style={{ fontSize: '1.2rem', fontWeight: 800, margin: 0 }}>Edit Item Name</h3>
              </div>
              <button
                type="button"
                onClick={() => setEditProduct(null)}
                style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}
              >
                <X size={20} />
              </button>
            </div>

            <div className="form-group" style={{ marginBottom: '1.5rem' }}>
              <label className="form-label" style={{ fontWeight: 700 }}>Item Name *</label>
              <input
                className="form-input"
                type="text"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                required
                autoFocus
              />
            </div>

            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
              <button
                type="button"
                className="btn-secondary"
                style={{ width: 'auto', padding: '0.65rem 1.25rem' }}
                onClick={() => setEditProduct(null)}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="btn-primary"
                disabled={savingEdit || !editName.trim()}
                style={{ width: 'auto', padding: '0.65rem 1.5rem' }}
              >
                {savingEdit ? 'Saving…' : 'Save Changes'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Delete Confirmation Dialog */}
      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title={`Delete ${deleteTarget?.name || 'item'}?`}
        message="Remove this item from the catalog. Existing bills will keep their historical records."
        confirmLabel="Delete Item"
        cancelLabel="Keep Item"
        danger
        busy={deleting}
        onCancel={() => setDeleteTarget(null)}
        onConfirm={confirmDelete}
      />
    </div>
  );
}
