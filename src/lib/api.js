import { clearSession, isExpired, markSessionExpired, readSession, saveSession } from './auth'

const API_BASE = (import.meta.env.VITE_API_URL || '/api/v1').replace(/\/+$/, '')

/**
 * Error thrown for every failed API call. `fieldErrors` maps snake_case field
 * names from FastAPI's validation errors to human-readable messages.
 */
class ApiError extends Error {
  constructor(message, options = {}) {
    super(message)
    this.name = 'ApiError'
    this.status = options.status ?? 0
    this.code = options.code ?? 'request_failed'
    this.details = options.details ?? null
    this.fieldErrors = options.fieldErrors ?? {}
    this.requestId = options.requestId ?? null
    this.idempotencyKey = options.idempotencyKey ?? null
  }
}

/**
 * Generic pagination metadata returned by the API.
 */
class PaginatedResponse {
  constructor(data, meta) {
    this.data = data
    this.meta = meta
  }

  /** Items in the current page, mirroring the raw `{ items, total }` shape. */
  get items() {
    return this.data
  }

  get hasMore() {
    return this.meta.hasMore ?? false
  }

  get page() {
    return this.meta.page ?? 1
  }

  get pageSize() {
    return this.meta.pageSize ?? 20
  }

  get total() {
    return this.meta.total ?? 0
  }
}

/**
 * UNREACHABLE_MESSAGE is shown when the API server cannot be reached.
 */
const UNREACHABLE_MESSAGE =
  'We could not reach the Reyvo API. Check that it is running on port 8000, then try again.'

/**
 * SESSION_EXPIRED_MESSAGE is shown when the user's session has expired.
 */
const SESSION_EXPIRED_MESSAGE = 'Your session has expired. Please sign in again.'

/**
 * STATUS_MESSAGES maps HTTP status codes to human-readable messages.
 */
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

/**
 * Cache entry for query results.
 */
class CacheEntry {
  constructor(value, timestamp) {
    this.value = value
    this.timestamp = timestamp
  }

  get isStale() {
    return Date.now() - this.timestamp > 60000
  }
}

/**
 * Error codes for common API error scenarios.
 */
const ErrorCodes = {
  NETWORK_ERROR: 'network_error',
  VALIDATION_ERROR: 'validation_error',
  NOT_FOUND: 'not_found',
  CONFLICT: 'conflict',
  RATE_LIMIT: 'rate_limit',
  AUTH_ERROR: 'auth_error',
  TOKEN_EXPIRED: 'token_expired',
  SERVER_ERROR: 'server_error',
}

/**
 * Pagination options for API requests.
 */
const PaginationOptions = {
  DEFAULT_PAGE: 1,
  DEFAULT_PAGE_SIZE: 20,
  MAX_PAGE_SIZE: 100,
}

/**
 * Retry configuration for API requests.
 */
const RetryConfig = {
  MAX_RETRIES: 3,
  BACKOFF_MS: 500,
  RETRYABLE_STATUSES: [408, 429, 500, 502, 503, 504],
}

/**
 * Checks if a status code should trigger a retry.
 */
function isRetryableStatus(status) {
  return RetryConfig.RETRYABLE_STATUSES.includes(status)
}

/**
 * Checks if an error is retryable.
 */
function isRetryableError(error) {
  if (!error) return false
  if (error instanceof ApiError) return isRetryableStatus(error.status)
  return false
}

/**
 * In-memory query cache with TTL.
 */
const queryCache = new Map()
const CACHE_MAX_ENTRIES = 50
const CACHE_TTL = 60000 // 60 seconds

function cacheQuery(key, fn) {
  const cached = queryCache.get(key)
  if (cached && !cached.isStale) {
    return cached.value
  }

  const result = fn()
  queryCache.set(key, new CacheEntry(result, Date.now()))

  // Evict oldest entries if over limit
  while (queryCache.size > CACHE_MAX_ENTRIES) {
    const firstKey = queryCache.keys().next().value
    queryCache.delete(firstKey)
  }

  return result
}

/**
 * Function to determine if a body is FormData.
 */
function isFormData(body) {
  return typeof FormData !== 'undefined' && body instanceof FormData
}

/**
 * Base request function with full error handling, token management, and caching.
 */
