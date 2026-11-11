import { clearSession, isExpired, markSessionExpired, readSession, saveSession } from './auth'

const API_BASE = (import.meta.env.VITE_API_URL || '/api/v1').replace(/\/+$/, '')

/**
 * Error thrown for every failed API call. `fieldErrors` maps snake_case field
 * names from FastAPI's validation errors to human-readable messages.
 */
export class ApiError extends Error {
  constructor(message, options = {}) {
    super(message)
    this.name = 'ApiError'
    this.status = options.status ?? 0
    this.code = options.code ?? 'request_failed'
    this.details = options.details ?? null
    this.fieldErrors = options.fieldErrors ?? {}
    this.requestId = options.requestId ?? null
  }
}

const UNREACHABLE_MESSAGE =
  'We could not reach the Reyvo API. Check that it is running on port 8000, then try again.'

const SESSION_EXPIRED_MESSAGE = 'Your session has expired. Please sign in again.'

const STATUS_MESSAGES = {
  0: UNREACHABLE_MESSAGE,
  400: 'That request could not be completed. Please review your details and try again.',
  401: 'Your email or password is incorrect.',
  403: 'You do not have access to that workspace.',
  409: 'An account with this email already exists.',
  422: 'Please check the highlighted fields and try again.',
  429: 'Too many attempts. Please wait a moment and try again.',
  500: 'Something went wrong on our side. Please try again shortly.',
  502: UNREACHABLE_MESSAGE,
  503: 'The service is temporarily unavailable. Please try again shortly.',
  504: UNREACHABLE_MESSAGE,
}

let sessionExpiredHandler = null
let refreshInFlight = null

function collectFieldErrors(details) {
  const errors = Array.isArray(details?.errors) ? details.errors : []
  const fieldErrors = {}

  for (const item of errors) {
    const field = Array.isArray(item?.loc) ? item.loc[item.loc.length - 1] : null
    if (!field || fieldErrors[field]) continue
    fieldErrors[field] = String(item?.msg || 'This value is not valid.').replace(
      /^Value error, /i,
      '',
    )
  }

  return fieldErrors
}

function isAbort(error) {
  return error?.name === 'AbortError'
}

function isRejectedToken(error) {
  return error?.status === 401 || error?.status === 403
}

/**
 * Registers a callback fired when the stored session can no longer be refreshed.
 * The app shell uses this to send the user back to the sign-in page. Returns an
 * unsubscribe function.
 */
export function onSessionExpired(handler) {
  sessionExpiredHandler = handler
  return () => {
    if (sessionExpiredHandler === handler) sessionExpiredHandler = null
  }
}

function notifySessionExpired() {
  markSessionExpired()
  clearSession()
  sessionExpiredHandler?.()
}

function isFormData(body) {
  return typeof FormData !== 'undefined' && body instanceof FormData
}

async function request(path, { method = 'GET', body, token, signal } = {}) {
  let response
  const formData = isFormData(body)

  try {
    response = await fetch(`${API_BASE}${path}`, {
      method,
      signal,
      headers: {
        Accept: 'application/json',
        // The browser sets the multipart boundary itself; setting JSON here
        // would make the upload unreadable to the API.
        ...(body && !formData ? { 'Content-Type': 'application/json' } : null),
        ...(token ? { Authorization: `Bearer ${token}` } : null),
      },
      ...(body ? { body: formData ? body : JSON.stringify(body) } : null),
    })
  } catch (error) {
    if (isAbort(error)) throw error
    throw new ApiError(STATUS_MESSAGES[0], { code: 'network_error' })
  }

  const raw = await response.text()
  let payload = null
  if (raw) {
    try {
      payload = JSON.parse(raw)
    } catch {
      payload = null
    }
  }

  if (!response.ok) {
    const envelope = payload?.error
    const message =
      envelope?.message ||
      STATUS_MESSAGES[response.status] ||
      `Request failed with status ${response.status}.`

    throw new ApiError(message, {
      status: response.status,
      code: envelope?.code,
      details: envelope?.details,
      fieldErrors: collectFieldErrors(envelope?.details),
      requestId: envelope?.request_id,
    })
  }

  return payload
}

/**
 * Exchanges the stored refresh token for a new pair. Concurrent callers share
 * one request so a burst of 401s cannot burn through refresh tokens.
 */
function refreshStoredSession() {
  const session = readSession()

  if (!session?.refreshToken) {
    return Promise.reject(
      new ApiError(SESSION_EXPIRED_MESSAGE, { status: 401, code: 'session_expired' }),
    )
  }

  if (!refreshInFlight) {
    refreshInFlight = request('/auth/refresh', {
      method: 'POST',
      body: { refresh_token: session.refreshToken },
    })
      .then((pair) => {
        const next = saveSession(pair)
        if (!next) {
          throw new ApiError('The server returned an unusable session.', {
            status: 502,
            code: 'invalid_token_pair',
          })
        }
        return next
      })
      .finally(() => {
        refreshInFlight = null
      })
  }

  return refreshInFlight
}

