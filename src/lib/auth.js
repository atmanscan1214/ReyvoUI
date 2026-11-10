import { clearWorkspaces, rememberSession } from './workspaces'

const STORAGE_KEY = 'reyvo.session.v1'
const EXPIRED_KEY = 'reyvo.session.expired'

const sessionListeners = new Set()

function emitSessionChange() {
  const session = readSession()
  for (const listener of sessionListeners) {
    try {
      listener(session)
    } catch {
      // A broken listener must not stop other subscribers from updating.
    }
  }
}

/** Subscribe to login, refresh, switch, and sign-out events. */
export function subscribeSession(listener) {
  sessionListeners.add(listener)
  return () => {
    sessionListeners.delete(listener)
  }
}

function isSession(value) {
  return Boolean(value?.accessToken)
}

function toSession(tokenPair) {
  if (!tokenPair?.access_token) return null

  return {
    accessToken: tokenPair.access_token,
    refreshToken: tokenPair.refresh_token ?? null,
    tokenType: tokenPair.token_type ?? 'bearer',
    expiresIn: tokenPair.expires_in ?? null,
    tenant: tokenPair.tenant ?? null,
    obtainedAt: Date.now(),
  }
}

/**
 * Persists the access/refresh token pair returned by register and login.
 * Kept deliberately tiny: the tenant summary is all the UI needs before /me.
 */
export function saveSession(tokenPair) {
  const session = toSession(tokenPair)
  if (!session) return null

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(session))
  } catch {
    // Storage can be unavailable (private mode); the session still works in memory
    // for the current navigation, so failing silently is acceptable here.
  }

  rememberSession(session)
  emitSessionChange()
  return session
}

/** Makes an already-stored workspace session active, without another refresh. */
export function activateSession(session) {
  if (!isSession(session)) return null

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(session))
  } catch {
    // ignore
  }

  rememberSession(session)
  emitSessionChange()
  return session
}

export function readSession() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const session = JSON.parse(raw)
    return isSession(session) ? session : null
  } catch {
    return null
  }
}

export function clearSession() {
  try {
    localStorage.removeItem(STORAGE_KEY)
  } catch {
    // ignore
  }

  emitSessionChange()
}

/** Sign-out removes every remembered workspace token from this device. */
export function clearAllSessions() {
  clearWorkspaces()
  clearSession()
}

/**
 * Leaves a one-shot marker so the sign-in page can explain why the user was
 * sent back, without relying on router state that a guard redirect can replace.
 */
export function markSessionExpired() {
  try {
    sessionStorage.setItem(EXPIRED_KEY, '1')
  } catch {
    // ignore
  }
}

export function consumeSessionExpired() {
  try {
    const expired = sessionStorage.getItem(EXPIRED_KEY) === '1'
    sessionStorage.removeItem(EXPIRED_KEY)
    return expired
  } catch {
    return false
  }
}

export function isExpired(session) {
  if (!session?.expiresIn || !session?.obtainedAt) return false
  const expiresAt = session.obtainedAt + session.expiresIn * 1000
  return Date.now() >= expiresAt - 30_000
}
