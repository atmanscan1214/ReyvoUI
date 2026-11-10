import { useCallback, useEffect, useState } from 'react'
import { api } from './api'
import { useSession } from './session'

/**
 * Onboarding model shared by the checklist page and the app shell widget.
 *
 * Progress is derived from data the API actually exposes: `/auth/me` for email
 * verification, `/tenants/current` for the mailing address, and
 * `/tenants/current/usage` plus `/email-accounts` for the sending steps.
 */

const DAY_MS = 24 * 60 * 60 * 1000

export const LOCAL_ONBOARDING_KEY = 'reyvo.onboarding.v1'

/** The design's five onboarding steps, in order. */
export const SETUP_STEPS = [
  {
    id: 'verify-email',
    title: 'Verify your email',
    description:
      'Confirm the address on your account. Reyvo will not send anything for you until it is verified.',
    href: '/verify-email',
    actionLabel: 'Verify email',
    doneLabel: 'View status',
    tag: 'Required',
    source: 'profile',
  },
  {
    id: 'mailing-address',
    title: 'Add your mailing address',
    description:
      'Required before your first campaign. It appears in the footer of every commercial email.',
    href: '/welcome/address',
    actionLabel: 'Add address',
    doneLabel: 'Edit address',
    tag: 'Required',
    source: 'tenant',
  },
  {
    id: 'connect-mailbox',
    title: 'Connect a mailbox',
    description:
      'Link Google Workspace or Microsoft 365 so Reyvo can send as you with conservative caps.',
    href: '/app/mailboxes',
    actionLabel: 'Connect mailbox',
    doneLabel: 'View mailboxes',
    tag: '2 minutes',
    source: 'setup',
  },
  {
    id: 'import-contacts',
    title: 'Import your market',
    description:
      'Bring in employers and contacts by CSV. Dedupe and suppression checks run automatically.',
    href: '/app/imports',
    actionLabel: 'Import contacts',
    doneLabel: 'View imports',
    tag: '5 minutes',
    source: 'setup',
  },
  {
    id: 'first-campaign',
    title: 'Launch your first campaign',
    description:
      'Build a multi-step sequence, approve the copy, and choose a conservative daily cap.',
    href: '/app/campaigns',
    actionLabel: 'Build campaign',
    doneLabel: 'View campaigns',
    tag: 'The good part',
    source: 'setup',
  },
]

function emptyStore() {
  return { challenges: {}, verified: {} }
}

function readStore() {
  if (typeof window === 'undefined') return emptyStore()
  try {
    const raw = window.localStorage.getItem(LOCAL_ONBOARDING_KEY)
    if (!raw) return emptyStore()
    const parsed = JSON.parse(raw)
    return {
      challenges: parsed?.challenges && typeof parsed.challenges === 'object' ? parsed.challenges : {},
      verified: parsed?.verified && typeof parsed.verified === 'object' ? parsed.verified : {},
    }
  } catch {
    return emptyStore()
  }
}

function writeStore(store) {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(LOCAL_ONBOARDING_KEY, JSON.stringify(store))
  } catch {
    // Storage full or blocked: verification falls back to the API only.
  }
}

function addressValue(address, key) {
  return String(address?.[key] ?? '').trim()
}

/** A mailing address counts as complete only when the legally required parts exist. */
export function hasPhysicalAddress(address) {
  if (!address || typeof address !== 'object') return false
  return Boolean(
    addressValue(address, 'line1') &&
      addressValue(address, 'city') &&
      addressValue(address, 'postal') &&
      addressValue(address, 'country'),
  )
}

export function addressToValues(address) {
  return {
    line1: addressValue(address, 'line1'),
    line2: addressValue(address, 'line2'),
    city: addressValue(address, 'city'),
    state: addressValue(address, 'state'),
    postal: addressValue(address, 'postal'),
    country: addressValue(address, 'country'),
  }
}

export function normalizeAddress(values) {
  return {
    line1: addressValue(values, 'line1'),
    line2: addressValue(values, 'line2'),
    city: addressValue(values, 'city'),
    state: addressValue(values, 'state'),
    postal: addressValue(values, 'postal'),
    country: addressValue(values, 'country'),
  }
}

export function formatAddress(address) {
  if (!address || typeof address !== 'object') return ''
  return [address.line1, address.line2, address.city, address.state, address.postal, address.country]
    .map((part) => String(part ?? '').trim())
    .filter(Boolean)
    .join(', ')
}

/** True when the user's email is verified by the API, or by the dev fallback. */
export function isEmailVerified(user) {
  if (!user) return false
  if (user.email_verified_at) return true
  return isLocallyVerified(user)
}

export function isLocallyVerified(user) {
  if (!import.meta.env.DEV || !user?.id) return false
  const entry = readStore().verified[user.id]
  if (!entry) return false
  return !user.email || entry.email === user.email
}

