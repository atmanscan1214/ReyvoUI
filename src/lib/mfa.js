import { api, ApiError } from './api'

export const MFA_STEP_SECONDS = 30
export const MFA_DIGITS = 6
export const MFA_MAX_ATTEMPTS = 5

const BASE32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'

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

/** Generates the current RFC 6238 TOTP for the enrollment helper in development. */
export async function generateTotp(secret, { timestamp = Date.now() } = {}) {
  const counter = Math.floor(timestamp / 1000 / MFA_STEP_SECONDS)
  const message = new Uint8Array(8)
  new DataView(message.buffer).setUint32(4, counter % 0x100000000)

  const signature = await hmacSha1(base32Decode(secret), message)
  const offset = signature[signature.length - 1] & 0x0f
  const binary =
    ((signature[offset] & 0x7f) << 24) |
    ((signature[offset + 1] & 0xff) << 16) |
    ((signature[offset + 2] & 0xff) << 8) |
    (signature[offset + 3] & 0xff)

  return String(binary % 10 ** MFA_DIGITS).padStart(MFA_DIGITS, '0')
}

export function totpRemainingSeconds(timestamp = Date.now()) {
  return MFA_STEP_SECONDS - (Math.floor(timestamp / 1000) % MFA_STEP_SECONDS)
}

export function isMfaRequired({ isPlatformAdmin } = {}) {
  return Boolean(isPlatformAdmin)
}

export async function getMfaStatus(_userId, signal) {
  const data = await api.mfaStatus(signal)
  return {
    enabled: data.enabled,
    enabledAt: data.enabled_at,
    pending: data.pending,
    pendingExpiresAt: data.pending_expires_at,
  }
}

export async function beginMfaEnrollment(userId) {
  if (!userId) {
    throw new ApiError('Sign in before enrolling an authenticator.', {
      status: 401,
      code: 'not_authenticated',
    })
  }
  const data = await api.mfaEnroll()
  return {
    development: false,
    secret: data.secret,
    uri: data.otpauth_uri,
    expiresAt: Date.parse(data.expires_at),
  }
}

export async function confirmMfaEnrollment(_userId, code) {
  const data = await api.mfaVerify({ code: code.replace(/\s+/g, '') })
  return { status: data.enabled ? 'enabled' : 'invalid', development: false }
}

export async function cancelMfaEnrollment(_userId) {
  await api.mfaCancelEnroll()
}

export async function disableMfa(_userId, code) {
  const data = await api.mfaDisable({ code: code.replace(/\s+/g, '') })
  return { status: data.enabled ? 'invalid' : 'disabled', development: false }
}

export async function verifyMfaChallenge(challengeId, code) {
  return api.mfaChallenge({
    challenge_id: challengeId,
    code: code.replace(/\s+/g, ''),
  })
}