/**
 * Authenticated request with proactive and reactive token refresh.
 *
 * - Refreshes first when the access token is about to expire.
 * - On a 401, refreshes once and retries the original request once.
 * - Clears the session only when the refresh token itself is rejected.
 */
export async function authedRequest(path, { method = 'GET', body, signal } = {}) {
  let session = readSession()

  if (!session?.accessToken) {
    throw new ApiError('Please sign in to continue.', { status: 401, code: 'not_authenticated' })
  }

  if (isExpired(session) && session.refreshToken) {
    try {
      session = await refreshStoredSession()
    } catch (error) {
      if (isRejectedToken(error)) {
        notifySessionExpired()
        throw new ApiError(SESSION_EXPIRED_MESSAGE, { status: 401, code: 'session_expired' })
      }
      throw error
    }
  }

  try {
    return await request(path, {
      method,
      body,
      signal,
      token: session.accessToken,
    })
  } catch (error) {
    if (isAbort(error) || error?.status !== 401) throw error

    if (!session.refreshToken) {
      notifySessionExpired()
      throw new ApiError(SESSION_EXPIRED_MESSAGE, { status: 401, code: 'session_expired' })
    }

    let refreshed
    try {
      refreshed = await refreshStoredSession()
    } catch (refreshError) {
      if (isRejectedToken(refreshError)) {
        notifySessionExpired()
        throw new ApiError(SESSION_EXPIRED_MESSAGE, { status: 401, code: 'session_expired' })
      }
      throw refreshError
    }

    try {
      return await request(path, {
        method,
        body,
        signal,
        token: refreshed.accessToken,
      })
    } catch (retryError) {
      if (retryError?.status === 401) notifySessionExpired()
      throw retryError
    }
  }
}

export const api = {
  register: (payload) => request('/auth/register', { method: 'POST', body: payload }),
  login: (payload) => request('/auth/login', { method: 'POST', body: payload }),
  refresh: (refreshToken) =>
    request('/auth/refresh', { method: 'POST', body: { refresh_token: refreshToken } }),
  me: (signal) => authedRequest('/auth/me', { signal }),
  // Provisional verification paths. The current API build does not expose
  // these yet; src/lib/emailVerification.js documents the dev-only fallback.
  verifyEmail: (token) => request('/auth/verify-email', { method: 'POST', body: { token } }),
  resendVerification: (email) =>
    request('/auth/resend-verification', { method: 'POST', body: { email } }),

  // Provisional T09 paths from the design's endpoint catalog. The current API
  // build does not expose them yet; the adapters in passwordReset.js, invites.js
  // and mfa.js document the development-only fallbacks.
  forgotPassword: (email) =>
    request('/auth/password/forgot', { method: 'POST', body: { email } }),
  resetPassword: (payload) =>
    request('/auth/password/reset', { method: 'POST', body: payload }),
  getInvite: (token) => request(`/invites/${encodeURIComponent(token)}`),
  acceptInvite: (token, payload) =>
    request(`/invites/${encodeURIComponent(token)}/accept`, { method: 'POST', body: payload }),
  mfaEnroll: (payload) => authedRequest('/auth/mfa/enroll', { method: 'POST', body: payload }),
  mfaVerify: (payload) => request('/auth/mfa/verify', { method: 'POST', body: payload }),

  // Provisional T10 paths. The current API build exposes only `GET /auth/me`,
  // so src/lib/account.js documents the development-only fallbacks.
  updateMe: (payload) => authedRequest('/auth/me', { method: 'PATCH', body: payload }),
  requestEmailChange: (payload) =>
    authedRequest('/auth/email-change', { method: 'POST', body: payload }),
  confirmEmailChange: (payload) =>
    authedRequest('/auth/email-change/confirm', { method: 'POST', body: payload }),
  changePassword: (payload) =>
    authedRequest('/auth/password/change', { method: 'POST', body: payload }),
  sessions: (signal) => authedRequest('/auth/sessions', { signal }),
  revokeSession: (sessionId) =>
    authedRequest(`/auth/sessions/${encodeURIComponent(sessionId)}`, { method: 'DELETE' }),
  revokeAllSessions: (payload) =>
    authedRequest('/auth/sessions/revoke-all', { method: 'POST', body: payload }),

  // Generic authenticated helpers. Product modules should use these instead of
  // calling fetch directly, so auth refresh and error parsing stay in one place.
  get: (path, options = {}) => authedRequest(path, options),
  post: (path, body, options = {}) => authedRequest(path, { ...options, method: 'POST', body }),
  postForm: (path, formData, options = {}) =>
    authedRequest(path, { ...options, method: 'POST', body: formData }),
  patch: (path, body, options = {}) => authedRequest(path, { ...options, method: 'PATCH', body }),
  delete: (path, options = {}) => authedRequest(path, { ...options, method: 'DELETE' }),
}

export { API_BASE }
