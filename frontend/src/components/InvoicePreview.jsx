import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Printer,
  Download,
  ArrowLeft,
  MessageSquare,
  Mail,
  Image as ImageIcon,
  Loader2,
  Copy,
  Banknote,
  Smartphone,
  Bell,
  ImagePlus,
  Undo2,
  Trash2,
  Share2,
  Monitor,
  Receipt,
  ChevronDown,
  Palette,
  Check,
  Sparkles,
  Edit3,
  Bookmark,
  FileText,
  Layout,
  Landmark,
  Type,
} from 'lucide-react';
import {
  INVOICE_TEMPLATES,
  loadInvoiceTemplate,
  saveInvoiceTemplate,
  getInvoiceTemplate,
} from '../utils/invoiceTemplates';
import BillAdjustSheet from './BillAdjustSheet';
import SendBillSheet from './SendBillSheet';
import BrandMark, { DeveloperCredit } from './BrandMark';
import StatusBadge from './StatusBadge';
import ConfirmDialog from './ConfirmDialog';
import AppSelect from './AppSelect';
import { isCancelled, remainingQty } from '../utils/billAdjust';
import { formatCurrency, formatBillDateTime } from '../utils/pakistan';
import { isHelpBill, isSupplierBill } from '../utils/billTypes';
import { paymentSummaryText } from '../utils/billPayments';
import { getPaymentMethods, paymentMethodLines, compactPaymentInstructions } from '../utils/paymentMethods';
import { apiFetch } from '../api/client';
import { useToast } from '../toast/ToastContext';
import { downloadBlob, saveOrShareBlob } from '../utils/downloadFile';
import { elementToJpegBlob, elementToPdfBlob } from '../utils/invoiceExport';
import { compressImageToDataUrl } from '../utils/imageCompress';
import { persistPaymentProof, readPaymentProof, paymentProofPreview, paymentHasProof } from '../utils/paymentProof';
import { loadBillSendPrefs, resolveBillExportOptions } from '../utils/billSendPrefs';
import {
  buildPaymentReminderText,
  openWhatsAppReminder,
  openSmsReminder,
} from '../utils/paymentReminder';
import { generateQrDataUrl } from '../utils/qrCode';

function sanitizeFilename(name) {
  return String(name || 'Invoice').replace(/[^\w.-]+/g, '_');
}

const BILL_VIEW_KEY = 'cocoadesk-bill-view';

function loadBillView() {
  try {
    const v = localStorage.getItem(BILL_VIEW_KEY);
    if (v === 'mobile' || v === 'phone' || v === 'desktop' || v === 'thermal' || v === 'story') return v;
  } catch {
    /* ignore */
  }
  return 'desktop';
}

function saveBillView(view) {
  try {
    localStorage.setItem(BILL_VIEW_KEY, view);
  } catch {
    /* ignore */
  }
}

function BiLabel({ en, ur, urdu, className, style }) {
  if (!urdu) return <span className={className} style={style}>{en}</span>;
  return (
    <span className={`bi-label ${className || ''}`} style={style}>
      <span className="bi-en">{en}</span>
      <span className="bi-ur" dir="rtl" lang="ur">{ur}</span>
    </span>
  );
}

function InvDropdown({ id, openId, setOpenId, label, icon: Icon, disabled, children, danger = false }) {
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
        disabled={disabled}
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={() => setOpenId(open ? null : id)}
      >
        {Icon ? <Icon size={15} /> : null}
        <span>{label}</span>
        <ChevronDown size={14} className={`inv-dd-chevron${open ? ' is-open' : ''}`} />
      </button>
      {open ? (
        <div className="inv-dd-menu" role="menu">
          {children}
        </div>
      ) : null}
    </div>
  );
}

function InvMenuItem({ icon: Icon, label, onClick, disabled, danger = false, busy = false }) {
  return (
    <button
      type="button"
      role="menuitem"
      className={`inv-dd-item${danger ? ' is-danger' : ''}`}
      disabled={disabled || busy}
      onClick={onClick}
    >
      {busy ? <Loader2 size={15} className="spin" /> : Icon ? <Icon size={15} /> : null}
      <span>{label}</span>
    </button>
  );
}

