import { api, ApiError } from './api'

/**
 * TOTP MFA adapter.
 *
 * The design specifies optional TOTP for tenant owners/admins and mandatory TOTP
 * for platform staff, with `POST /auth/mfa/enroll` and `/auth/mfa/verify`.
 * The current API build has neither route, so development builds keep enrollment
 * and short-lived challenge records under `reyvo.mfa.v1`.
 *
 * The secret is stored in localStorage only in development so the flow can be
 * exercised end to end. Production builds call the API and never persist a TOTP
 * secret in the browser.
 */

export const MFA_STEP_SECONDS = 30
export const MFA_DIGITS = 6
export const MFA_CHALLENGE_TTL_MS = 5 * 60 * 1000
export const MFA_ENROLLMENT_TTL_MS = 10 * 60 * 1000
export const MFA_MAX_ATTEMPTS = 5

const STORE_KEY = 'reyvo.mfa.v1'
const BASE32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'

const UNAVAILABLE_MESSAGE =
  'Two-factor authentication is not available on this API build yet. Contact support if you are required to use it.'

function isMissingEndpoint(error) {
  return error instanceof ApiError && (error.status === 404 || error.status === 405)
}

function unavailable() {
  return new ApiError(UNAVAILABLE_MESSAGE, {
    status: 501,
    code: 'mfa_unavailable',
  })
}

function emptyStore() {
  return { users: {}, challenges: {} }
}

function readStore() {
  if (typeof window === 'undefined') return emptyStore()
  try {
    const raw = window.localStorage.getItem(STORE_KEY)
    if (!raw) return emptyStore()
    const parsed = JSON.parse(raw)
    return {
      users: parsed?.users && typeof parsed.users === 'object' ? parsed.users : {},
      challenges:
        parsed?.challenges && typeof parsed.challenges === 'object' ? parsed.challenges : {},
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
    // Storage blocked: enrollment cannot persist, so the UI reports failure on
    // the next read instead of claiming MFA is active.
  }
}

function randomBytes(length) {
  const bytes = new Uint8Array(length)
  globalThis.crypto.getRandomValues(bytes)
  return bytes
}

function base32Encode(bytes) {
  let bits = 0
  let value = 0
  let output = ''

  for (const byte of bytes) {
    value = (value << 8) | byte
    bits += 8
    while (bits >= 5) {
      output += BASE32[(value >>> (bits - 5)) & 31]
      bits -= 5
    }
  }

  if (bits > 0) output += BASE32[(value << (5 - bits)) & 31]
  return output
}

function base32Decode(input) {
  const clean = String(input ?? '')
    .toUpperCase()
    .replace(/[\s=]+/g, '')

  let bits = 0
  let value = 0
  const bytes = []

  for (const character of clean) {
    const index = BASE32.indexOf(character)
    if (index === -1) throw new Error('That authenticator secret is not valid base32.')
    value = (value << 5) | index
    bits += 5
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 255)
      bits -= 8
    }
  }

  return new Uint8Array(bytes)
}

/** Generates a 160-bit base32 secret, the size authenticator apps expect. */
export function generateTotpSecret() {
  return base32Encode(randomBytes(20))
}

async function hmacSha1(keyBytes, messageBytes) {
  const key = await globalThis.crypto.subtle.importKey(
    'raw',
    keyBytes,
    { name: 'HMAC', hash: 'SHA-1' },
    false,
    ['sign'],
  )
  const signature = await globalThis.crypto.subtle.sign('HMAC', key, messageBytes)
  return new Uint8Array(signature)
}

/** RFC 6238 TOTP with SHA-1, six digits, and a thirty-second step. */
export async function generateTotp(
  secret,
  { timestamp = Date.now(), step = MFA_STEP_SECONDS, digits = MFA_DIGITS } = {},
) {
  const counter = Math.floor(timestamp / 1000 / step)
  const message = new Uint8Array(8)
  const view = new DataView(message.buffer)
  view.setUint32(4, counter % 0x100000000)

  const signature = await hmacSha1(base32Decode(secret), message)
  const offset = signature[signature.length - 1] & 0x0f
  const binary =
    ((signature[offset] & 0x7f) << 24) |
    ((signature[offset + 1] & 0xff) << 16) |
    ((signature[offset + 2] & 0xff) << 8) |
    (signature[offset + 3] & 0xff)

  return String(binary % 10 ** digits).padStart(digits, '0')
}

