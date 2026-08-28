import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Search, Eye, Edit3, Download, RefreshCw, Check, X, Plus, Copy, Banknote, MessageSquare, Smartphone, ImagePlus, Undo2, Trash2, PlusCircle, FileText, FileSpreadsheet, ChevronDown, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, Bookmark, CheckCircle2, Settings, Palette, SlidersHorizontal } from 'lucide-react';
import BillAdjustSheet from './BillAdjustSheet';
import StatusBadge, { StatusSelect } from './StatusBadge';
import TypeSelect from './TypeSelect';
import EmptyState from './EmptyState';
import ConfirmDialog from './ConfirmDialog';
import AppSelect from './AppSelect';
import { isCancelled, recalcBillTotals } from '../utils/billAdjust';
import { pakistanToday, formatCurrency, formatBillDateTime, addDaysToDateString } from '../utils/pakistan';
import { apiFetch } from '../api/client';
import { useToast } from '../toast/ToastContext';
import { downloadBlob } from '../utils/downloadFile';
import { downloadTablePdf, exportMoney } from '../utils/tableExport';
import { compressImageToDataUrl } from '../utils/imageCompress';
import { persistPaymentProof } from '../utils/paymentProof';
import {
  buildPaymentReminderText,
  openWhatsAppReminder,
  openSmsReminder,
} from '../utils/paymentReminder';
import { paymentSummaryText, billBalance } from '../utils/billPayments';
import useDialog from '../utils/useDialog';
import { loadFullBill } from '../utils/loadBill';
import { INVOICE_TEMPLATES, saveInvoiceTemplate } from '../utils/invoiceTemplates';
import {
  billTypeBadgeClass,
  billTypeBadgeLabel,
  billTypeExportLabel,
  billTypeFullLabel,
  BILLS_TYPE_FILTER_KEY,
  HELP_PERIODS,
  isHelpBill,
  normalizeBillType,
} from '../utils/billTypes';

const BILLS_PAGE_SIZE = 5;

function HeaderOptionsDropdown({
  onExportPDF,
  onRefresh,
  refreshing,
  loading,
  hasBills,
  isSettingsActive,
  onToggleSettings,
}) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const handleClickOutside = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setOpen(false);
      }
    };
    const handleEscape = (e) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('touchstart', handleClickOutside, { passive: true });
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [open]);

  return (
    <div className="bills-header-dropdown-wrap" ref={containerRef}>
      <button
        type="button"
        className={`bills-header-dropdown-btn ${open ? 'is-open' : ''} ${isSettingsActive ? 'is-active' : ''}`}
        onClick={() => setOpen((prev) => !prev)}
        aria-expanded={open}
        aria-haspopup="menu"
        title="Ledger options & settings"
        aria-label="Options"
      >
        <Settings size={16} />
      </button>

      {open && (
        <div className="bills-header-dropdown-menu" role="menu">
          <button
            type="button"
            className="bills-dropdown-item"
            disabled={!hasBills}
            onClick={() => {
              setOpen(false);
              onExportPDF();
            }}
          >
            <div className="bills-dd-icon-box is-blue">
              <FileText size={14} />
            </div>
            <div className="bills-dd-text">
              <strong>Export PDF</strong>
              <small>Printable executive statement</small>
            </div>
          </button>

          <button
            type="button"
            className="bills-dropdown-item"
            disabled={refreshing || loading}
            onClick={() => {
              setOpen(false);
              onRefresh();
            }}
          >
            <div className="bills-dd-icon-box is-teal">
              <RefreshCw size={14} className={refreshing ? 'spin' : undefined} />
            </div>
            <div className="bills-dd-text">
              <strong>Refresh Ledger</strong>
              <small>Fetch latest bills</small>
            </div>
          </button>

          <div className="bills-dropdown-divider" />

          <button
            type="button"
            className={`bills-dropdown-item ${isSettingsActive ? 'is-active' : ''}`}
            onClick={() => {
              setOpen(false);
              onToggleSettings();
            }}
          >
            <div className="bills-dd-icon-box is-amber">
              <Settings size={14} />
            </div>
            <div className="bills-dd-text">
              <strong>Invoice Style & Settings</strong>
              <small>{isSettingsActive ? 'Currently active' : 'Templates & layout'}</small>
            </div>
          </button>
        </div>
      )}
    </div>
  );
}

function BillsCardMenu({ id, openId, setOpenId, label, icon: Icon, children, danger = false }) {
  const ref = useRef(null);
  const open = openId === id;

  useEffect(() => {
    if (!open) return undefined;
    const onDoc = (e) => {
      if (!ref.current?.contains(e.target)) setOpenId(null);
    };
    const onKey = (e) => {
      if (e.key === 'Escape') setOpenId(null);
    };
    const onScroll = (e) => {
      if (ref.current?.contains(e.target)) return;
      setOpenId(null);
    };
    document.addEventListener('pointerdown', onDoc);
    document.addEventListener('keydown', onKey);
    window.addEventListener('scroll', onScroll, true);
    return () => {
      document.removeEventListener('pointerdown', onDoc);
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('scroll', onScroll, true);
    };
  }, [open, setOpenId]);

  return (
    <div className={`inv-dd${danger ? ' inv-dd--danger' : ''}`} ref={ref}>
      <button
        type="button"
        className={`btn-secondary inv-dd-trigger${open ? ' is-open' : ''}${danger ? ' inv-dd-trigger--danger' : ''}`}
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={() => setOpenId(open ? null : id)}
      >
        {Icon ? <Icon size={14} /> : null}
        <span>{label}</span>
        <ChevronDown size={14} className={`inv-dd-chevron${open ? ' is-open' : ''}`} aria-hidden />
      </button>
      {open ? (
        <div className="inv-dd-menu" role="menu">
          {children}
        </div>
      ) : null}
    </div>
  );
}