async function request(path, { method = 'GET', body, token, signal, responseType, paginate, filter, cacheKey } = {}) {
  let response

  const formData = isFormData(body)
  const idempotencyKey = token && body && !formData ? generateIdempotencyKey() : null

  try {
    // Build request options
    const init = {
      method,
      headers: {
        Accept: 'application/json',
        ...(body && !formData ? { 'Content-Type': 'application/json' } : null),
        ...(token ? { Authorization: `Bearer ${token}` } : null),
        ...(idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : null),
      },
      ...(body ? { body: formData ? body : JSON.stringify(body) } : null),
    }

    response = await fetch(`${API_BASE}${path}`, {
      ...init,
      signal: signal ?? undefined,
    })
  } catch (error) {
    if (error.name === 'AbortError') throw error
    throw new ApiError(UNREACHABLE_MESSAGE, { code: 'network_error' })
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
      idempotencyKey,
    })
  }

  // Return paginated response if requested. The live API returns
  // `{ items, total, limit, offset }`; older contracts used `{ data, meta }`.
  if (paginate && payload) {
    if (payload.meta) return new PaginatedResponse(payload.data ?? [], payload.meta)
    const offset = Number(payload.offset ?? 0)
    const limit = Number(payload.limit ?? PaginationOptions.DEFAULT_PAGE_SIZE)
    const items = Array.isArray(payload.items) ? payload.items : Array.isArray(payload) ? payload : []
    const total = Number(payload.total ?? items.length)
    return new PaginatedResponse(items, {
      total,
      page: Math.floor(offset / (limit || 1)) + 1,
      pageSize: limit,
      offset,
      hasMore: offset + items.length < total,
    })
  }

  // Return cached result if cacheKey provided and cache hit
  if (cacheKey) {
    const cached = queryCache.get(cacheKey)
    if (cached && cached.isStale !== undefined && !cached.isStale) {
      return cached.value
    }
  }

  // Return result based on responseType
  if (responseType === 'blob') return response.blob()
  return responseType === 'text' ? raw : payload
}

/**
 * Generates a simple idempotency key for API requests.
 */
function generateIdempotencyKey() {
  return `idempotent-${Date.now()}-${Math.random().toString(36).substring(2, 15)}`
}

/**
 * Collects field errors from FastAPI validation error details.
 */
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

/**
 * Async function to fetch data with token refresh and error handling.
 */
async function authedRequest(path, { method = 'GET', body, signal, responseType, paginate, filter, cacheKey } = {}) {
  let session = readSession()

  if (!session?.accessToken) {
    throw new ApiError('Please sign in to continue.', { status: 401, code: 'not_authenticated' })
  }

  // Proactive token refresh when about to expire
  if (isExpired(session) && session.refreshToken) {
    try {
      const pair = await request('/auth/refresh', {
        method: 'POST',
        body: { refresh_token: session.refreshToken },
      })
      if (pair?.access_token) {
        session = saveSession(pair)
      }
    } catch (error) {
      // If refresh fails, clear session and trigger re-auth
      clearSession()
      triggerSessionExpired()
      throw new ApiError('Session expired. Please sign in again.', { status: 401, code: 'token_expired' })
    }
  }

  try {
    return await request(path, {
      method,
      body,
      token: session.accessToken,
      signal,
      responseType,
      paginate,
      filter,
      cacheKey,
    })
  } catch (error) {
    if (error?.name === 'AbortError') throw error
    if (error?.status === 401) triggerSessionExpired()
    throw error
  }
}

/**
 * Default API object with all authenticated helpers.
 * Product modules should use these instead of calling fetch directly,
 * so auth refresh and error parsing stay in one place.
 */
