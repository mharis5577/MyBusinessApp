import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Banknote, X } from 'lucide-react';
import { apiFetch } from '../api/client';
import { useToast } from '../toast/ToastContext';
import { formatCurrency, pakistanToday } from '../utils/pakistan';
import { billBalance, paymentSummaryText } from '../utils/billPayments';
import { isHelpBill } from '../utils/billTypes';
import AppSelect from './AppSelect';

const METHODS = ['Cash', 'Bank Transfer / Raast', 'JazzCash', 'EasyPaisa', 'Card'];

export default function QuickPaySheet({ bill, open, onClose, onSaved, currencySymbol = 'Rs.' }) {
  const toast = useToast();
  const formRef = useRef(null);
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState('Cash');
  const [tendered, setTendered] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open || !bill) return;
    const due = billBalance(bill);
    setAmount(due > 0 ? String(due) : '');
    setMethod(bill.payment_method || (isHelpBill(bill) ? 'Cash' : 'Cash'));
    setTendered('');
  }, [open, bill]);

  if (!open || !bill) return null;

  const amountNum = parseFloat(amount) || 0;
  const tenderedNum = parseFloat(tendered);
  const isCash = String(method).toLowerCase().includes('cash');
  const changeDue =
    isCash && Number.isFinite(tenderedNum) && tenderedNum > 0
      ? Math.round((tenderedNum - amountNum) * 100) / 100
      : null;
  const summary = paymentSummaryText(currencySymbol, bill, amountNum);
  const help = isHelpBill(bill);

  const submit = async (e) => {
    e.preventDefault();
    if (!amountNum || amountNum <= 0) {
      toast.error('Enter a valid amount');
      return;
    }
    setSaving(true);
    try {
      let notes = '';
      if (isCash && changeDue != null) {
        notes = `Cash tendered: ${currencySymbol}${tenderedNum.toFixed(2)} · Change: ${currencySymbol}${Math.max(0, changeDue).toFixed(2)}${changeDue < 0 ? ' (short)' : ''}`;
      }
      const res = await apiFetch(`/api/bills/${bill.id}/payments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount: amountNum,
          method,
          payment_date: pakistanToday(),
          notes,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      const remain = Number(data.balance_due) || 0;
      toast.success(
        remain > 0
          ? help
            ? `Repayment saved. Still out ${formatCurrency(currencySymbol, remain)}`
            : `Payment saved. Remaining ${formatCurrency(currencySymbol, remain)}`
          : help
            ? 'Repayment saved. Fully returned.'
            : 'Payment saved. Bill fully paid.'
      );
      onSaved?.(data);
      onClose?.();
    } catch (err) {
      toast.error((help ? 'Repayment failed: ' : 'Payment failed: ') + err.message);
    } finally {
      setSaving(false);
    }
  };

  return createPortal(
    <div
      className="modal-sheet modal-sheet--portal"
      role="presentation"
      onClick={onClose}
    >
      <form
        ref={formRef}
        onSubmit={submit}
        className="glass-panel pay-modal"
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem' }}>
          <div>
            <h3 style={{ fontSize: '1.05rem', fontWeight: 800, margin: 0 }}>
              {help ? 'Record repayment' : 'Record payment'}
            </h3>
            <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', margin: '0.25rem 0 0' }}>
              {bill.invoice_number} · {bill.customer_name}
            </p>
          </div>
          <button type="button" className="btn-secondary" style={{ padding: '0.4rem 0.6rem', width: 'auto' }} onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        <div className="pay-due-banner">
          <span className="pay-due-label">{help ? 'Still out' : 'Still due'}</span>
          <strong className="pay-due-value">{summary.dueLabel}</strong>
          {summary.paid > 0 && (
            <span className="pay-due-hint">
              {help ? 'Given' : 'Bill'} {summary.totalLabel} · already {help ? 'returned' : 'paid'} {summary.paidLabel}
            </span>
          )}
        </div>

        <div className="form-group">
          <div className="pay-amount-head">
            <label className="form-label" style={{ margin: 0 }}>
              {help ? `Amount returned (${currencySymbol})` : `Amount received (${currencySymbol})`}
            </label>
            {summary.balance > 0 && (
              <button
                type="button"
                className="pay-full-btn"
                onClick={() => setAmount(String(summary.balance))}
              >
                {help ? 'Return all' : 'Pay full due'}
              </button>
            )}
          </div>
          <input
            type="number"
            step="0.01"
            min="0.01"
            className="form-input"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            required
            autoFocus
          />
          {amountNum > 0 && (
            <p className={`pay-left-line ${summary.remaining <= 0 ? 'is-clear' : ''}`}>
              {summary.remaining <= 0
                ? help
                  ? 'This clears the help.'
                  : 'This clears the bill.'
                : `Left after save: ${summary.leftLabel}`}
            </p>
          )}
        </div>

        <div className="form-group">
          <label className="form-label">{help ? 'How they returned it' : 'How paid'}</label>
          <AppSelect
            value={method}
            aria-label={help ? 'How they returned it' : 'How paid'}
            onChange={(next) => {
              setMethod(next);
              if (!String(next).toLowerCase().includes('cash')) setTendered('');
            }}
            options={METHODS}
          />
        </div>

        {isCash && (
          <div className="cash-change-box form-group">
            <label className="form-label">Cash tendered ({currencySymbol})</label>
            <input
              type="number"
              step="1"
              min="0"
              className="form-input"
              placeholder={help ? 'They handed you…' : 'Customer handed you…'}
              value={tendered}
              onChange={(e) => setTendered(e.target.value)}
            />
            <div className="cash-chip-row">
              <button type="button" className="cash-chip" onClick={() => setTendered(String(Math.ceil(amountNum)))}>
                Exact
              </button>
              {[500, 1000, 5000].map((n) => (
                <button key={n} type="button" className="cash-chip" onClick={() => setTendered(String(n))}>
                  {currencySymbol}{n}
                </button>
              ))}
            </div>
            {changeDue != null && (
              <div className={`cash-change-result ${changeDue < 0 ? 'is-short' : 'is-ok'}`}>
                {changeDue < 0
                  ? `Short by ${currencySymbol}${Math.abs(changeDue).toFixed(2)}`
                  : `Change due: ${currencySymbol}${changeDue.toFixed(2)}`}
              </div>
            )}
          </div>
        )}

        <div style={{ display: 'flex', gap: '0.6rem', justifyContent: 'flex-end', marginTop: '1rem' }}>
          <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn-primary" disabled={saving}>
            <Banknote size={16} /> {saving ? 'Saving…' : help ? 'Save repayment' : 'Save payment'}
          </button>
        </div>
      </form>
    </div>,
    document.body
  );
}
