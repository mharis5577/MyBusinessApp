import React, { useState, useEffect } from 'react';
import { Printer, Download, ArrowLeft, MessageSquare, Mail, ToggleLeft, Image as ImageIcon, Loader2, Copy, Banknote } from 'lucide-react';
import html2pdf from 'html2pdf.js';
import html2canvas from 'html2canvas';
import { formatCurrency } from '../utils/pakistan';
import { apiFetch } from '../api/client';

function sanitizeFilename(name) {
  return String(name || 'Invoice').replace(/[^\w.-]+/g, '_');
}

function normalizeWhatsAppPhone(phone) {
  const digits = String(phone || '').replace(/\D/g, '');
  if (!digits) return '';
  if (digits.startsWith('92')) return digits;
  if (digits.startsWith('0') && digits.length === 11) return `92${digits.slice(1)}`;
  if (digits.length === 10) return `92${digits}`;
  return digits;
}

function triggerDownload(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

export default function InvoicePreview({ bill, onBack, onDuplicate, currencySymbol = 'Rs.', urduLabels = false }) {
  const [settings, setSettings] = useState({});
  const [posMode, setPosMode] = useState(false);
  const [sharing, setSharing] = useState(null);
  const [liveBill, setLiveBill] = useState(bill);
  const [payAmount, setPayAmount] = useState('');
  const [payMethod, setPayMethod] = useState('Cash');
  const [paying, setPaying] = useState(false);

  useEffect(() => {
    setLiveBill(bill);
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
  const baseName = sanitizeFilename(liveBill.invoice_number);
  const paid = Number(liveBill.amount_paid) || 0;
  const balance = Number(liveBill.balance_due ?? Math.max(0, (liveBill.total_amount || 0) - paid));
  const label = (en, ur) => (urduLabels ? `${en} / ${ur}` : en);

  const getInvoiceElement = () => {
    const el = document.getElementById('printable-invoice');
    if (!el) throw new Error('Invoice preview not ready');
    return el;
  };

  const buildPdfBlob = async () => {
    const element = getInvoiceElement();
    const opt = {
      margin: 0.3,
      filename: `${baseName}_Invoice.pdf`,
      image: { type: 'jpeg', quality: 0.98 },
      html2canvas: { scale: 2, useCORS: true, backgroundColor: '#ffffff' },
      jsPDF: { unit: 'in', format: 'letter', orientation: 'portrait' },
    };
    return html2pdf().set(opt).from(element).outputPdf('blob');
  };

  const buildImageBlob = async () => {
    const element = getInvoiceElement();
    const canvas = await html2canvas(element, {
      scale: 2,
      useCORS: true,
      allowTaint: true,
      backgroundColor: '#ffffff',
      logging: false,
    });
    return new Promise((resolve, reject) => {
      canvas.toBlob(
        (b) => (b ? resolve(b) : reject(new Error('Could not create image'))),
        'image/jpeg',
        0.92
      );
    });
  };

  const shareOrDownloadFile = async (file, { title, text }) => {
    const payload = { files: [file], title, text };
    if (navigator.canShare && navigator.canShare(payload)) {
      await navigator.share(payload);
      return 'shared';
    }
    triggerDownload(file, file.name);
    return 'downloaded';
  };

  const handleDownloadPDF = async () => {
    setSharing('pdf');
    try {
      const blob = await buildPdfBlob();
      triggerDownload(blob, `${baseName}_Invoice.pdf`);
    } catch (err) {
      alert('Could not create PDF: ' + err.message);
    } finally {
      setSharing(null);
    }
  };

  const handleDownloadImage = async () => {
    setSharing('image');
    try {
      const blob = await buildImageBlob();
      triggerDownload(blob, `${baseName}_Invoice.jpg`);
    } catch (err) {
      alert('Could not create image: ' + err.message);
    } finally {
      setSharing(null);
    }
  };

  const handleWhatsAppShare = async () => {
    setSharing('whatsapp');
    try {
      const blob = await buildImageBlob();
      const file = new File([blob], `${baseName}_Invoice.jpg`, { type: 'image/jpeg' });
      const caption = `Invoice ${liveBill.invoice_number} — ${companyName}\nAmount: ${formatCurrency(currencySymbol, liveBill.total_amount)}\nClient: ${liveBill.customer_name}`;
      const result = await shareOrDownloadFile(file, { title: `Invoice ${liveBill.invoice_number}`, text: caption });
      if (result === 'downloaded') {
        const phone = normalizeWhatsAppPhone(liveBill.customer_phone);
        const waBase = phone ? `https://wa.me/${phone}` : 'https://wa.me/';
        alert('Invoice image saved. WhatsApp will open — attach the downloaded JPG.');
        window.open(`${waBase}?text=${encodeURIComponent(caption)}`, '_blank');
      }
    } catch (err) {
      if (err?.name !== 'AbortError') alert('Could not share invoice image: ' + (err.message || err));
    } finally {
      setSharing(null);
    }
  };

  const handleEmailShare = async () => {
    setSharing('email');
    try {
      const blob = await buildPdfBlob();
      const file = new File([blob], `${baseName}_Invoice.pdf`, { type: 'application/pdf' });
      const subject = `Invoice ${liveBill.invoice_number} from ${companyName}`;
      const body = `Dear ${liveBill.customer_name},\n\nPlease find invoice ${liveBill.invoice_number}.\nTotal: ${formatCurrency(currencySymbol, liveBill.total_amount)}\n\nRegards,\n${companyName}`;
      const result = await shareOrDownloadFile(file, { title: subject, text: body });
      if (result === 'downloaded') {
        window.location.href = `mailto:${encodeURIComponent(liveBill.customer_email || '')}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
      }
    } catch (err) {
      if (err?.name !== 'AbortError') alert('Could not share invoice PDF: ' + (err.message || err));
    } finally {
      setSharing(null);
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
        body: JSON.stringify({ amount, method: payMethod }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      setLiveBill(data);
      setPayAmount('');
    } catch (err) {
      alert(err.message);
    } finally {
      setPaying(false);
    }
  };

  const qrPaymentText = settings.mobile_wallet || `PAYMENT-INV:${liveBill.invoice_number}:${liveBill.total_amount}`;
  const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=120x120&data=${encodeURIComponent(qrPaymentText)}`;
  const busy = Boolean(sharing);

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
                Balance due: <strong style={{ color: 'var(--text-primary)' }}>{formatCurrency(currencySymbol, balance)}</strong>
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
            <button type="submit" className="btn-primary" style={{ width: 'auto' }} disabled={paying}>
              <Banknote size={16} /> {paying ? 'Saving…' : 'Record Pay'}
            </button>
          </div>
        </form>
      )}

      <p className="no-print" style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', margin: '-0.5rem 0 0' }}>
        Use <b>Thermal Receipt</b> for 58/80mm printers. WhatsApp sends an <b>image</b>; email uses a <b>PDF</b>.
      </p>

      {posMode ? (
        <div id="printable-invoice" className="thermal-sheet">
          <div style={{ textAlign: 'center', marginBottom: '0.75rem', borderBottom: '1px dashed #000', paddingBottom: '0.5rem' }}>
            <h3 style={{ fontSize: '1.05rem', margin: 0, fontWeight: 800 }}>{companyName}</h3>
            <p style={{ margin: '0.2rem 0', fontSize: '0.72rem' }}>{settings.company_phone}</p>
            <p style={{ margin: 0, fontSize: '0.72rem' }}>{settings.company_address}</p>
          </div>
          <div style={{ marginBottom: '0.5rem', fontSize: '0.78rem' }}>
            <div>{label('Receipt #', 'رسید')}: {liveBill.invoice_number}</div>
            <div>{label('Date', 'تاریخ')}: {liveBill.bill_date}</div>
            <div>{label('Client', 'گاہک')}: {liveBill.customer_name}</div>
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
            {label('TOTAL', 'کل')}: {formatCurrency(currencySymbol, liveBill.total_amount)}
          </div>
          {paid > 0 && (
            <div style={{ textAlign: 'right', fontSize: '0.8rem', marginTop: '0.25rem' }}>
              {label('Paid', 'ادا')}: {formatCurrency(currencySymbol, paid)} · {label('Due', 'باقی')}: {formatCurrency(currencySymbol, balance)}
            </div>
          )}
          <div style={{ textAlign: 'center', marginTop: '1rem' }}>
            <img src={qrCodeUrl} alt="Scan to Pay" style={{ width: '80px', height: '80px' }} />
            <p style={{ fontSize: '0.7rem', marginTop: '0.2rem' }}>{label('Scan to Pay', 'ادائیگی کے لیے اسکین کریں')}</p>
          </div>
          <p style={{ textAlign: 'center', fontSize: '0.68rem', marginTop: '0.75rem' }}>Thank you / شکریہ</p>
        </div>
      ) : (
        <div id="printable-invoice" className="invoice-sheet">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: '2px solid #e2e8f0', paddingBottom: '1.5rem', marginBottom: '1.5rem', gap: '1rem', flexWrap: 'wrap' }}>
            <div>
              <h1 style={{ fontSize: '1.6rem', fontWeight: 800, color: '#0d4a4a', margin: 0 }}>{companyName}</h1>
              <p style={{ color: '#64748b', fontSize: '0.85rem', margin: '0.2rem 0', whiteSpace: 'pre-line' }}>{settings.company_address}</p>
              <p style={{ color: '#64748b', fontSize: '0.85rem', margin: 0 }}>{settings.company_email} | {settings.company_phone}</p>
              {settings.company_tax_id && <p style={{ color: '#64748b', fontSize: '0.8rem', margin: '0.2rem 0' }}>Tax ID: {settings.company_tax_id}</p>}
            </div>
            <div style={{ textAlign: 'right' }}>
              <h2 style={{ fontSize: '1.25rem', fontWeight: 900, color: '#0f172a', margin: 0, textTransform: 'uppercase' }}>
                {liveBill.bill_type === 'supplier' ? label('SAUDIA BUYING BILL', 'خریداری بل') : label('SALES INVOICE', 'سیلز انوائس')}
              </h2>
              <div style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: '1.1rem', color: '#0d4a4a', margin: '0.25rem 0' }}>#{liveBill.invoice_number}</div>
              <span className={`badge badge-${liveBill.status}`}>{liveBill.status}</span>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem', marginBottom: '1.5rem' }}>
            <div>
              <h4 style={{ fontSize: '0.8rem', color: '#64748b', textTransform: 'uppercase', fontWeight: 700, marginBottom: '0.4rem' }}>{label('Billed To', 'بل برائے')}</h4>
              <h3 style={{ fontSize: '1.1rem', fontWeight: 800, color: '#0f172a', margin: 0 }}>{liveBill.customer_name}</h3>
              {liveBill.customer_phone && <p style={{ color: '#475569', fontSize: '0.85rem', margin: '0.2rem 0' }}>{liveBill.customer_phone}</p>}
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ marginBottom: '0.4rem' }}><span style={{ color: '#64748b', fontSize: '0.85rem' }}>{label('Date', 'تاریخ')}: </span><strong>{liveBill.bill_date}</strong></div>
              <div><span style={{ color: '#64748b', fontSize: '0.85rem' }}>{label('Due', 'آخری تاریخ')}: </span><strong>{liveBill.due_date}</strong></div>
            </div>
          </div>

          <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '1.5rem' }}>
            <thead>
              <tr style={{ background: '#f8fafc', borderBottom: '2px solid #e2e8f0', color: '#475569', fontSize: '0.8rem', textTransform: 'uppercase', textAlign: 'left' }}>
                <th style={{ padding: '0.75rem 1rem' }}>{label('Description', 'تفصیل')}</th>
                <th style={{ padding: '0.75rem 1rem', textAlign: 'center' }}>{label('Qty', 'تعداد')}</th>
                <th style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>{label('Price', 'قیمت')}</th>
                <th style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>{label('Total', 'کل')}</th>
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
                <span>{label('Subtotal', 'ذیلی کل')}</span>
                <span style={{ fontFamily: 'var(--font-mono)' }}>{formatCurrency(currencySymbol, liveBill.subtotal)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.6rem 0 0', marginTop: '0.5rem', borderTop: '2px solid #0f172a', fontSize: '1.15rem', fontWeight: 900 }}>
                <span>{label('Total', 'کل')}</span>
                <span style={{ color: '#0d4a4a', fontFamily: 'var(--font-mono)' }}>{formatCurrency(currencySymbol, liveBill.total_amount)}</span>
              </div>
              {paid > 0 && (
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.35rem 0', color: '#b45309', fontWeight: 700 }}>
                  <span>{label('Balance Due', 'باقی رقم')}</span>
                  <span style={{ fontFamily: 'var(--font-mono)' }}>{formatCurrency(currencySymbol, balance)}</span>
                </div>
              )}
            </div>
          </div>

          {(settings.bank_name || settings.mobile_wallet) && (
            <div style={{ marginTop: '1.5rem', background: '#f8fafc', padding: '1rem', borderRadius: 10, fontSize: '0.85rem', color: '#334155' }}>
              <strong>{label('Payment Details', 'ادائیگی تفصیلات')}</strong>
              {settings.bank_name && <div>Bank: {settings.bank_name}</div>}
              {settings.account_number && <div>A/C: {settings.account_number}</div>}
              {settings.mobile_wallet && <div>Raast / JazzCash / EasyPaisa: {settings.mobile_wallet}</div>}
            </div>
          )}

          {liveBill.notes && (
            <div style={{ marginTop: '1.25rem', color: '#64748b', fontSize: '0.8rem' }}>
              <strong>{label('Notes', 'نوٹس')}:</strong> {liveBill.notes}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
