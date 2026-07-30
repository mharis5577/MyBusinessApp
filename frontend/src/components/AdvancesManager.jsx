import React, { useState, useEffect } from 'react';
import { Wallet, Plus, Trash2, Banknote, RefreshCw } from 'lucide-react';
import { pakistanToday, formatCurrency } from '../utils/pakistan';
import { apiFetch } from '../api/client';

export default function AdvancesManager({ currencySymbol = 'Rs.' }) {
  const [advances, setAdvances] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [totalAdvance, setTotalAdvance] = useState(0);
  const [available, setAvailable] = useState(0);
  const [loading, setLoading] = useState(true);

  const [clientName, setClientName] = useState('');
  const [amount, setAmount] = useState('');
  const [paymentDate, setPaymentDate] = useState(pakistanToday());
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  const [applyClient, setApplyClient] = useState('');
  const [clientBills, setClientBills] = useState([]);
  const [applyBillId, setApplyBillId] = useState('');
  const [applyAmount, setApplyAmount] = useState('');
  const [applying, setApplying] = useState(false);

  const loadAdvances = async () => {
    setLoading(true);
    try {
      const res = await apiFetch('/api/advances');
      const data = await res.json();
      setAdvances(data.advances || []);
      setTotalAdvance(data.total_advance || 0);
      setAvailable(data.available_advance || 0);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const loadCustomers = async () => {
    try {
      const res = await apiFetch('/api/customers');
      const data = await res.json();
      setCustomers(data || []);
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    loadAdvances();
    loadCustomers();
  }, []);

  useEffect(() => {
    if (!applyClient) {
      setClientBills([]);
      setApplyBillId('');
      return;
    }
    (async () => {
      try {
        const res = await apiFetch(
          `/api/bills?search=${encodeURIComponent(applyClient)}&type=customer`
        );
        const data = await res.json();
        const open = (Array.isArray(data) ? data : data.bills || [])
          .filter((b) => b.customer_name === applyClient)
          .filter((b) => {
            const due = Number(
              b.balance_due ?? Math.max(0, (b.total_amount || 0) - (b.amount_paid || 0))
            );
            return due > 0;
          });
        setClientBills(open);
        setApplyBillId(open[0]?.id ? String(open[0].id) : '');
        if (open[0]) {
          const due = Number(
            open[0].balance_due ??
              Math.max(0, (open[0].total_amount || 0) - (open[0].amount_paid || 0))
          );
          const wallet = advances
            .filter((a) => a.client_name === applyClient)
            .reduce((s, a) => s + (Number(a.remaining ?? a.amount) || 0), 0);
          setApplyAmount(String(Math.min(due, wallet) || ''));
        } else {
          setApplyAmount('');
        }
      } catch (err) {
        console.error(err);
        setClientBills([]);
      }
    })();
  }, [applyClient, advances]);

  const handleRecord = async (e) => {
    e.preventDefault();
    const amt = parseFloat(amount);
    if (!clientName.trim() || !amt || amt <= 0) {
      alert('Client and a valid amount are required');
      return;
    }
    setSaving(true);
    try {
      const res = await apiFetch('/api/advances', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_name: clientName.trim(),
          amount: amt,
          payment_date: paymentDate || pakistanToday(),
          notes,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      setAmount('');
      setNotes('');
      setPaymentDate(pakistanToday());
      await loadAdvances();
    } catch (err) {
      alert(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this advance record?')) return;
    try {
      const res = await apiFetch(`/api/advances/${id}`, { method: 'DELETE' });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Delete failed');
      }
      await loadAdvances();
    } catch (err) {
      alert(err.message);
    }
  };

  const handleApply = async (e) => {
    e.preventDefault();
    if (!applyClient || !applyBillId) {
      alert('Select a client and an open bill');
      return;
    }
    setApplying(true);
    try {
      const res = await apiFetch('/api/advances/apply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_name: applyClient,
          bill_id: Number(applyBillId),
          amount: applyAmount ? Number(applyAmount) : undefined,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      alert(`Applied ${formatCurrency(currencySymbol, data.applied)} to the bill.`);
      setApplyAmount('');
      await loadAdvances();
      setApplyClient(applyClient);
    } catch (err) {
      alert(err.message);
    } finally {
      setApplying(false);
    }
  };

  const clientOptions = [
    ...new Set([
      ...customers.map((c) => c.name),
      ...advances.map((a) => a.client_name).filter(Boolean),
    ]),
  ].sort((a, b) => a.localeCompare(b));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      <div className="glass-panel" style={{ padding: '1.25rem 1.5rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '1rem', flexWrap: 'wrap' }}>
          <div>
            <h2 style={{ fontSize: '1.25rem', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '0.5rem', margin: 0 }}>
              <Wallet size={22} /> Client Advances
            </h2>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginTop: '0.35rem' }}>
              Record money paid ahead, then apply it to open invoices.
            </p>
          </div>
          <button type="button" className="btn-secondary" onClick={loadAdvances} style={{ width: 'auto' }}>
            <RefreshCw size={16} /> Refresh
          </button>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '0.75rem', marginTop: '1rem' }}>
          <div className="surface-block" style={{ padding: '0.85rem' }}>
            <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Total recorded</div>
            <div style={{ fontWeight: 800, fontFamily: 'var(--font-mono)', fontSize: '1.1rem' }}>
              {formatCurrency(currencySymbol, totalAdvance)}
            </div>
          </div>
          <div className="surface-block" style={{ padding: '0.85rem' }}>
            <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Available to apply</div>
            <div style={{ fontWeight: 800, fontFamily: 'var(--font-mono)', fontSize: '1.1rem', color: 'var(--success)' }}>
              {formatCurrency(currencySymbol, available)}
            </div>
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1.25rem' }}>
        <form className="glass-panel" style={{ padding: '1.25rem' }} onSubmit={handleRecord}>
          <h3 style={{ fontSize: '1rem', fontWeight: 800, marginBottom: '1rem' }}>
            <Plus size={16} style={{ verticalAlign: -2 }} /> Record advance
          </h3>
          <div className="form-group">
            <label className="form-label">Client *</label>
            <input
              className="form-input"
              list="advance-clients"
              value={clientName}
              onChange={(e) => setClientName(e.target.value)}
              placeholder="Client name"
              required
            />
            <datalist id="advance-clients">
              {clientOptions.map((n) => (
                <option key={n} value={n} />
              ))}
            </datalist>
          </div>
          <div className="form-group">
            <label className="form-label">Amount ({currencySymbol}) *</label>
            <input
              type="number"
              step="0.01"
              min="0.01"
              className="form-input"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              required
            />
          </div>
          <div className="form-group">
            <label className="form-label">Date</label>
            <input
              type="date"
              className="form-input"
              value={paymentDate}
              onChange={(e) => setPaymentDate(e.target.value)}
            />
          </div>
          <div className="form-group">
            <label className="form-label">Notes</label>
            <input
              className="form-input"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g. JazzCash ahead for next order"
            />
          </div>
          <button type="submit" className="btn-primary" style={{ width: '100%' }} disabled={saving}>
            <Wallet size={16} /> {saving ? 'Saving…' : 'Save Advance'}
          </button>
        </form>

        <form className="glass-panel" style={{ padding: '1.25rem' }} onSubmit={handleApply}>
          <h3 style={{ fontSize: '1rem', fontWeight: 800, marginBottom: '1rem' }}>
            <Banknote size={16} style={{ verticalAlign: -2 }} /> Apply to bill
          </h3>
          <div className="form-group">
            <label className="form-label">Client *</label>
            <select
              className="form-select"
              value={applyClient}
              onChange={(e) => setApplyClient(e.target.value)}
              required
            >
              <option value="">— Choose client —</option>
              {clientOptions.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">Open bill *</label>
            <select
              className="form-select"
              value={applyBillId}
              onChange={(e) => {
                setApplyBillId(e.target.value);
                const bill = clientBills.find((b) => String(b.id) === e.target.value);
                if (bill) {
                  const due = Number(
                    bill.balance_due ??
                      Math.max(0, (bill.total_amount || 0) - (bill.amount_paid || 0))
                  );
                  const wallet = advances
                    .filter((a) => a.client_name === applyClient)
                    .reduce((s, a) => s + (Number(a.remaining ?? a.amount) || 0), 0);
                  setApplyAmount(String(Math.min(due, wallet) || ''));
                }
              }}
              required
              disabled={!applyClient}
            >
              <option value="">
                {!applyClient ? 'Select client first' : clientBills.length ? '— Choose bill —' : 'No open bills'}
              </option>
              {clientBills.map((b) => {
                const due = Number(
                  b.balance_due ?? Math.max(0, (b.total_amount || 0) - (b.amount_paid || 0))
                );
                return (
                  <option key={b.id} value={b.id}>
                    {b.invoice_number} · due {formatCurrency(currencySymbol, due)}
                  </option>
                );
              })}
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">Amount to apply ({currencySymbol})</label>
            <input
              type="number"
              step="0.01"
              min="0.01"
              className="form-input"
              value={applyAmount}
              onChange={(e) => setApplyAmount(e.target.value)}
              placeholder="Leave blank for max"
            />
          </div>
          <button type="submit" className="btn-primary" style={{ width: '100%' }} disabled={applying || !applyBillId}>
            <Banknote size={16} /> {applying ? 'Applying…' : 'Apply Advance'}
          </button>
        </form>
      </div>

      <div className="glass-panel" style={{ padding: '1.25rem' }}>
        <h3 style={{ fontSize: '1rem', fontWeight: 800, marginBottom: '0.85rem' }}>Advance history</h3>
        {loading ? (
          <p style={{ color: 'var(--text-secondary)' }}>Loading…</p>
        ) : advances.length === 0 ? (
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>No advances recorded yet.</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {advances.map((a) => {
              const rem = Number(a.remaining ?? a.amount) || 0;
              const used = Math.max(0, (Number(a.amount) || 0) - rem);
              return (
                <div
                  key={a.id}
                  className="surface-block"
                  style={{
                    padding: '0.85rem 1rem',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    gap: '0.75rem',
                    flexWrap: 'wrap',
                  }}
                >
                  <div>
                    <div style={{ fontWeight: 800 }}>{a.client_name}</div>
                    <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                      {a.payment_date}
                      {a.notes ? ` · ${a.notes}` : ''}
                    </div>
                  </div>
                  <div style={{ textAlign: 'right', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    <div>
                      <div style={{ fontFamily: 'var(--font-mono)', fontWeight: 800 }}>
                        {formatCurrency(currencySymbol, a.amount)}
                      </div>
                      <div style={{ fontSize: '0.72rem', color: rem > 0 ? 'var(--success)' : 'var(--text-muted)' }}>
                        Left {formatCurrency(currencySymbol, rem)}
                        {used > 0 ? ` · used ${formatCurrency(currencySymbol, used)}` : ''}
                      </div>
                    </div>
                    <button
                      type="button"
                      className="btn-danger"
                      style={{ padding: '0.4rem', width: 'auto' }}
                      onClick={() => handleDelete(a.id)}
                      title="Delete"
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
  );
}
