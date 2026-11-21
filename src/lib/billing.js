import { api } from './api'

/**
 * Billing/usage adapter for T40 (§5.10).
 *
 * Live endpoints in this API build:
 * - `GET /tenants/current/usage` → UsageRead: current counts (contacts,
 *   companies, campaigns, active_campaigns, messages_sent, replies, seats,
 *   daily_send_cap). Counts only — no limits and no AI quota.
 * - `GET /billing/plans` → PlanRead[]: `code`, `name`, `stripe_price_id`,
 *   `limits` (`contacts`, `sending_inboxes`, `daily_send_cap`), `active`.
 *   Prices are not exposed (`stripe_price_id` is null in this build).
 * - `GET /billing/subscription` → SubscriptionRead: the tenant's plan code,
 *   status, period dates, `cancel_at_period_end`, seats, trial end, and
 *   the provider-backed grace-period end after a failed payment.
 * - `POST /billing/checkout` → CheckoutResponse `{ checkout_url, session_id }`.
 *   Without a configured Stripe key or plan price the API answers 503; the
 *   page surfaces that instead of a fake upgrade link.
 * - `POST /billing/plan-change` enforces the target plan's configured usage
 *   limits before changing the provider subscription.
 * - `GET /billing/invoices` lists provider invoices for the tenant's customer
 *   (owner/admin only), with cursor pagination.
 * - `POST /billing/portal` → BillingPortalResponse `{ url }`. Without a
 *   billing account the API answers 400; same treatment.
 */

export const SUBSCRIPTION_STATUS_META = {
  trialing: {
    label: 'Trialing',
    tone: 'warning',
    detail: 'The trial is active and the workspace is fully usable until the trial ends.',
  },
  active: {
    label: 'Active',
    tone: 'success',
    detail: 'The plan is current and renews automatically.',
  },
  canceled: {
    label: 'Canceled',
    tone: 'neutral',
    detail: 'The plan stays available until the period ends, then features are reduced.',
  },
  unpaid: {
    label: 'Unpaid',
    tone: 'danger',
    detail: 'There is an unpaid invoice on this workspace. Settle it to restore the plan.',
  },
  incomplete: {
    label: 'Incomplete',
    tone: 'warning',
    detail: 'The last checkout was not completed. Finish checkout to activate the plan.',
  },
}

export function isDowngradePlan(target, current) {
  if (!target || !current) return false
  return Object.entries(target.limits ?? {}).some(([key, targetLimit]) => {
    const currentLimit = current.limits?.[key]
    return (
      targetLimit != null &&
      currentLimit != null &&
      Number(targetLimit) < Number(currentLimit)
    )
  })
}

export function planDowngradeBlockers(plan, { usage, inboxCount, seats } = {}) {
  const measurements = [
    { key: 'contacts', label: 'contacts', used: usage?.contacts },
    { key: 'sendingInboxes', label: 'connected inboxes', used: inboxCount },
    { key: 'dailySendCap', label: 'daily send cap', used: usage?.dailySendCap },
    { key: 'seats', label: 'seats', used: seats },
  ]

  return measurements.flatMap(({ key, label, used }) => {
    const rawLimit = plan?.limits?.[key]
    if (rawLimit == null) return []
    const limit = Number(rawLimit)
    const count = Number(used ?? 0)
    return Number.isFinite(limit) && count > limit
      ? [{ key, label, used: count, limit }]
      : []
  })
}

export function subscriptionStatusMeta(status) {
  const subscription = status && typeof status === 'object' ? status : { status }
  const state = subscription.status
  if (state === 'past_due') {
    const graceEnd = subscription.gracePeriodEndsAt
      ? new Date(subscription.gracePeriodEndsAt)
      : null
    if (graceEnd && !Number.isNaN(graceEnd.getTime()) && graceEnd.getTime() > Date.now()) {
      return {
        label: 'Grace period',
        tone: 'warning',
        detail: `Payment is past due. Sending continues until ${new Intl.DateTimeFormat(undefined, {
          dateStyle: 'medium',
        }).format(graceEnd)} while the payment issue is resolved.`,
      }
    }

    return {
      label: 'Past due',
      tone: 'danger',
      detail: 'The payment grace period has ended. Campaign sending is paused until payment is restored.',
    }
  }

  return (
    SUBSCRIPTION_STATUS_META[state] ?? {
      label: state ? String(state).replace(/_/g, ' ') : 'Unknown',
      tone: 'outline',
      detail: 'The subscription state is not recognized; check the billing provider.',
    }
  )
}