export function totpRemainingSeconds(timestamp = Date.now()) {
  return MFA_STEP_SECONDS - (Math.floor(timestamp / 1000) % MFA_STEP_SECONDS)
}

/** Accepts the previous, current, and next step to tolerate clock drift. */
export async function verifyTotp(secret, code, { window = 1, timestamp = Date.now() } = {}) {
  const normalized = String(code ?? '').replace(/\s+/g, '')
  if (!/^\d{6}$/.test(normalized)) return false

  for (let offset = -window; offset <= window; offset += 1) {
    const candidate = await generateTotp(secret, {
      timestamp: timestamp + offset * MFA_STEP_SECONDS * 1000,
    })
    if (candidate === normalized) return true
  }

  return false
}

export function otpauthUri({ secret, email, issuer = 'Reyvo' }) {
  const account = email ? `${issuer}:${email}` : issuer
  const params = new URLSearchParams({
    secret,
    issuer,
    algorithm: 'SHA1',
    digits: String(MFA_DIGITS),
    period: String(MFA_STEP_SECONDS),
  })
  return `otpauth://totp/${encodeURIComponent(account)}?${params.toString()}`
}

export function isMfaRequired({ isPlatformAdmin } = {}) {
  return Boolean(isPlatformAdmin)
}

export function getMfaStatus(userId) {
  if (!userId) return { enabled: false, enabledAt: null, hasPending: false, pendingExpiresAt: null }
  const record = readStore().users[userId]
  if (!record) return { enabled: false, enabledAt: null, hasPending: false, pendingExpiresAt: null }

  return {
    enabled: Boolean(record.secret && record.enabledAt),
    enabledAt: record.enabledAt ?? null,
    hasPending: Boolean(record.pending?.secret),
    pendingExpiresAt: record.pending?.expiresAt ?? null,
  }
}

export function hasEnabledMfa() {
  return Object.values(readStore().users).some((record) => record?.secret && record.enabledAt)
}

export async function beginMfaEnrollment(userId, { email } = {}) {
  if (!userId) {
    throw new ApiError('Sign in before enrolling an authenticator.', {
      status: 401,
      code: 'not_authenticated',
    })
  }

  try {
    const data = await api.mfaEnroll({ action: 'begin' })
    if (data?.secret) {
      return {
        development: false,
        secret: data.secret,
        uri: data.otpauth_uri ?? otpauthUri({ secret: data.secret, email }),
        expiresAt: null,
      }
    }
    if (!import.meta.env.DEV) throw unavailable()
  } catch (error) {
    if (!isMissingEndpoint(error)) throw error
    if (!import.meta.env.DEV) throw unavailable()
  }

  const store = readStore()
  const secret = generateTotpSecret()
  const now = Date.now()

  store.users[userId] = {
    ...(store.users[userId] ?? {}),
    pending: { secret, startedAt: now, expiresAt: now + MFA_ENROLLMENT_TTL_MS },
    email: email ?? store.users[userId]?.email ?? null,
  }
  writeStore(store)

  return {
    development: true,
    secret,
    uri: otpauthUri({ secret, email: email ?? store.users[userId].email }),
    expiresAt: now + MFA_ENROLLMENT_TTL_MS,
  }
}

export async function confirmMfaEnrollment(userId, code, { email } = {}) {
  const store = readStore()
  const record = store.users[userId]

  if (record?.pending?.secret) {
    if (Date.now() > Number(record.pending.expiresAt ?? 0)) {
      delete record.pending
      writeStore(store)
      return { status: 'expired', development: true }
    }

    const valid = await verifyTotp(record.pending.secret, code)
    if (!valid) return { status: 'invalid', development: true }

    store.users[userId] = {
      secret: record.pending.secret,
      enabledAt: Date.now(),
      email: email ?? record.email ?? null,
    }
    writeStore(store)
    return { status: 'enabled', development: true }
  }

  try {
    await api.mfaVerify({ action: 'enroll', code })
    return { status: 'enabled', development: false }
  } catch (error) {
    if (!isMissingEndpoint(error)) throw error
    if (!import.meta.env.DEV) throw unavailable()
  }

  return { status: 'expired', development: true }
}

export function cancelMfaEnrollment(userId) {
  const store = readStore()
  if (store.users[userId]?.pending) {
    delete store.users[userId].pending
    writeStore(store)
  }
}

