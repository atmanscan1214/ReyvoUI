import { useCallback, useEffect, useState } from 'react'
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle,
  Info,
  Refresh,
  Shield,
} from '../../../components/icons'
import { Badge, Button, ErrorPanel, PageHeader, Skeleton, useToast } from '../../../components/ui'
import {
  buildOpenUsage,
  buildUsageMeters,
  changePlan,
  fetchInvoices,
  fetchPlans,
  fetchSubscription,
  fetchUsage,
  findPlan,
  isDowngradePlan,
  nextPlan,
  openPortal,
  planDowngradeBlockers,
  sortPlansByTier,
  startCheckout,
  subscriptionStatusMeta,
  usageState,
} from '../../../lib/billing'
import { listEmailAccounts } from '../../../lib/emailAccounts'
import './billing.css'

function formatDate(value) {
  if (!value) return 'Not set'
  try {
    return new Intl.DateTimeFormat(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    }).format(new Date(value))
  } catch {
    return 'Not set'
  }
}

function formatCurrency(minorAmount, currency) {
  try {
    const formatter = new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency,
    })
    const divisor = 10 ** formatter.resolvedOptions().maximumFractionDigits
    return formatter.format(Number(minorAmount ?? 0) / divisor)
  } catch {
    return `${Number(minorAmount ?? 0).toLocaleString()} ${currency}`
  }
}

function invoiceStatusTone(status) {
  if (status === 'paid') return 'success'
  if (status === 'open' || status === 'draft') return 'warning'
  if (status === 'uncollectible') return 'danger'
  return 'neutral'
}

/**
 * Billing and quota (T40, §5.10). Every number comes from the live
 * `GET /tenants/current/usage` against the current plan's limits from
 * `GET /billing/plans` + `GET /billing/subscription`; inbox usage counts the
 * live `/email-accounts` list. Checkout, plan changes, invoices, and portal
 * use provider-backed API endpoints; provider errors are shown as returned.
 */
