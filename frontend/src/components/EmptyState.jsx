import React from 'react';

/** Quiet empty state with one primary CTA */
export default function EmptyState({ title, body, actionLabel, onAction, icon: Icon }) {
  return (
    <div className="empty-state">
      {Icon ? (
        <div className="empty-state-icon" aria-hidden>
          <Icon size={22} />
        </div>
      ) : null}
      <h3 className="empty-state-title">{title}</h3>
      {body ? <p className="empty-state-body">{body}</p> : null}
      {actionLabel && onAction ? (
        <button type="button" className="btn-primary" onClick={onAction}>
          {actionLabel}
        </button>
      ) : null}
    </div>
  );
}