function BillsCardMenuItem({ icon: Icon, label, onClick, danger = false }) {
  return (
    <button
      type="button"
      role="menuitem"
      className={`inv-dd-item${danger ? ' is-danger' : ''}`}
      onClick={onClick}
    >
      {Icon ? <Icon size={15} /> : null}
      <span>{label}</span>
    </button>
  );
}

function getPaginationItems(current, total) {
  if (total <= 4) {
    return Array.from({ length: total }, (_, i) => i + 1);
  }
  if (current <= 2) {
    return [1, 2, 3, '...', total];
  }
  if (current >= total - 1) {
    return [1, '...', total - 2, total - 1, total];
  }
  return [1, '...', current, '...', total];
}

export default function BillsDatabase({
  onViewBill,
  onDuplicateBill,
  onNavigate,
  currencySymbol = 'Rs.',
  urduLabels = false,
  settings: settingsProp = {},
  onSettingsUpdated,
  active = true,
}) {
  const toast = useToast();
  const [bills, setBills] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [localSettings, setLocalSettings] = useState(() => settingsProp || {});

  useEffect(() => {
    setLocalSettings(settingsProp || {});
  }, [settingsProp]);

  const handleUpdateSetting = async (key, val) => {
    const next = { ...localSettings, [key]: val };
    setLocalSettings(next);
    if (key === 'default_invoice_template') {
      saveInvoiceTemplate(val);
    }
    try {
      await apiFetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [key]: val }),
      });
      toast.success('Bill settings updated');
      onSettingsUpdated?.();
    } catch {
      toast.error('Failed to update setting');
    }
  };

  const [billTypeFilter, setBillTypeFilter] = useState(() => {
    try {
      const pref = sessionStorage.getItem(BILLS_TYPE_FILTER_KEY);
      if (pref === 'help' || pref === 'supplier' || pref === 'customer' || pref === 'settings') {
        sessionStorage.removeItem(BILLS_TYPE_FILTER_KEY);
        return pref;
      }
    } catch {
      /* ignore */
    }
    return 'all';
  });
  const [statusFilter, setStatusFilter] = useState('all');
  const [showBookmarkedOnly, setShowBookmarkedOnly] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [headerMenuOpen, setHeaderMenuOpen] = useState(null);

  // Edit Modal State
  const [editingBill, setEditingBill] = useState(null);
  const [editType, setEditType] = useState('customer');
  const [editInvNum, setEditInvNum] = useState('');
  const [editCustomerName, setEditCustomerName] = useState('');
  const [editBillDate, setEditBillDate] = useState('');
  const [editDueDate, setEditDueDate] = useState('');
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
  const [cardMenu, setCardMenu] = useState(null);
  const editFormRef = useDialog(Boolean(editingBill), () => setEditingBill(null));
  const payFormRef = useDialog(Boolean(payBill), () => setPayBill(null));

  useEffect(() => {
    setSettings(settingsProp || {});
  }, [settingsProp]);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(searchQuery.trim()), 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  useEffect(() => {
    setCurrentPage(1);
  }, [billTypeFilter, statusFilter, debouncedSearch, showBookmarkedOnly]);

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
      if (!soft) setCurrentPage(1);
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

  const didMountRef = useRef(false);
  useEffect(() => {
    if (!didMountRef.current) {
      didMountRef.current = true;
      return;
    }
    if (active) apiFetchBills({ soft: true });
  }, [active]);

  // Open Edit Modal
  const handleOpenEditModal = async (bill) => {
    if (isCancelled(bill)) {
      toast.info('Cancelled bills are kept for history and cannot be edited.');
      return;
    }
    const full = await loadFullBill(bill);
    setEditingBill(full);
    setEditType(normalizeBillType(full.bill_type));
    setEditInvNum(full.invoice_number);
    setEditCustomerName(full.customer_name);
    setEditBillDate(full.bill_date);
    setEditDueDate(full.due_date || '');
    setEditStatus(full.status);
    setEditNotes(full.notes || '');
    setEditTaxRate(full.tax_rate ?? 0);
    setEditDiscountRate(full.discount_rate ?? 0);
    setEditItems(full.items ? JSON.parse(JSON.stringify(full.items)) : []);
  };

  useEffect(() => {
    if (!editingBill && !payBill) return undefined;
    const frame = requestAnimationFrame(() => {
      if (editFormRef.current) editFormRef.current.scrollTop = 0;
      if (payFormRef.current) payFormRef.current.scrollTop = 0;
    });
    return () => cancelAnimationFrame(frame);
  }, [editingBill, payBill]);

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

    const taxRate = parseFloat(editTaxRate) || 0;
    const discountRate = parseFloat(editDiscountRate) || 0;
    const {
      subtotal,
      discount_amount: discountAmount,
      tax_amount: taxAmount,
      total_amount: totalAmount,
    } = recalcBillTotals({ tax_rate: taxRate, discount_rate: discountRate }, editItems);

    try {
      const res = await apiFetch(`/api/bills/${editingBill.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          bill_type: editType,
          invoice_number: editInvNum,
          customer_name: editCustomerName,
          bill_date: editBillDate,
          due_date: editDueDate || editBillDate,
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

  const handleUpdateType = async (bill, nextType) => {
    const type = normalizeBillType(nextType);
    if (isCancelled(bill) || normalizeBillType(bill.bill_type) === type) return;
    const payload = { bill_type: type };
    if (type === 'help' && !bill.due_date) {
      payload.due_date = addDaysToDateString(bill.bill_date || pakistanToday(), 30);
    }
    try {
      const res = await apiFetch(`/api/bills/${bill.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      toast.success(
        type === 'help' ? 'Updated to Help / loan' : type === 'supplier' ? 'Updated to Saudia buying' : 'Updated to Sale'
      );
      apiFetchBills();
    } catch (err) {
      toast.error('Error updating type: ' + err.message);
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
    const full = await loadFullBill(bill);
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
      const proof = await persistPaymentProof(payScreenshot || '');
      const res = await apiFetch(`/api/bills/${payBill.id}/payments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount,
          method: payMethod,
          payment_date: pakistanToday(),
          notes,
          screenshot_data: proof.screenshot_data,
          screenshot_path: proof.screenshot_path,
          screenshot_thumb: proof.screenshot_thumb,
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
        const recomputed = recalcBillTotals(b, b.items);
        if (recomputed.total_amount > 0 && (total <= 0 || Math.abs(total - recomputed.total_amount) > 0.02)) {
          subtotal = recomputed.subtotal;
          total = recomputed.total_amount;
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
        billTypeExportLabel(b),
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

  const handleExportPDF = async () => {
    const listToExport = filteredBills.length > 0 ? filteredBills : bills;
    if (listToExport.length === 0) {
      toast.info('No bills to export');
      return;
    }
    try {
      const { headers, rows } = buildBillsExportTable();
      const filterBits = [
        billTypeFilter !== 'all' ? billTypeFilter : null,
        statusFilter !== 'all' ? statusFilter : null,
        debouncedSearch ? `search "${debouncedSearch}"` : null,
      ].filter(Boolean);

      const totalBilled = listToExport.reduce((s, b) => s + (Number(b.total_amount) || 0), 0);
      const totalPaid = listToExport.reduce((s, b) => s + (Number(b.amount_paid) || 0), 0);
      const totalBal = Math.max(0, totalBilled - totalPaid);

      const summaryCards = [
        { label: 'TOTAL INVOICES', value: `${listToExport.length} Bills`, color: [15, 23, 42] },
        { label: 'TOTAL INVOICED', value: `Rs. ${exportMoney(totalBilled)}`, color: [16, 185, 129] },
        { label: 'COLLECTED AMOUNT', value: `Rs. ${exportMoney(totalPaid)}`, color: [14, 165, 233] },
        { label: 'RECEIVABLES / DUE', value: `Rs. ${exportMoney(totalBal)}`, color: [239, 68, 68] },
      ];

      await downloadTablePdf({
        title: 'Elite Chocolate — Invoices & Sales Ledger',
        subtitle: `${pakistanToday()} · ${listToExport.length} bill(s)${filterBits.length ? ` · Filtered: ${filterBits.join(' · ')}` : ''}`,
        headers,
        rows,
        summaryCards,
        filename: `Bills_Ledger_${pakistanToday()}.pdf`,
        landscape: true,
        colWeights: [1.1, 1.2, 1.6, 1.0, 0.7, 1.1, 1.1, 1.1, 1.1, 0.8],
      });
      toast.success(`Exported ${rows.length} bill${rows.length === 1 ? '' : 's'} (PDF)`);
    } catch (err) {
      if (err?.name !== 'AbortError') toast.error('PDF export failed: ' + err.message);
    }
  };

  const handleToggleBookmark = async (bill, e) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    const currentVal = Number(bill.is_bookmarked) ? 1 : 0;
    const nextVal = currentVal ? 0 : 1;
    setBills((prev) =>
      prev.map((b) => (b.id === bill.id ? { ...b, is_bookmarked: nextVal } : b))
    );
    try {
      const res = await apiFetch(`/api/bills/${bill.id}/bookmark`, { method: 'POST' });
      if (!res.ok) throw new Error('Bookmark toggle failed');
      const data = await res.json();
      const confirmedVal = Number(data.is_bookmarked) ? 1 : 0;
      setBills((prev) =>
        prev.map((b) => (b.id === bill.id ? { ...b, is_bookmarked: confirmedVal } : b))
      );
      toast.success(nextVal ? 'Bill starred ⭐' : 'Bookmark removed');
    } catch (err) {
      console.error('Bookmark toggle error:', err);
      setBills((prev) =>
        prev.map((b) => (b.id === bill.id ? { ...b, is_bookmarked: currentVal } : b))
      );
      toast.error('Failed to update bookmark');
    }
  };

  const bookmarkedCount = bills.filter((b) => Number(b.is_bookmarked) === 1).length;
  const filteredBills = bills.filter((b) => {
    if (showBookmarkedOnly && Number(b.is_bookmarked) !== 1) return false;
    return true;
  });
  const totalPages = Math.max(1, Math.ceil(filteredBills.length / BILLS_PAGE_SIZE));
  const validPage = Math.min(Math.max(1, currentPage), totalPages);
  const startIndex = (validPage - 1) * BILLS_PAGE_SIZE;
  const visibleBills = filteredBills.slice(startIndex, startIndex + BILLS_PAGE_SIZE);

  return (
    <div className="glass-panel bills-database-container" style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      {/* 1. Sleek Compact Header */}
      <div className="bills-db-header">
        <div className="bills-db-left">
          <div className="bills-db-title-row">
            <h2 className="bills-db-title">Invoices & Ledger</h2>
          </div>
          <p className="bills-db-sub">
            Retail sales · Saudia buying · Credit khata
          </p>
        </div>

        <HeaderOptionsDropdown
          onExportPDF={handleExportPDF}
          onRefresh={() => apiFetchBills({ soft: true })}
          refreshing={refreshing}
          loading={loading}
          hasBills={bills.length > 0}
          isSettingsActive={billTypeFilter === 'settings'}
          onToggleSettings={() => setBillTypeFilter(billTypeFilter === 'settings' ? 'all' : 'settings')}
        />
      </div>

      {/* 2. Clean Modern Filter Panel */}
      <div className="bills-filter-panel">
        {/* Row 1: Search Input + Starred Filter Toggle */}
        <div className="bills-search-row">
          <div className="bills-search-input-wrap">
            <Search size={15} className="bills-search-icon" aria-hidden />
            <input
              type="text"
              className="bills-search-input"
              placeholder="Search by customer, invoice #, city or note…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
            {searchQuery && (
              <button
                type="button"
                className="bills-search-clear"
                onClick={() => setSearchQuery('')}
                title="Clear search"
              >
                <X size={14} />
              </button>
            )}
          </div>

          <button
            type="button"
            className={`bills-bookmark-filter-btn${showBookmarkedOnly ? ' is-active' : ''}`}
            onClick={() => setShowBookmarkedOnly(!showBookmarkedOnly)}
            title={showBookmarkedOnly ? 'Show all bills' : 'Show only bookmarked bills'}
          >
            <Bookmark size={14} fill={showBookmarkedOnly ? '#d4af37' : 'none'} />
            <span>Starred</span>
            <span className="bills-bookmark-count">{bookmarkedCount}</span>
          </button>
        </div>

        {/* Row 2: Segmented Category Tabs + Status Dropdown */}
        <div className="bills-filter-controls">
          <div className="bills-type-segmented" role="tablist" aria-label="Bill categories">
            <button
              type="button"
              role="tab"
              aria-selected={billTypeFilter === 'all'}
              className={`bills-type-tab${billTypeFilter === 'all' ? ' is-active' : ''}`}
              onClick={() => setBillTypeFilter('all')}
            >
              All <span className="tab-badge">{bills.length}</span>
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={billTypeFilter === 'customer'}
              className={`bills-type-tab${billTypeFilter === 'customer' ? ' is-active' : ''}`}
              onClick={() => setBillTypeFilter('customer')}
            >
              Sales
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={billTypeFilter === 'supplier'}
              className={`bills-type-tab${billTypeFilter === 'supplier' ? ' is-active' : ''}`}
              onClick={() => setBillTypeFilter('supplier')}
            >
              Saudia
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={billTypeFilter === 'help'}
              className={`bills-type-tab${billTypeFilter === 'help' ? ' is-active' : ''}`}
              onClick={() => setBillTypeFilter('help')}
            >
              Help
            </button>
          </div>

          <div className="bills-status-segmented">
            <AppSelect
              value={statusFilter}
              onChange={setStatusFilter}
              options={[
                { value: 'all', label: 'All Statuses' },
                { value: 'pending', label: 'Due / Unpaid' },
                { value: 'paid', label: 'Paid / Cleared' },
                { value: 'overdue', label: 'Overdue' },
                { value: 'cancelled', label: 'Cancelled' },
              ]}
              style={{ minWidth: 140 }}
            />
          </div>
        </div>
      </div>

      {/* Bill Settings View OR Master Table */}
      {billTypeFilter === 'settings' ? (
        <div className="glass-panel" style={{ padding: '1.25rem', borderRadius: 'var(--radius-lg, 16px)' }}>
          {/* Default Bill Template Picker */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.35rem' }}>
              <Palette size={18} style={{ color: 'var(--primary, #00b3a6)' }} />
              <h3 style={{ fontSize: '1.05rem', fontWeight: 800, color: 'var(--accent-teal)', margin: 0 }}>Default Bill Style & Template</h3>
            </div>
            <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '1rem' }}>
              Choose the company-wide default look for invoices, bills, and payment advices. You can also switch styles on any bill anytime.
            </p>
            <div className="template-picker-grid">
              {INVOICE_TEMPLATES.map((tmpl) => {
                const active = (localSettings.default_invoice_template || 'classic') === tmpl.id;
                return (
                  <button
                    key={tmpl.id}
                    type="button"
                    className={`template-card ${active ? 'is-active' : ''}`}
                    onClick={() => handleUpdateSetting('default_invoice_template', tmpl.id)}
                  >
                    <div className="template-card-header">
                      <div className="template-swatch-badge">
                        <span
                          className="template-swatch-dot"
                          style={{
                            backgroundColor: tmpl.primaryColor,
                            border: tmpl.id === 'minimal' ? '1px solid #71717a' : 'none',
                          }}
                        />
                        <span>{tmpl.name}</span>
                      </div>
                      {active ? <Check size={16} style={{ color: 'var(--primary, #00b3a6)' }} /> : null}
                    </div>
                    <div className="template-card-tagline">{tmpl.tagline}</div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Header Layout Style */}
          <div style={{ marginTop: '1.5rem', paddingTop: '1.25rem', borderTop: '1px solid var(--border-color)' }}>
            <h4 style={{ fontSize: '0.95rem', fontWeight: 800, color: 'var(--text-primary)', margin: '0 0 0.25rem' }}>Header Layout Style</h4>
            <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', margin: '0 0 0.85rem' }}>
              Choose how the logo, brand name, and invoice title are arranged on invoices.
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '0.65rem' }}>
              {[
                { id: 'split', label: 'Modern Split', desc: 'Logo left · Invoice title right' },
                { id: 'banner', label: 'Full Banner', desc: 'Prominent colored bar top' },
                { id: 'centered', label: 'Centered Letterhead', desc: 'Classic prestige centered logo' },
              ].map((layout) => {
                const isSelected = (localSettings.header_layout || 'split') === layout.id;
                return (
                  <button
                    key={layout.id}
                    type="button"
                    className={`template-card ${isSelected ? 'is-active' : ''}`}
                    style={{ padding: '0.75rem', textAlign: 'left' }}
                    onClick={() => handleUpdateSetting('header_layout', layout.id)}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.2rem' }}>
                      <strong style={{ fontSize: '0.85rem', color: isSelected ? 'var(--accent-teal)' : 'var(--text-primary)' }}>{layout.label}</strong>
                      {isSelected && <Check size={14} style={{ color: 'var(--accent-teal)' }} />}
                    </div>
                    <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{layout.desc}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Custom Brand Accent Color */}
          <div style={{ marginTop: '1.5rem', paddingTop: '1.25rem', borderTop: '1px solid var(--border-color)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem', flexWrap: 'wrap', gap: '0.5rem' }}>
              <div>
                <h4 style={{ fontSize: '0.95rem', fontWeight: 800, color: 'var(--text-primary)', margin: 0 }}>Custom Brand Accent Color</h4>
                <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', margin: '0.2rem 0 0' }}>Override bill accent highlights with your exact brand palette.</p>
              </div>
              {localSettings.custom_brand_color && (
                <button
                  type="button"
                  className="btn-secondary"
                  style={{ fontSize: '0.72rem', padding: '0.25rem 0.55rem', width: 'auto' }}
                  onClick={() => handleUpdateSetting('custom_brand_color', '')}
                >
                  Reset to template color
                </button>
              )}
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap', marginTop: '0.75rem' }}>
              {['#00b3a6', '#2a1810', '#0f172a', '#064e3b', '#881337', '#c2410c', '#0369a1', '#9d174d', '#b45309'].map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => handleUpdateSetting('custom_brand_color', c)}
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: '50%',
                    background: c,
                    border: localSettings.custom_brand_color === c ? '3px solid #ffffff' : '2px solid rgba(0,0,0,0.15)',
                    boxShadow: localSettings.custom_brand_color === c ? '0 0 0 2px var(--accent-teal)' : 'none',
                    cursor: 'pointer',
                    transition: 'transform 0.15s ease',
                  }}
                  title={c}
                />
              ))}
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', marginLeft: '0.5rem' }}>
                <input
                  type="color"
                  value={localSettings.custom_brand_color || '#00b3a6'}
                  onChange={(e) => handleUpdateSetting('custom_brand_color', e.target.value)}
                  style={{ width: 32, height: 32, padding: 0, border: 'none', borderRadius: 6, cursor: 'pointer', background: 'transparent' }}
                  title="Pick custom hex color"
                />
                <span style={{ fontSize: '0.78rem', fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)' }}>
                  {localSettings.custom_brand_color || 'Default'}
                </span>
              </div>
            </div>
          </div>

          {/* Custom Text / Font Color */}
          <div style={{ marginTop: '1.5rem', paddingTop: '1.25rem', borderTop: '1px solid var(--border-color)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem', flexWrap: 'wrap', gap: '0.5rem' }}>
              <div>
                <h4 style={{ fontSize: '0.95rem', fontWeight: 800, color: 'var(--text-primary)', margin: 0 }}>Custom Text & Font Color</h4>
                <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', margin: '0.2rem 0 0' }}>Customize the font color for invoice titles, line items, and totals.</p>
              </div>
              {localSettings.custom_text_color && (
                <button
                  type="button"
                  className="btn-secondary"
                  style={{ fontSize: '0.72rem', padding: '0.25rem 0.55rem', width: 'auto' }}
                  onClick={() => handleUpdateSetting('custom_text_color', '')}
                >
                  Reset to default text
                </button>
              )}
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap', marginTop: '0.75rem' }}>
              {['#000000', '#0f172a', '#1e293b', '#1e3a8a', '#3b2219', '#064e3b', '#581c87', '#334155'].map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => handleUpdateSetting('custom_text_color', c)}
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: '50%',
                    background: c,
                    border: localSettings.custom_text_color === c ? '3px solid #ffffff' : '2px solid rgba(0,0,0,0.15)',
                    boxShadow: localSettings.custom_text_color === c ? '0 0 0 2px var(--accent-teal)' : 'none',
                    cursor: 'pointer',
                    transition: 'transform 0.15s ease',
                  }}
                  title={c}
                />
              ))}
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', marginLeft: '0.5rem' }}>
                <input
                  type="color"
                  value={localSettings.custom_text_color || '#111111'}
                  onChange={(e) => handleUpdateSetting('custom_text_color', e.target.value)}
                  style={{ width: 32, height: 32, padding: 0, border: 'none', borderRadius: 6, cursor: 'pointer', background: 'transparent' }}
                  title="Pick custom text hex color"
                />
                <span style={{ fontSize: '0.78rem', fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)' }}>
                  {localSettings.custom_text_color || 'Default'}
                </span>
              </div>
            </div>
          </div>
        </div>
      ) : loading ? (
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
        <div className={`bills-list-panel${refreshing ? ' is-refreshing' : ''}`}>
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
                {visibleBills.map((bill) => (
                  <tr key={bill.id}>
                    <td>
                      {isCancelled(bill) ? (
                        <span className={`type-badge ${billTypeBadgeClass(bill)}`}>
                          {billTypeBadgeLabel(bill)}
                        </span>
                      ) : (
                        <TypeSelect
                          value={bill.bill_type}
                          onChange={(next) => handleUpdateType(bill, next)}
                        />
                      )}
                    </td>
                    <td className="invoice-mono">
                      <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.45rem' }}>
                        <button
                          type="button"
                          className="btn-bookmark-icon"
                          onClick={(e) => handleToggleBookmark(bill, e)}
                          title={Number(bill.is_bookmarked) === 1 ? 'Remove bookmark' : 'Bookmark bill'}
                          style={{
                            background: 'transparent',
                            border: 'none',
                            cursor: 'pointer',
                            padding: 2,
                            display: 'inline-flex',
                            alignItems: 'center',
                            color: Number(bill.is_bookmarked) === 1 ? '#d4af37' : 'var(--text-muted)',
                            transition: 'transform 0.15s ease, color 0.15s ease',
                          }}
                        >
                          <Bookmark size={15} fill={Number(bill.is_bookmarked) === 1 ? '#d4af37' : 'none'} />
                        </button>
                        <span>{bill.invoice_number}</span>
                      </div>
                    </td>
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
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', alignItems: 'flex-start' }}>
                        {isCancelled(bill) ? (
                          <StatusBadge status="cancelled" />
                        ) : (
                          <StatusSelect
                            value={bill.status}
                            onChange={(next) => handleUpdateStatus(bill.id, next)}
                          />
                        )}
                        {Boolean(bill.is_partner_settled) && (
                          <span
                            className="badge badge-paid"
                            style={{
                              fontSize: '0.66rem',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '0.22rem',
                              fontWeight: 750,
                              padding: '0.15rem 0.5rem',
                              borderRadius: '999px',
                              background: 'rgba(52, 168, 83, 0.15)',
                              border: '1px solid var(--status-paid)',
                              color: 'var(--status-paid)',
                              whiteSpace: 'nowrap',
                            }}
                            title="50/50 Partner Profit Settled"
                          >
                            <CheckCircle2 size={10} /> 50/50 Settled
                          </span>
                        )}
                      </div>
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      <div style={{ display: 'flex', gap: '0.35rem', justifyContent: 'center', flexWrap: 'wrap' }}>
                        <button className="btn-secondary" style={{ padding: '0.35rem 0.55rem', fontSize: '0.75rem', width: 'auto' }} onClick={() => onViewBill(bill)} title="View bill">
                          <Eye size={14} /> View
                        </button>
                        {!isCancelled(bill) && (
                          <button
                            className="btn-secondary"
                            style={{ padding: '0.35rem 0.55rem', fontSize: '0.75rem', width: 'auto' }}
                            onClick={() => openPayModal(bill)}
                            disabled={!canTakePayment(bill)}
                            title={
                              canTakePayment(bill)
                                ? isHelpBill(bill) ? 'Record repayment' : 'Record payment'
                                : 'Fully paid — Pay locked'
                            }
                          >
                            <Banknote size={14} /> Pay
                          </button>
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
          <div className="mobile-only mobile-card-list bills-card-list">
            {visibleBills.map((bill) => {
              const due = billBalance(bill);
              const paidAmt = Number(bill.amount_paid) || 0;
              const canPay = canTakePayment(bill);
              const canRemind = canPay && bill.bill_type !== 'supplier';
              const isBookmarked = Number(bill.is_bookmarked) === 1;

              return (
                <div className="bills-bill-card" key={`m-${bill.id}`}>
                  {/* Top Row: Client & Amount */}
                  <div className="bills-card-top-row">
                    <div className="bills-card-party-box">
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                        <span className="bills-card-client-name" title={bill.customer_name}>
                          {bill.customer_name || 'Walk-in Customer'}
                        </span>
                        <button
                          type="button"
                          className="btn-bookmark-icon"
                          onClick={(e) => handleToggleBookmark(bill, e)}
                          title={isBookmarked ? 'Remove bookmark' : 'Bookmark bill'}
                          style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', display: 'inline-flex' }}
                        >
                          <Bookmark size={15} fill={isBookmarked ? '#d4af37' : 'none'} color={isBookmarked ? '#d4af37' : 'var(--text-muted)'} />
                        </button>
                      </div>

                      <div className="bills-card-meta-line">
                        <span className="invoice-mono" style={{ fontWeight: 700 }}>{bill.invoice_number}</span>
                        <span>·</span>
                        <span>{formatBillDateTime(bill)}</span>
                      </div>
                    </div>

                    <div className="bills-card-amount-box">
                      <span className="bills-card-total-val">
                        {formatCurrency(currencySymbol, bill.total_amount)}
                      </span>
                      {(paidAmt > 0 || due > 0) && (
                        <span
                          style={{
                            fontSize: '0.72rem',
                            fontWeight: 800,
                            color: due > 0 ? '#f59e0b' : '#10b981',
                          }}
                        >
                          {due > 0 ? `Due ${formatCurrency(currencySymbol, due)}` : 'Cleared'}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Middle Row: Quick Status & Type Selectors */}
                  <div className="bills-card-dropdowns-row">
                    {isCancelled(bill) ? (
                      <StatusBadge status="cancelled" />
                    ) : (
                      <StatusSelect
                        value={bill.status}
                        onChange={(next) => handleUpdateStatus(bill.id, next)}
                      />
                    )}
                    {Boolean(bill.is_partner_settled) && (
                      <span
                        className="badge badge-paid"
                        style={{
                          fontSize: '0.68rem',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '0.25rem',
                          fontWeight: 750,
                          padding: '0.25rem 0.6rem',
                          borderRadius: '999px',
                          background: 'rgba(52, 168, 83, 0.15)',
                          border: '1px solid var(--status-paid)',
                          color: 'var(--status-paid)',
                          whiteSpace: 'nowrap',
                        }}
                        title="50/50 Partner Profit Settled"
                      >
                        <CheckCircle2 size={11} /> 50/50 Settled
                      </span>
                    )}
                    {!isCancelled(bill) && (
                      <TypeSelect
                        value={bill.bill_type}
                        onChange={(next) => handleUpdateType(bill, next)}
                      />
                    )}
                  </div>

                  {/* Bottom Action Button Bar */}
                  <div className="bills-card-btn-bar">
                    <button
                      type="button"
                      className="bills-action-btn is-primary"
                      onClick={() => onViewBill(bill)}
                    >
                      <Eye size={14} /> View
                    </button>

                    {!isCancelled(bill) && (
                      <button
                        type="button"
                        className={`bills-action-btn${canPay ? ' is-pay' : ''}`}
                        onClick={() => openPayModal(bill)}
                        disabled={!canPay}
                        title={
                          canPay
                            ? isHelpBill(bill) ? 'Record repayment' : 'Record payment'
                            : 'Fully paid — Pay locked'
                        }
                      >
                        <Banknote size={14} /> {canPay ? 'Pay' : 'Paid'}
                      </button>
                    )}

                    {canRemind && (
                      <button
                        type="button"
                        className="bills-action-btn is-manage"
                        style={{ color: '#25d366', borderColor: 'rgba(37, 211, 102, 0.3)' }}
                        title="Share on WhatsApp"
                        onClick={() => handleRemind(bill, 'whatsapp')}
                      >
                        <MessageSquare size={14} />
                      </button>
                    )}

                    <BillsCardMenu
                      id={`${bill.id}:manage`}
                      openId={cardMenu}
                      setOpenId={setCardMenu}
                      label="Manage"
                      icon={Copy}
                      danger
                    >
                      {!isCancelled(bill) && (
                        <BillsCardMenuItem
                          icon={Edit3}
                          label="Edit"
                          onClick={() => {
                            setCardMenu(null);
                            handleOpenEditModal(bill);
                          }}
                        />
                      )}
                      {onDuplicateBill && (
                        <BillsCardMenuItem
                          icon={Copy}
                          label="Duplicate"
                          onClick={() => {
                            setCardMenu(null);
                            onDuplicateBill(bill);
                          }}
                        />
                      )}
                      {!isCancelled(bill) && (
                        <BillsCardMenuItem
                          icon={Undo2}
                          label="Return / Cancel"
                          onClick={() => {
                            setCardMenu(null);
                            openAdjust(bill);
                          }}
                        />
                      )}
                      <BillsCardMenuItem
                        icon={Trash2}
                        label="Delete bill"
                        danger
                        onClick={() => {
                          setCardMenu(null);
                          askDeleteBill(bill);
                        }}
                      />
                    </BillsCardMenu>
                  </div>
                </div>
              );
            })}
          </div>
          {/* Pagination Page Shifter at Bottom — Centered */}
          {filteredBills.length > 0 && (
            <div
              className="bills-pagination-bar"
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '0.65rem',
                marginTop: '1.5rem',
                paddingTop: '1.25rem',
                borderTop: '1px solid var(--border-subtle)',
                textAlign: 'center',
                width: '100%',
              }}
            >
              {totalPages > 1 && (
                <div className="bills-pagination-controls" style={{ display: 'inline-flex', flexDirection: 'row', flexWrap: 'nowrap', alignItems: 'center', justifyContent: 'center', gap: '0.35rem' }}>
                  <button
                    type="button"
                    className="btn-secondary bills-pagination-btn"
                    onClick={() => {
                      setCurrentPage((p) => Math.max(1, p - 1));
                      window.scrollTo({ top: 0, behavior: 'smooth' });
                    }}
                    disabled={validPage === 1}
                    style={{ width: '34px', height: '34px', minWidth: '34px', padding: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', borderRadius: '999px' }}
                    title="Previous page"
                  >
                    <ChevronLeft size={16} />
                  </button>

                  {/* Smart Windowed Page Number Buttons for up to 100+ pages */}
                  {getPaginationItems(validPage, totalPages).map((item, idx) => {
                    if (item === '...') {
                      return (
                        <span
                          key={`dots-${idx}`}
                          style={{
                            color: 'var(--text-muted)',
                            padding: '0 0.15rem',
                            fontSize: '0.85rem',
                            userSelect: 'none',
                            flex: '0 0 auto',
                          }}
                        >
                          …
                        </span>
                      );
                    }
                    const pageNum = Number(item);
                    return (
                      <button
                        key={pageNum}
                        type="button"
                        className={`btn-${validPage === pageNum ? 'primary' : 'secondary'} bills-pagination-btn`}
                        onClick={() => {
                          setCurrentPage(pageNum);
                          window.scrollTo({ top: 0, behavior: 'smooth' });
                        }}
                        style={{
                          width: '34px',
                          height: '34px',
                          minWidth: '34px',
                          padding: 0,
                          display: 'inline-flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          borderRadius: '999px',
                          fontSize: '0.84rem',
                          fontWeight: validPage === pageNum ? 800 : 600,
                        }}
                      >
                        {pageNum}
                      </button>
                    );
                  })}

                  <button
                    type="button"
                    className="btn-secondary bills-pagination-btn"
                    onClick={() => {
                      setCurrentPage((p) => Math.min(totalPages, p + 1));
                      window.scrollTo({ top: 0, behavior: 'smooth' });
                    }}
                    disabled={validPage === totalPages}
                    style={{ width: '34px', height: '34px', minWidth: '34px', padding: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', borderRadius: '999px' }}
                    title="Next page"
                  >
                    <ChevronRight size={16} />
                  </button>
                </div>
              )}

              <div style={{ fontSize: '0.80rem', color: 'var(--text-secondary)' }}>
                Showing <strong style={{ color: 'var(--text-primary)' }}>{startIndex + 1}</strong>–
                <strong style={{ color: 'var(--text-primary)' }}>
                  {Math.min(startIndex + BILLS_PAGE_SIZE, filteredBills.length)}
                </strong> of <strong style={{ color: 'var(--text-primary)' }}>{filteredBills.length}</strong> bills
                {totalPages > 1 && <span> · Page {validPage} of {totalPages}</span>}
              </div>
            </div>
          )}
        </div>
      )}

      {/* FULL EDIT BILL INTERACTIVE MODAL — portaled so tab transforms cannot park it at page end */}
      {editingBill && createPortal(
        <div
          className="modal-sheet modal-sheet--portal"
          role="presentation"
          onClick={() => setEditingBill(null)}
        >
          <form
            ref={editFormRef}
            onSubmit={handleSaveBillEdits}
            className="glass-panel"
            role="dialog"
            aria-modal="true"
            aria-labelledby="edit-bill-title"
            tabIndex={-1}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.75rem' }}>
              <div>
                <h3 id="edit-bill-title" style={{ fontSize: '1.15rem', fontWeight: 800, color: 'var(--text-primary)' }}>Edit Bill #{editingBill.invoice_number}</h3>
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
                  onChange={(next) => {
                    const type = normalizeBillType(next);
                    setEditType(type);
                    if (type === 'help' && !editDueDate) {
                      setEditDueDate(addDaysToDateString(editBillDate || pakistanToday(), 30));
                    }
                  }}
                  aria-label="Bill category"
                  options={[
                    { value: 'customer', label: billTypeFullLabel('customer') },
                    { value: 'supplier', label: billTypeFullLabel('supplier') },
                    { value: 'help', label: billTypeFullLabel('help') },
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
                  {editType === 'supplier' ? 'Supplier / Pay To *' : editType === 'help' ? 'Person *' : 'Customer / Party Name *'}
                </label>
                <input type="text" className="form-input" value={editCustomerName} onChange={(e) => setEditCustomerName(e.target.value)} required />
              </div>

              <div className="form-group">
                <label className="form-label">Bill Date *</label>
                <input type="date" className="form-input" value={editBillDate} onChange={(e) => setEditBillDate(e.target.value)} required />
              </div>

              <div className="form-group">
                <label className="form-label">{editType === 'help' ? 'Return by' : 'Due Date'}</label>
                <input type="date" className="form-input" value={editDueDate} onChange={(e) => setEditDueDate(e.target.value)} />
                {editType === 'help' && (
                  <div className="cash-chip-row" style={{ marginTop: '0.45rem' }}>
                    {HELP_PERIODS.map((p) => (
                      <button
                        key={p.days}
                        type="button"
                        className="cash-chip"
                        onClick={() =>
                          setEditDueDate(addDaysToDateString(editBillDate || pakistanToday(), p.days))
                        }
                      >
                        {p.label}
                      </button>
                    ))}
                  </div>
                )}
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
        </div>,
        document.body
      )}

      {payBill && createPortal(
        <div
          className="modal-sheet modal-sheet--portal"
          role="presentation"
          onClick={() => setPayBill(null)}
        >
          <form
            ref={payFormRef}
            onSubmit={handleRecordPayment}
            className="glass-panel pay-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="bills-pay-title"
            tabIndex={-1}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem' }}>
              <div>
                <h3 id="bills-pay-title" style={{ fontSize: '1.05rem', fontWeight: 800, margin: 0 }}>
                  {isHelpBill(payBill) ? 'Record repayment' : 'Record payment'}
                </h3>
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
        </div>,
        document.body
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
