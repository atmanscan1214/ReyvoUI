import { api } from './api'

/**
 * Sending-inbox adapter for T18.
 *
 * The live API exposes the whole mailbox route under `/email-accounts`:
 * a plain array read, OAuth start, OAuth callback (browser-external), update,
 * disconnect, and a test endpoint. This module covers the T18 slice — the list
 * and the OAuth start handshake. Configuration, test send, and disconnect
 * belong to the T19 inbox detail.
 *
 * OAuth notes:
 * - `POST /oauth/{provider}/start` returns `authorization_url` + `state`. The
 *   callback is a backend URL, so the UI cannot intercept the redirect; the
 *   page polls the accounts list while the consent window is open and treats
 *   a new account as success.
 * - Without provider credentials configured, start returns 503; the UI maps
 *   that to a clear "not configured" state rather than a raw message.
 * - Health states come straight from the API: `connected`, `needs_reauth`,
 *   `degraded`, `error`, `disconnected`.
 */

export const OAUTH_PROVIDERS = [
  {
    value: 'google',
    label: 'Google Workspace / Gmail',
    blurb: 'Connect a Gmail or Google Workspace inbox through OAuth 2.0. Reyvo requests send and read access to deliver campaigns and track replies.',
    scopes: ['openid', 'email', 'profile', 'gmail send', 'gmail read'],
    buttonLabel: 'Continue with Google',
  },
  {
    value: 'microsoft',
    label: 'Microsoft 365 / Outlook',
    blurb: 'Connect an Outlook or Microsoft 365 inbox through OAuth 2.0. Tenant admin consent may be required for your organization.',
    scopes: ['openid', 'offline access', 'email', 'profile', 'User.Read', 'Mail.Send', 'Mail.Read'],
    buttonLabel: 'Continue with Microsoft',
  },
]

export const ACCOUNT_STATUS_META = {
  connected: {
    label: 'Connected',
    tone: 'success',
    reconnect: false,
    description: 'The inbox is authenticated and its last health check passed.',
  },
  needs_reauth: {
    label: 'Needs reauth',
    tone: 'danger',
    reconnect: true,
    description: 'The provider token expired or was revoked. Reconnect to refresh it; campaigns using this inbox pause.',
  },
  degraded: {
    label: 'Degraded',
    tone: 'warning',
    reconnect: false,
    description: 'The inbox still works, but the latest health check raised a warning. Watch it before campaigns rely on it.',
  },
  error: {
    label: 'Error',
    tone: 'danger',
    reconnect: true,
    description: 'The last health check failed. Reconnect the inbox or check the provider error below.',
  },
  disconnected: {
    label: 'Disconnected',
    tone: 'neutral',
    reconnect: true,
    description: 'This inbox was disconnected. Reconnect to use it again.',
  },
}

export function accountStatusMeta(status) {
  return (
    ACCOUNT_STATUS_META[status] ?? {
      label: status ? String(status).replace(/_/g, ' ') : 'Unknown',
      tone: 'outline',
      reconnect: false,
      description: null,
    }
  )
}

export function providerLabel(provider) {
  if (provider === 'microsoft') return 'Microsoft 365'
  if (provider === 'smtp') return 'SMTP'
  return 'Google'
}

export function normalizeEmailAccount(raw) {
  return {
    id: String(raw?.id ?? ''),
    provider: raw?.provider ?? 'google',
    email: raw?.email ?? '',
    displayName: raw?.display_name ?? null,
    fromName: raw?.from_name ?? null,
    replyTo: raw?.reply_to ?? null,
    signatureHtml: raw?.signature_html ?? null,
    status: raw?.status ?? 'disconnected',
    dailyCap: Number(raw?.daily_cap ?? 0),
    hourlyCap: Number(raw?.hourly_cap ?? 0),
    rampStage: Number(raw?.ramp_stage ?? 1),
    warmupStartedAt: raw?.warmup_started_at ?? null,
    lastHealthCheckAt: raw?.last_health_check_at ?? null,
    lastError: raw?.last_error ?? null,
    createdAt: raw?.created_at ?? null,
    updatedAt: raw?.updated_at ?? null,
  }
}

export async function listEmailAccounts(signal) {
  const data = await api.get('/email-accounts', { signal })
  return Array.isArray(data) ? data.map(normalizeEmailAccount) : []
}

export async function startOAuth(provider, signal) {
  const data = await api.post(`/email-accounts/oauth/${encodeURIComponent(provider)}/start`, undefined, {
    signal,
  })
  return {
    authorizationUrl: data?.authorization_url ?? '',
    state: data?.state ?? '',
  }
}

/**
 * There is no GET-by-id endpoint; the list is small, so detail pages resolve
 * the account from it.
 */
export async function getEmailAccount(id, signal) {
  const items = await listEmailAccounts(signal)
  const found = items.find((item) => item.id === String(id))
  if (!found) {
    throw Object.assign(new Error('Sending inbox not found.'), { status: 404 })
  }
  return found
}

export async function updateEmailAccount(id, payload, signal) {
  const data = await api.patch(`/email-accounts/${encodeURIComponent(id)}`, payload, { signal })
  return normalizeEmailAccount(data)
}

export async function disconnectEmailAccount(id, signal) {
  const data = await api.delete(`/email-accounts/${encodeURIComponent(id)}`, { signal })
  return normalizeEmailAccount(data)
}

export async function testEmailAccount(id, payload, signal) {
  return api.post(`/email-accounts/${encodeURIComponent(id)}/test`, payload, { signal })
}
