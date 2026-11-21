import { useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle,
  CheckCircle,
  Lock,
  Mail,
  Pause,
  Shield,
} from '../../../components/icons'
import { Badge, Button, Modal, PageHeader } from '../../../components/ui'
import { getSendingControls, setKillSwitch, setTenantSendingPause } from '../../../lib/adminControls'
import { campaignStatusMeta, listCampaigns, pauseCampaign, resumeCampaign } from '../../../lib/campaigns'
import {
  accountStatusMeta,
  listEmailAccounts,
  providerLabel,
  setEmailAccountPaused,
} from '../../../lib/emailAccounts'
import { useSession } from '../../../lib/session'
import './admin.css'

function formatTimestamp(value) {
  if (!value) return 'No timestamp recorded'
  try {
    return new Intl.DateTimeFormat(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    }).format(new Date(value))
  } catch {
    return 'No timestamp recorded'
  }
}

/** Verbs per control so the confirm modal reads naturally for each scope. */
const KIND_META = {
  tenant: { noun: 'workspace sending', pause: 'Pause', resume: 'Resume' },
  campaign: { noun: 'campaign', pause: 'Pause', resume: 'Resume' },
  inbox: { noun: 'mailbox', pause: 'Pause', resume: 'Resume' },
  killswitch: { noun: 'platform kill switch', pause: 'Engage', resume: 'Release' },
}

/** Only these controls accept a free-text reason that the API records. */
const NOTE_KINDS = new Set(['tenant', 'killswitch'])

