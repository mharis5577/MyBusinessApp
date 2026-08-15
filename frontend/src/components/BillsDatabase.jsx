import React, { useState, useEffect } from 'react';
import { Search, Eye, Edit3, Download, RefreshCw, Check, X, Plus, Copy, Banknote, MessageSquare, Smartphone, ImagePlus, Undo2, Trash2, PlusCircle, FileText } from 'lucide-react';
import BillAdjustSheet from './BillAdjustSheet';
import StatusBadge, { StatusSelect } from './StatusBadge';
import EmptyState from './EmptyState';
import ConfirmDialog from './ConfirmDialog';
import AppSelect from './AppSelect';
import { isCancelled } from '../utils/billAdjust';
import { pakistanToday, formatCurrency, formatBillDateTime } from '../utils/pakistan';
import { apiFetch } from '../api/client';
import { useToast } from '../toast/ToastContext';
import { downloadBlob } from '../utils/downloadFile';
import { downloadCsv, downloadTablePdf, exportMoney } from '../utils/tableExport';
import { compressImageToDataUrl } from '../utils/imageCompress';
import {
  buildPaymentReminderText,
  openWhatsAppReminder,
  openSmsReminder,
} from '../utils/paymentReminder';
import { paymentSummaryText, billBalance } from '../utils/billPayments';

