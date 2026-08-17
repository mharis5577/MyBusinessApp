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
    if (v === 'mobile' || v === 'desktop' || v === 'thermal') return v;
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

export default function InvoicePreview({ bill, onBack, onDuplicate, onBillUpdated, currencySymbol = 'Rs.', urduLabels = false, settings: settingsProp = {} }) {
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
    const next = view === 'mobile' || view === 'thermal' ? view : 'desktop';
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
  const paymentInstructions = compactPaymentInstructions(settings.payment_instructions, shopPaymentMethods);
  const hasShopPayment =
    shopPaymentMethods.length > 0 || Boolean(paymentInstructions);
  const primaryWallet =
    shopPaymentMethods.find((m) => m.mobile_wallet)?.mobile_wallet ||
    shopPaymentMethods.find((m) => m.account_number)?.account_number ||
    settings.mobile_wallet ||
    '';

  const getInvoiceElement = () => {
    const el = document.getElementById('printable-invoice');
    if (!el) throw new Error('Invoice preview not ready — open a bill first');
    return el;
  };

  const exportOptsFromPrefs = (prefs) => resolveBillExportOptions(prefs || loadBillSendPrefs());

  const buildBillBlob = async (prefs) => {
    const opts = exportOptsFromPrefs(prefs);
    const prevView = billView;

    // Switch visible layout so capture matches Desktop (A4) vs Mobile (phone card)
    setBillView(opts.target === 'mobile' ? 'mobile' : 'desktop');

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
      if (!sendOpen) setBillView(prevView);
      else setBillView(opts.target === 'mobile' ? 'mobile' : 'desktop');
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

  const viewLabel = billView === 'mobile' ? 'Mobile' : billView === 'thermal' ? 'Thermal' : 'Desktop';
  const ViewIcon = billView === 'mobile' ? Smartphone : billView === 'thermal' ? Receipt : Monitor;
  const currentTemplate = getInvoiceTemplate(template);
  const canRemind = balance > 0 && !cancelled && liveBill.bill_type !== 'supplier';

  const runMenuAction = (fn) => {
    setMenuOpen(null);
    fn?.();
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      <div className="no-print glass-panel invoice-actions">
        <div className="invoice-actions-top">
          <button type="button" className="btn-secondary invoice-back-btn" onClick={onBack} disabled={busy}>
            <ArrowLeft size={16} /> <span>Back</span>
          </button>
          <button type="button" className="btn-primary invoice-send-btn" onClick={() => setSendOpen(true)} disabled={busy}>
            {sharing === 'send' || sharing === 'save' ? <Loader2 size={16} className="spin" /> : <Share2 size={16} />}
            <span>Send bill</span>
          </button>
        </div>

        <div className="invoice-action-grid">
          <InvDropdown
            id="view"
            openId={menuOpen}
            setOpenId={setMenuOpen}
            label={viewLabel}
            icon={ViewIcon}
            disabled={busy}
          >
            <InvMenuItem
              icon={Monitor}
              label="Desktop (A4)"
              onClick={() => runMenuAction(() => setBillView('desktop'))}
            />
            <InvMenuItem
              icon={Smartphone}
              label="Mobile card"
              onClick={() => runMenuAction(() => setBillView('mobile'))}
            />
            <InvMenuItem
              icon={Receipt}
              label="Thermal receipt"
              onClick={() => runMenuAction(() => setBillView('thermal'))}
            />
          </InvDropdown>

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

          <button type="button" className="btn-primary invoice-send-in-grid" onClick={() => setSendOpen(true)} disabled={busy}>
            {sharing === 'send' || sharing === 'save' ? <Loader2 size={15} className="spin" /> : <Share2 size={15} />}
            <span>Send bill</span>
          </button>

          <InvDropdown id="share" openId={menuOpen} setOpenId={setMenuOpen} label="Share" icon={MessageSquare} disabled={busy}>
            <InvMenuItem
              icon={MessageSquare}
              label="WhatsApp"
              busy={sharing === 'whatsapp'}
              onClick={() => runMenuAction(() => handleWhatsAppShare())}
            />
            <InvMenuItem
              icon={Mail}
              label="Email"
              busy={sharing === 'email'}
              onClick={() => runMenuAction(() => handleEmailShare())}
            />
            {canRemind && (
              <>
                <InvMenuItem
                  icon={Bell}
                  label="Remind WhatsApp"
                  onClick={() => runMenuAction(() => handleRemind('whatsapp'))}
                />
                <InvMenuItem
                  icon={Smartphone}
                  label="Remind SMS"
                  onClick={() => runMenuAction(() => handleRemind('sms'))}
                />
              </>
            )}
          </InvDropdown>

          <InvDropdown id="export" openId={menuOpen} setOpenId={setMenuOpen} label="Export" icon={Download} disabled={busy}>
            <InvMenuItem
              icon={ImageIcon}
              label="Save image"
              busy={sharing === 'image'}
              onClick={() => runMenuAction(() => handleDownloadImage())}
            />
            <InvMenuItem
              icon={Download}
              label="Download PDF"
              busy={sharing === 'pdf'}
              onClick={() => runMenuAction(() => handleDownloadPDF())}
            />
            <InvMenuItem
              icon={Printer}
              label="Print"
              onClick={() => runMenuAction(() => window.print())}
            />
          </InvDropdown>

          <InvDropdown id="manage" openId={menuOpen} setOpenId={setMenuOpen} label="Manage" icon={Copy} disabled={busy} danger>
            {onDuplicate && (
              <InvMenuItem
                icon={Copy}
                label="Duplicate"
                onClick={() => runMenuAction(() => onDuplicate(liveBill))}
              />
            )}
            {!cancelled && (
              <InvMenuItem
                icon={Undo2}
                label="Return / Cancel"
                onClick={() => runMenuAction(() => setAdjustOpen(true))}
              />
            )}
            <InvMenuItem
              icon={Trash2}
              label="Delete bill"
              danger
              onClick={() => runMenuAction(() => askDeleteBill())}
            />
          </InvDropdown>
        </div>

        <label className="invoice-dev-credit-toggle">
          <input
            type="checkbox"
            checked={showDeveloperCredit}
            onChange={(e) => toggleDeveloperCredit(e.target.checked)}
          />
          Include developer name on this bill
        </label>
      </div>

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
        <form className="no-print glass-panel pay-inline" style={{ padding: '1rem 1.25rem' }} onSubmit={handleQuickPay}>
          <div className="pay-due-banner" style={{ marginBottom: '0.85rem' }}>
            <span className="pay-due-label">Still due</span>
            <strong className="pay-due-value">{formatCurrency(currencySymbol, balance)}</strong>
            {paid > 0 && (
              <span className="pay-due-hint">
                Already paid {formatCurrency(currencySymbol, paid)} of {formatCurrency(currencySymbol, liveBill.total_amount)}
              </span>
            )}
          </div>
          <div className="payment-form-row">
            <div style={{ flex: 1, minWidth: 140 }}>
              <label className="form-label">Amount received</label>
              <input
                className="form-input"
                type="number"
                step="0.01"
                min="0.01"
                max={balance}
                placeholder={String(balance)}
                value={payAmount}
                onChange={(e) => setPayAmount(e.target.value)}
              />
              {payAmountNum > 0 && (
                <p className={`pay-left-line ${paySummary.remaining <= 0 ? 'is-clear' : ''}`}>
                  {paySummary.remaining <= 0
                    ? 'This clears the bill.'
                    : `Left after save: ${paySummary.leftLabel}`}
                </p>
              )}
            </div>
            <div style={{ minWidth: 140 }}>
              <label className="form-label">How paid</label>
              <AppSelect
                value={payMethod}
                onChange={setPayMethod}
                aria-label="How paid"
                options={['Cash', 'Bank Transfer / Raast', 'JazzCash', 'EasyPaisa']}
              />
            </div>
            <label className="btn-secondary" style={{ cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6, alignSelf: 'flex-end' }}>
              <ImagePlus size={16} />
              {payScreenshot ? 'Photo ✓' : 'Screenshot'}
              <input type="file" accept="image/*" capture="environment" style={{ display: 'none' }} onChange={handleScreenshotPick} />
            </label>
            <button type="submit" className="btn-primary" disabled={paying} style={{ alignSelf: 'flex-end' }}>
              <Banknote size={16} /> {paying ? 'Saving…' : 'Save'}
            </button>
          </div>
          {payScreenshot && (
            <div style={{ marginTop: '0.65rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <img src={payScreenshot} alt="Proof" style={{ width: 56, height: 56, objectFit: 'cover', borderRadius: 8 }} />
              <button type="button" className="btn-secondary" style={{ width: 'auto', padding: '0.3rem 0.55rem' }} onClick={() => setPayScreenshot('')}>
                Remove
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
            <BrandMark size={36} logoUrl={settings.logo_url} />
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
          {isSupplier && hasPayeeBank && (
            <div className="thermal-bank">
              <div className="thermal-bank-title"><BiLabel en="Pay To Bank" ur="بینک ادائیگی" urdu={urdu} /></div>
              {liveBill.payee_bank_name && <div>Bank: {liveBill.payee_bank_name}</div>}
              {liveBill.payee_account_title && <div>Title: {liveBill.payee_account_title}</div>}
              {liveBill.payee_account_number && <div>IBAN/A/C: {liveBill.payee_account_number}</div>}
              {liveBill.payee_payment_notes && <div>{liveBill.payee_payment_notes}</div>}
            </div>
          )}
          {!isSupplier && hasShopPayment && (
            <div className="thermal-bank">
              <div className="thermal-bank-title"><BiLabel en="Payment Options" ur="ادائیگی کے طریقے" urdu={urdu} /></div>
              {shopPaymentMethods.map((method) => (
                <div key={method.id} className="thermal-bank-method">
                  {paymentMethodLines(method).map((line) => (
                    <div key={line}>{line}</div>
                  ))}
                </div>
              ))}
              {paymentInstructions && <div>{paymentInstructions}</div>}
            </div>
          )}
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
      ) : (
        <div
          id="printable-invoice"
          style={settings.custom_brand_color ? { '--inv-custom-accent': settings.custom_brand_color } : undefined}
          className={`invoice-sheet inv-template-${template} inv-header--${settings.header_layout || 'split'} ${billView === 'mobile' ? 'invoice-sheet--phone' : ''} ${urdu ? 'invoice-bilingual' : ''} ${cancelled ? 'is-cancelled' : ''}`}
        >
          {displayStatus === 'paid' && settings.show_paid_stamp !== 0 && settings.show_paid_stamp !== false && (
            <div className="inv-paid-stamp-wrapper">
              <div className="inv-paid-stamp">
                <span className="inv-paid-stamp-title">{urdu ? 'PAID / وصول شدہ' : 'PAID'}</span>
                <span className="inv-paid-stamp-sub">VERIFIED & CLEARED</span>
                <span className="inv-paid-stamp-date">{formatBillDateTime(liveBill)}</span>
              </div>
            </div>
          )}
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
                    <div className="inv-elite">ELITE CHOCOLATE</div>
                    <h1 className="inv-company">{companyName}</h1>
                  </>
                )}
                {isSupplier && (
                  <p className="inv-eyebrow">
                    <BiLabel en="From / Payer" ur="ادا کنندہ" urdu={urdu} />
                  </p>
                )}
                <p className="inv-contact">{settings.company_address}</p>
                <p className="inv-contact">{[settings.company_email, settings.company_phone].filter(Boolean).join(' · ')}</p>
                {settings.company_tax_id && <p className="inv-contact">NTN / Tax: {settings.company_tax_id}</p>}
              </div>
            </div>
            <div className="inv-doc-block">
              <p className="inv-doc-label">
                {isSupplier ? (
                  <BiLabel en="Purchase Payment Advice" ur="خریداری ادائیگی" urdu={urdu} />
                ) : isHelp ? (
                  <BiLabel en="Help / Loan Record" ur="مدد / قرض ریکارڈ" urdu={urdu} />
                ) : (
                  <BiLabel en="Sales Invoice" ur="سیلز انوائس" urdu={urdu} />
                )}
              </p>
              <div className="inv-number">#{liveBill.invoice_number}</div>
              <StatusBadge status={displayStatus} />
            </div>
          </header>

          <section className="inv-meta-grid">
            <div className="inv-meta-cell inv-party">
              <h4>
                <BiLabel en={isSupplier ? 'Pay To' : isHelp ? 'Person' : 'Billed To'} ur={isSupplier ? 'ادائیگی برائے' : isHelp ? 'شخص' : 'بل برائے'} urdu={urdu} />
              </h4>
              <strong className="inv-meta-value">{liveBill.customer_name}</strong>
              {liveBill.customer_phone && <p>{liveBill.customer_phone}</p>}
              {liveBill.customer_address && <p>{liveBill.customer_address}</p>}
            </div>
            <div className="inv-meta-cell">
              <span><BiLabel en="Bill date" ur="تاریخ" urdu={urdu} /></span>
              <strong className="inv-meta-value">{formatBillDateTime(liveBill)}</strong>
            </div>
            <div className="inv-meta-cell">
              <span><BiLabel en={isHelp ? 'Return by' : 'Due date'} ur={isHelp ? 'واپسی کی تاریخ' : 'آخری تاریخ'} urdu={urdu} /></span>
              <strong className="inv-meta-value">{liveBill.due_date}</strong>
            </div>
            {liveBill.payment_method && (
              <div className="inv-meta-cell">
                <span><BiLabel en="Method" ur="طریقہ" urdu={urdu} /></span>
                <strong className="inv-meta-value">{liveBill.payment_method}</strong>
              </div>
            )}
          </section>

          <table className="inv-table">
            <colgroup>
              <col className="col-desc" />
              <col className="col-qty" />
              <col className="col-price" />
              <col className="col-total" />
            </colgroup>
            <thead>
              <tr>
                <th><BiLabel en="Description" ur="تفصیل" urdu={urdu} /></th>
                <th className="num"><BiLabel en="Qty" ur="تعداد" urdu={urdu} /></th>
                <th className="num"><BiLabel en="Price" ur="قیمت" urdu={urdu} /></th>
                <th className="num"><BiLabel en="Total" ur="کل" urdu={urdu} /></th>
              </tr>
            </thead>
            <tbody>
              {liveBill.items?.map((item, idx) => {
                const rem = remainingQty(item);
                const ret = Number(item.returned_qty) || 0;
                const unit = Number(item.unit_price) || 0;
                const lineTotal = rem * unit;
                return (
                  <tr key={idx}>
                    <td>
                      <span className="inv-item-name">{item.description}</span>
                      {ret ? <span className="inv-item-note">{ret} returned</span> : null}
                    </td>
                    <td className="num">{rem}</td>
                    <td className="num">{unit.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                    <td className="num strong">{lineTotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          <div className="inv-totals-wrap">
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

          {payments.length > 0 && (
            <div className="inv-pay-history">
              <h4><BiLabel en="Payment History" ur="ادائیگی کی تاریخ" urdu={urdu} /></h4>
              <table>
                <thead>
                  <tr>
                    <th><BiLabel en="Date" ur="تاریخ" urdu={urdu} /></th>
                    <th><BiLabel en="Method" ur="طریقہ" urdu={urdu} /></th>
                    <th className="num"><BiLabel en="Amount" ur="رقم" urdu={urdu} /></th>
                  </tr>
                </thead>
                <tbody>
                  {payments.map((p) => (
                    <tr key={p.id}>
                      <td>{p.payment_date}</td>
                      <td>{p.method}</td>
                      <td className="num mono">{formatCurrency(currencySymbol, p.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {isSupplier ? (
            hasPayeeBank && (
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
            )
          ) : (
            hasShopPayment && (
              <div className="inv-paybox">
                <strong><BiLabel en="Payment Details" ur="ادائیگی تفصیلات" urdu={urdu} /></strong>
                {shopPaymentMethods.map((method) => (
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
            )
          )}

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
      )}

      <SendBillSheet
        open={sendOpen}
        onClose={() => !sharing && setSendOpen(false)}
        busy={sharing}
        invoiceLabel={liveBill.invoice_number || 'Invoice'}
        preferredTarget={billView === 'mobile' ? 'mobile' : 'desktop'}
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