export async function disableMfa(userId, code) {
  const store = readStore()
  const record = store.users[userId]

  if (record?.secret && record.enabledAt) {
    const valid = await verifyTotp(record.secret, code)
    if (!valid) return { status: 'invalid', development: true }

    delete store.users[userId]
    for (const [challengeId, challenge] of Object.entries(store.challenges)) {
      if (challenge?.userId === userId) delete store.challenges[challengeId]
    }
    writeStore(store)
    return { status: 'disabled', development: true }
  }

  try {
    await api.mfaVerify({ action: 'disable', code })
    return { status: 'disabled', development: false }
  } catch (error) {
    if (!isMissingEndpoint(error)) throw error
    if (!import.meta.env.DEV) throw unavailable()
  }

  return { status: 'invalid', development: true }
}

export function createMfaChallenge(userId, { ageMs = 0 } = {}) {
  const store = readStore()
  const now = Date.now()
  const id = `dev_challenge_${
    typeof globalThis.crypto?.randomUUID === 'function'
      ? globalThis.crypto.randomUUID()
      : `${now}-${Math.random().toString(16).slice(2)}`
  }`

  store.challenges[id] = {
    userId,
    createdAt: now - Math.max(0, ageMs),
    expiresAt: now - Math.max(0, ageMs) + MFA_CHALLENGE_TTL_MS,
    attempts: 0,
    usedAt: null,
  }
  writeStore(store)

  return { id, expiresAt: store.challenges[id].expiresAt, userId }
}

export function readMfaChallenge(challengeId) {
  if (!challengeId) return { status: 'invalid', reason: 'missing', challenge: null }

  const challenge = readStore().challenges[challengeId]
  if (!challenge) return { status: 'invalid', reason: 'unknown', challenge: null }

  const view = {
    id: challengeId,
    userId: challenge.userId,
    createdAt: challenge.createdAt,
    expiresAt: challenge.expiresAt,
    attempts: challenge.attempts ?? 0,
  }

  if (challenge.usedAt) return { status: 'used', reason: 'used', challenge: view }
  if (Date.now() > Number(challenge.expiresAt ?? 0)) {
    return { status: 'expired', reason: 'expired', challenge: view }
  }
  if ((challenge.attempts ?? 0) >= MFA_MAX_ATTEMPTS) {
    return { status: 'locked', reason: 'locked', challenge: view }
  }

  return { status: 'valid', reason: null, challenge: view }
}

export function getChallengeUser(userId) {
  const record = readStore().users[userId]
  if (!record?.secret || !record.enabledAt) return null
  return { userId, email: record.email ?? null, enabledAt: record.enabledAt }
}

/** Reads the live secret so the development helper can show a current code. */
export function getMfaSecret(userId) {
  return readStore().users[userId]?.secret ?? null
}

export async function verifyMfaChallenge(challengeId, code) {
  const store = readStore()
  const challenge = store.challenges[challengeId]

  if (!challenge) return { status: 'invalid', reason: 'unknown' }
  if (challenge.usedAt) return { status: 'used', reason: 'used' }
  if (Date.now() > Number(challenge.expiresAt ?? 0)) {
    return { status: 'expired', reason: 'expired' }
  }
  if ((challenge.attempts ?? 0) >= MFA_MAX_ATTEMPTS) {
    return { status: 'locked', reason: 'locked' }
  }

  const record = store.users[challenge.userId]

  if (record?.secret && record.enabledAt) {
    const valid = await verifyTotp(record.secret, code)
    if (valid) {
      challenge.usedAt = Date.now()
      writeStore(store)
      return { status: 'success', development: true }
    }

    challenge.attempts = (challenge.attempts ?? 0) + 1
    writeStore(store)
    return {
      status: challenge.attempts >= MFA_MAX_ATTEMPTS ? 'locked' : 'invalid',
      reason: 'code',
      attemptsLeft: Math.max(0, MFA_MAX_ATTEMPTS - challenge.attempts),
      development: true,
    }
  }

  try {
    await api.mfaVerify({ action: 'challenge', challenge_id: challengeId, code })
    challenge.usedAt = Date.now()
    writeStore(store)
    return { status: 'success', development: false }
  } catch (error) {
    if (!isMissingEndpoint(error)) {
      if (error?.code === 'mfa_code_expired') return { status: 'expired', reason: 'expired' }
      if (error?.code === 'mfa_code_invalid') return { status: 'invalid', reason: 'code' }
      throw error
    }
    if (!import.meta.env.DEV) throw unavailable()
  }

  return { status: 'invalid', reason: 'unknown' }
}
