import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  AlertTriangle,
  ArrowRight,
  Info,
  Mail,
  Refresh,
  Shield,
} from '../../../components/icons'
import { Badge, Button, EmptyState, ErrorPanel, PageHeader, Skeleton } from '../../../components/ui'
import {
  accountStatusMeta,
  explainMailboxHealth,
  listEmailAccounts,
  providerLabel,
} from '../../../lib/emailAccounts'
import './mailboxes.css'

function formatDate(value) {
  if (!value) return 'No record'
  try {
    return new Intl.DateTimeFormat(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    }).format(new Date(value))
  } catch {
    return 'No record'
  }
}

function relativeFromNow(value) {
  if (!value) return 'No record'
  const then = new Date(value).getTime()
  if (Number.isNaN(then)) return 'No record'
  const minutes = Math.round((Date.now() - then) / 60000)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes} min ago`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours} h ago`
  const days = Math.round(hours / 24)
  if (days < 30) return `${days} d ago`
  return formatDate(value)
}

/**
 * Sending health (T29, §5.3.4 / §5.6.8). Everything on this page comes from
 * fields `EmailAccountRead` actually returns: status, last_error,
 * last_health_check_at, caps, and warm-up. Bounce/error rates, per-inbox send
 * counters, and a last-successful-send timestamp are not exposed by this API
 * build, so they are named as gaps instead of shown as invented numbers.
 */