export function BillingPage() {
  const { toast } = useToast()
  const [data, setData] = useState(null)
  const [status, setStatus] = useState('loading')
  const [error, setError] = useState(null)
  const [refreshing, setRefreshing] = useState(false)
  const [actionError, setActionError] = useState(null)
  const [busyPlan, setBusyPlan] = useState(null)
  const [portalBusy, setPortalBusy] = useState(false)
  const [invoiceLoadingMore, setInvoiceLoadingMore] = useState(false)

  const load = useCallback((signal) => {
    setRefreshing(true)
    setError(null)
    const invoicesRequest = fetchInvoices({ limit: 10 }, signal)
      .then((invoices) => ({ invoices, invoiceError: null }))
      .catch((invoiceError) => {
        if (invoiceError?.name === 'AbortError') throw invoiceError
        return { invoices: null, invoiceError }
      })
    Promise.all([
      fetchUsage(signal),
      fetchPlans(signal),
      fetchSubscription(signal),
      listEmailAccounts(signal),
      invoicesRequest,
    ])
      .then(([usage, plans, subscription, accounts, invoiceResult]) => {
        setData({
          usage,
          plans,
          subscription,
          inboxCount: accounts.length,
          invoices: invoiceResult.invoices,
          invoiceError: invoiceResult.invoiceError,
        })
        setStatus('ready')
      })
      .catch((caught) => {
        if (caught?.name === 'AbortError') return
        setError(caught)
        setStatus('error')
      })
      .finally(() => setRefreshing(false))
  }, [])

  useEffect(() => {
    const controller = new AbortController()
    setStatus('loading')
    load(controller.signal)
    return () => controller.abort()
  }, [load])

  if (status === 'loading') {
    return (
      <div className="app-page billing-page">
        <PageHeader
          eyebrow="Account · Billing"
          title="Usage and quota"
          description="Usage against the current plan's limits, with warnings at 80% and 100%."
        />
        <div className="app-card">
          <Skeleton lines={6} />
        </div>
      </div>
    )
  }

  if (status === 'error') {
    return (
      <div className="app-page billing-page">
        <PageHeader
          eyebrow="Account · Billing"
          title="Usage and quota"
          description="Usage against the current plan's limits, with warnings at 80% and 100%."
        />
        <ErrorPanel
          title="Couldn't load usage and billing"
          description={error?.message || undefined}
          requestId={error?.requestId}
          onRetry={() => load()}
        />
      </div>
    )
  }

  const { usage, plans, subscription, inboxCount } = data
  const currentPlan = findPlan(plans, subscription.planCode)
  const upgradePlan = nextPlan(plans, subscription.planCode)
  const meters = buildUsageMeters({ usage, plan: currentPlan, inboxCount })
  const openUsage = buildOpenUsage({ usage })
  const states = new Map(meters.map((meter) => [meter.key, usageState(meter.used, meter.limit)]))
  const warnings = meters.filter((m) => states.get(m.key).tone === 'warning')
  const blocked = meters.filter((m) => states.get(m.key).tone === 'danger')
  const statusMeta = subscriptionStatusMeta(subscription)
  const hasActivePaidSubscription =
    subscription.status === 'active' && subscription.planCode !== 'trial'
  const paymentNeedsResolution = ['past_due', 'unpaid', 'incomplete'].includes(subscription.status)

  async function handlePlanSelect(plan) {
    setBusyPlan(plan.code)
    setActionError(null)
    try {
      if (hasActivePaidSubscription) {
        const downgrade = isDowngradePlan(plan, currentPlan)
        const blockers = planDowngradeBlockers(plan, {
          usage,
          inboxCount,
          seats: usage.seats,
        })
        if (downgrade && blockers.length > 0) {
          setActionError(
            `Downgrade blocked: ${blockers
              .map(({ used, label, limit }) => `${used} ${label} in use (limit ${limit})`)
              .join('; ')}.`,
          )
          return
        }
        await changePlan(plan.code)
        toast.success('Plan changed successfully.')
        load()
      } else {
        const result = await startCheckout(plan.code)
        if (result?.checkoutUrl) {
          window.open(result.checkoutUrl, '_blank', 'noopener')
          toast.success('Checkout opened in a new tab.')
        } else {
          toast.info('Checkout accepted but the provider returned no URL.')
        }
      }
    } catch (caught) {
      const blockers = Array.isArray(caught?.details?.blockers) ? caught.details.blockers : []
      const blockerSummary = blockers
        .map(({ resource, used, limit }) => `${used} ${resource.replace(/_/g, ' ')} in use (limit ${limit})`)
        .join('; ')
      setActionError(
        caught?.code === 'downgrade_blocked' && blockerSummary
          ? `Downgrade blocked: ${blockerSummary}.`
          : caught?.message || 'The plan change could not be completed.',
      )
    } finally {
      setBusyPlan(null)
    }
  }

  async function handleLoadMoreInvoices() {
    if (!data.invoices?.nextCursor || invoiceLoadingMore) return
    setInvoiceLoadingMore(true)
    try {
      const next = await fetchInvoices(
        { limit: 10, startingAfter: data.invoices.nextCursor },
      )
      setData((current) => ({
        ...current,
        invoices: {
          ...next,
          items: [...(current.invoices?.items ?? []), ...next.items],
        },
        invoiceError: null,
      }))
    } catch (caught) {
      setData((current) => ({ ...current, invoiceError: caught }))
    } finally {
      setInvoiceLoadingMore(false)
    }
  }

  async function handlePortal() {
    setPortalBusy(true)
    setActionError(null)
    try {
      const result = await openPortal()
      if (result?.url) {
        window.open(result.url, '_blank', 'noopener')
        toast.success('Customer portal opened in a new tab.')
      } else {
        toast.info('The portal accepted the request but returned no URL.')
      }
    } catch (caught) {
      setActionError(caught?.message || 'The customer portal is unavailable.')
    } finally {
      setPortalBusy(false)
    }
  }

  const upgradeLabel = upgradePlan ? `Upgrade to ${upgradePlan.name}` : 'Highest plan in this build'

  return (
    <div className="app-page billing-page">
      <PageHeader
        eyebrow="Account · Billing"
        title="Usage and quota"
        description="Usage against the current plan's limits, with warnings at 80% and 100%."
        actions={
          <Button
            variant="ghost"
            leadingIcon={Refresh}
            loading={refreshing}
            onClick={() => load()}
          >
            Refresh
          </Button>
        }
        meta={
          <>
            <Badge tone={blocked.length ? 'danger' : 'success'} dot>
              {blocked.length ? `${blocked.length} blocked` : 'No limits blocked'}
            </Badge>
            <Badge tone={warnings.length ? 'warning' : 'outline'} dot>
              {warnings.length ? `${warnings.length} at 80%+` : 'All within plan'}
            </Badge>
          </>
        }
      />

      <section className="app-card billing-page__section billing-page__plan-card" aria-labelledby="plan-overview">
        <div className="billing-page__section-head">
          <div>
            <p className="eyebrow">Subscription</p>
            <h2 id="plan-overview">Current plan</h2>
          </div>
          <Button variant="primary" leadingIcon={ArrowRight} loading={portalBusy} onClick={handlePortal}>
            Open customer portal
          </Button>
        </div>

        <div className="billing-page__plan-summary">
          <div className="billing-page__plan-main">
            <div>
              <p className="billing-page__label">Plan</p>
              <h3>{currentPlan?.name || subscription.planCode || 'Unknown plan'}</h3>
            </div>
            <Badge tone={statusMeta.tone} dot>
              {statusMeta.label}
            </Badge>
          </div>

          <div className="billing-page__plan-meta">
            <div>
              <span>Seats</span>
              <strong>{subscription.seats.toLocaleString()} seat{subscription.seats === 1 ? '' : 's'}</strong>
            </div>
            <div>
              <span>{subscription.status === 'trialing' ? 'Trial ends' : 'Current period ends'}</span>
              <strong>
                {formatDate(
                  subscription.status === 'trialing'
                    ? subscription.trialEndsAt
                    : subscription.currentPeriodEnd,
                )}
              </strong>
            </div>
            <div>
              <span>Renews</span>
              <strong>{subscription.cancelAtPeriodEnd ? 'Cancels at period end' : 'Automatic'}</strong>
            </div>
          </div>
        </div>

        <p className="billing-page__plan-detail">{statusMeta.detail}</p>

        {actionError ? (
          <p className="billing-page__api-error" role="alert">
            <AlertTriangle size={14} aria-hidden="true" />
            {actionError}
          </p>
        ) : null}
      </section>

      <div className="billing-page__alerts">
        {blocked.concat(warnings).length === 0 ? (
          <div className="billing-page__alert billing-page__alert--success">
            <div className="billing-page__alert-copy">
              <strong>Within plan</strong>
              <span>Every capped meter is below the 80% warning line.</span>
            </div>
          </div>
        ) : (
          blocked.concat(warnings).map((meter) => {
            const state = states.get(meter.key)

            return (
              <div key={meter.key} className={`billing-page__alert billing-page__alert--${state.tone}`}>
                <div className="billing-page__alert-copy">
                  <strong>{meter.label}</strong>
                  <span>
                    {state.label}:                     {meter.used.toLocaleString()} /{' '}
                    {meter.limit == null ? 'No cap' : meter.limit.toLocaleString()}{' '}
                    {meter.unit} ({state.percent}%). {state.action}
                  </span>
                </div>
                <button
                  type="button"
                  className="billing-page__upgrade-link"
                  disabled={!upgradePlan || busyPlan !== null}
                  onClick={() => handlePlanSelect(upgradePlan)}
                >
                  {busyPlan === upgradePlan?.code ? 'Starting checkout…' : upgradeLabel}
                  <ArrowRight size={14} />
                </button>
              </div>
            )
          })
        )}
      </div>

      <div className="billing-page__summary">
        <div className="app-card billing-page__stat">
          <span>Plan health</span>
          <strong>{blocked.length ? 'Action blocked' : 'Within allowance'}</strong>
        </div>
        <div className="app-card billing-page__stat billing-page__stat--warn">
          <span>Warnings</span>
          <strong>{warnings.length}</strong>
        </div>
        <div className="app-card billing-page__stat billing-page__stat--muted">
          <span>Blocked limits</span>
          <strong>{blocked.length}</strong>
        </div>
      </div>

      <section className="app-card billing-page__section" aria-labelledby="usage-meters">
        <div className="billing-page__section-head">
          <div>
            <p className="eyebrow">Quota details</p>
            <h2 id="usage-meters">Current workspace usage</h2>
          </div>
        </div>

        <div className="billing-page__grid">
          {meters.map((meter) => {
            const state = states.get(meter.key)

            return (
              <article key={meter.key} className="billing-page__card">
                <header className="billing-page__card-head">
                  <div>
                    <p className="billing-page__label">{meter.label}</p>
                    <h3>
                      {meter.used.toLocaleString()} /{' '}
                      {meter.limit == null ? 'No cap' : meter.limit.toLocaleString()} {meter.unit}
                    </h3>
                  </div>
                  <Badge tone={state.tone} dot>
                    {state.label}
                  </Badge>
                </header>

                <div
                  className="billing-page__meter"
                  role="img"
                  aria-label={`${meter.label}: ${state.percent}% of plan limit`}
                >
                  <span style={{ width: `${state.percent}%` }} />
                </div>

                <p className="billing-page__description">{meter.description}</p>

                <div className="billing-page__foot">
                  {state.tone === 'danger' ? (
                    <span className="billing-page__foot-status billing-page__foot-status--danger">
                      <AlertTriangle size={13} />
                      Blocked by this limit
                    </span>
                  ) : state.tone === 'warning' ? (
                    <span className="billing-page__foot-status billing-page__foot-status--warning">
                      <Shield size={13} />
                      Warning at 80%
                    </span>
                  ) : (
                    <span className="billing-page__foot-status billing-page__foot-status--success">
                      <CheckCircle size={13} />
                      Healthy range
                    </span>
                  )}

                  <span className="billing-page__foot-value">{state.percent}%</span>
                </div>
              </article>
            )
          })}
        </div>

        <div className="billing-page__open-usage">
          <p className="billing-page__label">Usage without a plan cap in this build</p>
          <div className="billing-page__open-grid">
            {openUsage.map((item) => (
              <div key={item.key} className="billing-page__open-item">
                <span>{item.label}</span>
                <strong>{item.value.toLocaleString()}</strong>
              </div>
            ))}
          </div>
        </div>

        <p className="billing-page__gap">
          <Info size={15} aria-hidden="true" />
          <span>
            Plan limits in this build cap contacts, sending inboxes, and the daily send cap only —
            UsageRead carries no message-volume meter and no AI quota, and plan prices are not
            exposed (Stripe prices are unset on the server). AI approval mode and quota in the
            campaign wizard stay browser-local.
          </span>
        </p>
      </section>

      <section className="app-card billing-page__section" aria-labelledby="plan-options">
        <div className="billing-page__section-head">
          <div>
            <p className="eyebrow">Plans</p>
            <h2 id="plan-options">Available plans</h2>
          </div>
        </div>

        <div className="billing-page__plan-options">
          {sortPlansByTier(plans).map((plan) => {
            const isCurrent = plan.code === subscription.planCode
            const downgrade = isDowngradePlan(plan, currentPlan)
            const downgradeBlockers = downgrade
              ? planDowngradeBlockers(plan, { usage, inboxCount, seats: usage.seats })
              : []

            return (
              <div
                key={plan.code}
                className={`billing-page__plan-option${isCurrent ? ' is-selected' : ''}`}
              >
                <div>
                  <p>{plan.name}</p>
                  <strong>
                    {plan.limits.contacts == null
                      ? 'No cap'
                      : plan.limits.contacts.toLocaleString()}
                    <span> contacts</span>
                  </strong>
                  <span>
                    {plan.limits.sendingInboxes == null
                      ? 'No inbox cap'
                      : `${plan.limits.sendingInboxes} inbox${plan.limits.sendingInboxes === 1 ? '' : 'es'}`}{' '}
                    ·{' '}
                    {plan.limits.dailySendCap == null
                      ? 'No daily send cap'
                      : `${plan.limits.dailySendCap.toLocaleString()} sends/day`}
                  </span>
                </div>
                <small>
                  {isCurrent
                    ? 'Current plan.'
                    : !plan.stripePriceId
                      ? 'No price configured on this server yet.'
                      : downgradeBlockers.length > 0
                        ? `Downgrade blocked: ${downgradeBlockers
                            .map(({ used, label, limit }) => `${used} ${label} (limit ${limit})`)
                            .join('; ')}.`
                        : hasActivePaidSubscription
                          ? 'Changes are applied through the billing provider.'
                          : paymentNeedsResolution
                            ? 'Resolve the payment issue in the customer portal before changing plans.'
                            : 'Continue through secure provider checkout.'}
                </small>
                {isCurrent ? (
                  <button type="button" className="btn btn--ghost" disabled>
                    Current plan
                  </button>
                ) : (
                  <Button
                    variant="ghost"
                    loading={busyPlan === plan.code}
                    disabled={
                      busyPlan !== null ||
                      !plan.stripePriceId ||
                      paymentNeedsResolution ||
                      (hasActivePaidSubscription && downgradeBlockers.length > 0)
                    }
                    onClick={() => handlePlanSelect(plan)}
                  >
                    {busyPlan === plan.code
                      ? hasActivePaidSubscription
                        ? 'Updating…'
                        : 'Starting checkout…'
                      : !plan.stripePriceId
                        ? 'Unavailable'
                        : paymentNeedsResolution
                          ? 'Resolve billing first'
                        : hasActivePaidSubscription
                          ? downgrade
                            ? 'Downgrade'
                            : 'Change plan'
                          : 'Choose plan'}
                  </Button>
                )}
              </div>
            )
          })}
        </div>

        <p className="billing-page__gap">
          <Info size={15} aria-hidden="true" />
          <span>
            Trial workspaces use the live <code>POST /billing/checkout</code>; active paid
            subscriptions use <code>POST /billing/plan-change</code>, which enforces configured
            usage limits before changing the Stripe subscription. Provider errors are surfaced;
            checkout is never simulated.
          </span>
        </p>
      </section>

      <section className="app-card billing-page__section" aria-labelledby="billing-history">
        <div className="billing-page__section-head">
          <div>
            <p className="eyebrow">History</p>
            <h2 id="billing-history">Billing history</h2>
          </div>
        </div>

        {data.invoiceError ? (
          <p className="billing-page__api-error" role="alert">
            <AlertTriangle size={14} aria-hidden="true" />
            {data.invoiceError.message || 'Invoice history is unavailable.'}
          </p>
        ) : data.invoices?.items.length ? (
          <>
            <div className="billing-page__invoice-list">
              {data.invoices.items.map((invoice) => {
                const amount =
                  invoice.status === 'paid' ? invoice.amountPaid : invoice.amountDue
                const invoiceLink = invoice.hostedInvoiceUrl || invoice.invoicePdf

                return (
                  <article key={invoice.id} className="billing-page__invoice-row">
                    <div>
                      <strong>{invoice.number || invoice.id}</strong>
                      <span>{formatDate(invoice.createdAt)}</span>
                      {invoice.dueAt ? <span>Due {formatDate(invoice.dueAt)}</span> : null}
                    </div>
                    <strong>{formatCurrency(amount, invoice.currency)}</strong>
                    <Badge tone={invoiceStatusTone(invoice.status)} dot>
                      {invoice.status || 'Unknown'}
                    </Badge>
                    {invoiceLink ? (
                      <a
                        className="btn btn--ghost btn--sm"
                        href={invoiceLink}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        View invoice
                      </a>
                    ) : (
                      <span className="billing-page__gap">No provider link</span>
                    )}
                  </article>
                )
              })}
            </div>
            {data.invoices.hasMore ? (
              <Button
                variant="ghost"
                loading={invoiceLoadingMore}
                onClick={handleLoadMoreInvoices}
              >
                Load more invoices
              </Button>
            ) : null}
          </>
        ) : (
          <p className="billing-page__gap">
            <Info size={15} aria-hidden="true" />
            <span>No invoices have been returned for this billing account yet.</span>
          </p>
        )}
      </section>
    </div>
  )
}
