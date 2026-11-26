import { Component } from 'react'

/**
 * Catches render-time errors and shows a recoverable message instead of an
 * empty document. Without this, one undefined variable in a page unmounts the
 * whole tree and the user sees a blank screen with no clue what happened.
 */
export class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { error: null }
  }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error, info) {
    // Keep the details in the console for debugging; the UI stays friendly.
    console.error('Unhandled render error:', error, info?.componentStack)
  }

  handleReset = () => {
    this.setState({ error: null })
  }

  render() {
    const { error } = this.state
    if (!error) return this.props.children

    return (
      <div className="app-page" role="alert">
        <div className="app-card" style={{ padding: '24px', maxWidth: '640px', margin: '48px auto' }}>
          <h1 style={{ marginTop: 0, fontSize: '1.35rem' }}>Something went wrong on this page</h1>
          <p style={{ color: 'var(--muted)' }}>
            The rest of the app is still running. Reload the page, or go back and try a different
            screen.
          </p>
          <pre
            style={{
              whiteSpace: 'pre-wrap',
              overflowWrap: 'anywhere',
              fontSize: '0.78rem',
              color: 'var(--muted)',
              background: 'var(--surface-sunken, rgba(0,0,0,0.04))',
              borderRadius: '10px',
              padding: '10px 12px',
            }}
          >
            {error.message}
          </pre>
          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
            <button
              type="button"
              className="ui-button ui-button--primary"
              onClick={() => window.location.reload()}
            >
              Reload page
            </button>
            <button type="button" className="ui-button ui-button--ghost" onClick={this.handleReset}>
              Try again
            </button>
            <a className="ui-button ui-button--quiet" href="/app">
              Back to dashboard
            </a>
          </div>
        </div>
      </div>
    )
  }
}
