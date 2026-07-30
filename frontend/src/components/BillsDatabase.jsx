import React, { useState, useEffect } from 'react';
import { Search, Eye, Trash2, Edit3, Download, RefreshCw, Check, X, Plus, Copy, Banknote } from 'lucide-react';
import { pakistanToday, formatCurrency } from '../utils/pakistan';
import { apiFetch } from '../api/client';

export default function BillsDatabase({ onViewBill, onDuplicateBill, currencySymbol = 'Rs.' }) {
  const [bills, setBills] = useState([]);
  const [loading, setLoading] = useState(true);
  const [billTypeFilter, setBillTypeFilter] = useState('all'); // 'all', 'customer', 'supplier'
  const [statusFilter, setStatusFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');

  // Edit Modal State
  const [editingBill, setEditingBill] = useState(null);
  const [editType, setEditType] = useState('customer');
  const [editInvNum, setEditInvNum] = useState('');
  const [editCustomerName, setEditCustomerName] = useState('');
  const [editBillDate, setEditBillDate] = useState('');
  const [editStatus, setEditStatus] = useState('pending');
  const [editNotes, setEditNotes] = useState('');
  const [editTaxRate, setEditTaxRate] = useState(0);
  const [editDiscountRate, setEditDiscountRate] = useState(0);
  const [editItems, setEditItems] = useState([]);

  // Payment modal
  const [payBill, setPayBill] = useState(null);
  const [payAmount, setPayAmount] = useState('');
  const [payMethod, setPayMethod] = useState('Cash');
  const [payNotes, setPayNotes] = useState('');
  const [paySaving, setPaySaving] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(searchQuery.trim()), 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const apiFetchBills = async () => {
    setLoading(true);
    try {
      let url = `/api/bills?type=${billTypeFilter}&status=${statusFilter}`;
      if (debouncedSearch) {
        url += `&search=${encodeURIComponent(debouncedSearch)}`;
      }
      const res = await apiFetch(url);
      const data = await res.json();
      setBills(data || []);
    } catch (err) {
      console.error('Error apiFetching bills database:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    apiFetchBills();
  }, [billTypeFilter, statusFilter, debouncedSearch]);

  // Open Edit Modal
  const handleOpenEditModal = (bill) => {
    setEditingBill(bill);
    setEditType(bill.bill_type || 'customer');
    setEditInvNum(bill.invoice_number);
    setEditCustomerName(bill.customer_name);
    setEditBillDate(bill.bill_date);
    setEditStatus(bill.status);
    setEditNotes(bill.notes || '');
    setEditTaxRate(bill.tax_rate ?? 0);
    setEditDiscountRate(bill.discount_rate ?? 0);
    setEditItems(bill.items ? JSON.parse(JSON.stringify(bill.items)) : []);
  };

  // Line Item Handlers in Edit Modal
  const handleItemChange = (index, field, value) => {
    const updated = [...editItems];
    updated[index][field] = value;
    setEditItems(updated);
  };

  const handleAddItemRow = () => {
    setEditItems([...editItems, { description: '', quantity: 1, unit_price: 0 }]);
  };

  const handleRemoveItemRow = (index) => {
    if (editItems.length <= 1) return;
    setEditItems(editItems.filter((_, i) => i !== index));
  };

  // Save Edits to API
  const handleSaveBillEdits = async (e) => {
    e.preventDefault();
    if (!editingBill) return;

    const subtotal = editItems.reduce((sum, item) => sum + (parseFloat(item.quantity || 0) * parseFloat(item.unit_price || 0)), 0);
    const taxRate = parseFloat(editTaxRate) || 0;
    const discountRate = parseFloat(editDiscountRate) || 0;
    const taxAmount = (subtotal * taxRate) / 100;
    const discountAmount = (subtotal * discountRate) / 100;
    const totalAmount = Math.max(0, subtotal + taxAmount - discountAmount);

    try {
      const res = await apiFetch(`/api/bills/${editingBill.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          bill_type: editType,
          invoice_number: editInvNum,
          customer_name: editCustomerName,
          bill_date: editBillDate,
          status: editStatus,
          notes: editNotes,
          subtotal,
          tax_rate: taxRate,
          tax_amount: taxAmount,
          discount_rate: discountRate,
          discount_amount: discountAmount,
          total_amount: totalAmount,
          items: editItems,
        }),
      });

      if (res.ok) {
        setEditingBill(null);
        apiFetchBills();
      } else {
        const err = await res.json().catch(() => ({}));
        alert('Error updating bill: ' + (err.error || `HTTP ${res.status}`));
      }
    } catch (err) {
      alert('Error updating bill: ' + err.message);
    }
  };

  // Update Status directly
  const handleUpdateStatus = async (id, newStatus) => {
    try {
      const res = await apiFetch(`/api/bills/${id}/status`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });
      if (res.ok) {
        apiFetchBills();
      }
    } catch (err) {
      alert('Error updating status: ' + err.message);
    }
  };

  // Delete Bill
  const handleDeleteBill = async (id) => {
    if (!window.confirm('Delete this bill permanently? This cannot be undone.')) {
      return;
    }
    try {
      const res = await apiFetch(`/api/bills/${id}`, { method: 'DELETE' });
      if (res.ok) {
        apiFetchBills();
      }
    } catch (err) {
      alert('Error deleting bill: ' + err.message);
    }
  };

  const openPayModal = (bill) => {
    setPayBill(bill);
    const due = Number(bill.balance_due ?? Math.max(0, (bill.total_amount || 0) - (bill.amount_paid || 0)));
    setPayAmount(due > 0 ? String(due) : '');
    setPayMethod(bill.payment_method || 'Cash');
    setPayNotes('');
  };

  const handleRecordPayment = async (e) => {
    e.preventDefault();
    if (!payBill) return;
    const amount = parseFloat(payAmount);
    if (!amount || amount <= 0) {
      alert('Enter a valid payment amount');
      return;
    }
    setPaySaving(true);
    try {
      const res = await apiFetch(`/api/bills/${payBill.id}/payments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount,
          method: payMethod,
          payment_date: pakistanToday(),
          notes: payNotes,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      setPayBill(null);
      apiFetchBills();
    } catch (err) {
      alert('Payment failed: ' + err.message);
    } finally {
      setPaySaving(false);
    }
  };

  // Export database to CSV
  const handleExportCSV = () => {
    if (bills.length === 0) return;
    const headers = ['Category', 'Invoice #', 'Party / City Name', 'Date', 'Subtotal', 'Total Amount', 'Paid', 'Balance', 'Status'];
    const rows = bills.map((b) => [
      b.bill_type === 'supplier' ? 'Saudia Arabia Buying Cost' : 'Customer Sale',
      b.invoice_number,
      `"${b.customer_name}"`,
      b.bill_date,
      b.subtotal,
      b.total_amount,
      b.amount_paid || 0,
      b.balance_due ?? Math.max(0, (b.total_amount || 0) - (b.amount_paid || 0)),
      b.status,
    ]);

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `Bills_Master_${pakistanToday()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="glass-panel" style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      {/* Header Banner */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h2 style={{ fontSize: '1.4rem', fontWeight: 900 }}>Master Invoices & Bills Database</h2>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
            Edit party names, city/country rates, quantities, and totals directly in the database
          </p>
        </div>

        <div style={{ display: 'flex', gap: '0.75rem' }}>
          <button className="btn-secondary" onClick={handleExportCSV}>
            <Download size={16} /> Export CSV
          </button>
          <button className="btn-secondary" onClick={apiFetchBills} title="Refresh Database">
            <RefreshCw size={16} />
          </button>
        </div>
      </div>

      {/* Filter Toolbar: Category Pills + Search + Payment Status */}
      <div className="surface-block filter-toolbar" style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', alignItems: 'center', padding: '0.85rem' }}>
        {/* Category Pills */}
        <div className="filter-pills" style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
          <button
            type="button"
            className={`nav-btn ${billTypeFilter === 'all' ? 'active' : ''}`}
            onClick={() => setBillTypeFilter('all')}
            style={{ padding: '0.45rem 0.9rem', fontSize: '0.825rem' }}
          >
            All ({bills.length})
          </button>
          <button
            type="button"
            className={`nav-btn ${billTypeFilter === 'customer' ? 'active' : ''}`}
            onClick={() => setBillTypeFilter('customer')}
            style={{ padding: '0.45rem 0.9rem', fontSize: '0.825rem' }}
          >
            Sales
          </button>
          <button
            type="button"
            className={`nav-btn ${billTypeFilter === 'supplier' ? 'active' : ''}`}
            onClick={() => setBillTypeFilter('supplier')}
            style={{ padding: '0.45rem 0.9rem', fontSize: '0.825rem' }}
          >
            Saudia
          </button>
        </div>

        {/* Search */}
        <div style={{ position: 'relative', flex: 1, minWidth: '160px', width: '100%' }}>
          <Search size={16} style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
          <input
            type="text"
            className="form-input"
            style={{ paddingLeft: '2.4rem' }}
            placeholder="Search party, city or bill #..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>

        {/* Payment Status Pills */}
        <div className="filter-pills" style={{ display: 'flex', gap: '0.3rem', flexWrap: 'wrap' }}>
          {['all', 'paid', 'pending', 'overdue'].map((st) => (
            <button
              key={st}
              type="button"
              className={`nav-btn ${statusFilter === st ? 'active' : ''}`}
              onClick={() => setStatusFilter(st)}
              style={{ padding: '0.4rem 0.75rem', fontSize: '0.8rem', textTransform: 'capitalize' }}
            >
              {st}
            </button>
          ))}
        </div>
      </div>

      {/* Master Table */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>
          <RefreshCw className="spin" size={28} />
          <p style={{ marginTop: '0.5rem' }}>Loading bills database...</p>
        </div>
      ) : bills.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>
          No bills found matching your search and filters.
        </div>
      ) : (
        <>
          {/* Desktop table */}
          <div className="table-container desktop-only-table">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Type</th>
                  <th>Invoice #</th>
                  <th>Party</th>
                  <th>Bill Date</th>
                  <th>Amount ({currencySymbol})</th>
                  <th>Status</th>
                  <th style={{ textAlign: 'center' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {bills.map((bill) => (
                  <tr key={bill.id}>
                    <td>
                      <span className={`type-badge ${bill.bill_type === 'supplier' ? 'saudia' : 'sale'}`}>
                        {bill.bill_type === 'supplier' ? 'SAUDIA BUYING' : 'SALE'}
                      </span>
                    </td>
                    <td className="invoice-mono">{bill.invoice_number}</td>
                    <td>
                      <div style={{ fontWeight: 700, fontSize: '0.95rem', color: 'var(--text-primary)' }}>{bill.customer_name}</div>
                      {(Number(bill.amount_paid) > 0 || Number(bill.balance_due) > 0) && bill.status !== 'paid' && (
                        <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', marginTop: 2 }}>
                          Paid {formatCurrency(currencySymbol, bill.amount_paid || 0)} · Due {formatCurrency(currencySymbol, bill.balance_due || 0)}
                        </div>
                      )}
                    </td>
                    <td style={{ color: 'var(--text-secondary)' }}>{bill.bill_date}</td>
                    <td style={{ fontWeight: 800, fontFamily: 'var(--font-mono)', fontSize: '0.95rem', color: 'var(--text-primary)', whiteSpace: 'nowrap' }}>
                      {formatCurrency(currencySymbol, bill.total_amount)}
                    </td>
                    <td>
                      <select
                        className={`badge badge-${bill.status}`}
                        style={{ cursor: 'pointer', border: 'none', appearance: 'none', paddingRight: '0.5rem' }}
                        value={bill.status}
                        onChange={(e) => handleUpdateStatus(bill.id, e.target.value)}
                      >
                        <option value="paid">PAID</option>
                        <option value="pending">PENDING</option>
                        <option value="overdue">OVERDUE</option>
                      </select>
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      <div style={{ display: 'flex', justifyContent: 'center', gap: '0.35rem', flexWrap: 'wrap' }}>
                        <button className="btn-secondary" style={{ padding: '0.35rem 0.55rem', fontSize: '0.75rem', width: 'auto' }} onClick={() => onViewBill(bill)}>
                          <Eye size={14} /> View
                        </button>
                        <button className="btn-secondary" style={{ padding: '0.35rem 0.55rem', fontSize: '0.75rem', width: 'auto' }} onClick={() => openPayModal(bill)} title="Record payment">
                          <Banknote size={14} /> Pay
                        </button>
                        <button className="btn-secondary" style={{ padding: '0.35rem 0.55rem', fontSize: '0.75rem', width: 'auto' }} onClick={() => handleOpenEditModal(bill)}>
                          <Edit3 size={14} /> Edit
                        </button>
                        {onDuplicateBill && (
                          <button className="btn-secondary" style={{ padding: '0.35rem 0.55rem', fontSize: '0.75rem', width: 'auto' }} onClick={() => onDuplicateBill(bill)} title="Duplicate">
                            <Copy size={14} />
                          </button>
                        )}
                        <button className="btn-danger" style={{ padding: '0.35rem 0.55rem', width: 'auto' }} onClick={() => handleDeleteBill(bill.id)}>
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile cards */}
          <div className="mobile-only mobile-card-list">
            {bills.map((bill) => (
              <div className="mobile-card" key={`m-${bill.id}`}>
                <div className="mobile-card-top">
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div className="mobile-card-title">{bill.customer_name}</div>
                    <div className="mobile-card-meta">
                      <span className="invoice-mono">{bill.invoice_number}</span>
                      {' · '}{bill.bill_date}
                      {' · '}{bill.bill_type === 'supplier' ? 'Saudia' : 'Sale'}
                    </div>
                  </div>
                  <div className="mobile-card-amount">{formatCurrency(currencySymbol, bill.total_amount)}</div>
                </div>
                <select
                  className={`badge badge-${bill.status}`}
                  style={{ cursor: 'pointer', border: 'none', width: '100%', textAlign: 'left', padding: '0.55rem 0.75rem', fontSize: '0.8rem' }}
                  value={bill.status}
                  onChange={(e) => handleUpdateStatus(bill.id, e.target.value)}
                >
                  <option value="paid">PAID</option>
                  <option value="pending">PENDING</option>
                  <option value="overdue">OVERDUE</option>
                </select>
                <div className="mobile-card-actions">
                  <button className="btn-secondary" onClick={() => onViewBill(bill)}>
                    <Eye size={14} /> View
                  </button>
                  <button className="btn-secondary" onClick={() => openPayModal(bill)}>
                    <Banknote size={14} /> Pay
                  </button>
                  <button className="btn-secondary" onClick={() => handleOpenEditModal(bill)}>
                    <Edit3 size={14} /> Edit
                  </button>
                  {onDuplicateBill && (
                    <button className="btn-secondary" onClick={() => onDuplicateBill(bill)}>
                      <Copy size={14} />
                    </button>
                  )}
                  <button className="btn-danger" onClick={() => handleDeleteBill(bill.id)}>
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {/* FULL EDIT BILL INTERACTIVE MODAL */}
      {editingBill && (
        <div className="modal-sheet" style={{ position: 'fixed', inset: 0, background: 'rgba(7,41,41,0.45)', backdropFilter: 'blur(5px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, padding: '1rem' }}>
          <form onSubmit={handleSaveBillEdits} className="glass-panel" style={{ width: '100%', maxWidth: '750px', maxHeight: '90vh', overflowY: 'auto', padding: '1.75rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.75rem' }}>
              <div>
                <h3 style={{ fontSize: '1.15rem', fontWeight: 800, color: 'var(--text-primary)' }}>Edit Bill #{editingBill.invoice_number}</h3>
                <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Modify party, items, quantities, and rates</p>
              </div>
              <button type="button" className="btn-secondary" style={{ padding: '0.4rem 0.6rem', width: 'auto' }} onClick={() => setEditingBill(null)}>
                <X size={18} />
              </button>
            </div>

            <div className="grid-2-mobile-1" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
              <div className="form-group">
                <label className="form-label">Bill Category *</label>
                <select className="form-select" value={editType} onChange={(e) => setEditType(e.target.value)}>
                  <option value="customer">🛒 Customer Sale Invoice</option>
                  <option value="supplier">🇸🇦 Saudia Arabia Buying Cost Bill</option>
                </select>
              </div>

              <div className="form-group">
                <label className="form-label">Bill Serial Number *</label>
                <input
                  type="text"
                  className="form-input"
                  style={{ fontFamily: 'var(--font-mono)', fontWeight: 700 }}
                  value={editInvNum}
                  onChange={(e) => setEditInvNum(e.target.value)}
                  placeholder="e.g. INV-2026-0001"
                  required
                />
              </div>

              <div className="form-group">
                <label className="form-label">Party / City / Country Name *</label>
                <input type="text" className="form-input" value={editCustomerName} onChange={(e) => setEditCustomerName(e.target.value)} required />
              </div>

              <div className="form-group">
                <label className="form-label">Bill Date *</label>
                <input type="date" className="form-input" value={editBillDate} onChange={(e) => setEditBillDate(e.target.value)} required />
              </div>

              <div className="form-group">
                <label className="form-label">Tax Rate (%)</label>
                <input type="number" step="0.1" min="0" className="form-input" value={editTaxRate} onChange={(e) => setEditTaxRate(e.target.value)} />
              </div>

              <div className="form-group">
                <label className="form-label">Discount Rate (%)</label>
                <input type="number" step="0.1" min="0" className="form-input" value={editDiscountRate} onChange={(e) => setEditDiscountRate(e.target.value)} />
              </div>
            </div>

            {/* Line Items Editor */}
            <div className="surface-block" style={{ padding: '1rem', marginBottom: '1rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                <h4 style={{ fontWeight: 800, fontSize: '0.95rem' }}>Line Items & Pricing</h4>
                <button type="button" className="btn-secondary" style={{ padding: '0.3rem 0.6rem', fontSize: '0.75rem' }} onClick={handleAddItemRow}>
                  <Plus size={14} /> Add Item Row
                </button>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                {editItems.map((item, idx) => (
                  <div key={idx} className="grid-2-mobile-1" style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 40px', gap: '0.5rem', alignItems: 'center' }}>
                    <input
                      type="text"
                      className="form-input"
                      placeholder="Item Description"
                      value={item.description}
                      onChange={(e) => handleItemChange(idx, 'description', e.target.value)}
                    />
                    <input
                      type="number"
                      min="1"
                      className="form-input"
                      placeholder="Qty"
                      value={item.quantity}
                      onChange={(e) => handleItemChange(idx, 'quantity', parseFloat(e.target.value) || 0)}
                    />
                    <input
                      type="number"
                      step="0.01"
                      className="form-input"
                      placeholder="Rate"
                      value={item.unit_price}
                      onChange={(e) => handleItemChange(idx, 'unit_price', parseFloat(e.target.value) || 0)}
                    />
                    <button type="button" className="btn-danger" style={{ padding: '0.4rem', width: 'auto' }} onClick={() => handleRemoveItemRow(idx)}>
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))}
              </div>
            </div>

            {/* Edit Actions */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '1.25rem', borderTop: '1px solid var(--border-color)', paddingTop: '1rem' }}>
              <button type="button" className="btn-secondary" onClick={() => setEditingBill(null)}>
                Cancel
              </button>
              <button type="submit" className="btn-primary">
                <Check size={16} /> Save Bill Changes
              </button>
            </div>
          </form>
        </div>
      )}

      {payBill && (
        <div className="modal-sheet" style={{ position: 'fixed', inset: 0, background: 'rgba(7,41,41,0.45)', backdropFilter: 'blur(5px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, padding: '1rem' }}>
          <form onSubmit={handleRecordPayment} className="glass-panel" style={{ width: '100%', maxWidth: '420px', padding: '1.5rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <div>
                <h3 style={{ fontSize: '1.05rem', fontWeight: 800 }}>Record Payment</h3>
                <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                  {payBill.invoice_number} · Balance {formatCurrency(currencySymbol, payBill.balance_due ?? 0)}
                </p>
              </div>
              <button type="button" className="btn-secondary" style={{ padding: '0.4rem 0.6rem', width: 'auto' }} onClick={() => setPayBill(null)}>
                <X size={18} />
              </button>
            </div>
            <div className="form-group">
              <label className="form-label">Amount ({currencySymbol})</label>
              <input type="number" step="0.01" min="0.01" className="form-input" value={payAmount} onChange={(e) => setPayAmount(e.target.value)} required />
            </div>
            <div className="form-group">
              <label className="form-label">Method</label>
              <select className="form-select" value={payMethod} onChange={(e) => setPayMethod(e.target.value)}>
                <option>Cash</option>
                <option>Bank Transfer / Raast</option>
                <option>JazzCash</option>
                <option>EasyPaisa</option>
                <option>Card</option>
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Notes</label>
              <input type="text" className="form-input" value={payNotes} onChange={(e) => setPayNotes(e.target.value)} placeholder="Optional" />
            </div>
            <div style={{ display: 'flex', gap: '0.6rem', justifyContent: 'flex-end', marginTop: '0.75rem' }}>
              <button type="button" className="btn-secondary" onClick={() => setPayBill(null)}>Cancel</button>
              <button type="submit" className="btn-primary" disabled={paySaving}>
                <Banknote size={16} /> {paySaving ? 'Saving…' : 'Save Payment'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
