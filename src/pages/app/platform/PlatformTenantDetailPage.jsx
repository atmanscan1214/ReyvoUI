import { useCallback, useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  Badge,
  Button,
  ConfirmDialog,
  Modal,
  PageHeader,
  Skeleton,
  useToast,
} from '../../../components/ui'
import { TextField } from '../../../components/Field'
import {
  AlertTriangle,
  CheckCircle,
  Clock,
  CreditCard,
  Lock,
  Refresh,
  Shield,
  Trash,
  Users,
} from '../../../components/icons'
import {
  PLAN_OPTIONS,
  applyCredit,
  changePlan,
  daysUntil,
  deleteTenant,
  extendTrial,
  forceTenantLogout,
  formatDate,
  formatDateTime,
  formatMoney,
  formatNumber,
  getTenantProfile,
  grantSupportAccess,
  planLabel,
  resetTenantMfa,
  revokeSupportAccess,
  riskMeta,
  suspendTenant,
  tenantStatusMeta,
} from '../../../lib/platformAdmin'
import { usePageTitle } from '../../../lib/usePageTitle'
import './platform.css'

const GRANT_HOURS = [
  { value: '1', label: '1 hour' },
  { value: '2', label: '2 hours' },
  { value: '4', label: '4 hours' },
  { value: '8', label: '8 hours' },
  { value: '24', label: '24 hours' },
  { value: '72', label: '3 days' },
  { value: '168', label: '7 days' },
]

function UsageCard({ label, value, hint }) {
  return (
    <div className="platform-usage__item">
      <span>{label}</span>
      <strong>{formatNumber(value)}</strong>
      {hint ? <small>{hint}</small> : null}
    </div>
  )
}