export function AdminPage() {
  const { tenantDetails, isPlatformAdmin, retryTenant } = useSession()

  const [campaigns, setCampaigns] = useState([])
  const [mailboxes, setMailboxes] = useState([])
  const [status, setStatus] = useState('loading')

  // Tenant pause mirrors `tenants.sending_paused_at` from `GET /tenants/current`.
  const [tenantPausedAt, setTenantPausedAt] = useState(tenantDetails?.sending_paused_at ?? null)

  // Platform kill switch: fetched only for platform staff; everyone else sees
  // the "platform staff only" panel because the API answers 403 for tenant roles.
  const [killSwitch, setKillSwitchState] = useState(null)
  const [killSwitchStatus, setKillSwitchStatus] = useState('idle')

  const [confirmTarget, setConfirmTarget] = useState(null)
  const [confirmNote, setConfirmNote] = useState('')
  const [confirmChecked, setConfirmChecked] = useState(false)
  const [actionBusy, setActionBusy] = useState(false)
  const [actionError, setActionError] = useState(null)

  useEffect(() => {
    const controller = new AbortController()

    Promise.all([listCampaigns({}, controller.signal), listEmailAccounts(controller.signal)])
      .then(([campaignPage, inboxList]) => {
        setCampaigns(campaignPage.items)
        setMailboxes(inboxList)
        setStatus('ready')
      })
      .catch(() => {
        setStatus('error')
      })

    return () => controller.abort()
  }, [])

  useEffect(() => {
    setTenantPausedAt(tenantDetails?.sending_paused_at ?? null)
  }, [tenantDetails?.sending_paused_at])

  useEffect(() => {
    if (!isPlatformAdmin) {
      setKillSwitchStatus('forbidden')
      return undefined
    }

    const controller = new AbortController()
    setKillSwitchStatus('loading')

    getSendingControls(controller.signal)
      .then((data) => {
        setKillSwitchState({
          enabled: Boolean(data.kill_switch_enabled),
          reason: data.kill_switch_reason ?? null,
          updatedAt: data.kill_switch_updated_at ?? null,
        })
        setKillSwitchStatus('ready')
      })
      .catch((error) => {
        if (error?.name === 'AbortError') return
        setKillSwitchStatus(error?.status === 403 ? 'forbidden' : 'error')
      })

    return () => controller.abort()
  }, [isPlatformAdmin])

  const summary = useMemo(() => {
    const workspacePaused = Boolean(tenantPausedAt)
    return {
      totalCampaigns: campaigns.length,
      pausedCampaigns: workspacePaused
        ? campaigns.length
        : campaigns.filter((campaign) => campaign.status === 'paused').length,
      totalInboxes: mailboxes.length,
      pausedInboxes: workspacePaused
        ? mailboxes.length
        : mailboxes.filter((account) => account.isPaused).length,
    }
  }, [campaigns, mailboxes, tenantPausedAt])

  function openConfirm({ kind, id, label, action, scope }) {
    setConfirmTarget({ kind, id, label, action, scope })
    setConfirmNote('')
    setConfirmChecked(false)
    setActionError(null)
  }

  function closeConfirm() {
    if (actionBusy) return
    setConfirmTarget(null)
    setConfirmNote('')
    setConfirmChecked(false)
    setActionError(null)
  }

  async function applyConfirm() {
    if (!confirmTarget || actionBusy) return
    const { kind, id, action } = confirmTarget
    const paused = action === 'pause'

    setActionBusy(true)
    setActionError(null)
    try {
      if (kind === 'tenant') {
        const data = await setTenantSendingPause(paused, confirmNote)
        setTenantPausedAt(data?.sending_paused_at ?? null)
        retryTenant()
      }

      if (kind === 'killswitch') {
        const data = await setKillSwitch(paused, confirmNote)
        setKillSwitchState({
          enabled: Boolean(data.kill_switch_enabled),
          reason: data.kill_switch_reason ?? null,
          updatedAt: data.kill_switch_updated_at ?? null,
        })
        setKillSwitchStatus('ready')
      }

      if (kind === 'campaign') {
        const updated = paused ? await pauseCampaign(id) : await resumeCampaign(id)
        setCampaigns((current) =>
          current.map((campaign) => (campaign.id === id ? { ...campaign, ...updated } : campaign)),
        )
      }

      if (kind === 'inbox') {
        const updated = await setEmailAccountPaused(id, paused)
        setMailboxes((current) =>
          current.map((account) => (account.id === id ? { ...account, ...updated } : account)),
        )
      }

      setConfirmTarget(null)
      setConfirmNote('')
      setConfirmChecked(false)
    } catch (error) {
      setActionError(error?.message || 'The API rejected this change. Nothing was applied.')
    } finally {
      setActionBusy(false)
    }
  }

  function toggleTenantPause(action) {
    openConfirm({
      kind: 'tenant',
      label: 'workspace sending',
      action,
      scope:
        action === 'pause'
          ? 'Every current and queued send in this workspace. Sign-in and data access stay available.'
          : 'Every paused send in this workspace; queued sends are released on the next sender cycle.',
    })
  }

  function toggleKillSwitch(action) {
    openConfirm({
      kind: 'killswitch',
      label: 'platform kill switch',
      action,
      scope:
        action === 'pause'
          ? 'Every send on the Reyvo platform, across all workspaces, until the switch is released.'
          : 'All workspaces on the platform resume on the sender’s next cycle.',
    })
  }

  function toggleCampaignPause(campaign, action) {
    openConfirm({
      kind: 'campaign',
      id: campaign.id,
      label: campaign.name,
      action,
      scope:
        action === 'pause'
          ? 'This campaign and its queued sends only.'
          : 'This paused campaign only; other campaigns are unaffected.',
    })
  }

  function toggleInboxPause(account, action) {
    openConfirm({
      kind: 'inbox',
      id: account.id,
      label: account.email,
      action,
      scope:
        action === 'pause'
          ? 'This mailbox and any scheduled sends that rely on it.'
          : 'This mailbox only; other mailboxes are unaffected.',
    })
  }

  const kindMeta = confirmTarget ? KIND_META[confirmTarget.kind] : KIND_META.tenant
  const modalActionText = confirmTarget?.action === 'pause' ? kindMeta.pause : kindMeta.resume
  const confirmDisabled = !confirmChecked || actionBusy
  const showNote = confirmTarget ? NOTE_KINDS.has(confirmTarget.kind) : false

  return (
    <div className="app-page admin-page">
      <PageHeader
        eyebrow="Admin · Sending controls"
        title="Pause, resume, and kill switch"
        description="Every control here is sent to the API and recorded in the audit log. The affected scope is shown before any action is confirmed, and a resume always requires an acknowledgement."
        meta={
          <>
            <Badge tone={tenantPausedAt ? 'danger' : 'success'} dot>
              {tenantPausedAt ? 'Workspace paused' : 'Workspace sending'}
            </Badge>
            {tenantPausedAt ? (
              <Badge tone="outline">Since {formatTimestamp(tenantPausedAt)}</Badge>
            ) : null}
            {killSwitchStatus === 'ready' && killSwitch?.enabled ? (
              <Badge tone="danger" dot>
                Kill switch engaged
              </Badge>
            ) : null}
          </>
        }
        actions={
          <Button
            variant={tenantPausedAt ? 'ghost' : 'primary'}
            leadingIcon={Shield}
            onClick={() => toggleTenantPause(tenantPausedAt ? 'resume' : 'pause')}
          >
            {tenantPausedAt ? 'Resume workspace sending' : 'Pause workspace sending'}
          </Button>
        }
      />

      {tenantPausedAt ? (
        <div className="admin-page__banner" role="status">
          <AlertTriangle size={18} aria-hidden="true" />
          <div>
            <strong>Sending is paused for this workspace.</strong>
            <span>
              The sender skips this tenant until it is resumed (paused {formatTimestamp(tenantPausedAt)}).
              Campaigns, mailboxes, and data stay fully accessible.
            </span>
          </div>
          <Button variant="outline" leadingIcon={CheckCircle} onClick={() => toggleTenantPause('resume')}>
            Resume
          </Button>
        </div>
      ) : null}

      {status === 'error' ? (
        <div className="app-card admin-page__error">
          <AlertTriangle size={18} aria-hidden="true" />
          <span>We couldn’t load the current sending controls. Refresh and try again.</span>
        </div>
      ) : null}

      <div className="admin-page__summary">
        <div className="app-card admin-page__stat">
          <span>Campaigns paused</span>
          <strong>
            {summary.pausedCampaigns}
            <small> of {summary.totalCampaigns}</small>
          </strong>
        </div>
        <div className="app-card admin-page__stat admin-page__stat--danger">
          <span>Mailboxes paused</span>
          <strong>
            {summary.pausedInboxes}
            <small> of {summary.totalInboxes}</small>
          </strong>
        </div>
        <div className="app-card admin-page__stat admin-page__stat--neutral">
          <span>Workspace sending</span>
          <strong>{tenantPausedAt ? 'Paused' : 'Active'}</strong>
        </div>
      </div>

      <section className="app-card admin-page__section" aria-labelledby="kill-switch-controls">
        <div className="admin-page__section-head">
          <div>
            <p className="eyebrow">Platform</p>
            <h2 id="kill-switch-controls">Global kill switch</h2>
          </div>
          {killSwitchStatus === 'ready' ? (
            <Badge tone={killSwitch?.enabled ? 'danger' : 'success'} dot>
              {killSwitch?.enabled ? 'Engaged' : 'Released'}
            </Badge>
          ) : null}
        </div>

        {!isPlatformAdmin || killSwitchStatus === 'forbidden' ? (
          <div className="admin-page__platform-note">
            <Lock size={16} aria-hidden="true" />
            <div>
              <strong>Platform staff only</strong>
              <span>
                The global kill switch stops every send on the platform and is enforced by the
                sender. It is controlled by Reyvo platform administrators — the API returns 403
                for tenant roles. Your workspace, campaign, and mailbox controls below are fully
                available to owners and admins.
              </span>
            </div>
          </div>
        ) : killSwitchStatus === 'error' ? (
          <div className="admin-page__error">
            <AlertTriangle size={18} aria-hidden="true" />
            <span>We couldn’t load the kill-switch state. Refresh and try again.</span>
          </div>
        ) : killSwitchStatus === 'loading' ? (
          <p className="admin-page__empty">Loading the current kill-switch state…</p>
        ) : (
          <div className="admin-page__killswitch">
            <div className="admin-page__killswitch-state">
              <strong>{killSwitch?.enabled ? 'Sending is stopped platform-wide' : 'Platform sending is enabled'}</strong>
              <span>
                {killSwitch?.enabled
                  ? `Engaged${killSwitch.reason ? ` — ${killSwitch.reason}` : ''}${killSwitch.updatedAt ? ` (${formatTimestamp(killSwitch.updatedAt)})` : ''}`
                  : 'All workspaces send normally. Engaging the switch halts every queued and new send until it is released.'}
              </span>
            </div>
            <Button
              variant={killSwitch?.enabled ? 'primary' : 'outline'}
              leadingIcon={killSwitch?.enabled ? CheckCircle : Pause}
              onClick={() => toggleKillSwitch(killSwitch?.enabled ? 'resume' : 'pause')}
            >
              {killSwitch?.enabled ? 'Release kill switch' : 'Engage kill switch'}
            </Button>
          </div>
        )}
      </section>

      <section className="app-card admin-page__section" aria-labelledby="campaign-controls">
        <div className="admin-page__section-head">
          <div>
            <p className="eyebrow">Campaigns</p>
            <h2 id="campaign-controls">Pause or resume campaigns</h2>
          </div>
        </div>

        <div className="admin-page__list">
          {campaigns.length === 0 ? (
            <p className="admin-page__empty">No campaigns are available.</p>
          ) : (
            campaigns.map((campaign) => {
              const meta = campaignStatusMeta(campaign.status)
              const paused = Boolean(tenantPausedAt) || campaign.status === 'paused'
              const canPause = campaign.status === 'active'
              const canResume = campaign.status === 'paused'

              return (
                <div key={campaign.id} className="admin-page__item">
                  <div className="admin-page__meta">
                    <strong>{campaign.name || 'Untitled campaign'}</strong>
                    <div className="admin-page__chips">
                      <Badge tone={paused && campaign.status !== 'paused' ? 'warning' : meta.tone} dot>
                        {paused && campaign.status !== 'paused' ? 'Paused (workspace)' : meta.label}
                      </Badge>
                      {campaign.timezone ? <Badge tone="outline">{campaign.timezone}</Badge> : null}
                    </div>
                  </div>

                  <div className="admin-page__actions">
                    {canPause ? (
                      <Button
                        variant="outline"
                        leadingIcon={Pause}
                        disabled={actionBusy}
                        onClick={() => toggleCampaignPause(campaign, 'pause')}
                      >
                        Pause
                      </Button>
                    ) : canResume ? (
                      <Button
                        variant="ghost"
                        leadingIcon={CheckCircle}
                        disabled={actionBusy}
                        onClick={() => toggleCampaignPause(campaign, 'resume')}
                      >
                        Resume
                      </Button>
                    ) : (
                      <span className="admin-page__no-action">No sending action</span>
                    )}
                  </div>
                </div>
              )
            })
          )}
        </div>
      </section>

      <section className="app-card admin-page__section" aria-labelledby="mailbox-controls">
        <div className="admin-page__section-head">
          <div>
            <p className="eyebrow">Mailboxes</p>
            <h2 id="mailbox-controls">Pause or resume inbox sending</h2>
          </div>
        </div>

        <div className="admin-page__list">
          {mailboxes.length === 0 ? (
            <p className="admin-page__empty">No active mailboxes were returned by the API.</p>
          ) : (
            mailboxes.map((account) => {
              const meta = accountStatusMeta(account.status)
              const paused = Boolean(tenantPausedAt) || account.isPaused

              return (
                <div key={account.id} className="admin-page__item">
                  <div className="admin-page__meta">
                    <div>
                      <strong>{account.email}</strong>
                      <small>{providerLabel(account.provider)}</small>
                    </div>
                    <div className="admin-page__chips">
                      <Badge
                        tone={paused && !account.isPaused ? 'warning' : meta.tone}
                        dot
                      >
                        {paused && !account.isPaused ? 'Paused (workspace)' : account.isPaused ? 'Paused' : meta.label}
                      </Badge>
                    </div>
                  </div>

                  <div className="admin-page__actions">
                    {account.isPaused ? (
                      <Button
                        variant="ghost"
                        leadingIcon={CheckCircle}
                        disabled={actionBusy}
                        onClick={() => toggleInboxPause(account, 'resume')}
                      >
                        Resume
                      </Button>
                    ) : (
                      <Button
                        variant="outline"
                        leadingIcon={Mail}
                        disabled={actionBusy}
                        onClick={() => toggleInboxPause(account, 'pause')}
                      >
                        Pause
                      </Button>
                    )}
                  </div>
                </div>
              )
            })
          )}
        </div>
      </section>

      <Modal
        open={Boolean(confirmTarget)}
        title={confirmTarget ? `${modalActionText} ${confirmTarget.label}` : 'Confirm this change'}
        description={confirmTarget ? `This action affects ${confirmTarget.scope}.` : 'Choose a control to continue.'}
        size="lg"
        onClose={closeConfirm}
        footer={
          <>
            <Button variant="ghost" onClick={closeConfirm} disabled={actionBusy}>
              Cancel
            </Button>
            <Button
              variant={confirmTarget?.action === 'resume' ? 'primary' : 'outline'}
              onClick={applyConfirm}
              disabled={confirmDisabled}
            >
              {actionBusy
                ? 'Applying…'
                : confirmTarget
                  ? `${modalActionText} ${confirmTarget.label}`
                  : 'Confirm'}
            </Button>
          </>
        }
      >
        {confirmTarget ? (
          <div className="admin-page__confirm">
            <div className="admin-page__confirm-scope">
              <p className="eyebrow">Affected scope</p>
              <strong>{confirmTarget.scope}</strong>
              <span className="admin-page__confirm-api">
                Sent to the API and recorded in the audit log as{' '}
                <code>
                  {confirmTarget.kind === 'tenant'
                    ? confirmTarget.action === 'pause'
                      ? 'tenant.sending_paused'
                      : 'tenant.sending_resumed'
                    : confirmTarget.kind === 'killswitch'
                      ? 'admin.kill_switch_changed'
                      : confirmTarget.kind === 'campaign'
                        ? confirmTarget.action === 'pause'
                          ? 'campaign.paused'
                          : 'campaign.resumed'
                        : 'email_account.updated'}
                </code>
                .
              </span>
            </div>

            {showNote ? (
              <label className="admin-page__reason">
                <span>Reason (recorded in the audit log)</span>
                <textarea
                  value={confirmNote}
                  onChange={(event) => setConfirmNote(event.target.value)}
                  placeholder={
                    confirmTarget.action === 'resume'
                      ? 'Why is this being resumed now?'
                      : 'Why is this being paused now?'
                  }
                />
              </label>
            ) : null}

            <label className="admin-page__confirm-check">
              <input
                type="checkbox"
                checked={confirmChecked}
                onChange={(event) => setConfirmChecked(event.target.checked)}
              />
              <span>
                I understand this {confirmTarget.action === 'resume' ? 'resumes' : 'pauses'}{' '}
                {kindMeta.noun} and the scope above is correct.
              </span>
            </label>

            {actionError ? (
              <p className="admin-page__confirm-error" role="alert">
                <AlertTriangle size={16} aria-hidden="true" />
                {actionError}
              </p>
            ) : null}
          </div>
        ) : null}
      </Modal>
    </div>
  )
}
