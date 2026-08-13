import React from 'react';

const LABELS = {
  paid: 'Paid',
  pending: 'Due',
  overdue: 'Overdue',
  cancelled: 'Cancelled',
  partial: 'Partial',
};

/**
 * Unified bill status chip — Paid teal, Due amber, Overdue red, Cancelled muted.
 */
export default function StatusBadge({ status, className = '' }) {
  const key = String(status || 'pending').toLowerCase();
  const label = LABELS[key] || key;
  return (
    <span className={`badge badge-${key} ${className}`.trim()}>
      {label}
    </span>
  );
}