export default function InvoicePreview({ bill, onBack, onDuplicate, onEdit, onBillUpdated, currencySymbol = 'Rs.', urduLabels = false, settings: settingsProp = {} }) {
  const toast = useToast();
  const [settings, setSettings] = useState(settingsProp || {});
  const [template, setTemplateState] = useState(() =>
    loadInvoiceTemplate(settingsProp?.default_invoice_template || 'classic')
  );
  const [billView, setBillViewState] = useState(() => loadBillView());
  const [sharing, setSharing] = useState(null);
  const [liveBill, setLiveBill] = useState(bill);
  const [payAmount, setPayAmount] = useState('');
  const [payMethod, setPayMethod] = useState('Cash');
  const [paying, setPaying] = useState(false);
  const [payScreenshot, setPayScreenshot] = useState('');
  const [previewShot, setPreviewShot] = useState(null);
  const [adjustOpen, setAdjustOpen] = useState(false);
  const [sendOpen, setSendOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [showDeveloperCredit, setShowDeveloperCredit] = useState(true);
  const [qrCodeDataUrl, setQrCodeDataUrl] = useState('');

  const setInvoiceTemplate = useCallback((tplId) => {
    setTemplateState(tplId);
    saveInvoiceTemplate(tplId);
  }, []);

  const setBillView = useCallback((view) => {
    const next = view === 'mobile' || view === 'phone' || view === 'thermal' || view === 'story' ? view : 'desktop';
    setBillViewState(next);
    saveBillView(next);
  }, []);

  const handleTargetPreview = useCallback(
    (target) => {
      // While Send sheet is open, mirror Desktop/Mobile choice in the live preview
      if (target === 'mobile') setBillView('mobile');
      else if (target === 'desktop') setBillView('desktop');
    },
    [setBillView]
  );

  useEffect(() => {
    setLiveBill(bill);
    if (!bill?.id) return;
    // Refresh full bill (payments + screenshots) — list view may omit screenshots on PC
    apiFetch(`/api/bills/${bill.id}`)
      .then((res) => res.json())
      .then((data) => {
        if (data && data.id) setLiveBill(data);
      })
      .catch(() => {});
  }, [bill]);

  useEffect(() => {
    if (settingsProp && Object.keys(settingsProp).length) {
      setSettings(settingsProp);
      setShowDeveloperCredit(settingsProp.show_developer_credit !== 0 && settingsProp.show_developer_credit !== false);
      if (settingsProp.default_invoice_template) {
        setTemplateState((cur) => (cur === 'classic' ? settingsProp.default_invoice_template : cur));
      }
      return;
    }
    apiFetch('/api/settings')
      .then((res) => res.json())
      .then((data) => {
        setSettings(data || {});
        setShowDeveloperCredit(data?.show_developer_credit !== 0 && data?.show_developer_credit !== false);
        if (data?.default_invoice_template) {
          setTemplateState((cur) => (cur === 'classic' ? data.default_invoice_template : cur));
        }
      })
      .catch((err) => console.error(err));
  }, [settingsProp]);

  const [isBookmarked, setIsBookmarked] = useState(Boolean(Number(bill?.is_bookmarked)));
  const [stylePanelOpen, setStylePanelOpen] = useState(false);

  const handleUpdateSetting = async (key, val) => {
    const updated = { ...settings, [key]: val };
    setSettings(updated);
    try {
      await apiFetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [key]: val }),
      });
      toast.success(
        key === 'custom_brand_color'
          ? 'Brand color updated'
          : key === 'custom_text_color'
            ? 'Text color updated'
            : 'Header layout updated'
      );
    } catch (err) {
      console.error('Failed to update setting', err);
    }
  };

  useEffect(() => {
    setIsBookmarked(Boolean(Number(liveBill?.is_bookmarked)));
  }, [liveBill?.id, liveBill?.is_bookmarked]);

  const handleToggleBookmark = async () => {
    if (!liveBill?.id) return;
    const current = isBookmarked ? 1 : 0;
    const nextVal = current ? 0 : 1;
    setIsBookmarked(Boolean(nextVal));
    setLiveBill((prev) => (prev ? { ...prev, is_bookmarked: nextVal } : prev));
    try {
      const res = await apiFetch(`/api/bills/${liveBill.id}/bookmark`, { method: 'POST' });
      if (!res.ok) throw new Error('Bookmark toggle failed');
      const data = await res.json();
      const confirmed = Number(data.is_bookmarked) ? 1 : 0;
      setIsBookmarked(Boolean(confirmed));
      const updated = { ...liveBill, is_bookmarked: confirmed };
      setLiveBill((prev) => (prev ? { ...prev, is_bookmarked: confirmed } : prev));
      if (onBillUpdated) onBillUpdated(updated);
      toast.success(nextVal ? 'Bill starred ⭐' : 'Bookmark removed');
    } catch (err) {
      console.error('Invoice bookmark error:', err);
      setIsBookmarked(Boolean(current));
      setLiveBill((prev) => (prev ? { ...prev, is_bookmarked: current } : prev));
      toast.error('Failed to update bookmark');
    }
  };

  const toggleDeveloperCredit = async (checked) => {
    setShowDeveloperCredit(checked);
    try {
      const res = await apiFetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...settings,
          show_developer_credit: checked ? 1 : 0,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) setSettings(data);
    } catch (err) {
      console.warn(err);
    }
  };

  if (!liveBill) {
    return (
      <div style={{ textAlign: 'center', padding: '3rem' }}>
        <p>No bill selected for preview.</p>
        <button className="btn-secondary" onClick={onBack} style={{ marginTop: '1rem' }}>
          <ArrowLeft size={16} /> Back
        </button>
      </div>
    );
  }

  const companyName = settings.company_name || 'ELITE CHOCOLATE';
  const companyIsElite = /elite\s*chocolate/i.test(companyName);
  const baseName = sanitizeFilename(liveBill.invoice_number);
  const paid = Number(liveBill.amount_paid) || 0;
  const balance = Number(liveBill.balance_due ?? Math.max(0, (liveBill.total_amount || 0) - paid));
  const payAmountNum = parseFloat(payAmount) || 0;
  const paySummary = paymentSummaryText(currencySymbol, liveBill, payAmountNum);
  const urdu = Boolean(urduLabels);
  const isSupplier = isSupplierBill(liveBill);
  const isHelp = isHelpBill(liveBill);
  const hasPayeeBank =
    Boolean(liveBill.payee_bank_name) ||
    Boolean(liveBill.payee_account_title) ||
    Boolean(liveBill.payee_account_number) ||
    Boolean(liveBill.payee_payment_notes);
  const shopPaymentMethods = getPaymentMethods(settings);
  const [selectedBankIds, setSelectedBankIds] = useState(() => null);

  const activePaymentMethods = React.useMemo(() => {
    if (!shopPaymentMethods || shopPaymentMethods.length === 0) return [];
    if (!selectedBankIds) return shopPaymentMethods;
    const filtered = shopPaymentMethods.filter((m) => selectedBankIds.includes(m.id));
    return filtered.length > 0 ? filtered : shopPaymentMethods;
  }, [shopPaymentMethods, selectedBankIds]);

  const paymentInstructions = compactPaymentInstructions(settings.payment_instructions, activePaymentMethods);
  const hasShopPayment =
    activePaymentMethods.length > 0 || Boolean(paymentInstructions);
  const primaryWallet =
    activePaymentMethods.find((m) => m.mobile_wallet)?.mobile_wallet ||
    activePaymentMethods.find((m) => m.account_number)?.account_number ||
    settings.mobile_wallet ||
    '';

  const handleToggleBank = (bankId) => {
    if (!selectedBankIds) {
      setSelectedBankIds([bankId]);
      return;
    }
    if (selectedBankIds.includes(bankId)) {
      const next = selectedBankIds.filter((id) => id !== bankId);
      if (next.length === 0) {
        setSelectedBankIds(null);
      } else {
        setSelectedBankIds(next);
      }
    } else {
      const next = [...selectedBankIds, bankId];
      if (next.length >= shopPaymentMethods.length) {
        setSelectedBankIds(null);
      } else {
        setSelectedBankIds(next);
      }
    }
  };

  const handleSelectAllBanks = () => {
    setSelectedBankIds(null);
  };

  const bankDropdownLabel = React.useMemo(() => {
    if (!shopPaymentMethods || shopPaymentMethods.length === 0) return 'Accounts';
    if (!selectedBankIds || selectedBankIds.length >= shopPaymentMethods.length) {
      return `Accounts (${shopPaymentMethods.length})`;
    }
    if (selectedBankIds.length === 1) {
      const b = shopPaymentMethods.find((m) => m.id === selectedBankIds[0]);
      return b?.label || b?.bank_name || b?.name || '1 Account';
    }
    return `${selectedBankIds.length} Accounts`;
  }, [shopPaymentMethods, selectedBankIds]);

  const getInvoiceElement = () => {
    const el = document.getElementById('printable-invoice');
    if (!el) throw new Error('Invoice preview not ready — open a bill first');
    return el;
  };

  const exportOptsFromPrefs = (prefs) => resolveBillExportOptions(prefs || loadBillSendPrefs());

  const buildBillBlob = async (prefs) => {
    const currentView = billView;
    const exportTarget = prefs?.target || (currentView === 'mobile' ? 'mobile' : currentView === 'story' ? 'story' : currentView === 'thermal' ? 'thermal' : 'desktop');
    const opts = exportOptsFromPrefs({ ...prefs, target: exportTarget });

    // Switch visible layout to target view for accurate screenshot capture
    setBillView(exportTarget);

    try {
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      await new Promise((r) => setTimeout(r, 80));

      const element = getInvoiceElement();
      const exportArgs = {
        scale: opts.scale,
        maxWidth: opts.maxWidth,
        layoutWidth: opts.layoutWidth,
        jpegQuality: opts.jpegQuality,
        pdfJpegQuality: opts.pdfJpegQuality,
        layout: opts.layout,
      };

      if (opts.format === 'pdf') {
        const blob = await elementToPdfBlob(element, {
          filename: `${baseName}_Invoice.pdf`,
          ...exportArgs,
        });
        return { blob, opts, filename: `${baseName}_Invoice.pdf` };
      }
      const blob = await elementToJpegBlob(element, exportArgs);
      return { blob, opts, filename: `${baseName}_Invoice.jpg` };
    } catch (err) {
      const msg = String(err?.message || err || '');
      if (/illegal invocation/i.test(msg)) {
        throw new Error('Could not render bill on this browser. Try Save, or refresh the page and retry.');
      }
      throw err;
    } finally {
      // Always restore user's active billView format!
      setBillView(currentView);
    }
  };

  const shareCaption = () =>
    isSupplier
      ? `Payment for purchase ${liveBill.invoice_number} to ${liveBill.customer_name}\nAmount to pay: ${formatCurrency(currencySymbol, liveBill.total_amount)}\nFrom: ${companyName}`
      : isHelp
        ? `Help / loan ${liveBill.invoice_number}\nGiven to: ${liveBill.customer_name}\nAmount: ${formatCurrency(currencySymbol, liveBill.total_amount)}\nReturn by: ${liveBill.due_date || '—'}\n${companyName}`
        : `Invoice ${liveBill.invoice_number} — ${companyName}\nAmount: ${formatCurrency(currencySymbol, liveBill.total_amount)}\nClient: ${liveBill.customer_name}`;

  const handleDownloadPDF = async () => {
    setSharing('pdf');
    try {
      const { blob, filename } = await buildBillBlob({ ...loadBillSendPrefs(), format: 'pdf' });
      await downloadBlob(blob, filename, 'application/pdf');
      toast.success('PDF saved');
    } catch (err) {
      if (err?.name !== 'AbortError') toast.error('Could not create PDF: ' + (err.message || err));
    } finally {
      setSharing(null);
    }
  };

  const handleDownloadImage = async () => {
    setSharing('image');
    try {
      const { blob, filename } = await buildBillBlob({ ...loadBillSendPrefs(), format: 'image' });
      await downloadBlob(blob, filename, 'image/jpeg');
      toast.success('Image saved');
    } catch (err) {
      if (err?.name !== 'AbortError') toast.error('Could not create image: ' + (err.message || err));
    } finally {
      setSharing(null);
    }
  };

  const handleSendBill = async (prefs) => {
    setSharing('send');
    try {
      const { blob, opts, filename } = await buildBillBlob(prefs);
      const caption = shareCaption();
      const result = await saveOrShareBlob(blob, filename, opts.mime, {
        title: isSupplier
          ? `Payment ${liveBill.invoice_number}`
          : isHelp
            ? `Help ${liveBill.invoice_number}`
            : `Invoice ${liveBill.invoice_number}`,
        text: caption,
        dialogTitle: 'Send bill',
      });
      if (result === 'shared') toast.success('Bill ready to send');
      else toast.success('Bill downloaded — attach it in your app');
      setSendOpen(false);
    } catch (err) {
      if (err?.name !== 'AbortError') toast.error('Could not send bill: ' + (err.message || err));
    } finally {
      setSharing(null);
    }
  };

  const handleSaveBill = async (prefs) => {
    setSharing('save');
    try {
      const { blob, opts, filename } = await buildBillBlob(prefs);
      await downloadBlob(blob, filename, opts.mime);
      toast.success(opts.format === 'pdf' ? 'PDF saved' : 'Image saved');
      setSendOpen(false);
    } catch (err) {
      if (err?.name !== 'AbortError') toast.error('Could not save bill: ' + (err.message || err));
    } finally {
      setSharing(null);
    }
  };

  const handleWhatsAppShare = async (prefs) => {
    setSharing('whatsapp');
    try {
      const usePrefs = prefs || { ...loadBillSendPrefs(), format: 'image' };
      const { blob, opts, filename } = await buildBillBlob({ ...usePrefs, format: usePrefs.format || 'image' });
      const caption = shareCaption();
      const result = await saveOrShareBlob(blob, filename, opts.mime, {
        title: isSupplier
          ? `Payment ${liveBill.invoice_number}`
          : isHelp
            ? `Help ${liveBill.invoice_number}`
            : `Invoice ${liveBill.invoice_number}`,
        text: caption,
        dialogTitle: 'Send via WhatsApp',
      });
      if (result === 'downloaded') {
        const text = buildPaymentReminderText({
          bill: liveBill,
          settings,
          currencySymbol,
          urdu,
        });
        openWhatsAppReminder(liveBill.customer_phone, text || caption);
        toast.info('File downloaded. WhatsApp will open — attach the bill if needed.');
      } else {
        toast.success('Pick WhatsApp in the share sheet');
      }
      setSendOpen(false);
    } catch (err) {
      if (err?.name !== 'AbortError') toast.error('Could not share invoice: ' + (err.message || err));
    } finally {
      setSharing(null);
    }
  };

  const handleRemind = (channel) => {
    if (balance <= 0) {
      toast.error('No balance due.');
      return;
    }
    const text = buildPaymentReminderText({
      bill: { ...liveBill, balance_due: balance },
      settings,
      currencySymbol,
      urdu,
    });
    if (channel === 'sms') openSmsReminder(liveBill.customer_phone, text);
    else openWhatsAppReminder(liveBill.customer_phone, text);
  };

  const handleEmailShare = async (prefs) => {
    setSharing('email');
    try {
      const usePrefs = prefs || { ...loadBillSendPrefs(), format: 'pdf' };
      const { blob, opts, filename } = await buildBillBlob({
        ...usePrefs,
        format: usePrefs.format || 'pdf',
      });
      const subject = isSupplier
        ? `Payment advice ${liveBill.invoice_number} from ${companyName}`
        : isHelp
          ? `Help / loan ${liveBill.invoice_number} from ${companyName}`
          : `Invoice ${liveBill.invoice_number} from ${companyName}`;
      const body = isSupplier
        ? `Assalam o Alaikum ${liveBill.customer_name},\n\nPlease find payment advice ${liveBill.invoice_number} for our purchase.\nAmount to pay: ${formatCurrency(currencySymbol, liveBill.total_amount)}\n\nRegards,\n${companyName}`
        : isHelp
          ? `Assalam o Alaikum ${liveBill.customer_name},\n\nHelp / loan ${liveBill.invoice_number}.\nAmount given: ${formatCurrency(currencySymbol, liveBill.total_amount)}\nReturn by: ${liveBill.due_date || '—'}\n\nRegards,\n${companyName}`
          : `Dear ${liveBill.customer_name},\n\nPlease find invoice ${liveBill.invoice_number}.\nTotal: ${formatCurrency(currencySymbol, liveBill.total_amount)}\n\nRegards,\n${companyName}`;
      const result = await saveOrShareBlob(blob, filename, opts.mime, {
        title: subject,
        text: body,
        dialogTitle: 'Email bill',
      });
      if (result === 'downloaded') {
        window.location.href = `mailto:${encodeURIComponent(liveBill.customer_email || '')}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body + '\n\n(Attach the downloaded file)')}`;
      }
      setSendOpen(false);
    } catch (err) {
      if (err?.name !== 'AbortError') toast.error('Could not share invoice: ' + (err.message || err));
    } finally {
      setSharing(null);
    }
  };

  const handleScreenshotPick = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      setPayScreenshot(await compressImageToDataUrl(file));
    } catch (err) {
      toast.error(err.message || 'Could not attach image');
    }
  };

  const handleQuickPay = async (e) => {
    e.preventDefault();
    const amount = parseFloat(payAmount);
    if (!amount || amount <= 0) return;
    setPaying(true);
    try {
      const proof = await persistPaymentProof(payScreenshot || '');
      const res = await apiFetch(`/api/bills/${liveBill.id}/payments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount,
          method: payMethod,
          screenshot_data: proof.screenshot_data,
          screenshot_path: proof.screenshot_path,
          screenshot_thumb: proof.screenshot_thumb,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      setLiveBill(data);
      setPayAmount('');
      setPayScreenshot('');
      const remain = Number(data.balance_due) || 0;
      toast.success(
        remain > 0
          ? `Payment saved. Remaining ${formatCurrency(currencySymbol, remain)}`
          : 'Payment saved. Bill fully paid.'
      );
    } catch (err) {
      toast.error(err.message);
    } finally {
      setPaying(false);
    }
  };

  const askDeleteBill = () => {
    setDeleteOpen(true);
  };

  const confirmDeleteBill = async () => {
    const label = liveBill.invoice_number || `#${liveBill.id}`;
    setDeleting(true);
    try {
      const res = await apiFetch(`/api/bills/${liveBill.id}`, { method: 'DELETE' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      toast.success(`Deleted ${label}`);
      setDeleteOpen(false);
      onBack?.();
    } catch (err) {
      toast.error('Delete failed: ' + err.message);
    } finally {
      setDeleting(false);
    }
  };

  const qrPaymentText = primaryWallet || `PAYMENT-INV:${liveBill.invoice_number}:${liveBill.total_amount}`;

  useEffect(() => {
    let active = true;
    if (!qrPaymentText) {
      setQrCodeDataUrl('');
      return;
    }
    generateQrDataUrl(qrPaymentText, { width: 160 }).then((url) => {
      if (active) setQrCodeDataUrl(url || '');
    });
    return () => {
      active = false;
    };
  }, [qrPaymentText]);

  const busy = Boolean(sharing);
  const payments = liveBill.payments || [];
  const cancelled = isCancelled(liveBill);
  const displayStatus = cancelled
    ? 'cancelled'
    : balance <= 0 && (Number(liveBill.total_amount) || 0) > 0
      ? 'paid'
      : String(liveBill.status || '').toLowerCase() === 'overdue'
        ? 'overdue'
        : 'pending';

  const viewLabel =
    billView === 'phone'
      ? 'Mobile Bill'
      : billView === 'mobile'
        ? 'Mobile Card'
        : billView === 'thermal'
          ? 'Thermal (80mm)'
          : billView === 'story'
            ? 'WhatsApp Story'
            : 'Standard (A4)';
  const ViewIcon =
    billView === 'phone' || billView === 'mobile'
      ? Smartphone
      : billView === 'thermal'
        ? Receipt
        : billView === 'story'
          ? Sparkles
          : FileText;
  const currentTemplate = getInvoiceTemplate(template);
  const canRemind = balance > 0 && !cancelled && liveBill.bill_type !== 'supplier';

  const runMenuAction = (fn) => {
    setMenuOpen(null);
    fn?.();
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      <div className="no-print glass-panel invoice-actions-cockpit">
        {/* Row 1: Nav & Primary Share */}
        <div className="inv-cockpit-main">
          <div className="inv-cockpit-left">
            <button type="button" className="btn-secondary inv-icon-btn" onClick={onBack} disabled={busy} title="Back">
              <ArrowLeft size={16} />
            </button>
            <button
              type="button"
              className={`btn-secondary inv-icon-btn${isBookmarked ? ' is-bookmarked-btn' : ''}`}
              onClick={handleToggleBookmark}
              disabled={busy}
              title={isBookmarked ? 'Starred ⭐' : 'Bookmark this bill'}
            >
              <Bookmark size={15} fill={isBookmarked ? '#d4af37' : 'none'} color={isBookmarked ? '#d4af37' : 'currentColor'} />
            </button>
          </div>

          <div className="inv-cockpit-right">
            <InvDropdown
              id="template"
              openId={menuOpen}
              setOpenId={setMenuOpen}
              label={currentTemplate.name}
              icon={Palette}
              disabled={busy || billView === 'thermal'}
            >
              {INVOICE_TEMPLATES.map((tmpl) => {
                const isSel = template === tmpl.id;
                return (
                  <button
                    key={tmpl.id}
                    type="button"
                    role="menuitem"
                    className={`inv-dd-item ${isSel ? 'is-active' : ''}`}
                    onClick={() => runMenuAction(() => setInvoiceTemplate(tmpl.id))}
                    style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', gap: '0.75rem' }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                      <span
                        style={{
                          width: 12,
                          height: 12,
                          borderRadius: '50%',
                          backgroundColor: tmpl.primaryColor,
                          border: tmpl.id === 'minimal' ? '1px solid #71717a' : 'none',
                          display: 'inline-block',
                          flexShrink: 0,
                        }}
                      />
                      <span>{tmpl.name}</span>
                    </div>
                    {isSel ? <Check size={14} style={{ color: 'var(--primary, #00b3a6)', marginLeft: 'auto' }} /> : null}
                  </button>
                );
              })}
            </InvDropdown>

            <button type="button" className="btn-primary inv-primary-send-btn" onClick={() => setSendOpen(true)} disabled={busy}>
              {sharing === 'send' || sharing === 'save' ? <Loader2 size={15} className="spin" /> : <Share2 size={15} />}
              <span>Send Bill</span>
            </button>
          </div>
        </div>

        {/* Row 2: Secondary Tool Strip */}
        <div className="inv-cockpit-tools">
          <InvDropdown
            id="view"
            openId={menuOpen}
            setOpenId={setMenuOpen}
            label={viewLabel}
            icon={ViewIcon}
            disabled={busy}
          >
            <InvMenuItem icon={FileText} label="Standard (A4)" onClick={() => runMenuAction(() => setBillView('desktop'))} />
            <InvMenuItem icon={Smartphone} label="Mobile Bill" onClick={() => runMenuAction(() => setBillView('phone'))} />
            <InvMenuItem icon={Smartphone} label="Mobile Card" onClick={() => runMenuAction(() => setBillView('mobile'))} />
            <InvMenuItem icon={Receipt} label="Thermal Receipt (80mm)" onClick={() => runMenuAction(() => setBillView('thermal'))} />
            <InvMenuItem icon={Sparkles} label="WhatsApp Story Card (9:16)" onClick={() => runMenuAction(() => setBillView('story'))} />
          </InvDropdown>

          <InvDropdown id="export" openId={menuOpen} setOpenId={setMenuOpen} label="Export" icon={Download} disabled={busy}>
            <InvMenuItem icon={Download} label="Download PDF" busy={sharing === 'pdf'} onClick={() => runMenuAction(() => handleDownloadPDF())} />
            <InvMenuItem icon={ImageIcon} label="Save image" busy={sharing === 'image'} onClick={() => runMenuAction(() => handleDownloadImage())} />
            <InvMenuItem icon={Printer} label="Print" onClick={() => runMenuAction(() => window.print())} />
          </InvDropdown>

          <InvDropdown id="share" openId={menuOpen} setOpenId={setMenuOpen} label="Share" icon={MessageSquare} disabled={busy}>
            <InvMenuItem icon={MessageSquare} label="WhatsApp" busy={sharing === 'whatsapp'} onClick={() => runMenuAction(() => handleWhatsAppShare())} />
            <InvMenuItem icon={Mail} label="Email" busy={sharing === 'email'} onClick={() => runMenuAction(() => handleEmailShare())} />
            {canRemind && (
              <>
                <InvMenuItem icon={Bell} label="Remind WhatsApp" onClick={() => runMenuAction(() => handleRemind('whatsapp'))} />
                <InvMenuItem icon={Smartphone} label="Remind SMS" onClick={() => runMenuAction(() => handleRemind('sms'))} />
              </>
            )}
          </InvDropdown>

          <InvDropdown id="manage" openId={menuOpen} setOpenId={setMenuOpen} label="Manage" icon={Copy} disabled={busy} danger>
            {(onEdit || onDuplicate) && (
              <InvMenuItem icon={Edit3} label="Edit bill" onClick={() => runMenuAction(() => (onEdit ? onEdit(liveBill) : onDuplicate(liveBill)))} />
            )}
            {onDuplicate && (
              <InvMenuItem icon={Copy} label="Duplicate" onClick={() => runMenuAction(() => onDuplicate(liveBill))} />
            )}
            {!cancelled && (
              <InvMenuItem icon={Undo2} label="Return / Cancel" onClick={() => runMenuAction(() => setAdjustOpen(true))} />
            )}
            <InvMenuItem icon={Trash2} label="Delete bill" danger onClick={() => runMenuAction(() => askDeleteBill())} />
          </InvDropdown>

          {shopPaymentMethods.length > 0 && (
            <InvDropdown
              id="banks"
              openId={menuOpen}
              setOpenId={setMenuOpen}
              label={bankDropdownLabel}
              icon={Landmark}
              disabled={busy}
            >
              <div style={{ padding: '0.45rem 0.75rem 0.35rem', borderBottom: '1px solid var(--border-color)', marginBottom: '0.25rem' }}>
                <span style={{ fontSize: '0.72rem', fontWeight: 800, color: 'var(--accent-teal)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  Show Accounts On Bill
                </span>
              </div>
              <button
                type="button"
                className={`inv-dd-item ${!selectedBankIds ? 'is-active' : ''}`}
                onClick={() => handleSelectAllBanks()}
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', gap: '0.5rem' }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <Landmark size={14} style={{ color: 'var(--accent-teal)' }} />
                  <span style={{ fontWeight: !selectedBankIds ? 750 : 500 }}>All Accounts ({shopPaymentMethods.length})</span>
                </div>
                {!selectedBankIds ? <Check size={14} style={{ color: 'var(--accent-teal)' }} /> : null}
              </button>
              <div style={{ height: 1, background: 'var(--border-color)', margin: '0.25rem 0' }} />
              {shopPaymentMethods.map((m) => {
                const isChecked = !selectedBankIds || selectedBankIds.includes(m.id);
                return (
                  <button
                    key={m.id}
                    type="button"
                    className={`inv-dd-item ${isChecked && selectedBankIds ? 'is-active' : ''}`}
                    onClick={() => handleToggleBank(m.id)}
                    style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', gap: '0.5rem', textAlign: 'left' }}
                  >
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.1rem', minWidth: 0 }}>
                      <span style={{ fontWeight: isChecked ? 750 : 500, fontSize: '0.82rem' }}>{m.bank_name || m.name || 'Bank'}</span>
                      {(m.account_number || m.account_title) && (
                        <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                          {[m.account_title, m.account_number].filter(Boolean).join(' · ')}
                        </span>
                      )}
                    </div>
                    {isChecked ? <Check size={14} style={{ color: 'var(--accent-teal)', flexShrink: 0 }} /> : null}
                  </button>
                );
              })}
            </InvDropdown>
          )}

          <button
            type="button"
            className={`btn-secondary ${stylePanelOpen ? 'is-active-filter' : ''}`}
            onClick={() => setStylePanelOpen((v) => !v)}
            title="Customize Brand Color & Header Layout"
            style={{ display: 'inline-flex', alignItems: 'center', gap: '0.45rem', padding: '0.4rem 0.75rem', height: '36px', borderRadius: '10px', fontSize: '0.8rem', fontWeight: 700 }}
          >
            <Palette size={14} style={{ color: settings.custom_brand_color || 'var(--accent-teal)' }} />
            <span>Style</span>
          </button>
        </div>
      </div>

      {/* Brand Color & Header Layout Studio */}
      {stylePanelOpen && (
        <div className="no-print glass-panel inv-style-studio" style={{ padding: '1rem 1.25rem', borderRadius: 16, border: '1px solid var(--border-color)', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {/* Custom Brand Color */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.35rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Palette size={16} style={{ color: 'var(--primary, #00b3a6)' }} />
                <h4 style={{ fontSize: '0.95rem', fontWeight: 800, color: 'var(--accent-teal)', margin: 0 }}>Custom Brand Color</h4>
              </div>
              <button
                type="button"
                className="btn-secondary"
                style={{ padding: '0.2rem 0.6rem', fontSize: '0.75rem', borderRadius: 8 }}
                onClick={() => setStylePanelOpen(false)}
              >
                Close ✕
              </button>
            </div>
            <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginBottom: '0.75rem' }}>
              Override the bill accent color with your business's exact color palette.
            </p>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.55rem', flexWrap: 'wrap' }}>
              {[
                { label: 'Default', hex: '' },
                { label: 'Teal', hex: '#00b3a6' },
                { label: 'Sapphire', hex: '#2563eb' },
                { label: 'Emerald', hex: '#059669' },
                { label: 'Ruby', hex: '#dc2626' },
                { label: 'Amber', hex: '#ea580c' },
                { label: 'Purple', hex: '#7c3aed' },
                { label: 'Slate', hex: '#0f172a' },
              ].map((swatch) => {
                const active = (settings.custom_brand_color || '') === swatch.hex;
                return (
                  <button
                    key={swatch.label}
                    type="button"
                    onClick={() => handleUpdateSetting('custom_brand_color', swatch.hex)}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 6,
                      padding: '0.35rem 0.75rem',
                      borderRadius: 999,
                      border: active ? '2px solid var(--accent-teal)' : '1px solid var(--border-color)',
                      background: active ? 'color-mix(in srgb, var(--accent-teal) 18%, transparent)' : 'var(--surface-muted)',
                      color: 'var(--text-primary)',
                      cursor: 'pointer',
                      fontSize: '0.8rem',
                      fontWeight: active ? 800 : 600,
                      transition: 'all 0.15s ease',
                    }}
                  >
                    <span
                      style={{
                        width: 11,
                        height: 11,
                        borderRadius: '50%',
                        backgroundColor: swatch.hex || '#00b3a6',
                        border: swatch.hex ? 'none' : '1px dashed #888',
                        display: 'inline-block',
                        flexShrink: 0,
                      }}
                    />
                    <span>{swatch.label}</span>
                  </button>
                );
              })}
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: 7, marginLeft: 4 }}>
                <input
                  type="color"
                  value={settings.custom_brand_color || '#00b3a6'}
                  onChange={(e) => handleUpdateSetting('custom_brand_color', e.target.value)}
                  style={{ width: 32, height: 32, padding: 2, border: '1px solid var(--border-color)', borderRadius: 8, cursor: 'pointer', background: 'var(--surface-muted)' }}
                  title="Pick exact hex color"
                />
                <span style={{ fontSize: '0.78rem', color: 'var(--text-primary)', fontWeight: 700, fontFamily: 'var(--font-mono)' }}>
                  {settings.custom_brand_color || 'Default'}
                </span>
              </div>
            </div>
          </div>

          {/* Custom Text / Font Color */}
          <div style={{ paddingTop: '0.85rem', borderTop: '1px solid var(--border-color)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
              <Type size={16} style={{ color: 'var(--primary, #00b3a6)' }} />
              <h4 style={{ fontSize: '0.95rem', fontWeight: 800, color: 'var(--accent-teal)', margin: 0 }}>Custom Text & Font Color</h4>
            </div>
            <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginBottom: '0.75rem' }}>
              Customize the typography color for invoice text, line items, and totals.
            </p>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.55rem', flexWrap: 'wrap' }}>
              {[
                { label: 'Default', hex: '' },
                { label: 'Deep Black', hex: '#000000' },
                { label: 'Midnight Slate', hex: '#0f172a' },
                { label: 'Dark Charcoal', hex: '#1e293b' },
                { label: 'Navy Blue', hex: '#1e3a8a' },
                { label: 'Espresso', hex: '#3b2219' },
                { label: 'Dark Emerald', hex: '#064e3b' },
                { label: 'Deep Plum', hex: '#581c87' },
              ].map((swatch) => {
                const active = (settings.custom_text_color || '') === swatch.hex;
                return (
                  <button
                    key={swatch.label}
                    type="button"
                    onClick={() => handleUpdateSetting('custom_text_color', swatch.hex)}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 6,
                      padding: '0.35rem 0.75rem',
                      borderRadius: 999,
                      border: active ? '2px solid var(--accent-teal)' : '1px solid var(--border-color)',
                      background: active ? 'color-mix(in srgb, var(--accent-teal) 18%, transparent)' : 'var(--surface-muted)',
                      color: 'var(--text-primary)',
                      cursor: 'pointer',
                      fontSize: '0.8rem',
                      fontWeight: active ? 800 : 600,
                      transition: 'all 0.15s ease',
                    }}
                  >
                    <span
                      style={{
                        width: 11,
                        height: 11,
                        borderRadius: '50%',
                        backgroundColor: swatch.hex || '#111111',
                        border: swatch.hex ? 'none' : '1px dashed #888',
                        display: 'inline-block',
                        flexShrink: 0,
                      }}
                    />
                    <span>{swatch.label}</span>
                  </button>
                );
              })}
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: 7, marginLeft: 4 }}>
                <input
                  type="color"
                  value={settings.custom_text_color || '#111111'}
                  onChange={(e) => handleUpdateSetting('custom_text_color', e.target.value)}
                  style={{ width: 32, height: 32, padding: 2, border: '1px solid var(--border-color)', borderRadius: 8, cursor: 'pointer', background: 'var(--surface-muted)' }}
                  title="Pick exact text hex color"
                />
                <span style={{ fontSize: '0.78rem', color: 'var(--text-primary)', fontWeight: 700, fontFamily: 'var(--font-mono)' }}>
                  {settings.custom_text_color || 'Default'}
                </span>
              </div>
            </div>
          </div>

          {/* Header Layout Style */}
          <div style={{ paddingTop: '0.85rem', borderTop: '1px solid var(--border-color)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
              <Layout size={16} style={{ color: 'var(--primary, #00b3a6)' }} />
              <h4 style={{ fontSize: '0.95rem', fontWeight: 800, color: 'var(--accent-teal)', margin: 0 }}>Header Layout Style</h4>
            </div>
            <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginBottom: '0.75rem' }}>
              Choose how your logo, business details, and invoice meta are organized at the top of the bill.
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '0.65rem' }}>
              {[
                { id: 'split', name: 'Modern Split (Default)', desc: 'Logo and company details on the left, invoice summary on the right.' },
                { id: 'banner', name: 'Full Banner', desc: 'Prominent header banner with glassmorphism invoice card.' },
                { id: 'centered', name: 'Centered Letterhead', desc: 'Elegant boutique style with centered logo and business title.' },
              ].map((layout) => {
                const active = (settings.header_layout || 'split') === layout.id;
                return (
                  <button
                    key={layout.id}
                    type="button"
                    className={`template-card ${active ? 'is-active' : ''}`}
                    onClick={() => handleUpdateSetting('header_layout', layout.id)}
                    style={{
                      padding: '0.75rem 0.85rem',
                      borderRadius: 12,
                      border: active ? '2px solid var(--accent-teal)' : '1px solid var(--border-color)',
                      background: active ? 'color-mix(in srgb, var(--accent-teal) 12%, transparent)' : 'var(--surface-muted)',
                      textAlign: 'left',
                      cursor: 'pointer',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 4,
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <strong style={{ fontSize: '0.84rem', color: 'var(--text-primary)' }}>{layout.name}</strong>
                      {active ? <Check size={15} style={{ color: 'var(--accent-teal)' }} /> : null}
                    </div>
                    <span style={{ fontSize: '0.74rem', color: 'var(--text-secondary)', lineHeight: 1.3 }}>{layout.desc}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {cancelled && (
        <div className="no-print surface-block" style={{ padding: '0.85rem 1rem', borderLeft: '4px solid var(--text-secondary)' }}>
          <strong>Cancelled</strong>
          <span style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: 4 }}>
            Kept in history. Stock was put back.
            {liveBill.cancel_reason ? ` Reason: ${liveBill.cancel_reason}` : ''}
          </span>
        </div>
      )}

      {balance > 0 && !cancelled && (
        <form className="no-print glass-panel exec-pay-card" onSubmit={handleQuickPay}>
          <div className="exec-pay-banner">
            <div className="exec-pay-banner-left">
              <span className="exec-pay-label">STILL DUE</span>
              <strong className="exec-pay-amount">{formatCurrency(currencySymbol, balance)}</strong>
            </div>
            {paid > 0 && (
              <div className="exec-pay-progress-wrap">
                <span className="exec-pay-progress-text">
                  Paid {formatCurrency(currencySymbol, paid)} of {formatCurrency(currencySymbol, liveBill.total_amount)}
                </span>
                <div className="exec-pay-progress-bar">
                  <div className="exec-pay-progress-fill" style={{ width: `${Math.min(100, Math.round((paid / (Number(liveBill.total_amount) || 1)) * 100))}%` }} />
                </div>
              </div>
            )}
          </div>

          <div className="exec-pay-grid">
            <div className="exec-pay-field">
              <label className="form-label">Amount Received</label>
              <div className="exec-pay-input-wrap">
                <input
                  className="form-input exec-pay-input"
                  type="number"
                  step="0.01"
                  min="0.01"
                  max={balance}
                  placeholder={String(balance)}
                  value={payAmount}
                  onChange={(e) => setPayAmount(e.target.value)}
                />
                <button
                  type="button"
                  className="exec-pay-full-btn"
                  onClick={() => setPayAmount(String(balance))}
                  title="Pay full remaining balance"
                >
                  Full
                </button>
              </div>
            </div>

            <div className="exec-pay-field">
              <label className="form-label">Payment Method</label>
              <AppSelect
                value={payMethod}
                onChange={setPayMethod}
                aria-label="How paid"
                options={['Cash', 'Bank Transfer / Raast', 'JazzCash', 'EasyPaisa']}
              />
            </div>
          </div>

          <div className="exec-pay-actions">
            <label className="btn-secondary exec-pay-photo-btn">
              <ImagePlus size={15} />
              <span>{payScreenshot ? 'Proof Attached ✓' : 'Add Photo / Proof'}</span>
              <input type="file" accept="image/*" capture="environment" style={{ display: 'none' }} onChange={handleScreenshotPick} />
            </label>

            <button type="submit" className="btn-primary exec-pay-submit-btn" disabled={paying}>
              <Banknote size={16} />
              <span>{paying ? 'Recording…' : `Record ${payAmountNum > 0 ? formatCurrency(currencySymbol, payAmountNum) : ''} Payment`}</span>
            </button>
          </div>

          {payScreenshot && (
            <div className="exec-pay-proof-preview">
              <img src={payScreenshot} alt="Proof" />
              <button type="button" className="btn-secondary btn-sm" onClick={() => setPayScreenshot('')}>
                Remove Photo
              </button>
            </div>
          )}
        </form>
      )}

      {(payments.length > 0 || paid > 0) && (
        <div className="no-print glass-panel" style={{ padding: '1rem 1.25rem' }}>
          <h4 style={{ fontSize: '0.9rem', fontWeight: 800, marginBottom: '0.65rem' }}>Payment history</h4>
          {paid > 0 && (
            <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', marginBottom: '0.65rem' }}>
              Total paid: <strong style={{ color: 'var(--success)' }}>{formatCurrency(currencySymbol, paid)}</strong>
              {balance > 0 ? (
                <> · Remaining: <strong style={{ color: 'var(--warning)' }}>{formatCurrency(currencySymbol, balance)}</strong></>
              ) : (
                <> · <strong style={{ color: 'var(--success)' }}>Fully paid</strong></>
              )}
            </p>
          )}
          {payments.length === 0 ? (
            <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>No individual payment records yet.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem' }}>
              {payments.map((p) => (
                <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.75rem', fontSize: '0.85rem' }}>
                  <div>
                    <strong style={{ fontFamily: 'var(--font-mono)' }}>{formatCurrency(currencySymbol, p.amount)}</strong>
                    {' · '}{p.method} · {p.payment_date}
                    {p.notes ? <span style={{ color: 'var(--text-muted)' }}> · {p.notes}</span> : null}
                  </div>
                  {paymentHasProof(p) && (
                    <button
                      type="button"
                      className="btn-secondary"
                      style={{ width: 'auto', padding: '0.25rem' }}
                      onClick={async () => {
                        const full = await readPaymentProof(p);
                        setPreviewShot(full || paymentProofPreview(p) || null);
                      }}
                    >
                      {paymentProofPreview(p) ? (
                        <img src={paymentProofPreview(p)} alt="Proof" style={{ width: 40, height: 40, objectFit: 'cover', borderRadius: 6, display: 'block' }} />
                      ) : (
                        <ImagePlus size={16} />
                      )}
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <p className="no-print" style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', margin: '-0.5rem 0 0' }}>
        Switch <b>Desktop</b> (A4), <b>Mobile</b> (phone card), or <b>Thermal</b> (58/80mm). Use <b>Send bill</b> to share.
      </p>

      {billView === 'thermal' ? (
        <div id="printable-invoice" className={`thermal-sheet ${urdu ? 'invoice-bilingual' : ''} ${cancelled ? 'is-cancelled' : ''}`}>
          <div className="thermal-head">
            <BrandMark size={60} logoUrl={settings.logo_url} className="thermal-logo" style={{ margin: '0 auto 0.5rem', display: 'block' }} />
            <h3 className="thermal-brand">{companyName}</h3>
            <p className="thermal-meta">{settings.company_phone}</p>
            <p className="thermal-meta">{settings.company_address}</p>
            {isSupplier && (
              <p className="thermal-doc-type">
                <BiLabel en="Purchase Payment Advice" ur="خریداری ادائیگی" urdu={urdu} />
              </p>
            )}
            {isHelp && (
              <p className="thermal-doc-type">
                <BiLabel en="Help / Loan" ur="مدد / قرض" urdu={urdu} />
              </p>
            )}
          </div>
          <div className="thermal-info">
            <div><BiLabel en={isSupplier ? 'Advice #' : isHelp ? 'Help #' : 'Receipt #'} ur={isSupplier ? 'مشورہ' : isHelp ? 'مدد' : 'رسید'} urdu={urdu} />: <b>{liveBill.invoice_number}</b></div>
            <div><BiLabel en="Date" ur="تاریخ" urdu={urdu} />: {formatBillDateTime(liveBill)}</div>
            <div>
              <BiLabel en={isSupplier ? 'Pay To' : isHelp ? 'Person' : 'Client'} ur={isSupplier ? 'ادائیگی برائے' : isHelp ? 'شخص' : 'گاہک'} urdu={urdu} />: <b>{liveBill.customer_name}</b>
            </div>
          </div>
          <div className="thermal-lines">
            {cancelled && <p className="thermal-cancelled">CANCELLED</p>}
            {liveBill.items?.map((item, idx) => {
              const rem = remainingQty(item);
              const ret = Number(item.returned_qty) || 0;
              return (
                <div key={idx} className="thermal-line">
                  <span className="thermal-line-desc">{rem}× {item.description}{ret ? ` (${ret} returned)` : ''}</span>
                  <span className="thermal-line-amt">{formatCurrency(currencySymbol, rem * (Number(item.unit_price) || 0))}</span>
                </div>
              );
            })}
          </div>
          <div className="thermal-total">
            <BiLabel en={isSupplier ? 'AMOUNT TO PAY' : isHelp ? 'AMOUNT GIVEN' : 'TOTAL'} ur={isSupplier ? 'ادا کی جانے والی رقم' : isHelp ? 'دی گئی رقم' : 'کل'} urdu={urdu} />
            <strong>{formatCurrency(currencySymbol, liveBill.total_amount)}</strong>
          </div>
          {paid > 0 && (
            <div className="thermal-paid">
              <BiLabel en="Paid" ur="ادا" urdu={urdu} />: {formatCurrency(currencySymbol, paid)} · <BiLabel en="Remaining" ur="باقی" urdu={urdu} />: {formatCurrency(currencySymbol, balance)}
            </div>
          )}
          {isSupplier && hasPayeeBank ? (
            <div className="thermal-bank">
              <div className="thermal-bank-title"><BiLabel en="Pay To Bank" ur="بینک ادائیگی" urdu={urdu} /></div>
              {liveBill.payee_bank_name && <div>Bank: {liveBill.payee_bank_name}</div>}
              {liveBill.payee_account_title && <div>Title: {liveBill.payee_account_title}</div>}
              {liveBill.payee_account_number && <div>IBAN/A/C: {liveBill.payee_account_number}</div>}
              {liveBill.payee_payment_notes && <div>{liveBill.payee_payment_notes}</div>}
            </div>
          ) : hasShopPayment ? (
            <div className="thermal-bank">
              <div className="thermal-bank-title"><BiLabel en="Payment Options" ur="ادائیگی کے طریقے" urdu={urdu} /></div>
              {activePaymentMethods.map((method) => (
                <div key={method.id} className="thermal-bank-method">
                  {paymentMethodLines(method).map((line) => (
                    <div key={line}>{line}</div>
                  ))}
                </div>
              ))}
              {paymentInstructions && <div>{paymentInstructions}</div>}
            </div>
          ) : null}
          {urdu && (
            <p className="bi-ur thermal-urdu-footer" dir="rtl" lang="ur">
              {isSupplier ? 'ادائیگی کی تصدیق محفوظ رکھیں' : 'شکریہ — بروقت ادائیگی کا شکریہ'}
            </p>
          )}
          {!isSupplier && (
            <div className="thermal-qr">
              {qrCodeDataUrl ? (
                <img src={qrCodeDataUrl} alt="Scan to Pay" width={80} height={80} />
              ) : (
                <div style={{ width: 80, height: 80, margin: '0 auto', background: '#f1f5f9', borderRadius: 4 }} />
              )}
              <p><BiLabel en="Scan to Pay" ur="ادائیگی کے لیے اسکین کریں" urdu={urdu} /></p>
            </div>
          )}
          <p className="thermal-thanks">Thank you{urdu ? ' / شکریہ' : ''}</p>
          {showDeveloperCredit ? (
            <DeveloperCredit compact className="inv-developer-credit thermal-developer-credit" />
          ) : null}
        </div>
      ) : billView === 'story' ? (
        <div id="printable-invoice" className="story-card-sheet">
          <div className="story-card-top">
            <span className="story-card-badge">Order Summary</span>
            <div style={{ display: 'flex', justifyContent: 'center', width: '100%', margin: '0.65rem auto 0.45rem' }}>
              <BrandMark size={64} logoUrl={settings.logo_url} className="story-card-logo" style={{ margin: '0 auto', display: 'block' }} />
            </div>
            <h2 className="story-card-company">{companyName}</h2>
            <p style={{ fontSize: '0.78rem', color: '#d4af37', letterSpacing: '0.15em', textTransform: 'uppercase', marginTop: '0.2rem' }}>
              {liveBill.invoice_number} · {formatBillDateTime(liveBill)}
            </p>
            <p style={{ fontSize: '1.05rem', fontWeight: 700, color: '#fdfbf7', marginTop: '0.45rem' }}>
              Prepared for {liveBill.customer_name}
            </p>
          </div>

          <div className="story-card-middle">
            <div className="story-card-items-wrap">
              {liveBill.items?.map((item, idx) => {
                const rem = remainingQty(item);
                return (
                  <div key={idx} className="story-card-item-row">
                    <span>{rem}× {item.description}</span>
                    <strong style={{ fontFamily: 'var(--font-mono)', color: '#d4af37' }}>
                      {formatCurrency(currencySymbol, rem * (Number(item.unit_price) || 0))}
                    </strong>
                  </div>
                );
              })}
            </div>

            <div className="story-card-total-box">
              <span style={{ fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: '0.1em', fontWeight: 700 }}>Total</span>
              <span className="story-card-total-val">{formatCurrency(currencySymbol, liveBill.total_amount)}</span>
            </div>
          </div>

          <div className="story-card-bottom">
            <p className="story-card-thanks">"Thank you for choosing {companyName}!"</p>
            <p className="story-card-contact">{settings.company_phone} · {settings.company_address}</p>
            {showDeveloperCredit ? (
              <DeveloperCredit compact className="inv-developer-credit" style={{ marginTop: '0.65rem' }} />
            ) : null}
          </div>
        </div>
      ) : billView === 'mobile' ? (
        <div
          id="printable-invoice"
          className={`mc-pass inv-template-${template}`}
          style={{
            '--mc-primary': currentTemplate.primaryColor,
            '--mc-accent': currentTemplate.accentColor,
            '--mc-header-bg': currentTemplate.headerBg,
            ...(settings.custom_text_color ? { '--inv-custom-text': settings.custom_text_color, color: settings.custom_text_color } : {}),
          }}
        >
          {/* Top Luxury Hero Banner */}
          <div className="mc-hero">
            <div className="mc-hero-brand">
              <BrandMark size={48} logoUrl={settings.logo_url} />
              <div className="mc-hero-titles">
                <span className="mc-hero-tag">Official Receipt</span>
                <h3 className="mc-hero-company">{companyName}</h3>
              </div>
            </div>

            <div className="mc-hero-price-block">
              <span className="mc-hero-price-label">
                {balance <= 0 ? 'Total Cleared' : 'Total Amount'}
              </span>
              <strong className="mc-hero-price-val">
                {formatCurrency(currencySymbol, liveBill.total_amount)}
              </strong>
              <div className="mc-hero-status-pill">
                <StatusBadge status={displayStatus} />
              </div>
            </div>
          </div>

          {/* Ticket Perforation Divider */}
          <div className="mc-perforation">
            <div className="mc-notch mc-notch-left" />
            <div className="mc-dashed-line" />
            <div className="mc-notch mc-notch-right" />
          </div>

          {/* Card Body */}
          <div className="mc-body">
            {/* Metadata Grid */}
            <div className="mc-grid-meta">
              <div className="mc-meta-item">
                <span className="mc-meta-lbl">INVOICE NO.</span>
                <strong className="mc-meta-txt">{liveBill.invoice_number}</strong>
              </div>
              <div className="mc-meta-item">
                <span className="mc-meta-lbl">DATE & TIME</span>
                <span className="mc-meta-txt">{formatBillDateTime(liveBill)}</span>
              </div>
            </div>

            {/* Billed To Customer */}
            <div className="mc-client-card">
              <span className="mc-meta-lbl">BILLED TO</span>
              <h4 className="mc-client-name">{liveBill.customer_name}</h4>
              {liveBill.customer_phone && <p className="mc-client-phone">{liveBill.customer_phone}</p>}
            </div>

            {/* Items List */}
            <div className="mc-items-wrap">
              <div className="mc-items-heading">
                <span>ITEMS</span>
                <span>TOTAL</span>
              </div>
              <div className="mc-items-list">
                {liveBill.items?.map((item, idx) => {
                  const rem = remainingQty(item);
                  const ret = Number(item.returned_qty) || 0;
                  const unitPrice = Number(item.unit_price) || 0;
                  return (
                    <div key={idx} className="mc-item-row">
                      <div className="mc-item-left">
                        <span className="mc-item-qty">{rem}×</span>
                        <div className="mc-item-details">
                          <strong className="mc-item-name">{item.description}</strong>
                          <span className="mc-item-rate">
                            @ {formatCurrency(currencySymbol, unitPrice)}
                            {ret ? ` (${ret} ret)` : ''}
                          </span>
                        </div>
                      </div>
                      <strong className="mc-item-sum">
                        {formatCurrency(currencySymbol, rem * unitPrice)}
                      </strong>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Financial Ledger Section */}
            <div className="mc-ledger">
              <div className="mc-ledger-row">
                <span>Subtotal</span>
                <span>{formatCurrency(currencySymbol, liveBill.total_amount)}</span>
              </div>
              {paid > 0 && (
                <div className="mc-ledger-row is-credit">
                  <span>Already Paid</span>
                  <span>- {formatCurrency(currencySymbol, paid)}</span>
                </div>
              )}
              <div className="mc-ledger-total">
                <span className="mc-ledger-total-lbl">
                  {balance <= 0 ? 'Remaining Balance' : 'Still Due'}
                </span>
                <strong className={`mc-ledger-total-val ${balance <= 0 ? 'is-zero' : 'is-due'}`}>
                  {formatCurrency(currencySymbol, balance)}
                </strong>
              </div>
            </div>

            {/* Scan To Pay / Bank Info */}
            {hasShopPayment && (
              <div className="mc-pay-strip">
                <div className="mc-pay-content">
                  <span className="mc-meta-lbl">PAYMENT ACCOUNTS / KHATA</span>
                  {activePaymentMethods.map((m) => {
                    const lines = paymentMethodLines(m);
                    return (
                      <div key={m.id} className="mc-pay-line" style={{ marginBottom: 4, lineHeight: 1.35 }}>
                        {lines.map((line, lIdx) => (
                          <div key={lIdx} style={{ fontSize: '0.74rem', fontWeight: lIdx === 0 ? 750 : 500, color: lIdx === 0 ? 'var(--text-primary)' : 'var(--text-secondary)' }}>
                            {line}
                          </div>
                        ))}
                      </div>
                    );
                  })}
                  {paymentInstructions && (
                    <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: 4 }}>{paymentInstructions}</div>
                  )}
                </div>
                {qrCodeDataUrl && (
                  <img src={qrCodeDataUrl} alt="Scan to pay" className="mc-pay-qr" />
                )}
              </div>
            )}

            {/* Footer Brand Note */}
            <div className="mc-footer">
              <p className="mc-footer-note">"Crafted with Passion · Thank you for your business!"</p>
              <p className="mc-footer-contact">{settings.company_phone} · {settings.company_address}</p>
              {showDeveloperCredit && (
                <DeveloperCredit compact className="inv-developer-credit" style={{ marginTop: '0.5rem' }} />
              )}
            </div>
          </div>
        </div>
      ) : billView === 'phone' ? (
        <div
          id="printable-invoice"
          className={`mb-bill inv-template-${template} ${cancelled ? 'is-cancelled' : ''}`}
          style={{
            '--mb-primary': settings.custom_brand_color || currentTemplate.primaryColor,
            '--mb-accent': currentTemplate.accentColor,
            '--mb-header-bg': currentTemplate.headerBg,
            ...(settings.custom_text_color ? { '--inv-custom-text': settings.custom_text_color, color: settings.custom_text_color } : {}),
          }}
        >
          <div className="mb-bill-topbar" />
          <header className="mb-bill-header">
            <div className="mb-bill-brand">
              <BrandMark size={44} logoUrl={settings.logo_url} />
              <div>
                <h2 className="mb-bill-company">{companyName}</h2>
                <p className="mb-bill-contact">{[settings.company_phone, settings.company_address].filter(Boolean).join(' · ')}</p>
              </div>
            </div>
            <div className="mb-bill-doc">
              <span className="mb-bill-num">#{liveBill.invoice_number}</span>
              <StatusBadge status={displayStatus} />
            </div>
          </header>

          <div className="mb-bill-meta">
            <div className="mb-bill-meta-item">
              <span>Billed To</span>
              <strong>{liveBill.customer_name}</strong>
              {liveBill.customer_phone && <small style={{ color: '#666', fontSize: '0.7rem' }}>{liveBill.customer_phone}</small>}
            </div>
            <div className="mb-bill-meta-item">
              <span>Date</span>
              <strong>{formatBillDateTime(liveBill)}</strong>
            </div>
            <div className="mb-bill-meta-item">
              <span>Due Date</span>
              <strong>{liveBill.due_date || 'On Receipt'}</strong>
            </div>
            {liveBill.payment_method && (
              <div className="mb-bill-meta-item">
                <span>Method</span>
                <strong>{liveBill.payment_method}</strong>
              </div>
            )}
          </div>

          <table className="mb-bill-table">
            <thead>
              <tr>
                <th>Item</th>
                <th className="num">Qty</th>
                <th className="num">Price</th>
                <th className="num">Total</th>
              </tr>
            </thead>
            <tbody>
              {liveBill.items?.map((item, idx) => {
                const rem = remainingQty(item);
                const ret = Number(item.returned_qty) || 0;
                const unit = Number(item.unit_price) || 0;
                return (
                  <tr key={idx}>
                    <td>
                      <span style={{ fontWeight: 700 }}>{item.description}</span>
                      {ret ? <span style={{ display: 'block', fontSize: '0.68rem', color: '#dc2626' }}>({ret} ret)</span> : null}
                    </td>
                    <td className="num">{rem}</td>
                    <td className="num">{unit.toLocaleString()}</td>
                    <td className="num" style={{ fontWeight: 750 }}>{(rem * unit).toLocaleString()}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          <div className="mb-bill-totals">
            <div className="mb-bill-total-row">
              <span>Subtotal</span>
              <span className="mono">{formatCurrency(currencySymbol, liveBill.subtotal)}</span>
            </div>
            {Number(liveBill.discount_amount) > 0 && (
              <div className="mb-bill-total-row" style={{ color: '#0f766e' }}>
                <span>Discount ({liveBill.discount_rate || 0}%)</span>
                <span className="mono">−{formatCurrency(currencySymbol, liveBill.discount_amount)}</span>
              </div>
            )}
            <div className="mb-bill-total-row is-grand">
              <span>Total</span>
              <span className="mono">{formatCurrency(currencySymbol, liveBill.total_amount)}</span>
            </div>
            {paid > 0 && (
              <>
                <div className="mb-bill-total-row" style={{ color: '#16a34a' }}>
                  <span>Paid</span>
                  <span className="mono">{formatCurrency(currencySymbol, paid)}</span>
                </div>
                <div className="mb-bill-total-row" style={{ color: '#c2410c' }}>
                  <span>Balance Due</span>
                  <span className="mono">{formatCurrency(currencySymbol, balance)}</span>
                </div>
              </>
            )}
          </div>

          {isSupplier && hasPayeeBank ? (
            <div className="mb-bill-paybox">
              <strong style={{ fontSize: '0.74rem', color: '#111', marginBottom: '0.2rem', display: 'block' }}>
                <BiLabel en="Pay To Bank" ur="بینک تفصیلات" urdu={urdu} />
              </strong>
              {liveBill.payee_bank_name && <div style={{ fontSize: '0.7rem' }}>Bank: {liveBill.payee_bank_name}</div>}
              {liveBill.payee_account_title && <div style={{ fontSize: '0.7rem' }}>Title: {liveBill.payee_account_title}</div>}
              {liveBill.payee_account_number && <div style={{ fontSize: '0.7rem' }}>A/C: {liveBill.payee_account_number}</div>}
            </div>
          ) : hasShopPayment ? (
            <div className="mb-bill-paybox">
              <strong style={{ fontSize: '0.74rem', color: '#111', marginBottom: '0.25rem', display: 'block' }}>
                <BiLabel en="Payment Details" ur="ادائیگی تفصیلات" urdu={urdu} />
              </strong>
              {activePaymentMethods.map((method) => {
                const lines = paymentMethodLines(method);
                if (!lines || !lines.length) return null;
                return (
                  <div key={method.id} style={{ fontSize: '0.7rem', color: '#444', lineHeight: 1.35, marginBottom: '0.25rem' }}>
                    {lines.map((line, lIdx) => (
                      <div key={lIdx}>{line}</div>
                    ))}
                  </div>
                );
              })}
              {paymentInstructions && <div style={{ fontSize: '0.68rem', color: '#666', marginTop: '0.2rem' }}>{paymentInstructions}</div>}
            </div>
          ) : null}

          <div className="mb-bill-footer">
            <p style={{ margin: 0, fontWeight: 600 }}>Thank you for your business!</p>
            {showDeveloperCredit && (
              <DeveloperCredit compact className="inv-developer-credit" style={{ marginTop: '0.45rem', justifyContent: 'center' }} />
            )}
          </div>
        </div>
      ) : (
        <div className="no-print inv-a4-scroll-wrap">
        <div
          id="printable-invoice"
          style={{
            ...(settings.custom_brand_color ? { '--inv-custom-accent': settings.custom_brand_color } : {}),
            ...(settings.custom_text_color ? { '--inv-custom-text': settings.custom_text_color, color: settings.custom_text_color } : {}),
          }}
          className={`invoice-sheet inv-template-${template} inv-header--${settings.header_layout || 'split'} ${urdu ? 'invoice-bilingual' : ''} ${cancelled ? 'is-cancelled' : ''}`}
        >
          <div className="inv-watermark" aria-hidden="true">
            <BrandMark size={240} logoUrl={settings.logo_url} />
          </div>
          <div className="inv-topbar" />
          <header className="inv-header">
            <div className="inv-brand-block">
              <BrandMark size={settings.header_layout === 'centered' ? 80 : 64} logoUrl={settings.logo_url} />
              <div>
                {companyIsElite ? (
                  <>
                    <div className="inv-elite">ELITE</div>
                    <h1 className="inv-company">CHOCOLATE</h1>
                  </>
                ) : (
                  <>
                    <h1 className="inv-company">{companyName}</h1>
                  </>
                )}
                <div className="inv-company-meta">
                  {settings.company_address && <span>{settings.company_address}</span>}
                  {settings.company_phone && <span>Tel: {settings.company_phone}</span>}
                  {settings.company_email && <span>Email: {settings.company_email}</span>}
                </div>
              </div>
            </div>

            <div className="inv-meta-block">
              <div className="inv-title-badge">
                <span className="inv-title-text">{isSupplier ? 'PURCHASE / VOUCHER' : isHelp ? 'LOAN / HELP RECORD' : 'INVOICE'}</span>
                <span className="invoice-mono inv-num">#{liveBill.invoice_number}</span>
              </div>
              <div className="inv-meta-grid">
                <div className="inv-meta-cell">
                  <span className="inv-meta-k"><BiLabel en="Date" ur="تاریخ" urdu={urdu} /></span>
                  <span className="inv-meta-v">{formatBillDateTime(liveBill)}</span>
                </div>
                <div className="inv-meta-cell">
                  <span className="inv-meta-k"><BiLabel en="Due Date" ur="آخری تاریخ" urdu={urdu} /></span>
                  <span className="inv-meta-v">{liveBill.due_date || 'On Receipt'}</span>
                </div>
                <div className="inv-meta-cell">
                  <span className="inv-meta-k"><BiLabel en="Status" ur="حیثیت" urdu={urdu} /></span>
                  <span className="inv-meta-v">
                    <StatusBadge status={displayStatus} />
                  </span>
                </div>
                {liveBill.payment_method && (
                  <div className="inv-meta-cell">
                    <span className="inv-meta-k"><BiLabel en="Payment Method" ur="طریقہ ادائیگی" urdu={urdu} /></span>
                    <span className="inv-meta-v">{liveBill.payment_method}</span>
                  </div>
                )}
              </div>
            </div>
          </header>

          <div className="inv-party-strip">
            <div className="inv-party-card">
              <span className="inv-party-lbl">{isSupplier ? 'SUPPLIER / PAYEE' : isHelp ? 'GIVEN TO' : 'BILLED TO'}</span>
              <h3 className="inv-party-name">{liveBill.customer_name}</h3>
              <div className="inv-party-meta-row">
                {liveBill.customer_phone && <span className="inv-party-detail"><strong>Phone:</strong> {liveBill.customer_phone}</span>}
                {liveBill.customer_email && <span className="inv-party-detail"><strong>Email:</strong> {liveBill.customer_email}</span>}
                {liveBill.customer_city && <span className="inv-party-detail"><strong>City:</strong> {liveBill.customer_city}</span>}
              </div>
            </div>
          </div>

          <table className="inv-table">
            <thead>
              <tr>
                <th style={{ width: 40 }}>#</th>
                <th><BiLabel en="Item & Description" ur="اشیاء و تفصیل" urdu={urdu} /></th>
                <th className="num" style={{ width: 80 }}><BiLabel en="Qty" ur="تعداد" urdu={urdu} /></th>
                <th className="num" style={{ width: 110 }}><BiLabel en="Unit Price" ur="قیمت فی عدد" urdu={urdu} /></th>
                <th className="num" style={{ width: 120 }}><BiLabel en="Total" ur="کل" urdu={urdu} /></th>
              </tr>
            </thead>
            <tbody>
              {liveBill.items?.map((item, idx) => {
                const rem = remainingQty(item);
                const ret = Number(item.returned_qty) || 0;
                const unit = Number(item.unit_price) || 0;
                return (
                  <tr key={idx}>
                    <td>{idx + 1}</td>
                    <td>
                      <span className="inv-item-desc">{item.description}</span>
                      {ret ? (
                        <span className="inv-item-ret-tag">
                          ({ret} {urdu ? 'واپس شدہ' : 'returned'})
                        </span>
                      ) : null}
                    </td>
                    <td className="num">{rem}</td>
                    <td className="num mono">{formatCurrency(currencySymbol, unit)}</td>
                    <td className="num mono inv-item-total">{formatCurrency(currencySymbol, rem * unit)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          <div className="inv-summary-row">
            <div className="inv-summary-note">
              {urdu && (
                <div className="bi-ur" dir="rtl" lang="ur" style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                  یہ ایک کمپیوٹرائزڈ رسید ہے۔ کسی دستخط کی ضرورت نہیں ہے۔
                </div>
              )}
            </div>
            <div className="inv-totals">
              <div className="inv-total-row">
                <BiLabel en="Subtotal" ur="ذیلی کل" urdu={urdu} />
                <span className="mono">{formatCurrency(currencySymbol, liveBill.subtotal)}</span>
              </div>
              {Number(liveBill.tax_amount) > 0 && (
                <div className="inv-total-row">
                  <span><BiLabel en="Tax" ur="ٹیکس" urdu={urdu} /> ({liveBill.tax_rate || 0}%)</span>
                  <span className="mono">{formatCurrency(currencySymbol, liveBill.tax_amount)}</span>
                </div>
              )}
              {Number(liveBill.discount_amount) > 0 && (
                <div className="inv-total-row is-discount">
                  <span><BiLabel en="Discount" ur="رعایت" urdu={urdu} /> ({liveBill.discount_rate || 0}%)</span>
                  <span className="mono">−{formatCurrency(currencySymbol, liveBill.discount_amount)}</span>
                </div>
              )}
              <div className="inv-total-row is-grand">
                <BiLabel en={isSupplier ? 'Amount to Pay' : isHelp ? 'Amount given' : 'Total'} ur={isSupplier ? 'ادا کی جانے والی رقم' : isHelp ? 'دی گئی رقم' : 'کل رقم'} urdu={urdu} />
                <span className="mono">{formatCurrency(currencySymbol, liveBill.total_amount)}</span>
              </div>
              {paid > 0 && (
                <>
                  <div className="inv-total-row is-paid">
                    <BiLabel en="Amount Paid" ur="ادا شدہ" urdu={urdu} />
                    <span className="mono">{formatCurrency(currencySymbol, paid)}</span>
                  </div>
                  <div className="inv-total-row is-due">
                    <BiLabel en={isSupplier ? 'Remaining' : isHelp ? 'Still to return' : 'Balance Due'} ur="باقی رقم" urdu={urdu} />
                    <span className="mono">{formatCurrency(currencySymbol, balance)}</span>
                  </div>
                </>
              )}
            </div>
          </div>

          {isSupplier && hasPayeeBank ? (
            <div className="inv-paybox">
              <strong><BiLabel en="Pay To — Supplier Bank Details" ur="ادائیگی — سپلائر بینک تفصیلات" urdu={urdu} /></strong>
              {liveBill.payee_bank_name && <div>Bank: {liveBill.payee_bank_name}</div>}
              {liveBill.payee_account_title && <div>Title: {liveBill.payee_account_title}</div>}
              {liveBill.payee_account_number && <div>IBAN / A/C: {liveBill.payee_account_number}</div>}
              {liveBill.payee_payment_notes && <div className="inv-paybox-note">{liveBill.payee_payment_notes}</div>}
              {urdu && (
                <div className="bi-ur payment-urdu-block" dir="rtl" lang="ur">
                  براہ کرم مندرجہ بالا اکاؤنٹ پر ادائیگی بھیجیں
                </div>
              )}
            </div>
          ) : hasShopPayment ? (
            <div className="inv-paybox">
              <strong><BiLabel en="Payment Details" ur="ادائیگی تفصیلات" urdu={urdu} /></strong>
              {activePaymentMethods.map((method) => (
                <div key={method.id} className="inv-paybox-method">
                  {paymentMethodLines(method).map((line) => (
                    <div key={line}>{line}</div>
                  ))}
                </div>
              ))}
              {paymentInstructions && <div className="inv-paybox-note">{paymentInstructions}</div>}
              {urdu && (
                <div className="bi-ur payment-urdu-block" dir="rtl" lang="ur">
                  برائے مہربانی ادائیگی کی تصدیق واٹس ایپ پر بھیجیں
                </div>
              )}
            </div>
          ) : null}

          {liveBill.notes && (
            <div className="inv-notes">
              <strong><BiLabel en="Notes" ur="نوٹس" urdu={urdu} />:</strong> {liveBill.notes}
            </div>
          )}

          {settings.signature_url && (
            <div className="inv-signature-block">
              <div className="inv-signature-box">
                <img src={settings.signature_url} alt="Authorized Stamp / Signature" className="inv-signature-img" />
                <div className="inv-signature-line">
                  <BiLabel en="Authorized Sign / Stamp" ur="مجاز دستخط / مہر" urdu={urdu} />
                </div>
              </div>
            </div>
          )}

          <footer className="inv-footer">
            <div className="inv-footer-brand">
              <span>ELITE CHOCOLATE</span>
              <span>Thank you for your business{urdu ? ' / شکریہ' : ''}</span>
            </div>
            {showDeveloperCredit ? (
              <DeveloperCredit compact className="inv-developer-credit" />
            ) : null}
          </footer>
        </div>
        </div>
      )}

      <SendBillSheet
        open={sendOpen}
        onClose={() => !sharing && setSendOpen(false)}
        busy={sharing}
        invoiceLabel={liveBill.invoice_number || 'Invoice'}
        preferredTarget={billView}
        onSend={handleSendBill}
        onSave={handleSaveBill}
        onWhatsApp={handleWhatsAppShare}
        onEmail={handleEmailShare}
        onTargetPreview={handleTargetPreview}
      />

      <BillAdjustSheet
        bill={liveBill}
        open={adjustOpen}
        onClose={() => setAdjustOpen(false)}
        onUpdated={(updated) => {
          setLiveBill(updated);
          onBillUpdated?.(updated);
        }}
        currencySymbol={currencySymbol}
      />

      <ConfirmDialog
        open={deleteOpen}
        title={`Delete ${liveBill.invoice_number || `#${liveBill.id}`}?`}
        message="This cannot be undone. Stock will be put back if the bill was not already cancelled."
        confirmLabel={deleting ? 'Deleting…' : 'Delete'}
        busy={deleting}
        onCancel={() => {
          if (!deleting) setDeleteOpen(false);
        }}
        onConfirm={confirmDeleteBill}
      />

      {previewShot && (
        <div
          className="no-print"
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', zIndex: 10000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}
          onClick={() => setPreviewShot(null)}
        >
          <img src={previewShot} alt="Payment screenshot" style={{ maxWidth: '100%', maxHeight: '90vh', borderRadius: 12 }} />
        </div>
      )}
    </div>
  );
}
