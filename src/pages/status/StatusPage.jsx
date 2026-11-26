import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Badge, Button, PageHeader, Skeleton } from '../../components/ui'
import { Refresh } from '../../components/icons'
import { api } from '../../lib/api'
import { usePageTitle } from '../../lib/usePageTitle'
import './status.css'

/**
 * Public status page (T49, §5.12).
 *
 * The API exposes `GET /health` (process is up) and `GET /health/ready`
 * (database and cache reachable). Both sit outside `/api/v1`, so this page talks
 * to the same origin as the API rather than the versioned client path.
 */
function healthBase() {
  if (typeof window === 'undefined') return ''
  try {
    return new URL(api.API_BASE, window.location.origin).origin
  } catch {
    return ''
  }
}

async function probe(path, signal) {
  const response = await fetch(`${healthBase()}${path}`, {
    signal,
    headers: { Accept: 'application/json' },
  })
  if (!response.ok) {
    throw new Error(`The service answered with ${response.status}.`)
  }
  return response.json().catch(() => ({}))
}

const CHECKS = [
  {
    key: 'api',
    path: '/health',
    label: 'API',
    description: 'Requests are being accepted and processed.',
  },
  {
    key: 'ready',
    path: '/health/ready',
    label: 'Database and cache',
    description: 'Dependencies used by sign-in, imports, and sending are reachable.',
  },
]

function formatTime(value) {
  if (!value) return '—'
  try {
    return new Intl.DateTimeFormat(undefined, {
      hour: 'numeric',
      minute: '2-digit',
      second: '2-digit',
    }).format(value)
  } catch {
    return '—'
  }
}

export function StatusPage() {
  usePageTitle('Service status')

  const [state, setState] = useState({ api: 'loading', ready: 'loading' })
  const [details, setDetails] = useState({})
  const [checkedAt, setCheckedAt] = useState(null)
  const [refreshKey, setRefreshKey] = useState(0)

  const check = useCallback(() => setRefreshKey((key) => key + 1), [])

  useEffect(() => {
    const controller = new AbortController()
    let cancelled = false

    setState({ api: 'loading', ready: 'loading' })
    setDetails({})

    Promise.all(
      CHECKS.map(async (item) => {
        try {
          const body = await probe(item.path, controller.signal)
          return [item.key, 'up', body]
        } catch (error) {
          if (error?.name === 'AbortError') return null
          return [item.key, 'down', null]
        }
      }),
    ).then((results) => {
      if (cancelled) return
      const nextState = {}
      const nextDetails = {}
      for (const result of results) {
        if (!result) continue
        const [key, verdict, body] = result
        nextState[key] = verdict
        if (body) nextDetails[key] = body
      }
      setState((current) => ({ ...current, ...nextState }))
      setDetails(nextDetails)
      setCheckedAt(new Date())
    })

    return () => {
      cancelled = true
      controller.abort()
    }
  }, [refreshKey])

  const loading = state.api === 'loading' && state.ready === 'loading'
  const allUp = state.api === 'up' && state.ready === 'up'
  const anyDown = state.api === 'down' || state.ready === 'down'
  const tone = loading ? 'neutral' : allUp ? 'success' : anyDown ? 'danger' : 'warning'
  const headline = loading
    ? 'Checking…'
    : allUp
      ? 'All systems operational'
      : anyDown
        ? 'Service disruption'
        : 'Degraded'

  return (
    <div className="app-page status-page">
      <PageHeader
        eyebrow="Status"
        title="Service status"
        description="Live checks against the Reyvo API and the dependencies it needs to sign you in, import contacts, and send campaigns."
        actions={
          <Button variant="ghost" leadingIcon={Refresh} onClick={check} disabled={loading}>
            Re-check
          </Button>
        }
      />

      <section className="app-card status-page__summary" aria-live="polite">
        <Badge tone={tone} dot>
          {headline}
        </Badge>
        <p className="status-page__checked">Last checked: {formatTime(checkedAt)}</p>
      </section>

      <ul className="status-page__checks">
        {CHECKS.map((item) => {
          const verdict = state[item.key]
          return (
            <li key={item.key} className="app-card status-page__check">
              <div className="status-page__check-main">
                <h2>{item.label}</h2>
                <p>{item.description}</p>
              </div>
              {verdict === 'loading' ? (
                <Skeleton width={92} height={22} />
              ) : (
                <Badge tone={verdict === 'up' ? 'success' : 'danger'} dot>
                  {verdict === 'up' ? 'Operational' : 'Unavailable'}
                </Badge>
              )}
            </li>
          )
        })}
      </ul>

      <div className="status-page__footer">
        <p>
          If a check fails, sending may pause until the dependency recovers. Questions? Contact
          your workspace owner.
        </p>
        <Link to="/">Return to homepage</Link>
      </div>
    </div>
  )
}
