import { api, ApiError } from './api'

/**
 * T10 account-settings adapter.
 *
 * The design specifies profile edits, an email change that requires the current
 * password plus verification of the new address, a password change that
 * invalidates sessions, and a session list with individual and global sign-out.
 * The current API build exposes only `GET /auth/me`.
 *
 * Development builds therefore try the provisional paths first, then fall back
 * to browser-scoped records under `reyvo.account.v1` and `reyvo.sessions.v1`.
 * The fallbacks use the live login endpoint to verify the current password so
 * the confirmation step is real, but they cannot rotate the server password or
 * deliver an email. Production builds report the feature as unavailable rather
 * than pretending the change reached the API.
 */

export const ACCOUNT_STORE_KEY = 'reyvo.account.v1'
export const SESSIONS_STORE_KEY = 'reyvo.sessions.v1'
export const EMAIL_CHANGE_TTL_MS = 24 * 60 * 60 * 1000

const HOUR = 60 * 60 * 1000
const DAY = 24 * HOUR

function isMissingEndpoint(error) {
  return error instanceof ApiError && (error.status === 404 || error.status === 405)
}

function unavailable(message) {
  return new ApiError(message, { status: 501, code: 'account_unavailable' })
}

function emptyAccountStore() {
  return { users: {} }
}

function emptySessionStore() {
  return { users: {} }
}

function readJson(key, fallback) {
  if (typeof window === 'undefined') return fallback
  try {
    const raw = window.localStorage.getItem(key)
    if (!raw) return fallback
    return JSON.parse(raw) ?? fallback
  } catch {
    return fallback
  }
}

function writeJson(key, value) {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // Storage can be blocked; the UI reports the change as not persisted.
  }
}

function readAccountStore() {
  const parsed = readJson(ACCOUNT_STORE_KEY, emptyAccountStore())
  return {
    users: parsed?.users && typeof parsed.users === 'object' ? parsed.users : {},
  }
}

function writeAccountStore(store) {
  writeJson(ACCOUNT_STORE_KEY, store)
}

function readSessionStore() {
  const parsed = readJson(SESSIONS_STORE_KEY, emptySessionStore())
  return {
    users: parsed?.users && typeof parsed.users === 'object' ? parsed.users : {},
  }
}

function writeSessionStore(store) {
  writeJson(SESSIONS_STORE_KEY, store)
}

function accountRecord(userId) {
  return readAccountStore().users[userId] ?? null
}

export function getAccountState(userId) {
  const record = accountRecord(userId)
  if (!record) {
    return {
      fullName: null,
      email: null,
      serverEmail: null,
      emailVerifiedAt: null,
      pendingEmail: null,
      pendingEmailExpiresAt: null,
      passwordChangedAt: null,
    }
  }

  return {
    fullName: record.fullName ?? null,
    email: record.email ?? null,
    serverEmail: record.serverEmail ?? null,
    emailVerifiedAt: record.emailVerifiedAt ?? null,
    pendingEmail: record.pendingEmail ?? null,
    pendingEmailExpiresAt: record.pendingEmailExpiresAt ?? null,
    passwordChangedAt: record.passwordChangedAt ?? null,
  }
}

/**
 * Applies development-only profile overrides to the live profile. Only the
 * display name is merged into the session; email changes stay visible on the
 * account screen so the server address used for sign-in does not silently drift.
 */
export function applyLocalProfile(profile) {
  if (!import.meta.env.DEV || !profile?.user?.id) return profile
  const local = accountRecord(profile.user.id)
  if (!local?.fullName) return profile

  return {
    ...profile,
    user: { ...profile.user, full_name: local.fullName },
  }
}

function updateRecord(userId, patch) {
  const store = readAccountStore()
  store.users[userId] = { ...(store.users[userId] ?? {}), ...patch }
  writeAccountStore(store)
  return store.users[userId]
}

function extractUser(data) {
  if (!data || typeof data !== 'object') return null
  return data.user && typeof data.user === 'object' ? data.user : data
}