const api = {
  // Authentication endpoints
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

  // Password reset remains provisional; MFA routes are implemented and
  // session-gated sign-in returns an MFA challenge instead of tokens.
  forgotPassword: (email) =>
    request('/auth/password/forgot', { method: 'POST', body: { email } }),
  resetPassword: (payload) =>
    request('/auth/password/reset', { method: 'POST', body: payload }),

  // Invites
  getInvite: (token) => request(`/invites/${encodeURIComponent(token)}`),
  acceptInvite: (token, payload) =>
    request(`/invites/${encodeURIComponent(token)}/accept`, { method: 'POST', body: payload }),

  // MFA endpoints
  mfaStatus: (signal) => authedRequest('/auth/mfa/status', { signal }),
  mfaSetup: (payload, signal) =>
    request('/auth/mfa/setup', { method: 'POST', body: payload, signal }),
  mfaEnroll: () => authedRequest('/auth/mfa/enroll', { method: 'POST', body: {} }),
  mfaCancelEnroll: () => authedRequest('/auth/mfa/enroll/cancel', { method: 'POST', body: {} }),
  mfaVerify: (payload) => authedRequest('/auth/mfa/verify', { method: 'POST', body: payload }),
  mfaDisable: (payload) => authedRequest('/auth/mfa/disable', { method: 'POST', body: payload }),
  mfaChallenge: (payload) => request('/auth/mfa/challenge', { method: 'POST', body: payload }),

  // T10 account and T43 security endpoints.
  updateMe: (payload) => authedRequest('/auth/me', { method: 'PATCH', body: payload }),
  requestEmailChange: (payload) =>
    authedRequest('/auth/email-change', { method: 'POST', body: payload }),
  // Confirmation is opened from an email link, so it must work without a session.
  confirmEmailChange: (payload) =>
    request('/auth/email-change/confirm', { method: 'POST', body: payload }),
  cancelEmailChange: () => authedRequest('/auth/email-change', { method: 'DELETE' }),
  changePassword: (payload) =>
    authedRequest('/auth/password/change', { method: 'POST', body: payload }),
  sessions: (signal) => authedRequest('/auth/sessions', { signal }),
  revokeSession: (sessionId) =>
    authedRequest(`/auth/sessions/${encodeURIComponent(sessionId)}`, { method: 'DELETE' }),
  revokeAllSessions: (payload) =>
    authedRequest('/auth/sessions/revoke-all', { method: 'POST', body: payload }),

  download: (path, options = {}) =>
    authedRequest(path, { ...options, responseType: 'blob' }),

  // Generic authenticated helpers. Product modules should use these instead of
  // calling fetch directly, so auth refresh and error parsing stay in one place.
  get: (path, options = {}) => authedRequest(path, options),
  post: (path, body, options = {}) => authedRequest(path, { ...options, method: 'POST', body }),
  postForm: (path, formData, options = {}) =>
    authedRequest(path, { ...options, method: 'POST', body: formData }),
  patch: (path, body, options = {}) => authedRequest(path, { ...options, method: 'PATCH', body }),
  put: (path, body, options = {}) => authedRequest(path, { ...options, method: 'PUT', body }),
  delete: (path, options = {}) => authedRequest(path, { ...options, method: 'DELETE' }),

  // Pagination helper. The live API pages with `limit` + `offset`.
  list: (path, options = {}) => {
    const {
      page = PaginationOptions.DEFAULT_PAGE,
      pageSize = PaginationOptions.DEFAULT_PAGE_SIZE,
      params = {},
      ...rest
    } = options
    const query = new URLSearchParams()
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== null) query.set(key, String(value))
    }
    query.set('limit', String(pageSize))
    query.set('offset', String((Math.max(1, page) - 1) * pageSize))
    const separator = path.includes('?') ? '&' : '?'
    return authedRequest(`${path}${separator}${query}`, { ...rest, paginate: true })
  },

  // Filter helper
  search: (path, filter, options = {}) => {
    const searchParams = new URLSearchParams()
    if (filter) {
      Object.entries(filter).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
          searchParams.append(key, String(value))
        }
      })
    }
    const separator = path.includes('?') ? '&' : '?'
    return authedRequest(`${path}${separator}${searchParams}`, options)
  },

  // Cache invalidation
  invalidateCache: (key) => {
    queryCache.delete(key)
  },

  // Clear all cache
  clearCache: () => {
    queryCache.clear()
  },

  // API base path
  get API_BASE() {
    return API_BASE
  },
}

/**
 * Registers a callback fired when the stored session can no longer be refreshed.
 * The app shell uses this to send the user back to the sign-in page. Returns an
 * unsubscribe function.
 */
let _onSessionExpired = null

export function onSessionExpired(handler) {
  _onSessionExpired = handler
  return () => {
    _onSessionExpired = null
  }
}

/**
 * Invoke the stored session expired handler, if any.
 * Called by the request handler when a 401 can't be recovered from.
 */
export function triggerSessionExpired() {
  if (_onSessionExpired) {
    _onSessionExpired(new ApiError(SESSION_EXPIRED_MESSAGE, { status: 401, code: 'token_expired' }))
  }
}

/**
 * Export utility types and helpers for use in product code.
 */
export { ApiError, ErrorCodes, PaginationOptions, RetryConfig, isRetryableStatus, isRetryableError, collectFieldErrors }
export { request, authedRequest }
export { api, API_BASE }