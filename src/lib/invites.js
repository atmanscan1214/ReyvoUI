import { api, ApiError } from './api'

/**
 * Invitation adapter.
 *
 * The design specifies `POST /invites` and `POST /invites/:token/accept`, with
 * 7-day signed invitations. The current API build has no invite routes, so
 * development builds use a local invitation store under `reyvo.invites.v1` and
 * expose clearly labelled tools for creating valid, expired, and accepted demo
 * links. Production builds call the API and surface an honest unavailable error.
 */

export const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000

const STORE_KEY = 'reyvo.invites.v1'
const RETAIN_MS = 30 * 24 * 60 * 60 * 1000

const UNAVAILABLE_MESSAGE =
  'Invitations are not available on this API build yet. Ask the workspace owner to add you once the endpoint ships.'

function isMissingEndpoint(error) {
  return error instanceof ApiError && (error.status === 404 || error.status === 405)
}

function unavailable() {
  return new ApiError(UNAVAILABLE_MESSAGE, {
    status: 501,
    code: 'invites_unavailable',
  })
}

function emptyStore() {
  return { invites: {} }
}

function readStore() {
  if (typeof window === 'undefined') return emptyStore()
  try {
    const raw = window.localStorage.getItem(STORE_KEY)
    if (!raw) return emptyStore()
    const parsed = JSON.parse(raw)
    return {
      invites: parsed?.invites && typeof parsed.invites === 'object' ? parsed.invites : {},
    }
  } catch {
    return emptyStore()
  }
}

function writeStore(store) {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(STORE_KEY, JSON.stringify(store))
  } catch {
    // Storage can be blocked; the next load will simply report the invite as
    // invalid instead of losing the rest of the page.
  }
}

function makeToken() {
  const random =
    typeof globalThis.crypto?.randomUUID === 'function'
      ? globalThis.crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(16).slice(2)}`
  return `dev_invite_${random}`
}

function prune(store, now) {
  for (const [token, invite] of Object.entries(store.invites)) {
    if (now - Number(invite?.issuedAt ?? 0) > RETAIN_MS) delete store.invites[token]
  }
}

function toInvite(token, record) {
  return {
    token,
    email: record.email,
    role: record.role,
    tenantName: record.tenantName,
    inviterName: record.inviterName,
    issuedAt: record.issuedAt,
    expiresAt: record.expiresAt,
    acceptedAt: record.acceptedAt ?? null,
  }
}

export function inspectDevInvite(token) {
  if (!token) return { status: 'invalid', reason: 'missing', invite: null }

  const record = readStore().invites[token]
  if (!record) return { status: 'invalid', reason: 'unknown', invite: null }
  if (record.acceptedAt) {
    return { status: 'accepted', reason: 'accepted', invite: toInvite(token, record) }
  }
  if (Date.now() > Number(record.expiresAt ?? 0)) {
    return { status: 'expired', reason: 'expired', invite: toInvite(token, record) }
  }

  return { status: 'valid', reason: null, invite: toInvite(token, record) }
}

/**
 * Creates a local invitation. `ageMs` shifts the issue date backwards so the
 * development tools can demonstrate an expired invitation immediately.
 */
export function createDevInvite({
  email = 'new.teammate@agency.com',
  role = 'member',
  tenantName = 'Reyvo Demo Agency',
  inviterName = 'Demo Owner',
  ageMs = 0,
  accepted = false,
} = {}) {
  const store = readStore()
  const now = Date.now()
  prune(store, now)

  const token = makeToken()
  const issuedAt = now - Math.max(0, ageMs)
  store.invites[token] = {
    email: String(email ?? '').trim().toLowerCase(),
    role,
    tenantName,
    inviterName,
    issuedAt,
    expiresAt: issuedAt + INVITE_TTL_MS,
    acceptedAt: accepted ? now : null,
  }

  writeStore(store)
  return toInvite(token, store.invites[token])
}

function normalizeApiInvite(data) {
  const invite = {
    token: data?.token ?? null,
    email: data?.email ?? '',
    role: data?.role ?? 'member',
    tenantName: data?.tenant_name ?? data?.tenant?.name ?? 'the workspace',
    inviterName: data?.inviter_name ?? data?.inviter?.full_name ?? null,
    issuedAt: data?.created_at ? Date.parse(data.created_at) : null,
    expiresAt: data?.expires_at ? Date.parse(data.expires_at) : null,
    acceptedAt: data?.accepted_at ? Date.parse(data.accepted_at) : null,
  }

  if (invite.acceptedAt || data?.status === 'accepted') {
    return { status: 'accepted', reason: 'accepted', invite }
  }
  if (invite.expiresAt && invite.expiresAt < Date.now()) {
    return { status: 'expired', reason: 'expired', invite }
  }
  return { status: 'valid', reason: null, invite }
}

export async function loadInvite(token) {
  if (!token) return { status: 'invalid', reason: 'missing', invite: null }

  try {
    const data = await api.getInvite(token)
    return normalizeApiInvite(data)
  } catch (error) {
    if (isMissingEndpoint(error)) {
      if (import.meta.env.DEV) return inspectDevInvite(token)
      throw unavailable()
    }

    if (error?.status === 404) {
      return { status: 'invalid', reason: 'unknown', invite: null }
    }

    if (error?.status === 410) {
      const code = String(error?.code ?? '').toLowerCase()
      return {
        status: code.includes('accepted') ? 'accepted' : 'expired',
        reason: code || 'expired',
        invite: null,
      }
    }

    throw error
  }
}

function inviteErrorStatus(error) {
  const code = String(error?.code ?? '').toLowerCase()
  if (code.includes('accepted')) return 'accepted'
  if (code.includes('expired') || error?.status === 410) return 'expired'
  if (code.includes('invalid') || error?.status === 400 || error?.status === 404) return 'invalid'
  return null
}

export async function acceptInvite(token, { fullName, password }) {
  if (!token) {
    throw new ApiError('This invitation link is missing its token.', {
      status: 400,
      code: 'invite_invalid',
    })
  }

  try {
    const data = await api.acceptInvite(token, {
      full_name: String(fullName ?? '').trim(),
      password,
    })
    return { development: false, invite: normalizeApiInvite(data).invite }
  } catch (error) {
    if (!isMissingEndpoint(error)) {
      const status = inviteErrorStatus(error)
      if (status) {
        error.inviteStatus = status
      }
      throw error
    }
    if (!import.meta.env.DEV) throw unavailable()
  }

  const result = inspectDevInvite(token)

  if (result.status === 'expired') {
    throw new ApiError('This invitation has expired. Ask for a new one.', {
      status: 410,
      code: 'invite_expired',
      details: { inviteStatus: 'expired' },
    })
  }

  if (result.status === 'accepted') {
    throw new ApiError('This invitation has already been accepted.', {
      status: 410,
      code: 'invite_accepted',
      details: { inviteStatus: 'accepted' },
    })
  }

  if (result.status !== 'valid') {
    throw new ApiError('This invitation link is invalid.', {
      status: 410,
      code: 'invite_invalid',
      details: { inviteStatus: 'invalid' },
    })
  }

  const store = readStore()
  store.invites[token].acceptedAt = Date.now()
  writeStore(store)

  return { development: true, invite: toInvite(token, store.invites[token]) }
}

export function inviteRoleLabel(role) {
  if (role === 'owner') return 'Owner'
  if (role === 'admin') return 'Admin'
  return 'Member'
}