/** Plan tier order used to pick the upgrade target. */
const PLAN_TIER_ORDER = ['trial', 'starter', 'growth', 'scale']

export function normalizePlan(raw) {
  const limits = raw?.limits ?? {}
  return {
    code: raw?.code ?? '',
    name: raw?.name ?? raw?.code ?? 'Unknown plan',
    stripePriceId: raw?.stripe_price_id ?? null,
    limits: {
      contacts: limits.contacts == null ? null : Number(limits.contacts),
      sendingInboxes: limits.sending_inboxes == null ? null : Number(limits.sending_inboxes),
      dailySendCap: limits.daily_send_cap == null ? null : Number(limits.daily_send_cap),
      seats: limits.seats == null ? null : Number(limits.seats),
    },
    active: Boolean(raw?.active ?? true),
  }
}

export function normalizeSubscription(raw) {
  return {
    id: String(raw?.id ?? ''),
    planCode: raw?.plan_code ?? '',
    status: raw?.status ?? '',
    currentPeriodStart: raw?.current_period_start ?? null,
    currentPeriodEnd: raw?.current_period_end ?? null,
    cancelAtPeriodEnd: Boolean(raw?.cancel_at_period_end),
    seats: Number(raw?.seats ?? 0),
    trialEndsAt: raw?.trial_ends_at ?? null,
    gracePeriodEndsAt: raw?.grace_period_ends_at ?? null,
  }
}

export function normalizeUsage(raw) {
  return {
    contacts: Number(raw?.contacts ?? 0),
    companies: Number(raw?.companies ?? 0),
    campaigns: Number(raw?.campaigns ?? 0),
    activeCampaigns: Number(raw?.active_campaigns ?? 0),
    messagesSent: Number(raw?.messages_sent ?? 0),
    replies: Number(raw?.replies ?? 0),
    seats: Number(raw?.seats ?? 0),
    dailySendCap: Number(raw?.daily_send_cap ?? 0),
  }
}

export async function fetchUsage(signal) {
  return normalizeUsage(await api.get('/tenants/current/usage', { signal }))
}

export async function fetchPlans(signal) {
  const data = await api.get('/billing/plans', { signal })
  return (Array.isArray(data) ? data : []).map(normalizePlan)
}

export async function fetchSubscription(signal) {
  return normalizeSubscription(await api.get('/billing/subscription', { signal }))
}

export async function fetchInvoices({ limit = 10, startingAfter } = {}, signal) {
  const params = new URLSearchParams({ limit: String(limit) })
  if (startingAfter) params.set('starting_after', startingAfter)
  const data = await api.get(`/billing/invoices?${params.toString()}`, { signal })
  return {
    items: Array.isArray(data?.items)
      ? data.items.map((raw) => ({
          id: String(raw?.id ?? ''),
          number: raw?.number ?? null,
          status: raw?.status ?? null,
          amountDue: Number(raw?.amount_due ?? 0),
          amountPaid: Number(raw?.amount_paid ?? 0),
          currency: String(raw?.currency ?? 'USD').toUpperCase(),
          createdAt: raw?.created_at ?? null,
          dueAt: raw?.due_at ?? null,
          hostedInvoiceUrl: raw?.hosted_invoice_url ?? null,
          invoicePdf: raw?.invoice_pdf ?? null,
        }))
      : [],
    hasMore: Boolean(data?.has_more),
    nextCursor: data?.next_cursor ?? null,
  }
}

export function findPlan(plans, code) {
  return plans.find((plan) => plan.code === code) ?? null
}

/** The smallest active plan above the current one in tier order, or null. */
export function nextPlan(plans, currentCode) {
  const tier = PLAN_TIER_ORDER.indexOf(currentCode)
  const sorted = [...plans]
    .filter((plan) => plan.active)
    .sort(
      (a, b) =>
        PLAN_TIER_ORDER.indexOf(a.code) - PLAN_TIER_ORDER.indexOf(b.code) ||
          (a.limits.contacts ?? Number.POSITIVE_INFINITY) -
            (b.limits.contacts ?? Number.POSITIVE_INFINITY),
    )
  return sorted.find((plan) => PLAN_TIER_ORDER.indexOf(plan.code) > tier) ?? null
}

