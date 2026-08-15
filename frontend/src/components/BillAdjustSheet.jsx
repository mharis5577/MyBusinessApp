import React, { useEffect, useState } from 'react';
import { X, Undo2, Ban } from 'lucide-react';
import { formatCurrency } from '../utils/pakistan';
import { apiFetch } from '../api/client';
import { useToast } from '../toast/ToastContext';
import { isCancelled, remainingQty } from '../utils/billAdjust';
import ConfirmDialog from './ConfirmDialog';

export default function BillAdjustSheet({ bill, open, onClose, onUpdated, currencySymbol = 'Rs.' }) {
  const toast = useToast();
  const [tab, setTab] = useState('return');
  const [reason, setReason] = useState('');
  const [qtyMap, setQtyMap] = useState({});
  const [busy, setBusy] = useState(false);
  const [cancelConfirm, setCancelConfirm] = useState(false);

  useEffect(() => {
    if (!open || !bill) return;
    setTab('return');
    setReason('');
    setCancelConfirm(false);
    const next = {};
    for (const it of bill.items || []) next[it.id] = '';
    setQtyMap(next);
  }, [open, bill]);

  if (!open || !bill || isCancelled(bill)) return null;

  const items = bill.items || [];
  const returnable = items.filter((it) => remainingQty(it) > 0);

  const submitReturn = async (e) => {
    e.preventDefault();
    const payload = items
      .map((it) => ({ id: it.id, quantity: Number(qtyMap[it.id]) || 0 }))
      .filter((row) => row.quantity > 0);
    if (!payload.length) {
      toast.error('Enter how many to return on at least one line.');
      return;
    }
    setBusy(true);
    try {
      const res = await apiFetch(`/api/bills/${bill.id}/return`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: payload, reason }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      toast.success(data.status === 'cancelled' ? 'All items returned. Bill kept as cancelled.' : 'Return saved. Stock put back.');
      onUpdated?.(data);
      onClose();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  };

  const askCancel = (e) => {
    e.preventDefault();
    setCancelConfirm(true);
  };

  const confirmCancel = async () => {
    setBusy(true);
    try {
      const res = await apiFetch(`/api/bills/${bill.id}/cancel`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      toast.success('Bill cancelled. History kept.');
      setCancelConfirm(false);
      onUpdated?.(data);
      onClose();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div
        className="modal-sheet"
        style={{ position: 'fixed', inset: 0, background: 'rgba(7,41,41,0.55)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', zIndex: 9999, padding: '0.75rem' }}
        onClick={onClose}
      >
        <div
          className="glass-panel"
          style={{ width: '100%', maxWidth: 520, maxHeight: '88vh', overflowY: 'auto', padding: '1.15rem 1.2rem 1.35rem' }}
          onClick={(e) => e.stopPropagation()}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.85rem' }}>
            <div>
              <h3 style={{ fontSize: '1.05rem', fontWeight: 800, margin: 0 }}>Return / Cancel</h3>
              <p style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', margin: '0.2rem 0 0' }}>
                {bill.invoice_number} · {bill.customer_name}
              </p>
            </div>
            <button type="button" className="btn-secondary" style={{ width: 'auto', padding: '0.35rem 0.5rem' }} onClick={onClose}>
              <X size={16} />
            </button>
          </div>

          <div className="filter-pills" style={{ display: 'flex', gap: '0.4rem', marginBottom: '0.9rem' }}>
            <button type="button" className={`nav-btn ${tab === 'return' ? 'active' : ''}`} onClick={() => setTab('return')}>
              <Undo2 size={14} /> Return items
            </button>
            <button type="button" className={`nav-btn ${tab === 'cancel' ? 'active' : ''}`} onClick={() => setTab('cancel')}>
              <Ban size={14} /> Cancel bill
            </button>
          </div>

          {tab === 'return' ? (
            <form onSubmit={submitReturn}>
              {returnable.length === 0 ? (
                <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>Nothing left to return on this bill.</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
                  {returnable.map((it) => {
                    const left = remainingQty(it);
                    return (
                      <div key={it.id} className="surface-block" style={{ padding: '0.7rem 0.8rem' }}>
                        <div style={{ fontWeight: 700, fontSize: '0.88rem' }}>{it.description}</div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: 2 }}>
                          Left {left} · {formatCurrency(currencySymbol, it.unit_price)} each
                        </div>
                        <label className="form-label" style={{ marginTop: '0.45rem' }}>Return qty</label>
                        <input
                          className="form-input"
                          type="number"
                          min="0"
                          max={left}
                          step="any"
                          value={qtyMap[it.id] ?? ''}
                          onChange={(e) => setQtyMap((m) => ({ ...m, [it.id]: e.target.value }))}
                        />
                      </div>
                    );
                  })}
                </div>
              )}
              <label className="form-label" style={{ marginTop: '0.85rem' }}>Reason (optional)</label>
              <input className="form-input" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Wrong qty, damaged, customer return…" />
              <button type="submit" className="btn-primary" style={{ width: '100%', marginTop: '0.9rem' }} disabled={busy || returnable.length === 0}>
                <Undo2 size={16} /> {busy ? 'Saving…' : 'Save return'}
              </button>
            </form>
          ) : (
            <form onSubmit={askCancel}>
              <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '0.75rem' }}>
                Use this for a wrong bill. It is not deleted. Stock is put back. Payments stay in history.
              </p>
              <label className="form-label">Reason (optional)</label>
              <input className="form-input" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Wrong client, duplicate, test…" />
              <button type="submit" className="btn-danger" style={{ width: '100%', marginTop: '0.9rem' }} disabled={busy}>
                <Ban size={16} /> {busy ? 'Cancelling…' : 'Cancel whole bill'}
              </button>
            </form>
          )}
        </div>
      </div>

      <ConfirmDialog
        open={cancelConfirm}
        title={`Cancel ${bill.invoice_number}?`}
        message="The bill stays in history. Stock goes back. This cannot be undone from this screen."
        confirmLabel={busy ? 'Cancelling…' : 'Cancel bill'}
        cancelLabel="Keep bill"
        busy={busy}
        onCancel={() => {
          if (!busy) setCancelConfirm(false);
        }}
        onConfirm={confirmCancel}
      />
    </>
  );
}
