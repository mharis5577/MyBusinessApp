import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import {
  MessageCircle,
  X,
  Copy,
  Check,
  Send,
  Users2,
  Calendar,
  Sparkles,
  ExternalLink,
  ShieldCheck,
} from 'lucide-react';
import { formatCurrency } from '../utils/pakistan';
import { normalizeWhatsAppPhone } from '../utils/paymentReminder';
import { playSuccessChime, playTapSound } from '../utils/audioEffects';
import useDialog from '../utils/useDialog';
import { useToast } from '../toast/ToastContext';

export default function PartnerWhatsAppDigestModal({
  open,
  onClose,
  calcData = {},
  partners = [],
  currencySymbol = 'Rs.',
  settings = {},
  latestSettlement = null,
}) {
  const toast = useToast();
  const [activeTemplate, setActiveTemplate] = useState('weekly'); // 'weekly' | 'settlement' | 'payout'
  const [copied, setCopied] = useState(false);
  const [selectedPartnerId, setSelectedPartnerId] = useState(partners[0]?.id || 1);
  const dialogRef = useDialog(open, onClose);

  if (!open) return null;

  const companyName = settings?.company_name || 'ELITE CHOCOLATE';
  const summary = calcData.summary || {};
  const orders = calcData.orders || [];
  const period = calcData.period || {};

  const totalSales = Number(summary.total_sales) || 0;
  const totalBuying = Number(summary.total_buying) || 0;
  const netProfit = Number(summary.net_profit) || 0;
  const marginPct = summary.profit_margin_pct ?? 0;
  const halfShare = Math.round((netProfit / 2) * 100) / 100;

  const selectedPartner = partners.find((p) => String(p.id) === String(selectedPartnerId)) || partners[0];

  // Template 1: Weekly / Period Financial Brief
  const generateWeeklyText = () => {
    const rangeText = period.startDate && period.endDate
      ? `${period.startDate} to ${period.endDate}`
      : 'Active Period';

    return `🍫 *${companyName} — PARTNERSHIP PROFIT DIGEST*
📅 *Period:* ${rangeText}
⏰ *Generated:* ${new Date().toLocaleDateString('en-GB')}

━━━━━━━━━━━━━━━━━━━━
📦 *Orders / Shipments:* ${orders.length} transactions
💰 *Gross Sales:* ${formatCurrency(currencySymbol, totalSales, { maximumFractionDigits: 0 })}
✈️ *Saudia Purchases:* ${formatCurrency(currencySymbol, totalBuying, { maximumFractionDigits: 0 })}
✨ *Net Operating Profit:* ${formatCurrency(currencySymbol, netProfit, { maximumFractionDigits: 0 })} (${marginPct}% margin)
━━━━━━━━━━━━━━━━━━━━
👥 *50/50 Profit Division:*
  • *Nomi (50%):* ${formatCurrency(currencySymbol, halfShare, { maximumFractionDigits: 0 })}
  • *Haris (50%):* ${formatCurrency(currencySymbol, halfShare, { maximumFractionDigits: 0 })}
━━━━━━━━━━━━━━━━━━━━
📊 *Account Standing:*
  • Nomi Available Balance: ${formatCurrency(currencySymbol, partners[0]?.current_balance || 0, { maximumFractionDigits: 0 })}
  • Haris Available Balance: ${formatCurrency(currencySymbol, partners[1]?.current_balance || 0, { maximumFractionDigits: 0 })}

✅ _Accrual & shipment reconciled from Cloud POS._`;
  };

  // Template 2: Settlement Milestone Checkpoint
  const generateSettlementText = () => {
    const settl = latestSettlement || {
      settlement_code: 'SETTL-RECENT',
      period_start: period.startDate || 'Start',
      period_end: period.endDate || 'Today',
      net_profit: netProfit,
      nomi_share: halfShare,
      haris_share: halfShare,
    };

    return `🚩 *${companyName} — PROFIT SETTLEMENT MILESTONE*
🔒 *Checkpoint Ref:* \`${settl.settlement_code}\`
📅 *Settled Period:* ${settl.period_start} to ${settl.period_end}

━━━━━━━━━━━━━━━━━━━━
💰 *Settled Total Profit:* ${formatCurrency(currencySymbol, settl.net_profit, { maximumFractionDigits: 0 })}
━━━━━━━━━━━━━━━━━━━━
👥 *Equal 50/50 Distribution:*
  • *Nomi:* ${formatCurrency(currencySymbol, settl.nomi_share, { maximumFractionDigits: 0 })}
  • *Haris:* ${formatCurrency(currencySymbol, settl.haris_share, { maximumFractionDigits: 0 })}
━━━━━━━━━━━━━━━━━━━━
📝 *Status:* Approved & Marked as Settled in POS Ledger.
🤝 _Next profit dividend counter has started cleanly._`;
  };

  // Template 3: Payout / Drawing Notification
  const generatePayoutText = () => {
    return `💵 *${companyName} — PARTNER PAYOUT ADVICE*
👤 *Partner:* ${selectedPartner?.name || 'Partner'}
📅 *Date:* ${new Date().toLocaleDateString('en-GB')}

━━━━━━━━━━━━━━━━━━━━
🏦 *Payment Channel:* ${selectedPartner?.bank_name || 'Bank Transfer'}
💳 *Account Title:* ${selectedPartner?.account_title || selectedPartner?.name}
💰 *Dividend Paid:* ${formatCurrency(currencySymbol, halfShare > 0 ? halfShare : 0, { maximumFractionDigits: 0 })}
━━━━━━━━━━━━━━━━━━━━
📊 *Updated Balance:* ${formatCurrency(currencySymbol, selectedPartner?.current_balance || 0, { maximumFractionDigits: 0 })}

✅ _Recorded in POS Equity Ledger._`;
  };

  const getMessageText = () => {
    if (activeTemplate === 'settlement') return generateSettlementText();
    if (activeTemplate === 'payout') return generatePayoutText();
    return generateWeeklyText();
  };

  const currentMessage = getMessageText();

  const handleCopy = () => {
    navigator.clipboard.writeText(currentMessage);
    playSuccessChime();
    setCopied(true);
    toast.success('WhatsApp text copied to clipboard!');
    setTimeout(() => setCopied(false), 2000);
  };

  const sendWhatsApp = (partner) => {
    playTapSound();
    const raw = partner?.phone || '';
    const norm = normalizeWhatsAppPhone(raw);
    const encoded = encodeURIComponent(currentMessage);
    const url = norm
      ? `https://wa.me/${norm}?text=${encoded}`
      : `https://wa.me/?text=${encoded}`;
    window.open(url, '_blank');
  };

  return createPortal(
    <div className="client-modal-overlay" onClick={onClose} role="presentation">
      <div
        ref={dialogRef}
        className="client-modal-card glass-panel"
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: '580px', width: '100%' }}
        role="dialog"
        aria-modal="true"
        aria-labelledby="partner-digest-title"
        tabIndex={-1}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
            <div
              style={{
                width: 36,
                height: 36,
                borderRadius: '50%',
                background: 'rgba(37, 211, 102, 0.15)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#25d366',
              }}
            >
              <MessageCircle size={20} />
            </div>
            <div>
              <h3 id="partner-digest-title" style={{ margin: 0, fontSize: '1.05rem', fontWeight: 800 }}>1-Tap WhatsApp Partner Digest</h3>
              <p style={{ margin: '0.15rem 0 0', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                Share live dividends & statements directly with Nomi & Haris
              </p>
            </div>
          </div>
          <button type="button" className="btn-secondary" style={{ width: 'auto', padding: '0.35rem 0.6rem' }} onClick={onClose}>
            <X size={16} />
          </button>
        </div>

        {/* Template Selector Tabs */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(3, 1fr)',
            gap: '0.4rem',
            background: 'rgba(0,0,0,0.15)',
            padding: '0.3rem',
            borderRadius: 'var(--radius-md, 10px)',
            marginBottom: '1rem',
          }}
        >
          <button
            type="button"
            className={`btn-secondary${activeTemplate === 'weekly' ? ' active' : ''}`}
            style={{
              fontSize: '0.78rem',
              padding: '0.45rem',
              borderColor: activeTemplate === 'weekly' ? '#25d366' : 'transparent',
              background: activeTemplate === 'weekly' ? 'rgba(37, 211, 102, 0.12)' : 'transparent',
              color: activeTemplate === 'weekly' ? '#25d366' : 'var(--text-secondary)',
              fontWeight: 700,
            }}
            onClick={() => {
              playTapSound();
              setActiveTemplate('weekly');
            }}
          >
            📊 Financial Digest
          </button>
          <button
            type="button"
            className={`btn-secondary${activeTemplate === 'settlement' ? ' active' : ''}`}
            style={{
              fontSize: '0.78rem',
              padding: '0.45rem',
              borderColor: activeTemplate === 'settlement' ? '#25d366' : 'transparent',
              background: activeTemplate === 'settlement' ? 'rgba(37, 211, 102, 0.12)' : 'transparent',
              color: activeTemplate === 'settlement' ? '#25d366' : 'var(--text-secondary)',
              fontWeight: 700,
            }}
            onClick={() => {
              playTapSound();
              setActiveTemplate('settlement');
            }}
          >
            🚩 Settlement Marker
          </button>
          <button
            type="button"
            className={`btn-secondary${activeTemplate === 'payout' ? ' active' : ''}`}
            style={{
              fontSize: '0.78rem',
              padding: '0.45rem',
              borderColor: activeTemplate === 'payout' ? '#25d366' : 'transparent',
              background: activeTemplate === 'payout' ? 'rgba(37, 211, 102, 0.12)' : 'transparent',
              color: activeTemplate === 'payout' ? '#25d366' : 'var(--text-secondary)',
              fontWeight: 700,
            }}
            onClick={() => {
              playTapSound();
              setActiveTemplate('payout');
            }}
          >
            💵 Payout Advice
          </button>
        </div>

        {/* If Payout template selected, choose target partner */}
        {activeTemplate === 'payout' && (
          <div style={{ marginBottom: '0.85rem' }}>
            <label style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-secondary)', display: 'block', marginBottom: '0.35rem' }}>
              Target Partner:
            </label>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              {partners.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  className={`btn-secondary${selectedPartnerId === p.id ? ' active' : ''}`}
                  style={{
                    flex: 1,
                    fontSize: '0.82rem',
                    padding: '0.45rem',
                    borderColor: selectedPartnerId === p.id ? 'var(--accent-teal)' : 'var(--border-color)',
                    background: selectedPartnerId === p.id ? 'rgba(20, 184, 166, 0.12)' : 'transparent',
                  }}
                  onClick={() => setSelectedPartnerId(p.id)}
                >
                  {p.name} ({p.profit_share_pct}%)
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Message Preview Box */}
        <div
          style={{
            position: 'relative',
            background: 'var(--surface-color, rgba(15, 23, 42, 0.65))',
            borderRadius: 'var(--radius-md, 12px)',
            border: '1px solid var(--border-color)',
            padding: '1rem',
            marginBottom: '1rem',
            fontFamily: 'monospace',
            fontSize: '0.8rem',
            lineHeight: 1.5,
            whiteSpace: 'pre-wrap',
            color: 'var(--text-primary)',
            maxHeight: '260px',
            overflowY: 'auto',
          }}
        >
          {currentMessage}
        </div>

        {/* Action Buttons: Direct 1-Tap WhatsApp to Nomi, Haris, or Copy */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.6rem' }}>
            {partners.map((p) => (
              <button
                key={p.id}
                type="button"
                className="btn-primary"
                style={{
                  background: '#25d366',
                  color: '#ffffff',
                  borderColor: '#25d366',
                  fontSize: '0.82rem',
                  fontWeight: 700,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '0.4rem',
                }}
                onClick={() => sendWhatsApp(p)}
              >
                <Send size={15} /> Send to {p.name}
              </button>
            ))}
          </div>

          <button
            type="button"
            className="btn-secondary"
            style={{ width: '100%', fontSize: '0.82rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem' }}
            onClick={handleCopy}
          >
            {copied ? <Check size={15} style={{ color: '#10b981' }} /> : <Copy size={15} />}
            {copied ? 'Copied to Clipboard!' : 'Copy WhatsApp Message Text'}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
