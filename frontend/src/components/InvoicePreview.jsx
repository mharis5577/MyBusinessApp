import React, { useState, useEffect } from 'react';
import {
  Printer,
  Download,
  ArrowLeft,
  MessageSquare,
  Mail,
  ToggleLeft,
  Image as ImageIcon,
  Loader2,
  Copy,
  Banknote,
  Smartphone,
  Bell,
  ImagePlus,
  Undo2,
} from 'lucide-react';
import BillAdjustSheet from './BillAdjustSheet';
import BrandMark from './BrandMark';
import { isCancelled, remainingQty } from '../utils/billAdjust';
import { formatCurrency, formatBillDateTime } from '../utils/pakistan';
import { paymentSummaryText } from '../utils/billPayments';
import { apiFetch } from '../api/client';
import { useToast } from '../toast/ToastContext';
import { downloadBlob, saveOrShareBlob } from '../utils/downloadFile';
import { elementToJpegBlob, elementToPdfBlob } from '../utils/invoiceExport';
import { compressImageToDataUrl } from '../utils/imageCompress';
import {
  buildPaymentReminderText,
  openWhatsAppReminder,
  openSmsReminder,
} from '../utils/paymentReminder';

function sanitizeFilename(name) {
  return String(name || 'Invoice').replace(/[^\w.-]+/g, '_');
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

export default function InvoicePreview({ bill, onBack, onDuplicate, onBillUpdated, currencySymbol = 'Rs.', urduLabels = false }) {
  const toast = useToast();
  const [settings, setSettings] = useState({});
  const [posMode, setPosMode] = useState(false);
  const [sharing, setSharing] = useState(null);
  const [liveBill, setLiveBill] = useState(bill);
  const [payAmount, setPayAmount] = useState('');
  const [payMethod, setPayMethod] = useState('Cash');
  const [paying, setPaying] = useState(false);
  const [payScreenshot, setPayScreenshot] = useState('');
  const [previewShot, setPreviewShot] = useState(null);
  const [adjustOpen, setAdjustOpen] = useState(false);

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
    apiFetch('/api/settings')
      .then((res) => res.json())
      .then((data) => setSettings(data || {}))
      .catch((err) => console.error(err));
  }, []);

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
  const isSupplier = liveBill.bill_type === 'supplier';
  const hasPayeeBank =
    Boolean(liveBill.payee_bank_name) ||
    Boolean(liveBill.payee_account_title) ||
    Boolean(liveBill.payee_account_number) ||
    Boolean(liveBill.payee_payment_notes);

  const getInvoiceElement = () => {
    const el = document.getElementById('printable-invoice');
    if (!el) throw new Error('Invoice preview not ready — open a bill first');
    return el;
  };

  const buildPdfBlob = async () => {
    const element = getInvoiceElement();
    return elementToPdfBlob(element, { filename: `${baseName}_Invoice.pdf` });
  };

  const buildImageBlob = async () => elementToJpegBlob(getInvoiceElement());

  const handleDownloadPDF = async () => {
    setSharing('pdf');
    try {
      const blob = await buildPdfBlob();
      await downloadBlob(blob, `${baseName}_Invoice.pdf`, 'application/pdf');
    } catch (err) {
      if (err?.name !== 'AbortError') toast.error('Could not create PDF: ' + (err.message || err));
    } finally {
      setSharing(null);
    }
  };

  const handleDownloadImage = async () => {
    setSharing('image');
    try {
      const blob = await buildImageBlob();
      await downloadBlob(blob, `${baseName}_Invoice.jpg`, 'image/jpeg');
    } catch (err) {
      if (err?.name !== 'AbortError') toast.error('Could not create image: ' + (err.message || err));
    } finally {
      setSharing(null);
    }
  };

  const handleWhatsAppShare = async () => {
    setSharing('whatsapp');
    try {
      const blob = await buildImageBlob();
      const caption = isSupplier
        ? `Payment for purchase ${liveBill.invoice_number} to ${liveBill.customer_name}\nAmount to pay: ${formatCurrency(currencySymbol, liveBill.total_amount)}\nFrom: ${companyName}`
        : `Invoice ${liveBill.invoice_number} — ${companyName}\nAmount: ${formatCurrency(currencySymbol, liveBill.total_amount)}\nClient: ${liveBill.customer_name}`;
      const result = await saveOrShareBlob(blob, `${baseName}_Invoice.jpg`, 'image/jpeg', {
        title: isSupplier ? `Payment ${liveBill.invoice_number}` : `Invoice ${liveBill.invoice_number}`,
        text: caption,
      });
      if (result === 'downloaded') {
        const text = buildPaymentReminderText({
          bill: liveBill,
          settings,
          currencySymbol,
          urdu,
        });
        openWhatsAppReminder(liveBill.customer_phone, text || caption);
        toast.error(
          isSupplier
            ? 'Payment advice image downloaded. WhatsApp will open — attach the JPG if needed.'
            : 'Invoice image downloaded. WhatsApp will open — attach the JPG if needed.'
        );
      }
    } catch (err) {
      if (err?.name !== 'AbortError') toast.error('Could not share invoice image: ' + (err.message || err));
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

  const handleEmailShare = async () => {
    setSharing('email');
    try {
      const blob = await buildPdfBlob();
      const subject = isSupplier
        ? `Payment advice ${liveBill.invoice_number} from ${companyName}`
        : `Invoice ${liveBill.invoice_number} from ${companyName}`;
      const body = isSupplier
        ? `Assalam o Alaikum ${liveBill.customer_name},\n\nPlease find payment advice ${liveBill.invoice_number} for our purchase.\nAmount to pay: ${formatCurrency(currencySymbol, liveBill.total_amount)}\n\nRegards,\n${companyName}`
        : `Dear ${liveBill.customer_name},\n\nPlease find invoice ${liveBill.invoice_number}.\nTotal: ${formatCurrency(currencySymbol, liveBill.total_amount)}\n\nRegards,\n${companyName}`;
      const result = await saveOrShareBlob(blob, `${baseName}_Invoice.pdf`, 'application/pdf', {
        title: subject,
        text: body,
      });
      if (result === 'downloaded') {
        window.location.href = `mailto:${encodeURIComponent(liveBill.customer_email || '')}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body + '\n\n(Attach the downloaded PDF)')}`;
      }
    } catch (err) {
      if (err?.name !== 'AbortError') toast.error('Could not share invoice PDF: ' + (err.message || err));
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
      const res = await apiFetch(`/api/bills/${liveBill.id}/payments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount,
          method: payMethod,
          screenshot_data: payScreenshot || '',
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

  const qrPaymentText = settings.mobile_wallet || `PAYMENT-INV:${liveBill.invoice_number}:${liveBill.total_amount}`;
  const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=120x120&data=${encodeURIComponent(qrPaymentText)}`;
  const busy = Boolean(sharing);
  const payments = liveBill.payments || [];
  const cancelled = isCancelled(liveBill);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      <div className="no-print glass-panel invoice-actions" style={{ padding: '1rem 1.25rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem' }}>
        <button className="btn-secondary" onClick={onBack} disabled={busy}>
          <ArrowLeft size={16} /> Back
        </button>
        <div className="action-chip-row" style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          <button className="btn-secondary" onClick={() => setPosMode(!posMode)} disabled={busy}>
            <ToggleLeft size={16} /> {posMode ? 'A4 Invoice' : 'Thermal Receipt'}
          </button>
          {onDuplicate && (
            <button className="btn-secondary" onClick={() => onDuplicate(liveBill)} disabled={busy}>
              <Copy size={16} /> Duplicate
            </button>
          )}
          {!cancelled && (
            <button className="btn-secondary" onClick={() => setAdjustOpen(true)} disabled={busy}>
              <Undo2 size={16} /> Return / Cancel
            </button>
          )}
          {balance > 0 && !cancelled && liveBill.bill_type !== 'supplier' && (
            <>
              <button className="btn-secondary" style={{ color: '#25D366' }} onClick={() => handleRemind('whatsapp')} disabled={busy}>
                <Bell size={16} /> Remind WA
              </button>
              <button className="btn-secondary" onClick={() => handleRemind('sms')} disabled={busy}>
                <Smartphone size={16} /> SMS
              </button>
            </>
          )}
          <button className="btn-secondary" onClick={handleWhatsAppShare} style={{ color: '#25D366' }} disabled={busy}>
            {sharing === 'whatsapp' ? <Loader2 size={16} className="spin" /> : <MessageSquare size={16} />}
            WhatsApp
          </button>
          <button className="btn-secondary" onClick={handleEmailShare} disabled={busy}>
            {sharing === 'email' ? <Loader2 size={16} className="spin" /> : <Mail size={16} />}
            Email PDF
          </button>
          <button className="btn-secondary" onClick={handleDownloadImage} disabled={busy}>
            {sharing === 'image' ? <Loader2 size={16} className="spin" /> : <ImageIcon size={16} />}
            Image
          </button>
          <button className="btn-secondary" onClick={() => window.print()} disabled={busy}>
            <Printer size={16} /> Print
          </button>
          <button className="btn-primary" onClick={handleDownloadPDF} disabled={busy}>
            {sharing === 'pdf' ? <Loader2 size={16} className="spin" /> : <Download size={16} />}
            PDF
          </button>
        </div>
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
        <form className="no-print glass-panel" style={{ padding: '1rem 1.25rem' }} onSubmit={handleQuickPay}>
          <h4 style={{ fontSize: '0.95rem', fontWeight: 800, marginBottom: '0.65rem' }}>Add payment</h4>
          <div className="payment-summary-grid" style={{ marginBottom: '0.85rem' }}>
            {paySummary.lines.map((line) => (
              <div key={line.label} className="surface-block" style={{ padding: '0.55rem 0.65rem' }}>
                <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>{line.label}</div>
                <div style={{ fontWeight: 800, fontFamily: 'var(--font-mono)', fontSize: '0.9rem', color: line.accent || 'var(--text-primary)' }}>
                  {line.value}
                </div>
              </div>
            ))}
          </div>
          <div className="payment-form-row">
            <div style={{ flex: 1, minWidth: 120 }}>
              <label className="form-label">Payment amount</label>
              <input className="form-input" type="number" step="0.01" min="0.01" max={balance} placeholder="Amount to subtract" value={payAmount} onChange={(e) => setPayAmount(e.target.value)} />
            </div>
            <select className="form-select" style={{ minWidth: 140 }} value={payMethod} onChange={(e) => setPayMethod(e.target.value)}>
              <option>Cash</option>
              <option>Bank Transfer / Raast</option>
              <option>JazzCash</option>
              <option>EasyPaisa</option>
            </select>
            <label className="btn-secondary" style={{ cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <ImagePlus size={16} />
              {payScreenshot ? 'Photo ✓' : 'Screenshot'}
              <input type="file" accept="image/*" capture="environment" style={{ display: 'none' }} onChange={handleScreenshotPick} />
            </label>
            <button type="submit" className="btn-primary" disabled={paying}>
              <Banknote size={16} /> {paying ? 'Saving…' : 'Record Pay'}
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
                  {p.screenshot_data && (
                    <button type="button" className="btn-secondary" style={{ width: 'auto', padding: '0.25rem' }} onClick={() => setPreviewShot(p.screenshot_data)}>
                      <img src={p.screenshot_data} alt="Proof" style={{ width: 40, height: 40, objectFit: 'cover', borderRadius: 6, display: 'block' }} />
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <p className="no-print" style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', margin: '-0.5rem 0 0' }}>
        Use <b>Thermal Receipt</b> for 58/80mm printers. <b>Remind WA / SMS</b> sends balance + Raast details. On phone, PDF opens a Share sheet.
      </p>

      {posMode ? (
        <div id="printable-invoice" className={`thermal-sheet ${urdu ? 'invoice-bilingual' : ''} ${cancelled ? 'is-cancelled' : ''}`}>
          <div className="thermal-head">
            <BrandMark size={42} />
            <h3 className="thermal-brand">{companyName}</h3>
            <p className="thermal-meta">{settings.company_phone}</p>
            <p className="thermal-meta">{settings.company_address}</p>
            {isSupplier && (
              <p className="thermal-doc-type">
                <BiLabel en="Purchase Payment Advice" ur="خریداری ادائیگی" urdu={urdu} />
              </p>
            )}
          </div>
          <div className="thermal-info">
            <div><BiLabel en={isSupplier ? 'Advice #' : 'Receipt #'} ur={isSupplier ? 'مشورہ' : 'رسید'} urdu={urdu} />: <b>{liveBill.invoice_number}</b></div>
            <div><BiLabel en="Date" ur="تاریخ" urdu={urdu} />: {formatBillDateTime(liveBill)}</div>
            <div>
              <BiLabel en={isSupplier ? 'Pay To' : 'Client'} ur={isSupplier ? 'ادائیگی برائے' : 'گاہک'} urdu={urdu} />: <b>{liveBill.customer_name}</b>
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
            <BiLabel en={isSupplier ? 'AMOUNT TO PAY' : 'TOTAL'} ur={isSupplier ? 'ادا کی جانے والی رقم' : 'کل'} urdu={urdu} />
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
          {urdu && (
            <p className="bi-ur thermal-urdu-footer" dir="rtl" lang="ur">
              {isSupplier ? 'ادائیگی کی تصدیق محفوظ رکھیں' : 'شکریہ — بروقت ادائیگی کا شکریہ'}
            </p>
          )}
          {!isSupplier && (
            <div className="thermal-qr">
              <img src={qrCodeUrl} alt="Scan to Pay" width={80} height={80} />
              <p><BiLabel en="Scan to Pay" ur="ادائیگی کے لیے اسکین کریں" urdu={urdu} /></p>
            </div>
          )}
          <p className="thermal-thanks">Thank you{urdu ? ' / شکریہ' : ''}</p>
        </div>
      ) : (
        <div id="printable-invoice" className={`invoice-sheet ${urdu ? 'invoice-bilingual' : ''} ${cancelled ? 'is-cancelled' : ''}`}>
          <div className="inv-topbar" />
          <header className="inv-header">
            <div className="inv-brand-block">
              <BrandMark size={52} />
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
                ) : (
                  <BiLabel en="Sales Invoice" ur="سیلز انوائس" urdu={urdu} />
                )}
              </p>
              <div className="inv-number">#{liveBill.invoice_number}</div>
              <span className={`badge badge-${cancelled ? 'cancelled' : liveBill.status}`}>
                {cancelled ? 'cancelled' : liveBill.status}
              </span>
            </div>
          </header>

          <section className="inv-meta-grid">
            <div className="inv-party">
              <h4>
                <BiLabel en={isSupplier ? 'Pay To' : 'Billed To'} ur={isSupplier ? 'ادائیگی برائے' : 'بل برائے'} urdu={urdu} />
              </h4>
              <h3>{liveBill.customer_name}</h3>
              {liveBill.customer_phone && <p>{liveBill.customer_phone}</p>}
              {liveBill.customer_address && <p>{liveBill.customer_address}</p>}
            </div>
            <div className="inv-dates">
              <div>
                <span><BiLabel en="Bill date" ur="تاریخ" urdu={urdu} /></span>
                <strong>{formatBillDateTime(liveBill)}</strong>
              </div>
              <div>
                <span><BiLabel en="Due date" ur="آخری تاریخ" urdu={urdu} /></span>
                <strong>{liveBill.due_date}</strong>
              </div>
              {liveBill.payment_method && (
                <div>
                  <span><BiLabel en="Method" ur="طریقہ" urdu={urdu} /></span>
                  <strong>{liveBill.payment_method}</strong>
                </div>
              )}
            </div>
          </section>

          <table className="inv-table">
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
                return (
                  <tr key={idx}>
                    <td>
                      <span className="inv-item-name">{item.description}</span>
                      {ret ? <span className="inv-item-note">{ret} returned</span> : null}
                    </td>
                    <td className="num">{rem}</td>
                    <td className="num mono">{Number(item.unit_price).toFixed(2)}</td>
                    <td className="num mono strong">{(rem * (Number(item.unit_price) || 0)).toFixed(2)}</td>
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
                <BiLabel en={isSupplier ? 'Amount to Pay' : 'Total'} ur={isSupplier ? 'ادا کی جانے والی رقم' : 'کل رقم'} urdu={urdu} />
                <span className="mono">{formatCurrency(currencySymbol, liveBill.total_amount)}</span>
              </div>
              {paid > 0 && (
                <>
                  <div className="inv-total-row is-paid">
                    <BiLabel en="Amount Paid" ur="ادا شدہ" urdu={urdu} />
                    <span className="mono">{formatCurrency(currencySymbol, paid)}</span>
                  </div>
                  <div className="inv-total-row is-due">
                    <BiLabel en={isSupplier ? 'Remaining' : 'Balance Due'} ur="باقی رقم" urdu={urdu} />
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
            (settings.bank_name || settings.mobile_wallet || settings.payment_instructions || settings.account_title) && (
              <div className="inv-paybox">
                <strong><BiLabel en="Payment Details" ur="ادائیگی تفصیلات" urdu={urdu} /></strong>
                {settings.bank_name && <div>Bank: {settings.bank_name}</div>}
                {settings.account_title && <div>Title: {settings.account_title}</div>}
                {settings.account_number && <div>A/C / Raast: {settings.account_number}</div>}
                {settings.mobile_wallet && <div>JazzCash / EasyPaisa: {settings.mobile_wallet}</div>}
                {settings.payment_instructions && <div className="inv-paybox-note">{settings.payment_instructions}</div>}
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

          <footer className="inv-footer">
            <span>ELITE CHOCOLATE</span>
            <span>Thank you for your business{urdu ? ' / شکریہ' : ''}</span>
          </footer>
        </div>
      )}

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