/** Saves the display name. Returns the user patch to apply to the session. */
export async function saveProfile(user, fullName) {
  const name = String(fullName ?? '').trim()
  if (!name) {
    throw new ApiError('Enter your full name.', { status: 400, code: 'full_name_required' })
  }

  try {
    const data = await api.updateMe({ full_name: name })
    const updated = extractUser(data)
    return {
      development: false,
      patch: { full_name: updated?.full_name ?? name },
    }
  } catch (error) {
    if (!isMissingEndpoint(error)) throw error
    if (!import.meta.env.DEV) {
      throw unavailable('Profile editing is not available on this API build yet.')
    }
  }

  updateRecord(user.id, { fullName: name })
  return { development: true, patch: { full_name: name } }
}

async function assertCurrentPassword(user, currentPassword) {
  try {
    await api.login({ email: user.email, password: currentPassword })
  } catch (error) {
    if (error?.status === 401) {
      throw new ApiError('That password isn’t right. Try again.', {
        status: 401,
        code: 'current_password_invalid',
      })
    }
    throw error
  }
}

/**
 * Starts an email change. The provisional API is tried first; the development
 * fallback verifies the current password against the live login endpoint before
 * recording a 24-hour pending change.
 */
export async function requestEmailChange(user, { email, currentPassword }) {
  const nextEmail = String(email ?? '').trim().toLowerCase()

  try {
    const data = await api.requestEmailChange({
      email: nextEmail,
      current_password: currentPassword,
    })
    return {
      development: false,
      status: 'pending',
      pendingEmail: data?.pending_email ?? nextEmail,
      expiresAt: data?.expires_at ? Date.parse(data.expires_at) : null,
    }
  } catch (error) {
    if (!isMissingEndpoint(error)) {
      if (error?.status === 401 || error?.status === 403) {
        throw new ApiError('That password isn’t right. Try again.', {
          status: 401,
          code: 'current_password_invalid',
        })
      }
      throw error
    }
    if (!import.meta.env.DEV) {
      throw unavailable('Email changes are not available on this API build yet.')
    }
  }

  await assertCurrentPassword(user, currentPassword)

  const now = Date.now()
  const record = updateRecord(user.id, {
    pendingEmail: nextEmail,
    pendingEmailIssuedAt: now,
    pendingEmailExpiresAt: now + EMAIL_CHANGE_TTL_MS,
    serverEmail: accountRecord(user.id)?.serverEmail ?? user.email,
  })

  return {
    development: true,
    status: 'pending',
    pendingEmail: record.pendingEmail,
    expiresAt: record.pendingEmailExpiresAt,
  }
}

/**
 * Confirms a pending email change. Production uses the verification token from
 * the email link; the development helper confirms the recorded pending address.
 */
export async function confirmEmailChange(userId, token) {
  const record = accountRecord(userId)
  if (!record?.pendingEmail) {
    return { development: !token, status: 'invalid', email: null }
  }

  if (token) {
    try {
      const data = await api.confirmEmailChange({ token })
      const updated = extractUser(data)
      return {
        development: false,
        status: 'changed',
        email: updated?.email ?? record.pendingEmail,
      }
    } catch (error) {
      if (!isMissingEndpoint(error)) throw error
      if (!import.meta.env.DEV) {
        throw unavailable('Email changes are not available on this API build yet.')
      }
    }
  }

  if (Date.now() > Number(record.pendingEmailExpiresAt ?? 0)) {
    return { development: true, status: 'expired', email: null }
  }

  const changedAt = Date.now()
  updateRecord(userId, {
    email: record.pendingEmail,
    emailVerifiedAt: changedAt,
    pendingEmail: null,
    pendingEmailIssuedAt: null,
    pendingEmailExpiresAt: null,
    serverEmail: record.serverEmail ?? null,
  })
  revokeOtherDevSessions(userId, null, record.pendingEmail)

  return { development: true, status: 'changed', email: record.pendingEmail }
}

