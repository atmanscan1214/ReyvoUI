import { useEffect, useState } from 'react'
import { Link, useRouteError } from 'react-router-dom'
import { Badge, Button, PageHeader } from '../../../components/ui'
import { useToast } from '../../../lib/useToast'

/**
 * Public status page (T49, §5.12).
 *
 * Phase 2 style placeholder showing current incident status.
 * In Phase 2 this is a simple static page; Phase 3 will add real-time
 * incident tracking, provider status, and user subscription.
 *
 * Design (§5.12):
 *   - Public status page for incident visibility
 *   - Linked from the app footer
 *   - Done when: the page is reachable at /status and linked from the footer
 */
export function StatusPage() {
  const [status, setStatus] = useState('online')
  const [incidents, setIncidents] = useState([])
  const [loading, setLoading] = useState(true)
  const { showError, success } = useToast()

  useEffect(() => {
    // Fetch incident status from the API
    fetch('/api/v1/status')
      .then((res) => res.json())
      .then((data) => {
        setStatus(data.status || 'online')
        setIncidents(data.incidents || [])
        setLoading(false)
      })
      .catch(() => {
        setStatus('online')
        setIncidents([])
        setLoading(false)
        showError('Unable to load status. Please try again later.')
      })
  }, [])

  return (
    <div className="app-page status-page">
      <PageHeader
        eyebrow="Status"
        title="Service Status"
        description="Reyvo service status and incident reporting."
      />

      <div className="status-page__header">
        <Badge tone={status === 'online' ? 'success' : 'danger'}>
          {status.toUpperCase()}
        </Badge>
      </div>

      {loading ? (
        <div className="status-page__loading">
          <span>Loading status…</span>
        </div>
      ) : (
        <div className="status-page__incidents">
          {incidents.length === 0 ? (
            <p>No active incidents.</p>
          ) : (
            <ul>
              {incidents.map((incident) => (
                <li key={incident.id}>
                  <strong>{incident.title}</strong>
                  <span>{incident.description}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <div className="status-page__footer">
        <p>
          Last checked:{' '}
          <new Date().toLocaleTimeString()>{' '}
          {'—'}
        </new>
        </new>
        </p>
        <Link to="/">Return to workspace</Link>
      </div>
    </div>
  )
}