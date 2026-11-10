const STORAGE_KEY = 'reyvo.session.v1'

/**
 * Persists the access/refresh token pair returned by register and login.
 * Kept deliberately tiny: the tenant summary is all the UI needs before /me.
 */
export function saveSession(tokenPair) {
  if (!tokenPair?.access_token) return null

  const session = {
    accessToken: tokenPair.access_token,
    refreshToken: tokenPair.refresh_token ?? null,
    tokenType: tokenPair.token_type ?? 'bearer',
    expiresIn: tokenPair.expires_in ?? null,
    tenant: tokenPair.tenant ?? null,
    obtainedAt: Date.now(),
  }

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(session))
  } catch {
    // Storage can be unavailable (private mode); the session still works in memory
    // for the current navigation, so failing silently is acceptable here.
  }

  return session
}

export function readSession() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const session = JSON.parse(raw)
    return session?.accessToken ? session : null
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
}

export function isExpired(session) {
  if (!session?.expiresIn || !session?.obtainedAt) return false
  const expiresAt = session.obtainedAt + session.expiresIn * 1000
  return Date.now() >= expiresAt - 30_000
}
