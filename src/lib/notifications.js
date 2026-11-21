import { api } from './api'
import {
  AlertTriangle,
  Bell,
  CheckCircle,
  CreditCard,
  Database,
  Info,
  Lock,
  Mail,
  Send,
  TrendUp,
} from '../components/icons'

/** Notification types the API can produce (backend NotificationType enum). */
export const NOTIFICATION_TYPES = [
  'positive_reply',
  'new_reply',
  'bounce_spike',
  'inbox_auth_failure',
  'quota_warning',
  'campaign_completed',
  'import_completed',
  'billing_issue',
  'digest',
]

/**
 * Presentation metadata per type: icon, tone (badge color), and the label
 * used in the preferences matrix. Kept here so the bell dropdown, the feed
 * page, and the preferences UI all agree.
 */
export const notificationMeta = {
  positive_reply: {
    label: 'Positive reply',
    description: 'A contact replied positively to a sequence.',
    icon: CheckCircle,
    tone: 'success',
  },
  new_reply: {
    label: 'New reply',
    description: 'A contact replied to one of your messages.',
    icon: Mail,
    tone: 'info',
  },
  bounce_spike: {
    label: 'Bounce spike',
    description: 'Hard bounces crossed the hourly threshold.',
    icon: AlertTriangle,
    tone: 'warning',
  },
  inbox_auth_failure: {
    label: 'Inbox auth failure',
    description: 'A sending mailbox needs to be reconnected.',
    icon: Lock,
    tone: 'danger',
  },
  quota_warning: {
    label: 'Quota warning',
    description: 'Contacts reached 80% of the plan limit.',
    icon: TrendUp,
    tone: 'warning',
  },
  campaign_completed: {
    label: 'Campaign completed',
    description: 'A campaign finished sending.',
    icon: Send,
    tone: 'success',
  },
  import_completed: {
    label: 'Import completed',
    description: 'A contact import finished processing.',
    icon: Database,
    tone: 'success',
  },
  billing_issue: {
    label: 'Billing issue',
    description: 'A payment failed or the subscription is past due.',
    icon: CreditCard,
    tone: 'danger',
  },
  digest: {
    label: 'Digest',
    description: 'A summary of your unread notifications.',
    icon: Bell,
    tone: 'info',
  },
}

/** Types a user/tenant can configure channels for (everything but the digest). */
export const CHANNEL_TYPES = NOTIFICATION_TYPES.filter((type) => type !== 'digest')

export const DIGEST_CHOICES = [
  { value: 'off', label: 'Off' },
  { value: 'daily', label: 'Daily' },
  { value: 'weekly', label: 'Weekly (Mondays)' },
]

export function metaFor(type) {
  return (
    notificationMeta[type] || {
      label: 'Notification',
      description: '',
      icon: Info,
      tone: 'info',
    }
  )
}

/** Relative time like "3m ago", "2h ago", "5d ago". */
export function timeAgo(iso) {
  if (!iso) return ''
  const then = new Date(iso).getTime()
  if (Number.isNaN(then)) return ''
  const seconds = Math.max(0, Math.floor((Date.now() - then) / 1000))
  if (seconds < 60) return 'just now'
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 30) return `${days}d ago`
  return new Date(iso).toLocaleDateString()
}

// ---------------------------------------------------------------------------
// API calls
// ---------------------------------------------------------------------------

export const notificationsApi = {
  list: ({ unread, limit = 20, offset = 0 } = {}) => {
    const params = new URLSearchParams({ limit: String(limit), offset: String(offset) })
    if (unread === true) params.set('unread', 'true')
    if (unread === false) params.set('unread', 'false')
    return api.get(`/notifications?${params.toString()}`)
  },
  unreadCount: () => api.get('/notifications/unread-count'),
  markRead: (id) => api.post(`/notifications/${id}/read`),
  markAllRead: () => api.post('/notifications/read-all'),
  getPreferences: () => api.get('/notifications/preferences'),
  savePreferences: (body) => api.put('/notifications/preferences', body),
  getDefaults: () => api.get('/notifications/defaults'),
  saveDefaults: (body) => api.put('/notifications/defaults', body),
}

/**
 * Flatten tenant defaults + user overrides into the row shape the
 * preferences matrix renders: one row per type with in-app/email/override
 * flags. When `isTenant` is true the rows describe the tenant defaults.
 */
export function preferenceRows(payload, { isTenant = false } = {}) {
  const source = isTenant ? payload.tenant_defaults : payload.effective
  const overrides = payload.user_overrides || {}
  return CHANNEL_TYPES.map((type) => {
    const channels = source[type] || { in_app: true, email: true }
    const meta = metaFor(type)
    return {
      type,
      label: meta.label,
      description: meta.description,
      icon: meta.icon,
      inApp: channels.in_app,
      email: channels.email,
      overridden: !isTenant && Boolean(overrides[type]),
    }
  })
}