export function PlatformTenantDetailPage() {
  const { tenantId } = useParams()
  const navigate = useNavigate()
  const { toast } = useToast()
  usePageTitle('Tenant profile')

  const [profile, setProfile] = useState(null)
  const [loadState, setLoadState] = useState('loading')
  const [error, setError] = useState(null)
  const [refreshKey, setRefreshKey] = useState(0)

  const [dialog, setDialog] = useState(null)
  const [dialogError, setDialogError] = useState(null)
  const [busy, setBusy] = useState(false)

  const [suspendReason, setSuspendReason] = useState('')
  const [creditAmount, setCreditAmount] = useState('')
  const [creditReason, setCreditReason] = useState('')
  const [planCode, setPlanCode] = useState('')
  const [deleteName, setDeleteName] = useState('')

  const [grantReason, setGrantReason] = useState('')
  const [grantHours, setGrantHours] = useState('24')
  const [grantBusy, setGrantBusy] = useState(false)
  const [grantError, setGrantError] = useState(null)
  const [revokingId, setRevokingId] = useState(null)

  const load = useCallback(
    (signal) => {
      setLoadState('loading')
      setError(null)
      return getTenantProfile(tenantId, signal)
        .then((data) => {
          setProfile(data)
          setPlanCode(data.plan_code ?? '')
          setLoadState('ready')
        })
        .catch((caught) => {
          if (caught?.name === 'AbortError') return
          setError(caught)
          setLoadState(caught?.status === 403 ? 'denied' : caught?.status === 404 ? 'missing' : 'error')
        })
    },
    [tenantId],
  )

  useEffect(() => {
    const controller = new AbortController()
    load(controller.signal)
    return () => controller.abort()
  }, [load, refreshKey])

  function openDialog(kind) {
    setDialog({ kind })
    setDialogError(null)
    setSuspendReason('')
    setCreditAmount('')
    setCreditReason('')
    setDeleteName('')
  }

  function closeDialog() {
    if (busy) return
    setDialog(null)
    setDialogError(null)
  }

  async function runAction(action, successMessage) {
    setBusy(true)
    setDialogError(null)
    try {
      await action()
      setDialog(null)
      setRefreshKey((key) => key + 1)
      if (successMessage) toast.success(successMessage)
    } catch (caught) {
      setDialogError(caught?.message || 'The API rejected this change. Nothing was applied.')
    } finally {
      setBusy(false)
    }
  }

  async function handleSuspend() {
    const suspending = profile.status !== 'suspended'
    if (suspending && suspendReason.trim().length < 5) {
      setDialogError('Add a reason of at least 5 characters so the audit log explains the suspension.')
      return
    }
    await runAction(
      () => suspendTenant(tenantId, { suspend: suspending, reason: suspendReason }),
      suspending ? 'Tenant suspended.' : 'Tenant reactivated.',
    )
  }

  async function handleCredit() {
    const dollars = Number(creditAmount)
    if (!Number.isFinite(dollars) || dollars <= 0) {
      setDialogError('Enter a credit amount greater than zero.')
      return
    }
    if (creditReason.trim().length < 5) {
      setDialogError('Add a reason of at least 5 characters for the credit ledger.')
      return
    }
    await runAction(
      () => applyCredit(tenantId, Math.round(dollars * 100), creditReason),
      'Credit applied to the workspace.',
    )
  }

  async function handlePlanChange() {
    if (!planCode || planCode === profile.plan_code) {
      setDialogError('Choose a different plan to apply.')
      return
    }
    await runAction(() => changePlan(tenantId, planCode), `Plan changed to ${planLabel(planCode)}.`)
  }

  async function handleGrant() {
    if (grantReason.trim().length < 5) {
      setGrantError('Describe why support access is needed (at least 5 characters).')
      return
    }
    setGrantBusy(true)
    setGrantError(null)
    try {
      await grantSupportAccess(tenantId, { reason: grantReason, hours: Number(grantHours) })
      setGrantReason('')
      setGrantHours('24')
      setRefreshKey((key) => key + 1)
      toast.success('Time-boxed support access granted.')
    } catch (caught) {
      setGrantError(caught?.message || 'The support grant could not be created.')
    } finally {
      setGrantBusy(false)
    }
  }

  async function handleRevoke(grantId) {
    setRevokingId(grantId)
    try {
      await revokeSupportAccess(grantId)
      setRefreshKey((key) => key + 1)
      toast.success('Support access revoked.')
    } catch (caught) {
      toast.error(caught?.message || 'The support grant could not be revoked.')
    } finally {
      setRevokingId(null)
    }
  }

  if (loadState === 'loading' && !profile) {
    return (
      <div className="app-page platform-page">
        <Skeleton width="40%" height={30} />
        <div className="platform-detail">
          <div className="app-card platform-panel">
            <Skeleton width="55%" height={20} />
            <Skeleton width="100%" height={14} />
            <Skeleton width="90%" height={14} />
            <Skeleton width="70%" height={14} />
          </div>
          <div className="app-card platform-panel">
            <Skeleton width="60%" height={20} />
            <Skeleton width="100%" height={14} />
            <Skeleton width="80%" height={14} />
          </div>
        </div>
      </div>
    )
  }

  if (loadState === 'denied' || loadState === 'missing' || loadState === 'error') {
    return (
      <div className="app-page platform-page">
        <PageHeader
          eyebrow="Platform · Tenants"
          title={loadState === 'missing' ? 'Tenant not found' : 'Tenant profile unavailable'}
          backTo="/app/platform"
          backLabel="All tenants"
        />
        <section className="app-card platform-denied">
          {loadState === 'denied' ? <Lock size={24} aria-hidden="true" /> : <AlertTriangle size={24} aria-hidden="true" />}
          <h2>
            {loadState === 'denied'
              ? 'Platform staff only'
              : loadState === 'missing'
                ? 'That tenant no longer exists'
                : 'We could not load this tenant'}
          </h2>
          <p>
            {error?.message ||
              (loadState === 'missing'
                ? 'It may have been deleted. Return to the tenant list to find the workspace.'
                : 'Refresh and try again. The API may be temporarily unavailable.')}
          </p>
          <div className="platform-denied__actions">
            <Button variant="ghost" leadingIcon={Refresh} onClick={() => setRefreshKey((key) => key + 1)}>
              Try again
            </Button>
            <Button variant="quiet" onClick={() => navigate('/app/platform')}>
              All tenants
            </Button>
          </div>
        </section>
      </div>
    )
  }

  if (!profile) return null

  const statusMeta = tenantStatusMeta(profile.status)
  const risk = riskMeta(profile.abuse?.risk)
  const suspended = profile.status === 'suspended' || Boolean(profile.suspended_at)
  const trialDays = daysUntil(profile.trial_ends_at)
  const activeGrants = (profile.support_access ?? []).filter(
    (grant) => !grant.revoked_at && new Date(grant.expires_at).getTime() > Date.now(),
  )
  const inactiveGrants = (profile.support_access ?? []).filter(
    (grant) => grant.revoked_at || new Date(grant.expires_at).getTime() <= Date.now(),
  )

  return (
    <div className="app-page platform-page">
      <PageHeader
        eyebrow="Platform · Tenant profile"
        title={profile.name}
        description={`${profile.slug} · created ${formatDate(profile.created_at)} · ${profile.timezone}`}
        backTo="/app/platform"
        backLabel="All tenants"
        meta={
          <>
            <Badge tone={statusMeta.tone} dot>
              {statusMeta.label}
            </Badge>
            <Badge tone="neutral">{planLabel(profile.plan_code)}</Badge>
            <Badge tone="success">{formatMoney(profile.mrr_cents)} MRR</Badge>
            <Badge tone={risk.tone} dot>
              {risk.label}
            </Badge>
            {activeGrants.length ? (
              <Badge tone="warning" dot>
                {activeGrants.length} support grant{activeGrants.length === 1 ? '' : 's'}
              </Badge>
            ) : null}
          </>
        }
        actions={
          <>
            <Button
              variant="ghost"
              leadingIcon={Refresh}
              onClick={() => setRefreshKey((key) => key + 1)}
              loading={loadState === 'loading'}
            >
              Refresh
            </Button>
            <Button
              variant={suspended ? 'primary' : 'outline'}
              leadingIcon={suspended ? CheckCircle : Lock}
              onClick={() => openDialog('suspend')}
            >
              {suspended ? 'Reactivate' : 'Suspend'}
            </Button>
          </>
        }
      />

      {suspended ? (
        <div className="platform-banner" role="status">
          <Lock size={18} aria-hidden="true" />
          <div>
            <strong>This workspace is suspended.</strong>
            <span>
              {profile.suspension_reason || 'No reason recorded.'}
              {profile.suspended_at ? ` · ${formatDateTime(profile.suspended_at)}` : ''}
            </span>
          </div>
          <Button variant="outline" leadingIcon={CheckCircle} onClick={() => openDialog('suspend')}>
            Reactivate
          </Button>
        </div>
      ) : null}

      <div className="platform-detail">
        <div className="platform-detail__main">
          <section className="app-card platform-panel" aria-labelledby="tenant-account">
            <header className="platform-panel__head">
              <div>
                <p className="eyebrow">Account</p>
                <h2 id="tenant-account">Workspace profile</h2>
              </div>
              <Badge tone={statusMeta.tone} dot>
                {statusMeta.label}
              </Badge>
            </header>

            <dl className="platform-facts">
              <div>
                <dt>Owner</dt>
                <dd>
                  {profile.owner ? (
                    <>
                      <strong>{profile.owner.full_name}</strong>
                      <span>{profile.owner.email}</span>
                    </>
                  ) : (
                    <span className="platform-muted">No active owner</span>
                  )}
                </dd>
              </div>
              <div>
                <dt>Slug</dt>
                <dd>{profile.slug}</dd>
              </div>
              <div>
                <dt>Plan</dt>
                <dd>{planLabel(profile.plan_code)}</dd>
              </div>
              <div>
                <dt>Subscription</dt>
                <dd>{profile.subscription_status || 'No subscription record'}</dd>
              </div>
              <div>
                <dt>Trial ends</dt>
                <dd>
                  {formatDate(profile.trial_ends_at)}
                  {trialDays !== null ? (
                    <span className="platform-muted">
                      {' '}
                      · {trialDays < 0 ? `${Math.abs(trialDays)} days ago` : `${trialDays} days left`}
                    </span>
                  ) : null}
                </dd>
              </div>
              <div>
                <dt>Current period ends</dt>
                <dd>{formatDate(profile.current_period_end)}</dd>
              </div>
              <div>
                <dt>Credit balance</dt>
                <dd>{formatMoney(profile.credit_balance_cents)}</dd>
              </div>
              <div>
                <dt>Timezone</dt>
                <dd>{profile.timezone}</dd>
              </div>
            </dl>
          </section>

          <section className="app-card platform-panel" aria-labelledby="tenant-usage">
            <header className="platform-panel__head">
              <div>
                <p className="eyebrow">Usage</p>
                <h2 id="tenant-usage">Workspace activity</h2>
              </div>
              <Users size={18} aria-hidden="true" />
            </header>
            <div className="platform-usage">
              <UsageCard label="Contacts" value={profile.usage.contacts} />
              <UsageCard label="Companies" value={profile.usage.companies} />
              <UsageCard
                label="Campaigns"
                value={profile.usage.campaigns}
                hint={`${formatNumber(profile.usage.active_campaigns)} active`}
              />
              <UsageCard label="Messages sent" value={profile.usage.messages_sent} />
              <UsageCard label="Replies" value={profile.usage.replies} />
              <UsageCard
                label="Seats"
                value={profile.usage.seats}
                hint="active members"
              />
              <UsageCard
                label="Inboxes"
                value={profile.usage.inboxes}
                hint={`${formatNumber(profile.usage.connected_inboxes)} connected`}
              />
              <UsageCard label="MRR" value={profile.mrr_cents / 100} hint="USD / month" />
            </div>
          </section>

          <section className="app-card platform-panel" aria-labelledby="tenant-abuse">
            <header className="platform-panel__head">
              <div>
                <p className="eyebrow">Deliverability</p>
                <h2 id="tenant-abuse">Abuse signals</h2>
              </div>
              <Badge tone={risk.tone} dot>
                {risk.label}
              </Badge>
            </header>

            <div className="platform-abuse">
              <div>
                <span>Bounce rate</span>
                <strong>{Number(profile.abuse.bounce_rate ?? 0).toFixed(1)}%</strong>
                <small>hard bounces + complaints ÷ attempted sends</small>
              </div>
              <div>
                <span>Complaints</span>
                <strong>{formatNumber(profile.abuse.complaints)}</strong>
                <small>{formatNumber(profile.abuse.hard_bounces)} hard bounces</small>
              </div>
              <div>
                <span>Failed sends</span>
                <strong>{formatNumber(profile.abuse.failed_messages)}</strong>
                <small>{formatNumber(profile.abuse.sent_messages)} delivered</small>
              </div>
              <div>
                <span>Unsubscribes</span>
                <strong>{formatNumber(profile.abuse.unsubscribes)}</strong>
                <small>replies categorised as opt-out</small>
              </div>
            </div>

            {profile.abuse.risk !== 'low' ? (
              <div className="platform-note platform-note--warning">
                <AlertTriangle size={16} aria-hidden="true" />
                <span>
                  Review recent campaigns and inbox health before this workspace sends more mail.
                  Bounce and complaint thresholds are evaluated by the platform sender.
                </span>
              </div>
            ) : null}
          </section>

          <section className="app-card platform-panel" aria-labelledby="tenant-support">
            <header className="platform-panel__head">
              <div>
                <p className="eyebrow">Support</p>
                <h2 id="tenant-support">Time-boxed access</h2>
              </div>
              <Badge tone={activeGrants.length ? 'warning' : 'neutral'} dot>
                {activeGrants.length} active
              </Badge>
            </header>

            <p className="platform-panel__lead">
              Support access is visible to the workspace, requires a reason, and expires
              automatically. Revoke it as soon as the investigation is finished.
            </p>

            {activeGrants.length === 0 ? (
              <p className="platform-empty">No active support grants for this workspace.</p>
            ) : (
              <ul className="platform-grants">
                {activeGrants.map((grant) => (
                  <li key={grant.id} className="platform-grant">
                    <div className="platform-grant__main">
                      <strong>{grant.reason}</strong>
                      <span>
                        Granted {formatDateTime(grant.granted_at)} · expires{' '}
                        {formatDateTime(grant.expires_at)}
                      </span>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      leadingIcon={Lock}
                      loading={revokingId === grant.id}
                      disabled={revokingId === grant.id}
                      onClick={() => handleRevoke(grant.id)}
                    >
                      Revoke
                    </Button>
                  </li>
                ))}
              </ul>
            )}

            <div className="platform-grant-form">
              <label className="platform-field">
                <span>Reason (recorded in the audit log)</span>
                <textarea
                  value={grantReason}
                  onChange={(event) => {
                    setGrantReason(event.target.value)
                    if (grantError) setGrantError(null)
                  }}
                  placeholder="Why does platform staff need access to this workspace?"
                  maxLength={500}
                />
              </label>
              <label className="platform-field platform-field--narrow">
                <span>Duration</span>
                <select value={grantHours} onChange={(event) => setGrantHours(event.target.value)}>
                  {GRANT_HOURS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
              <Button
                variant="primary"
                leadingIcon={Shield}
                loading={grantBusy}
                onClick={handleGrant}
              >
                Grant access
              </Button>
            </div>
            {grantError ? (
              <p className="platform-error" role="alert">
                {grantError}
              </p>
            ) : null}

            {inactiveGrants.length ? (
              <details className="platform-grant-history">
                <summary>
                  <Clock size={15} aria-hidden="true" />
                  {inactiveGrants.length} expired or revoked grant
                  {inactiveGrants.length === 1 ? '' : 's'}
                </summary>
                <ul className="platform-grants platform-grants--muted">
                  {inactiveGrants.map((grant) => (
                    <li key={grant.id} className="platform-grant">
                      <div className="platform-grant__main">
                        <strong>{grant.reason}</strong>
                        <span>
                          {grant.revoked_at
                            ? `Revoked ${formatDateTime(grant.revoked_at)}`
                            : `Expired ${formatDateTime(grant.expires_at)}`}
                        </span>
                      </div>
                      <Badge tone="outline" size="sm">
                        {grant.revoked_at ? 'Revoked' : 'Expired'}
                      </Badge>
                    </li>
                  ))}
                </ul>
              </details>
            ) : null}
          </section>
        </div>

        <aside className="platform-detail__aside">
          <section className="app-card platform-panel" aria-labelledby="tenant-actions">
            <header className="platform-panel__head">
              <div>
                <p className="eyebrow">Account actions</p>
                <h2 id="tenant-actions">Platform controls</h2>
              </div>
            </header>

            <div className="platform-actions">
              <div className="platform-action">
                <div>
                  <strong>Extend trial</strong>
                  <span>Add 30 days from the current trial end (or today).</span>
                </div>
                <Button variant="ghost" size="sm" onClick={() => openDialog('trial')}>
                  Extend
                </Button>
              </div>

              <div className="platform-action">
                <div>
                  <strong>Change plan</strong>
                  <span>Update the plan code and MRR without touching billing.</span>
                </div>
                <Button variant="ghost" size="sm" onClick={() => openDialog('plan')}>
                  Change
                </Button>
              </div>

              <div className="platform-action">
                <div>
                  <strong>Apply credit</strong>
                  <span>Add a goodwill credit to the workspace ledger.</span>
                </div>
                <Button variant="ghost" size="sm" leadingIcon={CreditCard} onClick={() => openDialog('credit')}>
                  Apply
                </Button>
              </div>

              <div className="platform-action">
                <div>
                  <strong>Reset MFA</strong>
                  <span>Clear MFA for every owner and admin so they can re-enrol.</span>
                </div>
                <Button variant="ghost" size="sm" leadingIcon={Shield} onClick={() => openDialog('mfa')}>
                  Reset
                </Button>
              </div>

              <div className="platform-action">
                <div>
                  <strong>Force sign-out</strong>
                  <span>Revoke every active session for this workspace.</span>
                </div>
                <Button variant="ghost" size="sm" leadingIcon={Lock} onClick={() => openDialog('logout')}>
                  Sign out
                </Button>
              </div>
            </div>
          </section>

          <section className="app-card platform-panel platform-panel--danger" aria-labelledby="tenant-danger">
            <header className="platform-panel__head">
              <div>
                <p className="eyebrow">Danger zone</p>
                <h2 id="tenant-danger">Delete workspace</h2>
              </div>
              <Trash size={18} aria-hidden="true" />
            </header>
            <p className="platform-panel__lead">
              Marks the tenant deleted immediately. Data is retained for the platform retention
              window, but members can no longer sign in or send.
            </p>
            <Button
              variant="danger"
              leadingIcon={Trash}
              onClick={() => openDialog('delete')}
              disabled={profile.status === 'deleted'}
            >
              {profile.status === 'deleted' ? 'Already deleted' : 'Delete workspace'}
            </Button>
          </section>
        </aside>
      </div>

      <Modal
        open={dialog?.kind === 'suspend'}
        title={suspended ? `Reactivate ${profile.name}` : `Suspend ${profile.name}`}
        description={
          suspended
            ? 'Sending resumes and members can sign in again. The suspension history stays in the audit log.'
            : 'Sign-in and sending stop until the tenant is reactivated. A reason is required.'
        }
        onClose={closeDialog}
        footer={
          <>
            <Button variant="ghost" onClick={closeDialog} disabled={busy}>
              Cancel
            </Button>
            <Button
              variant={suspended ? 'primary' : 'danger'}
              loading={busy}
              onClick={handleSuspend}
              disabled={!suspended && suspendReason.trim().length < 5}
            >
              {suspended ? 'Reactivate tenant' : 'Suspend tenant'}
            </Button>
          </>
        }
      >
        {suspended ? (
          <p className="platform-panel__lead">No reason is needed to reactivate.</p>
        ) : (
          <label className="platform-field">
            <span>Suspension reason</span>
            <textarea
              value={suspendReason}
              onChange={(event) => {
                setSuspendReason(event.target.value)
                if (dialogError) setDialogError(null)
              }}
              placeholder="Payment review, abuse investigation, requested by the customer…"
              maxLength={500}
            />
          </label>
        )}
        {dialogError ? (
          <p className="platform-error" role="alert">
            {dialogError}
          </p>
        ) : null}
      </Modal>

      <ConfirmDialog
        open={dialog?.kind === 'trial'}
        title="Extend the trial by 30 days?"
        description="The new trial end is 30 days after the current trial end, or 30 days from today if none is set."
        confirmLabel="Extend trial"
        tone="primary"
        loading={busy}
        onConfirm={() =>
          runAction(() => extendTrial(tenantId), 'Trial extended by 30 days.')
        }
        onCancel={closeDialog}
      >
        {dialogError ? (
          <p className="platform-error" role="alert">
            {dialogError}
          </p>
        ) : null}
      </ConfirmDialog>

      <Modal
        open={dialog?.kind === 'plan'}
        title="Change plan"
        description="This updates the tenant plan code and, when a subscription record exists, its plan too."
        onClose={closeDialog}
        footer={
          <>
            <Button variant="ghost" onClick={closeDialog} disabled={busy}>
              Cancel
            </Button>
            <Button
              variant="primary"
              loading={busy}
              onClick={handlePlanChange}
              disabled={!planCode || planCode === profile.plan_code}
            >
              Apply plan
            </Button>
          </>
        }
      >
        <label className="platform-field">
          <span>Plan</span>
          <select value={planCode} onChange={(event) => setPlanCode(event.target.value)}>
            {PLAN_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <p className="platform-panel__lead">
          Current MRR: <strong>{formatMoney(profile.mrr_cents)}</strong>. MRR is derived from the
          plan list price, not from Stripe.
        </p>
        {dialogError ? (
          <p className="platform-error" role="alert">
            {dialogError}
          </p>
        ) : null}
      </Modal>

      <Modal
        open={dialog?.kind === 'credit'}
        title="Apply a credit"
        description="The amount is added to the workspace credit balance and written to the audit log."
        onClose={closeDialog}
        footer={
          <>
            <Button variant="ghost" onClick={closeDialog} disabled={busy}>
              Cancel
            </Button>
            <Button variant="primary" loading={busy} onClick={handleCredit}>
              Apply credit
            </Button>
          </>
        }
      >
        <div className="platform-form-grid">
          <TextField
            id="credit-amount"
            name="creditAmount"
            label="Amount (USD)"
            type="number"
            min="0.01"
            step="0.01"
            value={creditAmount}
            onChange={(event) => {
              setCreditAmount(event.target.value)
              if (dialogError) setDialogError(null)
            }}
            placeholder="50.00"
          />
          <label className="platform-field">
            <span>Reason</span>
            <textarea
              value={creditReason}
              onChange={(event) => {
                setCreditReason(event.target.value)
                if (dialogError) setDialogError(null)
              }}
              placeholder="Goodwill credit for a delivery outage"
              maxLength={500}
            />
          </label>
        </div>
        <p className="platform-panel__lead">
          Current balance: <strong>{formatMoney(profile.credit_balance_cents)}</strong>.
        </p>
        {dialogError ? (
          <p className="platform-error" role="alert">
            {dialogError}
          </p>
        ) : null}
      </Modal>

      <ConfirmDialog
        open={dialog?.kind === 'mfa'}
        title="Reset MFA for owners and admins?"
        description="Every owner and admin in this workspace will need to enrol an authenticator again. Their current sessions are not revoked."
        confirmLabel="Reset MFA"
        tone="danger"
        loading={busy}
        onConfirm={() =>
          runAction(() => resetTenantMfa(tenantId), 'MFA reset for the workspace owners and admins.')
        }
        onCancel={closeDialog}
      >
        {dialogError ? (
          <p className="platform-error" role="alert">
            {dialogError}
          </p>
        ) : null}
      </ConfirmDialog>

      <ConfirmDialog
        open={dialog?.kind === 'logout'}
        title="Sign every member out?"
        description="All active sessions for this workspace are revoked immediately. Members must sign in again."
        confirmLabel="Sign everyone out"
        tone="danger"
        loading={busy}
        onConfirm={() =>
          runAction(() => forceTenantLogout(tenantId), 'All workspace sessions revoked.')
        }
        onCancel={closeDialog}
      >
        {dialogError ? (
          <p className="platform-error" role="alert">
            {dialogError}
          </p>
        ) : null}
      </ConfirmDialog>

      <Modal
        open={dialog?.kind === 'delete'}
        title={`Delete ${profile.name}?`}
        description="This marks the tenant deleted. Members lose access immediately; data retention follows the platform policy."
        onClose={closeDialog}
        footer={
          <>
            <Button variant="ghost" onClick={closeDialog} disabled={busy}>
              Cancel
            </Button>
            <Button
              variant="danger"
              loading={busy}
              disabled={deleteName.trim() !== profile.name}
              onClick={() =>
                runAction(async () => {
                  await deleteTenant(tenantId)
                  navigate('/app/platform')
                }, 'Workspace marked deleted.')
              }
            >
              Delete workspace
            </Button>
          </>
        }
      >
        <label className="platform-field">
          <span>
            Type <strong>{profile.name}</strong> to confirm
          </span>
          <input
            type="text"
            value={deleteName}
            onChange={(event) => setDeleteName(event.target.value)}
            autoComplete="off"
          />
        </label>
        {dialogError ? (
          <p className="platform-error" role="alert">
            {dialogError}
          </p>
        ) : null}
      </Modal>
    </div>
  )
}