/** Creates a dev-only challenge and returns the token embedded in the email link. */
export function createLocalChallenge(user) {
  const store = readStore()
  const random =
    typeof globalThis.crypto?.randomUUID === 'function'
      ? globalThis.crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(16).slice(2)}`
  const token = `dev_${random}`

  const now = Date.now()
  for (const [userId, challenge] of Object.entries(store.challenges)) {
    if (now - Number(challenge?.issuedAt ?? 0) > DAY_MS) delete store.challenges[userId]
  }

  store.challenges[user.id] = { token, email: user.email, issuedAt: now }
  writeStore(store)
  return token
}

/** Consumes a dev-only challenge so the same link cannot be reused. */
export function consumeLocalChallenge(token) {
  if (!token) return { status: 'invalid' }
  const store = readStore()
  const match = Object.entries(store.challenges).find(([, challenge]) => challenge?.token === token)

  if (!match) return { status: 'invalid' }

  const [userId, challenge] = match
  if (Date.now() - Number(challenge.issuedAt ?? 0) > DAY_MS) {
    delete store.challenges[userId]
    writeStore(store)
    return { status: 'expired' }
  }

  store.verified[userId] = { email: challenge.email, verifiedAt: Date.now() }
  delete store.challenges[userId]
  writeStore(store)
  return { status: 'valid', userId, email: challenge.email }
}

export function clearLocalOnboarding() {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.removeItem(LOCAL_ONBOARDING_KEY)
  } catch {
    // ignore
  }
}

function stepState(source, { user, tenant, setupStatus }) {
  if (source === 'profile') {
    return { complete: isEmailVerified(user), known: Boolean(user) }
  }
  if (source === 'tenant') {
    return { complete: hasPhysicalAddress(tenant?.physical_address), known: Boolean(tenant) }
  }
  const ready = setupStatus === 'ready'
  return { complete: false, known: ready, ready }
}

/**
 * Merges live data into the step definitions. `known` is false while the data a
 * step depends on is still loading or failed, so the UI can say "checking"
 * instead of wrongly reporting a step as incomplete.
 */
export function buildOnboardingSteps({
  user,
  tenant,
  usage,
  emailAccounts,
  setupStatus = 'ready',
}) {
  const accounts = Array.isArray(emailAccounts) ? emailAccounts : []

  return SETUP_STEPS.map((step) => {
    const state = stepState(step.source, { user, tenant, setupStatus })

    if (step.source === 'setup') {
      const complete =
        step.id === 'connect-mailbox'
          ? accounts.length > 0
          : step.id === 'import-contacts'
            ? Number(usage?.contacts ?? 0) > 0
            : Number(usage?.campaigns ?? 0) > 0
      return { ...step, complete, known: state.known }
    }

    return { ...step, complete: state.complete, known: state.known }
  })
}

/** Roll-up used by both the checklist and the sidebar widget. */
export function summarizeOnboarding(steps) {
  const completed = steps.filter((step) => step.complete).length
  const allKnown = steps.every((step) => step.known)
  const verify = steps.find((step) => step.id === 'verify-email')
  const address = steps.find((step) => step.id === 'mailing-address')

  return {
    completed,
    total: steps.length,
    allKnown,
    readyToImport: Boolean(verify?.known && verify?.complete && address?.known && address?.complete),
    readyToSend: allKnown && completed === steps.length,
    nextStep: steps.find((step) => step.known && !step.complete) ?? null,
  }
}

/**
 * Loads the usage counters and connected mailboxes that drive the sending
 * steps. Profile and tenant data come from the session provider.
 */
export function useSetupData() {
  const { session } = useSession()
  const tenantId = session?.tenant?.id

  const [state, setState] = useState({
    status: tenantId ? 'loading' : 'idle',
    usage: null,
    emailAccounts: [],
    error: null,
  })
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    if (!tenantId || !session?.accessToken) {
      setState({ status: 'idle', usage: null, emailAccounts: [], error: null })
      return undefined
    }

    const controller = new AbortController()
    setState((current) => ({ ...current, status: 'loading', error: null }))

    Promise.allSettled([
      api.get('/tenants/current/usage', { signal: controller.signal }),
      api.get('/email-accounts', { signal: controller.signal }),
    ]).then(([usageResult, accountsResult]) => {
      if (controller.signal.aborted) return

      const usage = usageResult.status === 'fulfilled' ? usageResult.value : null
      const accounts =
        accountsResult.status === 'fulfilled'
          ? Array.isArray(accountsResult.value)
            ? accountsResult.value
            : accountsResult.value?.items ?? []
          : []

      const ok = usageResult.status === 'fulfilled' && accountsResult.status === 'fulfilled'

      setState({
        status: ok ? 'ready' : 'error',
        usage,
        emailAccounts: accounts,
        error: ok ? null : 'We could not load all of your setup progress just now.',
      })
    })

    return () => controller.abort()
  }, [tenantId, session?.accessToken, attempt])

  const refresh = useCallback(() => setAttempt((current) => current + 1), [])

  return { ...state, refresh }
}
