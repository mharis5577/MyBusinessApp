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
} from 'lucide-react';
import { formatCurrency } from '../utils/pakistan';
import { apiFetch } from '../api/client';
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

export default function InvoicePreview({ bill, onBack, onDuplicate, currencySymbol = 'Rs.', urduLabels = false }) {
  const [settings, setSettings] = useState({});
  const [posMode, setPosMode] = useState(false);
  const [sharing, setSharing] = useState(null);
  const [liveBill, setLiveBill] = useState(bill);
  const [payAmount, setPayAmount] = useState('');
  const [payMethod, setPayMethod] = useState('Cash');
  const [paying, setPaying] = useState(false);
  const [payScreenshot, setPayScreenshot] = useState('');
  const [previewShot, setPreviewShot] = useState(null);
  const [advanceWallet, setAdvanceWallet] = useState(0);

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

  useEffect(() => {
    if (!liveBill?.customer_name || liveBill.bill_type === 'supplier') {
      setAdvanceWallet(0);
      return;
    }
    apiFetch(`/api/advances?client=${encodeURIComponent(liveBill.customer_name)}`)
      .then((res) => res.json())
      .then((data) => setAdvanceWallet(Number(data.available_advance) || 0))
      .catch(() => setAdvanceWallet(0));
  }, [liveBill?.id, liveBill?.customer_name, liveBill?.amount_paid]);

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
  const baseName = sanitizeFilename(liveBill.invoice_number);
  const paid = Number(liveBill.amount_paid) || 0;
  const balance = Number(liveBill.balance_due ?? Math.max(0, (liveBill.total_amount || 0) - paid));
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
      if (err?.name !== 'AbortError') alert('Could not create PDF: ' + (err.message || err));
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
      if (err?.name !== 'AbortError') alert('Could not create image: ' + (err.message || err));
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
        alert(
          isSupplier
            ? 'Payment advice image downloaded. WhatsApp will open — attach the JPG if needed.'
            : 'Invoice image downloaded. WhatsApp will open — attach the JPG if needed.'
        );
      }
    } catch (err) {
      if (err?.name !== 'AbortError') alert('Could not share invoice image: ' + (err.message || err));
    } finally {
      setSharing(null);
    }
  };

  const handleRemind = (channel) => {
    if (balance <= 0) {
      alert('No balance due.');
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
      if (err?.name !== 'AbortError') alert('Could not share invoice PDF: ' + (err.message || err));
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
      alert(err.message || 'Could not attach image');
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
    } catch (err) {
      alert(err.message);
    } finally {
      setPaying(false);
    }
  };

  const handleApplyAdvance = async () => {
    if (advanceWallet <= 0 || balance <= 0) return;
    setPaying(true);
    try {
      const res = await apiFetch('/api/advances/apply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          bill_id: liveBill.id,
          client_name: liveBill.customer_name,
          amount: Math.min(balance, advanceWallet),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      setLiveBill(data.bill);
      setAdvanceWallet(Number(data.available_advance) || 0);
    } catch (err) {
      alert(err.message);
    } finally {
      setPaying(false);
    }
  };

  const qrPaymentText = settings.mobile_wallet || `PAYMENT-INV:${liveBill.invoice_number}:${liveBill.total_amount}`;
  const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=120x120&data=${encodeURIComponent(qrPaymentText)}`;
  const busy = Boolean(sharing);
  const payments = liveBill.payments || [];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      <div className="no-print glass-panel invoice-actions" style={{ padding: '1rem 1.25rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem' }}>
        <button className="btn-secondary" onClick={onBack} style={{ width: 'auto' }} disabled={busy}>
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
          {balance > 0 && liveBill.bill_type !== 'supplier' && (
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

      {balance > 0 && (
        <form className="no-print glass-panel" style={{ padding: '1rem 1.25rem' }} onSubmit={handleQuickPay}>
          <div style={{ display: 'flex', gap: '0.65rem', flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <div style={{ flex: 1, minWidth: 120 }}>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: 4 }}>
                {isSupplier ? 'Remaining to pay' : 'Balance due'}:{' '}
                <strong style={{ color: 'var(--text-primary)' }}>{formatCurrency(currencySymbol, balance)}</strong>
                {paid > 0 ? ` · Paid ${formatCurrency(currencySymbol, paid)}` : ''}
              </div>
              <input className="form-input" type="number" step="0.01" min="0.01" placeholder="Payment amount" value={payAmount} onChange={(e) => setPayAmount(e.target.value)} />
            </div>
            <select className="form-select" style={{ width: 'auto', minWidth: 140 }} value={payMethod} onChange={(e) => setPayMethod(e.target.value)}>
              <option>Cash</option>
              <option>Bank Transfer / Raast</option>
              <option>JazzCash</option>
              <option>EasyPaisa</option>
            </select>
            <label className="btn-secondary" style={{ width: 'auto', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <ImagePlus size={16} />
              {payScreenshot ? 'Photo ✓' : 'Screenshot'}
              <input type="file" accept="image/*" capture="environment" style={{ display: 'none' }} onChange={handleScreenshotPick} />
            </label>
            <button type="submit" className="btn-primary" style={{ width: 'auto' }} disabled={paying}>
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
          {advanceWallet > 0 && (
            <button type="button" className="btn-secondary" style={{ marginTop: '0.65rem', width: 'auto' }} disabled={paying} onClick={handleApplyAdvance}>
              Apply advance ({formatCurrency(currencySymbol, Math.min(balance, advanceWallet))})
            </button>
          )}
        </form>
      )}

      {payments.length > 0 && (
        <div className="no-print glass-panel" style={{ padding: '1rem 1.25rem' }}>
          <h4 style={{ fontSize: '0.9rem', fontWeight: 800, marginBottom: '0.65rem' }}>Payment history</h4>
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
        </div>
      )}

      <p className="no-print" style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', margin: '-0.5rem 0 0' }}>
        Use <b>Thermal Receipt</b> for 58/80mm printers. <b>Remind WA / SMS</b> sends balance + Raast details. On phone, PDF opens a Share sheet.
      </p>

      {posMode ? (
        <div id="printable-invoice" className={`thermal-sheet ${urdu ? 'invoice-bilingual' : ''}`}>
          <div style={{ textAlign: 'center', marginBottom: '0.75rem', borderBottom: '1px dashed #000', paddingBottom: '0.5rem' }}>
            <h3 style={{ fontSize: '1.05rem', margin: 0, fontWeight: 800 }}>{companyName}</h3>
            <p style={{ margin: '0.2rem 0', fontSize: '0.72rem' }}>{settings.company_phone}</p>
            <p style={{ margin: 0, fontSize: '0.72rem' }}>{settings.company_address}</p>
            {isSupplier && (
              <p style={{ margin: '0.35rem 0 0', fontSize: '0.72rem', fontWeight: 700 }}>
                <BiLabel en="Purchase Payment Advice" ur="خریداری ادائیگی" urdu={urdu} />
              </p>
            )}
          </div>
          <div style={{ marginBottom: '0.5rem', fontSize: '0.78rem' }}>
            <div><BiLabel en={isSupplier ? 'Advice #' : 'Receipt #'} ur={isSupplier ? 'مشورہ' : 'رسید'} urdu={urdu} />: {liveBill.invoice_number}</div>
            <div><BiLabel en="Date" ur="تاریخ" urdu={urdu} />: {liveBill.bill_date}</div>
            <div>
              <BiLabel en={isSupplier ? 'Pay To' : 'Client'} ur={isSupplier ? 'ادائیگی برائے' : 'گاہک'} urdu={urdu} />: {liveBill.customer_name}
            </div>
          </div>
          <div style={{ borderBottom: '1px dashed #000', borderTop: '1px dashed #000', padding: '0.5rem 0', margin: '0.5rem 0' }}>
            {liveBill.items?.map((item, idx) => (
              <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.25rem', gap: '0.5rem' }}>
                <span style={{ flex: 1 }}>{item.quantity}x {item.description}</span>
                <span>{formatCurrency(currencySymbol, item.total)}</span>
              </div>
            ))}
          </div>
          <div style={{ textAlign: 'right', fontWeight: 'bold', fontSize: '1rem', marginTop: '0.5rem' }}>
            <BiLabel en={isSupplier ? 'AMOUNT TO PAY' : 'TOTAL'} ur={isSupplier ? 'ادا کی جانے والی رقم' : 'کل'} urdu={urdu} />: {formatCurrency(currencySymbol, liveBill.total_amount)}
          </div>
          {paid > 0 && (
            <div style={{ textAlign: 'right', fontSize: '0.8rem', marginTop: '0.25rem' }}>
              <BiLabel en={isSupplier ? 'Paid' : 'Paid'} ur="ادا" urdu={urdu} />: {formatCurrency(currencySymbol, paid)} · <BiLabel en="Remaining" ur="باقی" urdu={urdu} />: {formatCurrency(currencySymbol, balance)}
            </div>
          )}
          {isSupplier && hasPayeeBank && (
            <div style={{ marginTop: '0.65rem', fontSize: '0.72rem', borderTop: '1px dashed #000', paddingTop: '0.45rem' }}>
              <div style={{ fontWeight: 700 }}><BiLabel en="Pay To Bank" ur="بینک ادائیگی" urdu={urdu} /></div>
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
            <div style={{ textAlign: 'center', marginTop: '1rem' }}>
              <img src={qrCodeUrl} alt="Scan to Pay" style={{ width: '80px', height: '80px' }} />
              <p style={{ fontSize: '0.7rem', marginTop: '0.2rem' }}>
                <BiLabel en="Scan to Pay" ur="ادائیگی کے لیے اسکین کریں" urdu={urdu} />
              </p>
            </div>
          )}
          <p style={{ textAlign: 'center', fontSize: '0.68rem', marginTop: '0.75rem' }}>Thank you{urdu ? ' / شکریہ' : ''}</p>
        </div>
      ) : (
        <div id="printable-invoice" className={`invoice-sheet ${urdu ? 'invoice-bilingual' : ''}`}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: '2px solid #e2e8f0', paddingBottom: '1.5rem', marginBottom: '1.5rem', gap: '1rem', flexWrap: 'wrap' }}>
            <div>
              <h1 style={{ fontSize: '1.6rem', fontWeight: 800, color: '#0d4a4a', margin: 0 }}>{companyName}</h1>
              {isSupplier && (
                <p style={{ color: '#64748b', fontSize: '0.75rem', margin: '0.15rem 0 0', fontWeight: 700, textTransform: 'uppercase' }}>
                  <BiLabel en="From / Payer" ur="ادا کنندہ" urdu={urdu} />
                </p>
              )}
              <p style={{ color: '#64748b', fontSize: '0.85rem', margin: '0.2rem 0', whiteSpace: 'pre-line' }}>{settings.company_address}</p>
              <p style={{ color: '#64748b', fontSize: '0.85rem', margin: 0 }}>{settings.company_email} | {settings.company_phone}</p>
              {settings.company_tax_id && <p style={{ color: '#64748b', fontSize: '0.8rem', margin: '0.2rem 0' }}>Tax ID: {settings.company_tax_id}</p>}
            </div>
            <div style={{ textAlign: 'right' }}>
              <h2 style={{ fontSize: '1.25rem', fontWeight: 900, color: '#0f172a', margin: 0, textTransform: 'uppercase' }}>
                {isSupplier ? (
                  <BiLabel en="Purchase Payment Advice" ur="خریداری ادائیگی" urdu={urdu} />
                ) : (
                  <BiLabel en="SALES INVOICE" ur="سیلز انوائس" urdu={urdu} />
                )}
              </h2>
              <div style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: '1.1rem', color: '#0d4a4a', margin: '0.25rem 0' }}>#{liveBill.invoice_number}</div>
              <span className={`badge badge-${liveBill.status}`}>{liveBill.status}</span>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem', marginBottom: '1.5rem' }}>
            <div>
              <h4 style={{ fontSize: '0.8rem', color: '#64748b', textTransform: 'uppercase', fontWeight: 700, marginBottom: '0.4rem' }}>
                <BiLabel en={isSupplier ? 'Pay To' : 'Billed To'} ur={isSupplier ? 'ادائیگی برائے' : 'بل برائے'} urdu={urdu} />
              </h4>
              <h3 style={{ fontSize: '1.1rem', fontWeight: 800, color: '#0f172a', margin: 0 }}>{liveBill.customer_name}</h3>
              {liveBill.customer_phone && <p style={{ color: '#475569', fontSize: '0.85rem', margin: '0.2rem 0' }}>{liveBill.customer_phone}</p>}
              {liveBill.customer_address && <p style={{ color: '#475569', fontSize: '0.8rem', margin: '0.15rem 0' }}>{liveBill.customer_address}</p>}
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ marginBottom: '0.4rem' }}>
                <span style={{ color: '#64748b', fontSize: '0.85rem' }}><BiLabel en="Date" ur="تاریخ" urdu={urdu} />: </span>
                <strong>{liveBill.bill_date}</strong>
              </div>
              <div>
                <span style={{ color: '#64748b', fontSize: '0.85rem' }}><BiLabel en="Due" ur="آخری تاریخ" urdu={urdu} />: </span>
                <strong>{liveBill.due_date}</strong>
              </div>
            </div>
          </div>

          <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '1.5rem' }}>
            <thead>
              <tr style={{ background: '#f8fafc', borderBottom: '2px solid #e2e8f0', color: '#475569', fontSize: '0.8rem', textTransform: 'uppercase', textAlign: 'left' }}>
                <th style={{ padding: '0.75rem 1rem' }}><BiLabel en="Description" ur="تفصیل" urdu={urdu} /></th>
                <th style={{ padding: '0.75rem 1rem', textAlign: 'center' }}><BiLabel en="Qty" ur="تعداد" urdu={urdu} /></th>
                <th style={{ padding: '0.75rem 1rem', textAlign: 'right' }}><BiLabel en="Price" ur="قیمت" urdu={urdu} /></th>
                <th style={{ padding: '0.75rem 1rem', textAlign: 'right' }}><BiLabel en="Total" ur="کل" urdu={urdu} /></th>
              </tr>
            </thead>
            <tbody>
              {liveBill.items?.map((item, idx) => (
                <tr key={idx} style={{ borderBottom: '1px solid #e2e8f0', fontSize: '0.9rem' }}>
                  <td style={{ padding: '0.85rem 1rem', color: '#0f172a', fontWeight: 600 }}>{item.description}</td>
                  <td style={{ padding: '0.85rem 1rem', textAlign: 'center' }}>{item.quantity}</td>
                  <td style={{ padding: '0.85rem 1rem', textAlign: 'right', fontFamily: 'var(--font-mono)' }}>{Number(item.unit_price).toFixed(2)}</td>
                  <td style={{ padding: '0.85rem 1rem', textAlign: 'right', fontWeight: 700, fontFamily: 'var(--font-mono)' }}>{Number(item.total).toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <div style={{ width: '280px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.3rem 0', color: '#64748b' }}>
                <BiLabel en="Subtotal" ur="ذیلی کل" urdu={urdu} />
                <span style={{ fontFamily: 'var(--font-mono)' }}>{formatCurrency(currencySymbol, liveBill.subtotal)}</span>
              </div>
              {Number(liveBill.tax_amount) > 0 && (
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.3rem 0', color: '#64748b' }}>
                  <span><BiLabel en="Tax" ur="ٹیکس" urdu={urdu} /> ({liveBill.tax_rate || 0}%)</span>
                  <span style={{ fontFamily: 'var(--font-mono)' }}>{formatCurrency(currencySymbol, liveBill.tax_amount)}</span>
                </div>
              )}
              {Number(liveBill.discount_amount) > 0 && (
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.3rem 0', color: '#15803d' }}>
                  <span><BiLabel en="Discount" ur="رعایت" urdu={urdu} /> ({liveBill.discount_rate || 0}%)</span>
                  <span style={{ fontFamily: 'var(--font-mono)' }}>-{formatCurrency(currencySymbol, liveBill.discount_amount)}</span>
                </div>
              )}
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.6rem 0 0', marginTop: '0.5rem', borderTop: '2px solid #0f172a', fontSize: '1.15rem', fontWeight: 900 }}>
                <BiLabel en={isSupplier ? 'Amount to Pay' : 'Total'} ur={isSupplier ? 'ادا کی جانے والی رقم' : 'کل رقم'} urdu={urdu} />
                <span style={{ color: '#0d4a4a', fontFamily: 'var(--font-mono)' }}>{formatCurrency(currencySymbol, liveBill.total_amount)}</span>
              </div>
              {paid > 0 && (
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.35rem 0', color: '#b45309', fontWeight: 700 }}>
                  <BiLabel en={isSupplier ? 'Remaining' : 'Balance Due'} ur="باقی رقم" urdu={urdu} />
                  <span style={{ fontFamily: 'var(--font-mono)' }}>{formatCurrency(currencySymbol, balance)}</span>
                </div>
              )}
            </div>
          </div>

          {isSupplier ? (
            hasPayeeBank && (
              <div style={{ marginTop: '1.5rem', background: '#f8fafc', padding: '1rem', borderRadius: 10, fontSize: '0.85rem', color: '#334155' }}>
                <strong><BiLabel en="Pay To — Supplier Bank Details" ur="ادائیگی — سپلائر بینک تفصیلات" urdu={urdu} /></strong>
                {liveBill.payee_bank_name && <div>Bank: {liveBill.payee_bank_name}</div>}
                {liveBill.payee_account_title && <div>Title: {liveBill.payee_account_title}</div>}
                {liveBill.payee_account_number && <div>IBAN / A/C: {liveBill.payee_account_number}</div>}
                {liveBill.payee_payment_notes && <div style={{ marginTop: '0.35rem' }}>{liveBill.payee_payment_notes}</div>}
                {urdu && (
                  <div className="bi-ur payment-urdu-block" dir="rtl" lang="ur">
                    براہ کرم مندرجہ بالا اکاؤنٹ پر ادائیگی بھیجیں
                  </div>
                )}
              </div>
            )
          ) : (
            (settings.bank_name || settings.mobile_wallet || settings.payment_instructions || settings.account_title) && (
              <div style={{ marginTop: '1.5rem', background: '#f8fafc', padding: '1rem', borderRadius: 10, fontSize: '0.85rem', color: '#334155' }}>
                <strong><BiLabel en="Payment Details" ur="ادائیگی تفصیلات" urdu={urdu} /></strong>
                {settings.bank_name && <div>Bank: {settings.bank_name}</div>}
                {settings.account_title && <div>Title: {settings.account_title}</div>}
                {settings.account_number && <div>A/C: {settings.account_number}</div>}
                {settings.mobile_wallet && <div>Raast / JazzCash / EasyPaisa: {settings.mobile_wallet}</div>}
                {settings.payment_instructions && <div style={{ marginTop: '0.35rem' }}>{settings.payment_instructions}</div>}
                {urdu && (
                  <div className="bi-ur payment-urdu-block" dir="rtl" lang="ur">
                    برائے مہربانی ادائیگی کی تصدیق واٹس ایپ پر بھیجیں
                  </div>
                )}
              </div>
            )
          )}

          {liveBill.notes && (
            <div style={{ marginTop: '1.25rem', color: '#64748b', fontSize: '0.8rem' }}>
              <strong><BiLabel en="Notes" ur="نوٹس" urdu={urdu} />:</strong> {liveBill.notes}
            </div>
          )}
        </div>
      )}

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
