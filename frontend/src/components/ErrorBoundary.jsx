import React from 'react';

/**
 * Stops a tab crash from wiping the whole WebView (white / frozen screen).
 */
export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error(this.props.label || 'UI error', error, info?.componentStack);
  }

  handleReload = () => {
    this.setState({ error: null });
    if (this.props.onReset) this.props.onReset();
    else window.location.reload();
  };

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="tab-fallback" role="alert" style={{ padding: '2rem 1.25rem', textAlign: 'center' }}>
        <p style={{ fontWeight: 800, marginBottom: '0.4rem' }}>Something went wrong</p>
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginBottom: '1rem' }}>
          {this.props.label ? `${this.props.label} failed to load.` : 'The screen hit an error.'} Reload and continue.
        </p>
        <button type="button" className="btn-primary" style={{ width: 'auto' }} onClick={this.handleReload}>
          Reload
        </button>
      </div>
    );
  }
}