/** Display order: trial → starter → growth → scale (the API sorts by code). */
export function sortPlansByTier(plans) {
  return [...plans].sort(
    (a, b) =>
      PLAN_TIER_ORDER.indexOf(a.code) - PLAN_TIER_ORDER.indexOf(b.code) ||
      (a.limits.contacts ?? Number.POSITIVE_INFINITY) -
        (b.limits.contacts ?? Number.POSITIVE_INFINITY),
  )
}

/**
 * Capped meters: usage × the current plan's limits. `UsageRead` counts
 * workspace state; `PlanRead.limits` caps contacts, sending inboxes, and the
 * daily send cap. Inbox usage comes from the live `/email-accounts` list.
 */
export function buildUsageMeters({ usage, plan, inboxCount }) {
  const limits = plan?.limits ?? { contacts: null, sendingInboxes: null, dailySendCap: null }
  return [
    {
      key: 'contacts',
      label: 'Contacts',
      unit: 'contacts',
      used: usage?.contacts ?? 0,
      limit: limits.contacts,
      description: 'Contact imports and list growth stop at this plan limit.',
    },
    {
      key: 'inboxes',
      label: 'Connected inboxes',
      unit: 'mailboxes',
      used: inboxCount ?? 0,
      limit: limits.sendingInboxes,
      description: 'New mailbox connections stop at this plan limit.',
    },
    {
      key: 'daily_send_cap',
      label: 'Daily send cap',
      unit: 'messages/day',
      used: usage?.dailySendCap ?? 0,
      limit: limits.dailySendCap,
      description: 'Sum of the workspace inbox daily caps versus the plan maximum.',
    },
  ]
}

/**
 * Usage fields the current plan does not cap (no matching PlanRead.limits
 * entry). Shown as counts only — no invented limits.
 */
export function buildOpenUsage({ usage, seats }) {
  return [
    { key: 'companies', label: 'Companies', value: usage?.companies ?? 0 },
    { key: 'campaigns', label: 'Campaigns', value: usage?.campaigns ?? 0 },
    { key: 'active_campaigns', label: 'Active campaigns', value: usage?.activeCampaigns ?? 0 },
    { key: 'messages_sent', label: 'Messages sent', value: usage?.messagesSent ?? 0 },
    { key: 'replies', label: 'Replies', value: usage?.replies ?? 0 },
    { key: 'seats', label: 'Seats in use', value: seats ?? usage?.seats ?? 0 },
  ]
}

export function usageState(used, limit) {
  const hasLimit = limit != null && Number.isFinite(Number(limit))
  const safeLimit = hasLimit ? Math.max(0, Number(limit)) : 0
  const percent = safeLimit
    ? Math.min(100, Math.round((used / safeLimit) * 100))
    : hasLimit && used >= safeLimit
      ? 100
      : 0

  if (hasLimit && used >= safeLimit) {
    return {
      tone: 'danger',
      label: 'At limit',
      banner: 'Blocked',
      percent,
      action:
        'This limit is reached — the next import, connection, or send is refused until usage drops or the plan changes.',
    }
  }

  if (hasLimit && percent >= 80) {
    return {
      tone: 'warning',
      label: '80% warning',
      banner: 'Warning',
      percent,
      action: 'Usage is past 80% of the plan limit. The next steps could be blocked soon.',
    }
  }

  return {
    tone: 'success',
    label: 'Healthy',
    banner: 'Healthy',
    percent,
    action: 'Usage is within the current plan.',
  }
}

/** POST /billing/checkout — returns `{ checkoutUrl, sessionId }` or throws ApiError. */
export async function startCheckout(planCode) {
  const raw = await api.post('/billing/checkout', { plan_code: planCode })
  return {
    checkoutUrl: raw?.checkout_url ?? null,
    sessionId: raw?.session_id ?? null,
  }
}

export async function changePlan(planCode) {
  return normalizeSubscription(
    await api.post('/billing/plan-change', { plan_code: planCode }),
  )
}

/** POST /billing/portal — returns `{ url }` or throws ApiError. */
export async function openPortal() {
  const raw = await api.post('/billing/portal')
  return { url: raw?.url ?? null }
}
