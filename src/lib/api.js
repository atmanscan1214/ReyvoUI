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

async function request(path, { method = 'GET', body, token, signal } = {}) {
  let response

  try {
    response = await fetch(`${API_BASE}${path}`, {
      method,
      signal,
      headers: {
        Accept: 'application/json',
        ...(body ? { 'Content-Type': 'application/json' } : null),
        ...(token ? { Authorization: `Bearer ${token}` } : null),
      },
      ...(body ? { body: JSON.stringify(body) } : null),
    })
  } catch (error) {
    if (error?.name === 'AbortError') throw error
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

export const api = {
  register: (payload) => request('/auth/register', { method: 'POST', body: payload }),
  login: (payload) => request('/auth/login', { method: 'POST', body: payload }),
  refresh: (refreshToken) =>
    request('/auth/refresh', { method: 'POST', body: { refresh_token: refreshToken } }),
  me: (token, signal) => request('/auth/me', { token, signal }),
}

export { API_BASE }
