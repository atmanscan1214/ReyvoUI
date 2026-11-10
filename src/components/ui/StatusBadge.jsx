import { Badge } from './Badge'

/**
 * Product statuses share one colour vocabulary across tables, cards, filters,
 * and detail screens. Unknown values fall back to the neutral tone.
 */
const TONES = {
  active: 'success',
  connected: 'success',
  completed: 'success',
  interested: 'success',
  ready: 'success',
  verified: 'success',
  trial: 'lime',
  scheduled: 'info',
  running: 'info',
  processing: 'info',
  sending: 'info',
  new: 'info',
  open: 'info',
  queued: 'neutral',
  draft: 'neutral',
  archived: 'neutral',
  paused: 'warning',
  past_due: 'warning',
  pending: 'warning',
  needs_review: 'warning',
  out_of_office: 'warning',
  limited: 'warning',
  suspended: 'danger',
  canceled: 'danger',
  cancelled: 'danger',
  failed: 'danger',
  error: 'danger',
  disconnected: 'danger',
  not_interested: 'danger',
  unsubscribe: 'danger',
  unsubscribed: 'danger',
  bounced: 'danger',
  blocked: 'danger',
}

export function statusTone(status) {
  return TONES[String(status ?? '').toLowerCase()] || 'neutral'
}

export function formatStatus(status) {
  if (!status) return 'Unknown'
  const words = String(status).replace(/[_-]+/g, ' ').trim().toLowerCase()
  return words.charAt(0).toUpperCase() + words.slice(1)
}

export function StatusBadge({ status, label, size = 'md', dot = true, className = '' }) {
  return (
    <Badge tone={statusTone(status)} size={size} dot={dot} className={className}>
      {label ?? formatStatus(status)}
    </Badge>
  )
}