export function cancelEmailChange(userId) {
  updateRecord(userId, {
    pendingEmail: null,
    pendingEmailIssuedAt: null,
    pendingEmailExpiresAt: null,
  })
}

/**
 * Changes the password. The development fallback verifies the current password
 * with the live login endpoint, records the change locally, and revokes every
 * other demo session. It cannot rotate the server password.
 */
export async function changePassword(user, { currentPassword, newPassword }) {
  try {
    await api.changePassword({
      current_password: currentPassword,
      new_password: newPassword,
    })
    return { development: false, changedAt: Date.now(), revokedOthers: true }
  } catch (error) {
    if (!isMissingEndpoint(error)) {
      if (error?.status === 401 || error?.status === 403) {
        throw new ApiError('That password isn’t right. Try again.', {
          status: 401,
          code: 'current_password_invalid',
        })
      }
      if (error?.fieldErrors?.new_password) {
        throw new ApiError(error.fieldErrors.new_password, {
          status: error.status,
          code: error.code,
          fieldErrors: error.fieldErrors,
        })
      }
      throw error
    }
    if (!import.meta.env.DEV) {
      throw unavailable('Password changes are not available on this API build yet.')
    }
  }

  await assertCurrentPassword(user, currentPassword)

  const changedAt = Date.now()
  updateRecord(user.id, { passwordChangedAt: changedAt })
  revokeOtherDevSessions(user.id, null, user.email)

  return {
    development: true,
    changedAt,
    revokedOthers: true,
    serverEmail: accountRecord(user.id)?.serverEmail ?? user.email,
  }
}

/* Sessions ---------------------------------------------------------------- */

function currentDeviceLabel() {
  if (typeof navigator === 'undefined') return 'This browser'
  const ua = navigator.userAgent
  const browser = /Edg\//.test(ua)
    ? 'Edge'
    : /Chrome\//.test(ua)
      ? 'Chrome'
      : /Firefox\//.test(ua)
        ? 'Firefox'
        : /Safari\//.test(ua)
          ? 'Safari'
          : 'Browser'
  const platform = /Windows/.test(ua)
    ? 'Windows'
    : /Mac OS X/.test(ua)
      ? 'macOS'
      : /Android/.test(ua)
        ? 'Android'
        : /iPhone|iPad/.test(ua)
          ? 'iOS'
          : 'desktop'
  return `${browser} on ${platform}`
}

function seedDevSessions(userId, email) {
  const now = Date.now()
  return [
    {
      id: `dev_session_${userId.slice(0, 8)}_current`,
      device: currentDeviceLabel(),
      detail: 'This browser · current session',
      location: 'Local development',
      ip: '127.0.0.1',
      createdAt: now - 2 * HOUR,
      lastActiveAt: now,
      current: true,
    },
    {
      id: `dev_session_${userId.slice(0, 8)}_iphone`,
      device: 'Safari on iPhone 15',
      detail: 'Mobile · remembered sign-in',
      location: 'Manila, PH',
      ip: '203.0.113.42',
      createdAt: now - 12 * DAY,
      lastActiveAt: now - 2 * HOUR,
      current: false,
    },
    {
      id: `dev_session_${userId.slice(0, 8)}_macbook`,
      device: 'Chrome on macOS',
      detail: 'Studio laptop · remembered sign-in',
      location: 'Manila, PH',
      ip: '203.0.113.18',
      createdAt: now - 40 * DAY,
      lastActiveAt: now - 3 * DAY,
      current: false,
    },
  ].map((session) => ({ ...session, email }))
}

function ensureDevSessions(userId, email) {
  const store = readSessionStore()
  if (!store.users[userId]?.sessions?.length) {
    store.users[userId] = {
      sessions: seedDevSessions(userId, email),
      seededAt: Date.now(),
    }
    writeSessionStore(store)
  }

  return readSessionStore().users[userId].sessions
}