export default function BillsDatabase({
  onViewBill,
  onDuplicateBill,
  onNavigate,
  currencySymbol = 'Rs.',
  urduLabels = false,
  settings: settingsProp = {},
}) {
  const toast = useToast();
  const [bills, setBills] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [listAnimKey, setListAnimKey] = useState(0);
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
  const [payTendered, setPayTendered] = useState('');
  const [paySaving, setPaySaving] = useState(false);
  const [payScreenshot, setPayScreenshot] = useState('');
  const [payScreenshotName, setPayScreenshotName] = useState('');
  const [payHistory, setPayHistory] = useState([]);
  const [adjustBill, setAdjustBill] = useState(null);
  const [settings, setSettings] = useState(settingsProp || {});
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    setSettings(settingsProp || {});
  }, [settingsProp]);

  useEffect(() => {
    if (settingsProp?.company_name) return;
    apiFetch('/api/settings')
      .then((res) => res.json())
      .then((data) => {
        if (data) setSettings((prev) => ({ ...prev, ...data }));
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(searchQuery.trim()), 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const apiFetchBills = async (opts = {}) => {
    const soft = opts.soft === true;
    if (soft) setRefreshing(true);
    else setLoading(true);
    try {
      let url = `/api/bills?type=${billTypeFilter}&status=${statusFilter}`;
      if (debouncedSearch) {
        url += `&search=${encodeURIComponent(debouncedSearch)}`;
      }
      const res = await apiFetch(url);
      const data = await res.json();
      setBills(data || []);
      if (soft) setListAnimKey((k) => k + 1);
    } catch (err) {
      console.error('Error apiFetching bills database:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    apiFetchBills();
  }, [billTypeFilter, statusFilter, debouncedSearch]);

  // Open Edit Modal
  const handleOpenEditModal = (bill) => {
    if (isCancelled(bill)) {
      toast.info('Cancelled bills are kept for history and cannot be edited.');
      return;
    }
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
        toast.error('Error updating bill: ' + (err.error || `HTTP ${res.status}`));
      }
    } catch (err) {
      toast.error('Error updating bill: ' + err.message);
    }
  };

  // Update Status directly
  const handleUpdateStatus = async (id, newStatus) => {
    const bill = bills.find((b) => b.id === id);
    if (bill && newStatus !== 'paid' && billBalance(bill) <= 0) {
      toast.info('This bill is fully paid — status stays Paid. Record a return or adjust payments if it should be due.');
      return;
    }
    try {
      const res = await apiFetch(`/api/bills/${id}/status`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      apiFetchBills();
    } catch (err) {
      toast.error('Error updating status: ' + err.message);
    }
  };

  const askDeleteBill = (bill) => {
    setDeleteTarget(bill);
  };

  const cancelDeleteBill = () => {
    if (deleting) return;
    setDeleteTarget(null);
  };

  const confirmDeleteBill = async () => {
    if (!deleteTarget) return;
    const bill = deleteTarget;
    const label = bill.invoice_number || `#${bill.id}`;
    setDeleting(true);
    try {
      const res = await apiFetch(`/api/bills/${bill.id}`, { method: 'DELETE' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      toast.success(`Deleted ${label}`);
      if (editingBill?.id === bill.id) setEditingBill(null);
      if (payBill?.id === bill.id) setPayBill(null);
      if (adjustBill?.id === bill.id) setAdjustBill(null);
      setDeleteTarget(null);
      apiFetchBills();
    } catch (err) {
      toast.error('Delete failed: ' + err.message);
    } finally {
      setDeleting(false);
    }
  };

  const openAdjust = async (bill) => {
    if (isCancelled(bill)) return;
    let full = bill;
    if (!bill.items?.length) {
      try {
        const res = await apiFetch(`/api/bills/${bill.id}`);
        const data = await res.json();
        if (res.ok && data?.id) full = data;
      } catch (_) {
        /* use list row */
      }
    }
    setAdjustBill(full);
  };

  const canTakePayment = (bill) => !isCancelled(bill) && billBalance(bill) > 0;

  const openPayModal = async (bill) => {
    if (isCancelled(bill)) {
      toast.info('Cancelled bills cannot take payment.');
      return;
    }
    const due = billBalance(bill);
    if (due <= 0) {
      toast.info('This bill is fully paid — nothing left to collect.');
      return;
    }
    setPayBill(bill);
    setPayAmount(String(due));
    setPayMethod(bill.payment_method || 'Cash');
    setPayNotes('');
    setPayTendered('');
    setPayScreenshot('');
    setPayScreenshotName('');
    setPayHistory([]);
    try {
      const res = await apiFetch(`/api/bills/${bill.id}/payments`);
      const data = await res.json();
      if (res.ok) setPayHistory(Array.isArray(data) ? data : data?.payments || []);
    } catch (_) {
      setPayHistory(bill.payments || []);
    }
  };

  const handleRemind = (bill, channel) => {
    const due = billBalance(bill);
    if (due <= 0) {
      toast.error('No balance due on this bill.');
      return;
    }
    const text = buildPaymentReminderText({
      bill: { ...bill, balance_due: due },
      settings,
      currencySymbol,
      urdu: urduLabels,
    });
    if (channel === 'sms') openSmsReminder(bill.customer_phone, text);
    else openWhatsAppReminder(bill.customer_phone, text);
  };

  const handleScreenshotPick = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const dataUrl = await compressImageToDataUrl(file);
      setPayScreenshot(dataUrl);
      setPayScreenshotName(file.name || 'screenshot.jpg');
    } catch (err) {
      toast.error(err.message || 'Could not attach image');
    }
  };

  const payAmountNum = parseFloat(payAmount) || 0;
  const payTenderedNum = parseFloat(payTendered);
  const isPayCash = String(payMethod).toLowerCase().includes('cash');
  const payChangeDue =
    isPayCash && Number.isFinite(payTenderedNum) && payTenderedNum > 0
      ? Math.round((payTenderedNum - payAmountNum) * 100) / 100
      : null;
  const paySummary = payBill ? paymentSummaryText(currencySymbol, payBill, payAmountNum) : null;

  const handleRecordPayment = async (e) => {
    e.preventDefault();
    if (!payBill) return;
    const amount = parseFloat(payAmount);
    if (!amount || amount <= 0) {
      toast.error('Enter a valid payment amount');
      return;
    }
    setPaySaving(true);
    try {
      let notes = payNotes;
      if (isPayCash && payChangeDue != null) {
        const cashLine = `Cash tendered: ${currencySymbol}${payTenderedNum.toFixed(2)} · Change: ${currencySymbol}${Math.max(0, payChangeDue).toFixed(2)}${payChangeDue < 0 ? ' (short)' : ''}`;
        notes = notes?.trim() ? `${notes}\n${cashLine}` : cashLine;
      }
      const res = await apiFetch(`/api/bills/${payBill.id}/payments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount,
          method: payMethod,
          payment_date: pakistanToday(),
          notes,
          screenshot_data: payScreenshot || '',
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      const remain = Number(data.balance_due) || 0;
      toast.success(
        remain > 0
          ? `Payment saved. Remaining ${formatCurrency(currencySymbol, remain)}`
          : 'Payment saved. Bill fully paid.'
      );
      setPayBill(null);
      apiFetchBills();
    } catch (err) {
      toast.error('Payment failed: ' + err.message);
    } finally {
      setPaySaving(false);
    }
  };

  const buildBillsExportTable = () => {
    const headers = [
      'Category',
      'Invoice #',
      'Party',
      'Date',
      'Time',
      'Subtotal',
      'Total',
      'Paid',
      'Balance',
      'Status',
    ];
    const rows = bills.map((b) => {
      // Prefer line-item totals when stored totals look wrong
      let subtotal = Number(b.subtotal) || 0;
      let total = Number(b.total_amount) || 0;
      if (Array.isArray(b.items) && b.items.length) {
        const fromItems = b.items.reduce((s, it) => {
          const qty = Math.max(0, (Number(it.quantity) || 0) - (Number(it.returned_qty) || 0));
          return s + qty * (Number(it.unit_price) || 0);
        }, 0);
        const taxRate = Number(b.tax_rate) || 0;
        const discountRate = Number(b.discount_rate) || 0;
        const discount = (fromItems * discountRate) / 100;
        const after = Math.max(0, fromItems - discount);
        const tax = (after * taxRate) / 100;
        const itemsTotal = Math.round((after + tax) * 100) / 100;
        if (itemsTotal > 0 && (total <= 0 || Math.abs(total - itemsTotal) > 0.02)) {
          subtotal = Math.round(fromItems * 100) / 100;
          total = itemsTotal;
        }
      }
      const paid = Number(b.amount_paid) || 0;
      const balance = Math.max(0, Math.round((total - paid) * 100) / 100);
      let status = b.status || 'pending';
      if (!isCancelled(b) && total > 0) {
        if (balance <= 0) status = 'paid';
        else if (status === 'paid') status = 'due';
      }
      return [
        b.bill_type === 'supplier' ? 'Saudia Buying' : 'Customer Sale',
        b.invoice_number || '',
        b.customer_name || '',
        b.bill_date || '',
        b.bill_time || '',
        exportMoney(subtotal),
        exportMoney(total),
        exportMoney(paid),
        exportMoney(balance),
        status,
      ];
    });
    return { headers, rows };
  };

  const handleExportCSV = async () => {
    if (bills.length === 0) {
      toast.info('No bills to export');
      return;
    }
    try {
      const { headers, rows } = buildBillsExportTable();
      await downloadCsv(headers, rows, `Bills_Master_${pakistanToday()}.csv`);
      toast.success(`Exported ${rows.length} bill${rows.length === 1 ? '' : 's'} (CSV)`);
    } catch (err) {
      if (err?.name !== 'AbortError') toast.error('CSV export failed: ' + err.message);
    }
  };

  const handleExportPDF = async () => {
    if (bills.length === 0) {
      toast.info('No bills to export');
      return;
    }
    try {
      const { headers, rows } = buildBillsExportTable();
      const filterBits = [
        billTypeFilter !== 'all' ? billTypeFilter : null,
        statusFilter !== 'all' ? statusFilter : null,
        debouncedSearch ? `search “${debouncedSearch}”` : null,
      ].filter(Boolean);
      await downloadTablePdf({
        title: 'Elite Chocolate — Bills Master',
        subtitle: `${pakistanToday()} · ${rows.length} bill(s)${filterBits.length ? ` · ${filterBits.join(' · ')}` : ''}`,
        headers,
        rows,
        filename: `Bills_Master_${pakistanToday()}.pdf`,
        landscape: true,
        colWeights: [1.2, 1.3, 1.4, 1.1, 0.7, 1.1, 1.1, 1.1, 1.1, 0.8],
      });
      toast.success(`Exported ${rows.length} bill${rows.length === 1 ? '' : 's'} (PDF)`);
    } catch (err) {
      if (err?.name !== 'AbortError') toast.error('PDF export failed: ' + err.message);
    }
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

        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
          <button className="btn-secondary" onClick={handleExportCSV} disabled={!bills.length}>
            <Download size={16} /> Export CSV
          </button>
          <button className="btn-secondary" onClick={handleExportPDF} disabled={!bills.length}>
            <FileText size={16} /> Export PDF
          </button>
          <button
            className="btn-secondary bills-refresh-btn"
            onClick={() => apiFetchBills({ soft: true })}
            title="Refresh Database"
            disabled={refreshing || loading}
            aria-busy={refreshing}
          >
            <RefreshCw size={16} className={refreshing ? 'spin' : undefined} />
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
          {['all', 'paid', 'pending', 'overdue', 'cancelled'].map((st) => (
            <button
              key={st}
              type="button"
              className={`nav-btn ${statusFilter === st ? 'active' : ''}`}
              onClick={() => setStatusFilter(st)}
              style={{ padding: '0.4rem 0.75rem', fontSize: '0.8rem', textTransform: 'capitalize' }}
            >
              {st === 'pending' ? 'Due' : st}
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
        searchQuery || statusFilter !== 'all' || billTypeFilter !== 'all' ? (
          <div className="empty-state">
            <h3 className="empty-state-title">No matches</h3>
            <p className="empty-state-body">Try a different search or clear filters.</p>
          </div>
        ) : (
          <EmptyState
            title="No bills yet"
            body="Create your first bill to start tracking sales and dues."
            actionLabel="Create first bill"
            onAction={() => onNavigate?.('create')}
            icon={PlusCircle}
          />
        )
      ) : (
        <div
          key={listAnimKey}
          className={`bills-list-panel${refreshing ? ' is-refreshing' : ''}${listAnimKey > 0 ? ' bills-list-panel--enter' : ''}`}
        >
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
                      {(billBalance(bill) > 0 || Number(bill.amount_paid) > 0) && (
                        <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', marginTop: 2 }}>
                          Paid {formatCurrency(currencySymbol, bill.amount_paid || 0)}
                          {billBalance(bill) > 0
                            ? ` · Due ${formatCurrency(currencySymbol, billBalance(bill))}`
                            : ' · Cleared'}
                        </div>
                      )}
                    </td>
                    <td style={{ color: 'var(--text-secondary)' }}>{formatBillDateTime(bill)}</td>
                    <td style={{ fontWeight: 800, fontFamily: 'var(--font-mono)', fontSize: '0.95rem', color: 'var(--text-primary)', whiteSpace: 'nowrap' }}>
                      {formatCurrency(currencySymbol, bill.total_amount)}
                    </td>
                    <td>
                      {isCancelled(bill) ? (
                        <StatusBadge status="cancelled" />
                      ) : (
                        <StatusSelect
                          value={bill.status}
                          onChange={(next) => handleUpdateStatus(bill.id, next)}
                        />
                      )}
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      <div style={{ display: 'flex', justifyContent: 'center', gap: '0.35rem', flexWrap: 'wrap' }}>
                        <button className="btn-secondary" style={{ padding: '0.35rem 0.55rem', fontSize: '0.75rem', width: 'auto' }} onClick={() => onViewBill(bill)}>
                          <Eye size={14} /> View
                        </button>
                        {!isCancelled(bill) && (
                          <button
                            className="btn-secondary"
                            style={{ padding: '0.35rem 0.55rem', fontSize: '0.75rem', width: 'auto', opacity: canTakePayment(bill) ? 1 : 0.45 }}
                            onClick={() => openPayModal(bill)}
                            disabled={!canTakePayment(bill)}
                            title={canTakePayment(bill) ? 'Record payment' : 'Fully paid — Pay locked'}
                          >
                            <Banknote size={14} /> Pay
                          </button>
                        )}
                        {canTakePayment(bill) &&
                          bill.bill_type !== 'supplier' && (
                          <>
                            <button
                              className="btn-secondary"
                              style={{ padding: '0.35rem 0.55rem', width: 'auto', color: '#25D366' }}
                              onClick={() => handleRemind(bill, 'whatsapp')}
                              title="WhatsApp reminder"
                            >
                              <MessageSquare size={14} />
                            </button>
                            <button
                              className="btn-secondary"
                              style={{ padding: '0.35rem 0.55rem', width: 'auto' }}
                              onClick={() => handleRemind(bill, 'sms')}
                              title="SMS reminder"
                            >
                              <Smartphone size={14} />
                            </button>
                          </>
                        )}
                        {!isCancelled(bill) && (
                          <button className="btn-secondary" style={{ padding: '0.35rem 0.55rem', fontSize: '0.75rem', width: 'auto' }} onClick={() => handleOpenEditModal(bill)}>
                            <Edit3 size={14} /> Edit
                          </button>
                        )}
                        {onDuplicateBill && (
                          <button className="btn-secondary" style={{ padding: '0.35rem 0.55rem', fontSize: '0.75rem', width: 'auto' }} onClick={() => onDuplicateBill(bill)} title="Duplicate">
                            <Copy size={14} />
                          </button>
                        )}
                        {!isCancelled(bill) && (
                          <button className="btn-secondary" style={{ padding: '0.35rem 0.55rem', width: 'auto' }} onClick={() => openAdjust(bill)} title="Return or cancel">
                            <Undo2 size={14} />
                          </button>
                        )}
                        <button
                          className="btn-danger"
                          style={{ padding: '0.35rem 0.55rem', width: 'auto' }}
                          onClick={() => askDeleteBill(bill)}
                          title="Delete bill permanently"
                        >
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
                      {' · '}{formatBillDateTime(bill)}
                      {' · '}{bill.bill_type === 'supplier' ? 'Saudia' : 'Sale'}
                    </div>
                  </div>
                  <div className="mobile-card-amount">{formatCurrency(currencySymbol, bill.total_amount)}</div>
                </div>
                {isCancelled(bill) ? (
                  <StatusBadge status="cancelled" />
                ) : (
                  <StatusSelect
                    block
                    value={bill.status}
                    onChange={(next) => handleUpdateStatus(bill.id, next)}
                  />
                )}
                <div className="mobile-card-actions">
                  <div className="mobile-card-actions-main">
                    <button className="btn-secondary" onClick={() => onViewBill(bill)}>
                      <Eye size={14} /> View
                    </button>
                    {!isCancelled(bill) && (
                      <button
                        className="btn-secondary"
                        onClick={() => openPayModal(bill)}
                        disabled={!canTakePayment(bill)}
                        style={{ opacity: canTakePayment(bill) ? 1 : 0.45 }}
                        title={canTakePayment(bill) ? 'Record payment' : 'Fully paid — Pay locked'}
                      >
                        <Banknote size={14} /> Pay
                      </button>
                    )}
                    {canTakePayment(bill) &&
                      bill.bill_type !== 'supplier' && (
                      <>
                        <button
                          className="btn-secondary"
                          style={{ color: '#25D366' }}
                          onClick={() => handleRemind(bill, 'whatsapp')}
                          title="WhatsApp payment reminder"
                        >
                          <MessageSquare size={14} />
                        </button>
                        <button
                          className="btn-secondary"
                          onClick={() => handleRemind(bill, 'sms')}
                          title="SMS payment reminder"
                        >
                          <Smartphone size={14} />
                        </button>
                      </>
                    )}
                    {!isCancelled(bill) && (
                      <button className="btn-secondary" onClick={() => handleOpenEditModal(bill)}>
                        <Edit3 size={14} /> Edit
                      </button>
                    )}
                    {onDuplicateBill && (
                      <button className="btn-secondary" onClick={() => onDuplicateBill(bill)} title="Duplicate bill">
                        <Copy size={14} />
                      </button>
                    )}
                  </div>
                  <div className="mobile-card-actions-foot">
                    {!isCancelled(bill) && (
                      <button className="btn-secondary" onClick={() => openAdjust(bill)}>
                        <Undo2 size={14} /> Return
                      </button>
                    )}
                    <button className="btn-danger" onClick={() => askDeleteBill(bill)} title="Delete bill permanently">
                      <Trash2 size={14} /> Delete
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* FULL EDIT BILL INTERACTIVE MODAL */}
      {editingBill && (
        <div className="modal-sheet" style={{ position: 'fixed', inset: 0, background: 'rgba(7,41,41,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, padding: '1rem' }}>
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
                <AppSelect
                  value={editType}
                  onChange={setEditType}
                  aria-label="Bill category"
                  options={[
                    { value: 'customer', label: 'Customer Sale Invoice' },
                    { value: 'supplier', label: 'Saudia Purchase / Payment Advice' },
                  ]}
                />
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
                <label className="form-label">
                  {editType === 'supplier' ? 'Supplier / Pay To *' : 'Customer / Party Name *'}
                </label>
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
        <div className="modal-sheet" style={{ position: 'fixed', inset: 0, background: 'rgba(7,41,41,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, padding: '1rem' }}>
          <form onSubmit={handleRecordPayment} className="glass-panel pay-modal" style={{ width: '100%', maxWidth: '400px', padding: '1.35rem 1.4rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem' }}>
              <div>
                <h3 style={{ fontSize: '1.05rem', fontWeight: 800, margin: 0 }}>Record payment</h3>
                <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', margin: '0.25rem 0 0' }}>
                  {payBill.invoice_number} · {payBill.customer_name}
                </p>
              </div>
              <button type="button" className="btn-secondary" style={{ padding: '0.4rem 0.6rem', width: 'auto' }} onClick={() => setPayBill(null)}>
                <X size={18} />
              </button>
            </div>

            {paySummary && (
              <div className="pay-due-banner">
                <span className="pay-due-label">Still due</span>
                <strong className="pay-due-value">{paySummary.dueLabel}</strong>
                {paySummary.paid > 0 && (
                  <span className="pay-due-hint">
                    Bill {paySummary.totalLabel} · already paid {paySummary.paidLabel}
                  </span>
                )}
              </div>
            )}

            {payHistory.length > 0 && (
              <details className="pay-history-details">
                <summary>Previous payments ({payHistory.length})</summary>
                <div className="pay-history-list">
                  {payHistory.map((p) => (
                    <div key={p.id} className="pay-history-row">
                      <span>{p.payment_date} · {p.method}</span>
                      <strong>{formatCurrency(currencySymbol, p.amount)}</strong>
                    </div>
                  ))}
                </div>
              </details>
            )}

            <div className="form-group">
              <div className="pay-amount-head">
                <label className="form-label" style={{ margin: 0 }}>Amount received ({currencySymbol})</label>
                {paySummary?.balance > 0 && (
                  <button
                    type="button"
                    className="pay-full-btn"
                    onClick={() => setPayAmount(String(paySummary.balance))}
                  >
                    Pay full due
                  </button>
                )}
              </div>
              <input
                type="number"
                step="0.01"
                min="0.01"
                className="form-input"
                value={payAmount}
                onChange={(e) => setPayAmount(e.target.value)}
                required
                autoFocus
              />
              {paySummary && payAmountNum > 0 && (
                <p className={`pay-left-line ${paySummary.remaining <= 0 ? 'is-clear' : ''}`}>
                  {paySummary.remaining <= 0
                    ? 'This clears the bill.'
                    : `Left after save: ${paySummary.leftLabel}`}
                </p>
              )}
            </div>

            <div className="form-group">
              <label className="form-label">How paid</label>
              <AppSelect
                value={payMethod}
                aria-label="How paid"
                onChange={(next) => {
                  setPayMethod(next);
                  if (!String(next).toLowerCase().includes('cash')) setPayTendered('');
                }}
                options={['Cash', 'Bank Transfer / Raast', 'JazzCash', 'EasyPaisa', 'Card']}
              />
            </div>

            {isPayCash && (
              <div className="cash-change-box form-group">
                <label className="form-label">Cash tendered ({currencySymbol})</label>
                <input
                  type="number"
                  step="1"
                  min="0"
                  className="form-input"
                  placeholder="Customer handed you…"
                  value={payTendered}
                  onChange={(e) => setPayTendered(e.target.value)}
                />
                <div className="cash-chip-row">
                  <button type="button" className="cash-chip" onClick={() => setPayTendered(String(Math.ceil(payAmountNum)))}>
                    Exact
                  </button>
                  {[500, 1000, 5000].map((n) => (
                    <button key={n} type="button" className="cash-chip" onClick={() => setPayTendered(String(n))}>
                      {currencySymbol}{n}
                    </button>
                  ))}
                </div>
                {payChangeDue != null && (
                  <div className={`cash-change-result ${payChangeDue < 0 ? 'is-short' : 'is-ok'}`}>
                    {payChangeDue < 0
                      ? `Short by ${currencySymbol}${Math.abs(payChangeDue).toFixed(2)}`
                      : `Change due: ${currencySymbol}${payChangeDue.toFixed(2)}`}
                  </div>
                )}
              </div>
            )}

            <details className="pay-more-details">
              <summary>Notes / screenshot (optional)</summary>
              <div className="form-group" style={{ marginTop: '0.65rem' }}>
                <label className="form-label">Notes</label>
                <input type="text" className="form-input" value={payNotes} onChange={(e) => setPayNotes(e.target.value)} placeholder="Optional" />
              </div>
              <div className="form-group">
                <label className="form-label">Screenshot</label>
                <label className="btn-secondary" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', cursor: 'pointer', width: 'auto' }}>
                  <ImagePlus size={16} />
                  {payScreenshotName || 'Attach image'}
                  <input type="file" accept="image/*" capture="environment" style={{ display: 'none' }} onChange={handleScreenshotPick} />
                </label>
                {payScreenshot && (
                  <div style={{ marginTop: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                    <img src={payScreenshot} alt="Payment proof" style={{ width: 72, height: 72, objectFit: 'cover', borderRadius: 8, border: '1px solid var(--border-color)' }} />
                    <button type="button" className="btn-secondary" style={{ width: 'auto', padding: '0.35rem 0.6rem' }} onClick={() => { setPayScreenshot(''); setPayScreenshotName(''); }}>
                      Remove
                    </button>
                  </div>
                )}
              </div>
            </details>

            <div style={{ display: 'flex', gap: '0.6rem', justifyContent: 'flex-end', marginTop: '1rem' }}>
              <button type="button" className="btn-secondary" onClick={() => setPayBill(null)}>Cancel</button>
              <button type="submit" className="btn-primary" disabled={paySaving}>
                <Banknote size={16} /> {paySaving ? 'Saving…' : 'Save payment'}
              </button>
            </div>
          </form>
        </div>
      )}

      <BillAdjustSheet
        bill={adjustBill}
        open={Boolean(adjustBill)}
        onClose={() => setAdjustBill(null)}
        onUpdated={() => apiFetchBills()}
        currencySymbol={currencySymbol}
      />

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title={`Delete ${deleteTarget?.invoice_number || (deleteTarget ? `#${deleteTarget.id}` : 'bill')}?`}
        message="This cannot be undone. Stock will be put back if the bill was not already cancelled."
        confirmLabel={deleting ? 'Deleting…' : 'Delete'}
        busy={deleting}
        onCancel={cancelDeleteBill}
        onConfirm={confirmDeleteBill}
      />
    </div>
  );
}