export function MailboxHealthPage() {
  const [accounts, setAccounts] = useState([])
  const [status, setStatus] = useState('loading')
  const [error, setError] = useState(null)
  const [refreshing, setRefreshing] = useState(false)

  const load = useCallback((signal) => {
    setRefreshing(true)
    setError(null)
    listEmailAccounts(signal)
      .then((items) => {
        setAccounts(items)
        setStatus('ready')
      })
      .catch((caught) => {
        if (caught?.name === 'AbortError') return
        setError(caught)
        setStatus('error')
      })
      .finally(() => setRefreshing(false))
  }, [])

  useEffect(() => {
    const controller = new AbortController()
    setStatus('loading')
    load(controller.signal)
    return () => controller.abort()
  }, [load])

  const summary = (() => {
    const counts = { connected: 0, degraded: 0, needs_reauth: 0, error: 0, disconnected: 0 }
    for (const account of accounts) {
      const key = String(account.status ?? 'disconnected')
      if (key in counts) counts[key] += 1
    }
    return {
      total: accounts.length,
      healthy: counts.connected,
      attention: counts.degraded + counts.needs_reauth + counts.error,
      disconnected: counts.disconnected,
    }
  })()

  return (
    <div className="app-page mail-page">
      <PageHeader
        eyebrow="Sending · Mailboxes"
        title="Sending health"
        description="Every mailbox's last known provider state, cap posture, and warm-up progress — and what to do when a check fails."
        backTo="/app/mailboxes"
        backLabel="Mailboxes"
        actions={
          <Button
            variant="ghost"
            leadingIcon={Refresh}
            loading={refreshing}
            onClick={() => load()}
          >
            Refresh
          </Button>
        }
      />

      <p className="mail__policy app-card">
        <Shield size={16} aria-hidden="true" />
        <span>
          Each row explains the last known provider condition and the next step: <strong>connected</strong>{' '}
          is healthy, <strong>degraded</strong> is warning-only, <strong>needs reauth</strong> blocks
          outbound sends, <strong>error</strong> requires a fix or reconnect, and{' '}
          <strong>disconnected</strong> has no active token.
        </span>
      </p>

      {status === 'error' ? (
        <ErrorPanel
          title="Couldn’t load mailbox health"
          description={error?.message || undefined}
          requestId={error?.requestId}
          onRetry={() => load()}
        />
      ) : status === 'loading' ? (
        <div className="app-card">
          <Skeleton lines={5} />
        </div>
      ) : accounts.length === 0 ? (
        <EmptyState
          icon={Mail}
          title="No mailboxes connected yet"
          description="Connect a sending inbox on the mailboxes page and its health, caps, and warm-up stage will show up here."
          actions={
            <Link className="btn btn--ghost btn--sm" to="/app/mailboxes">
              Go to mailboxes
            </Link>
          }
        />
      ) : (
        <>
          <div className="mail-health__summary">
            <div className="app-card mail-health__stat">
              <span>Total</span>
              <strong>{summary.total}</strong>
            </div>
            <div className="app-card mail-health__stat mail-health__stat--good">
              <span>Healthy</span>
              <strong>{summary.healthy}</strong>
            </div>
            <div className="app-card mail-health__stat mail-health__stat--warn">
              <span>Attention</span>
              <strong>{summary.attention}</strong>
            </div>
            <div className="app-card mail-health__stat mail-health__stat--muted">
              <span>Disconnected</span>
              <strong>{summary.disconnected}</strong>
            </div>
          </div>

          <div className="app-card">
            <div className="mail-health__table-wrap">
              <table className="mail-health__table">
                <thead>
                  <tr>
                    <th>Mailbox</th>
                    <th>Status</th>
                    <th>Caps</th>
                    <th>Warm-up</th>
                    <th>Last health check</th>
                    <th>What happened / what to do</th>
                    <th>
                      <span className="visually-hidden">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {accounts.map((account) => {
                    const meta = accountStatusMeta(account.status)
                    const health = explainMailboxHealth(account)
                    const rowTone =
                      health.status === 'connected'
                        ? 'good'
                        : health.status === 'degraded'
                          ? 'warn'
                          : health.status === 'error' || health.status === 'needs_reauth'
                            ? 'danger'
                            : 'muted'

                    return (
                      <tr key={account.id} className={`mail-health__row mail-health__row--${rowTone}`}>
                        <td>
                          <div className="mail-health__mailbox">
                            <span>{account.email}</span>
                            <small>{providerLabel(account.provider)}</small>
                          </div>
                        </td>
                        <td>
                          <Badge tone={meta.tone} dot>
                            {meta.label}
                          </Badge>
                        </td>
                        <td>
                          <div className="mail-health__metric">
                            <strong>{health.dailyCap.toLocaleString()}/day</strong>
                            <span>{health.hourlyCap.toLocaleString()}/hour</span>
                          </div>
                        </td>
                        <td>
                          <div className="mail-health__metric">
                            <strong>Stage {health.warmupStage}</strong>
                            <span>
                              {account.warmupStartedAt
                                ? `started ${formatDate(account.warmupStartedAt)}`
                                : 'no start date'}
                            </span>
                          </div>
                        </td>
                        <td>
                          <div className="mail-health__metric">
                            <strong>{relativeFromNow(account.lastHealthCheckAt)}</strong>
                            <span>{account.lastHealthCheckAt ? formatDate(account.lastHealthCheckAt) : 'not run yet'}</span>
                          </div>
                        </td>
                        <td>
                          <div className="mail-health__reason">
                            <strong>{health.explanation}</strong>
                            {health.reason ? (
                              <span className="mail-health__provider-error">
                                <AlertTriangle size={12} aria-hidden="true" />
                                Provider detail: {health.reason}
                              </span>
                            ) : null}
                            <span>{health.nextAction}</span>
                          </div>
                        </td>
                        <td>
                          <Link className="mail-health__action" to={`/app/mailboxes/${account.id}`}>
                            Open details
                            <ArrowRight size={14} />
                          </Link>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>

          <p className="mail-health__gap app-card">
            <Info size={16} aria-hidden="true" />
            <span>
              Caps are the configured limits, not observed usage — this API build exposes no per-inbox
              send counters, bounce/error rates, or last-successful-send timestamps, so those columns
              are not shown. The detail page shows the same health facts per mailbox.
            </span>
          </p>
        </>
      )}
    </div>
  )
}