function revokeOtherDevSessions(userId, currentId, email) {
  if (!import.meta.env.DEV || !userId) return
  const store = readSessionStore()

  if (!store.users[userId]?.sessions?.length) {
    store.users[userId] = {
      sessions: seedDevSessions(userId, email ?? ''),
      seededAt: Date.now(),
    }
  }

  const record = store.users[userId]
  record.sessions = record.sessions.filter(
    (session) => session.current || (currentId && session.id === currentId),
  )
  writeSessionStore(store)
}

function normalizeApiSessions(data) {
  const list = Array.isArray(data) ? data : (data?.sessions ?? data?.items ?? [])
  const currentId = data?.current_session_id ?? data?.current ?? null

  return list.map((raw, index) => ({
    id: String(raw?.id ?? raw?.session_id ?? `session-${index + 1}`),
    device: raw?.device ?? raw?.user_agent_label ?? raw?.user_agent ?? 'Unknown device',
    detail: raw?.detail ?? null,
    location: raw?.location ?? raw?.city ?? 'Unknown location',
    ip: raw?.ip_address ?? raw?.ip ?? null,
    createdAt: raw?.created_at ?? raw?.createdAt ?? null,
    lastActiveAt: raw?.last_used_at ?? raw?.last_active_at ?? raw?.created_at ?? null,
    current: Boolean(raw?.current ?? raw?.is_current ?? (currentId && raw?.id === currentId)),
  }))
}

export async function loadSessions(user, signal) {
  try {
    const data = await api.sessions(signal)
    return { development: false, sessions: normalizeApiSessions(data) }
  } catch (error) {
    if (error?.name === 'AbortError') throw error
    if (!isMissingEndpoint(error)) throw error
    if (!import.meta.env.DEV) {
      throw unavailable('Active-session review is not available on this API build yet.')
    }
  }

  const sessions = ensureDevSessions(user.id, user.email).map((session) =>
    session.current ? { ...session, lastActiveAt: Date.now() } : session,
  )
  return { development: true, sessions }
}

export function resetDevSessions(user) {
  const store = readSessionStore()
  store.users[user.id] = {
    sessions: seedDevSessions(user.id, user.email),
    seededAt: Date.now(),
  }
  writeSessionStore(store)
  return loadSessions(user)
}

export async function revokeSession(user, sessionId) {
  try {
    await api.revokeSession(sessionId)
    return { development: false, current: false }
  } catch (error) {
    if (!isMissingEndpoint(error)) throw error
    if (!import.meta.env.DEV) {
      throw unavailable('Session management is not available on this API build yet.')
    }
  }

  const store = readSessionStore()
  const record = store.users[user.id]
  const target = record?.sessions?.find((session) => session.id === sessionId)
  if (record?.sessions) {
    record.sessions = record.sessions.filter((session) => session.id !== sessionId)
    writeSessionStore(store)
  }

  return { development: true, current: Boolean(target?.current) }
}

export async function revokeOtherSessions(user) {
  try {
    await api.revokeAllSessions({ keep_current: true })
    return { development: false }
  } catch (error) {
    if (!isMissingEndpoint(error)) throw error
    if (!import.meta.env.DEV) {
      throw unavailable('Session management is not available on this API build yet.')
    }
  }

  const store = readSessionStore()
  const record = store.users[user.id]
  if (record?.sessions) {
    record.sessions = record.sessions.filter((session) => session.current)
    writeSessionStore(store)
  }
  return { development: true }
}

export async function revokeAllSessions(user) {
  try {
    await api.revokeAllSessions({ keep_current: false })
    return { development: false }
  } catch (error) {
    if (!isMissingEndpoint(error)) throw error
    if (!import.meta.env.DEV) {
      throw unavailable('Session management is not available on this API build yet.')
    }
  }

  const store = readSessionStore()
  if (store.users[user.id]) {
    store.users[user.id].sessions = []
    writeSessionStore(store)
  }
  return { development: true }
}
