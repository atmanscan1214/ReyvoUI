import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle,
  Globe,
  Refresh,
  Shield,
} from '../../../components/icons'
import { TextField, TextareaField } from '../../../components/Field'
import {
  Badge,
  Button,
  ConfirmDialog,
  ErrorPanel,
  Modal,
  PageHeader,
  Skeleton,
  useToast,
} from '../../../components/ui'
import { useSession } from '../../../lib/session'
import { usePageTitle } from '../../../lib/usePageTitle'
import {
  accountStatusMeta,
  disconnectEmailAccount,
  getEmailAccount,
  providerLabel,
  testEmailAccount,
  updateEmailAccount,
} from '../../../lib/emailAccounts'
import './mailboxes.css'

const DAILY_CAP_MAX = 2000
const HOURLY_CAP_MAX = 500

function relativeFromNow(value) {
  if (!value) return null
  const then = new Date(value).getTime()
  if (Number.isNaN(then)) return null
  const minutes = Math.round((Date.now() - then) / 60000)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes} min ago`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours} h ago`
  const days = Math.round(hours / 24)
  if (days < 30) return `${days} d ago`
  return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(then)
}

function formatDate(value) {
  if (!value) return null
  try {
    return new Intl.DateTimeFormat(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    }).format(new Date(value))
  } catch {
    return null
  }
}

function physicalAddressText(address) {
  if (!address || typeof address !== 'object') return null
  const parts = [
    address.line1,
    address.line2,
    address.city,
    address.state ?? address.region,
    address.postal_code ?? address.zip,
    address.country,
  ].filter((part) => typeof part === 'string' && part.trim())
  return parts.length ? parts.join(', ') : null
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function validate(form) {
  const errors = {}
  if ((form.fromName ?? '').trim().length > 255) {
    errors.fromName = 'From name must be 255 characters or fewer.'
  }
  const replyTo = (form.replyTo ?? '').trim()
  if (replyTo && !EMAIL_RE.test(replyTo)) {
    errors.replyTo = 'Enter a valid email address, or clear the field to use the mailbox address.'
  }
  if (replyTo.length > 320) {
    errors.replyTo = 'Reply-to must be 320 characters or fewer.'
  }
  const daily = Number(form.dailyCap)
  if (!Number.isInteger(daily) || daily < 1 || daily > DAILY_CAP_MAX) {
    errors.dailyCap = `Daily cap must be a whole number between 1 and ${DAILY_CAP_MAX.toLocaleString()}.`
  }
  const hourly = Number(form.hourlyCap)
  if (!Number.isInteger(hourly) || hourly < 1 || hourly > HOURLY_CAP_MAX) {
    errors.hourlyCap = `Hourly cap must be a whole number between 1 and ${HOURLY_CAP_MAX.toLocaleString()}.`
  }
  if (!errors.dailyCap && !errors.hourlyCap && hourly > daily) {
    errors.hourlyCap = 'The hourly cap cannot exceed the daily cap.'
  }
  return errors
}

/**
 * Inbox detail and configuration (T19).
 *
 * Reads the account from the list endpoint (no GET-by-id exists), renders the
 * sending identity (the from address is always the connected mailbox address —
 * §5.3.5), and owns the configuration form (from name, reply-to, signature,
 * caps), the warm-up/health panel, the test-send check, and disconnect.
 * Timezone is a tenant-level setting in this API build, so it is shown as
 * workspace context rather than a per-inbox field. Warm-up stage is managed by
 * the backend worker and is read-only here.
 */
export function MailboxDetailPage() {
  usePageTitle('Mailbox')
  const { mailboxId } = useParams()
  const navigate = useNavigate()
  const { role, profileStatus, tenantDetails } = useSession()
  const { toast } = useToast()

  const roleKnown = profileStatus === 'ready'
  const canWrite = roleKnown && (role === 'owner' || role === 'admin')

  const [account, setAccount] = useState(null)
  const [status, setStatus] = useState('loading')
  const [error, setError] = useState(null)
  const [refreshKey, setRefreshKey] = useState(0)

  const refresh = () => setRefreshKey((key) => key + 1)

  useEffect(() => {
    const controller = new AbortController()
    setStatus('loading')
    setError(null)

    getEmailAccount(mailboxId, controller.signal)
      .then((item) => {
        setAccount(item)
        setStatus('ready')
      })
      .catch((caught) => {
        if (caught?.name === 'AbortError') return
        setError(caught)
        setStatus('error')
      })

    return () => controller.abort()
  }, [mailboxId, refreshKey])

  if (status === 'error') {
    return (
      <div className="app-page mail-page">
        <PageHeader
          eyebrow="Sending · Mailboxes"
          title="Mailbox"
          backTo="/app/mailboxes"
          backLabel="Mailboxes"
        />
        <ErrorPanel
          title="Couldn’t load this mailbox"
          description={error?.message || undefined}
          requestId={error?.requestId}
          onRetry={refresh}
        />
      </div>
    )
  }

  if (status !== 'ready' || !account) {
    return (
      <div className="app-page mail-page" aria-busy="true">
        <PageHeader
          eyebrow="Sending · Mailboxes"
          title="Mailbox"
          backTo="/app/mailboxes"
          backLabel="Mailboxes"
        />
        <div className="app-card mail-detail__skeleton">
          <Skeleton variant="text" width="40%" height={18} />
          {Array.from({ length: 5 }).map((_, index) => (
            <Skeleton key={index} variant="text" width={`${55 + (index % 3) * 15}%`} />
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="app-page mail-page">
      <MailboxDetail
        account={account}
        canWrite={canWrite}
        roleKnown={roleKnown}
        tenantTimezone={tenantDetails?.timezone ?? null}
        tenantAddress={physicalAddressText(tenantDetails?.physical_address)}
        onUpdated={(next, signatureHtml, message) => {
          // The read model does not return signature_html, so the value just
          // saved is kept locally for display until the next load.
          setAccount(signatureHtml == null ? next : { ...next, signatureHtml })
          toast.success(message)
        }}
        onDisconnected={(message) => {
          toast.info(message)
          navigate('/app/mailboxes')
        }}
        onBack={() => navigate('/app/mailboxes')}
      />
    </div>
  )
}

function MailboxDetail({
  account,
  canWrite,
  roleKnown,
  tenantTimezone,
  tenantAddress,
  onUpdated,
  onDisconnected,
  onBack,
}) {
  const meta = accountStatusMeta(account.status)
  const [configOpen, setConfigOpen] = useState(false)
  const [testOpen, setTestOpen] = useState(false)
  const [disconnectOpen, setDisconnectOpen] = useState(false)
  const [disconnecting, setDisconnecting] = useState(false)
  const [disconnectError, setDisconnectError] = useState(null)
  const [testResult, setTestResult] = useState(null)
  const [testError, setTestError] = useState(null)

  async function handleDisconnect() {
    setDisconnecting(true)
    setDisconnectError(null)
    try {
      await disconnectEmailAccount(account.id)
      onDisconnected(
        `${account.email} was disconnected. Reconnect it from the mailboxes list to use it again.`,
      )
    } catch (caught) {
      setDisconnectError(caught?.message || 'The mailbox could not be disconnected.')
      setDisconnecting(false)
    }
  }

  async function handleTest(payload) {
    setTestResult(null)
    setTestError(null)
    try {
      const result = await testEmailAccount(account.id, payload)
      setTestResult(result?.message || `The test email to ${payload.to_email} was accepted.`)
      setTestOpen(false)
    } catch (caught) {
      // Keep the dialog open so the failure (for example an unusable token) is
      // visible right where the request was made.
      return caught?.message || 'The test email could not be sent.'
    }
    return null
  }

  const checked = relativeFromNow(account.lastHealthCheckAt)

  return (
    <>
      <PageHeader
        eyebrow="Sending · Mailboxes"
        title={account.email}
        description={
          account.displayName
            ? `${account.displayName} · ${providerLabel(account.provider)}`
            : providerLabel(account.provider)
        }
        backTo="/app/mailboxes"
        backLabel="Mailboxes"
        meta={
          <>
            <Badge tone={meta.tone} dot>
              {meta.label}
            </Badge>
            {roleKnown && !canWrite ? <Badge tone="outline">Read-only</Badge> : null}
          </>
        }
        actions={
          canWrite ? (
            <div className="mail-detail__actions">
              <Button
                variant="outline"
                size="sm"
                leadingIcon={Refresh}
                onClick={() => {
                  setTestResult(null)
                  setTestError(null)
                  setTestOpen(true)
                }}
              >
                Test send
              </Button>
              <Button variant="outline" size="sm" onClick={() => setConfigOpen(true)}>
                Configure
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setDisconnectOpen(true)}>
                Disconnect
              </Button>
            </div>
          ) : null
        }
      />

      {roleKnown && !canWrite ? (
        <p className="mail__read-only">
          <Shield size={15} aria-hidden="true" />
          Your role can view mailbox health and configuration but not change them. Ask an owner or
          admin.
        </p>
      ) : null}

      {account.lastError ? (
        <p className="mail__error mail-detail__error" role="status">
          <AlertTriangle size={14} aria-hidden="true" />
          {account.lastError}
        </p>
      ) : null}

      {testResult ? (
        <p className="mail-detail__test-ok" role="status">
          <CheckCircle size={15} aria-hidden="true" />
          {testResult}
        </p>
      ) : null}
      {testError ? (
        <p className="mail__error mail-detail__error" role="alert">
          <AlertTriangle size={14} aria-hidden="true" />
          {testError}
        </p>
      ) : null}

      <div className="mail-detail__grid">
        <section className="app-card mail-detail__card">
          <h2 className="mail-detail__card-title">Sending identity</h2>
          <dl className="mail-detail__facts">
            <Fact label="From address">
              {account.email}
              <span className="mail-detail__fact-note">
                Always the connected mailbox address — Reyvo never rewrites the from address.
              </span>
            </Fact>
            <Fact label="From name">{account.fromName}</Fact>
            <Fact label="Reply-to">{account.replyTo ?? 'Defaults to the mailbox address'}</Fact>
            <Fact label="Signature">
              {account.signatureHtml ? (
                <span className="mail-detail__signature-preview">{account.signatureHtml}</span>
              ) : null}
            </Fact>
          </dl>
          <p className="mail-detail__hint">
            <Globe size={13} aria-hidden="true" />
            Workspace timezone: <strong>{tenantTimezone ?? '—'}</strong> — sends are scheduled in the
            workspace timezone; per-inbox timezones are not part of this API build yet.
          </p>
          {canWrite ? (
            <div className="mail-detail__card-actions">
              <Button variant="outline" size="sm" onClick={() => setConfigOpen(true)}>
                Edit identity and caps
              </Button>
            </div>
          ) : null}
        </section>

        <section className="app-card mail-detail__card">
          <h2 className="mail-detail__card-title">Warm-up and health</h2>
          <dl className="mail-detail__facts">
            <Fact label="Status">{meta.description ?? meta.label}</Fact>
            <Fact label="Warm-up stage">
              {`Stage ${account.rampStage}`}
              {account.warmupStartedAt ? ` · started ${formatDate(account.warmupStartedAt)}` : ''}
              <span className="mail-detail__fact-note">
                Managed by the backend warm-up worker; it ramps the caps automatically.
              </span>
            </Fact>
            <Fact label="Last health check">
              {checked ? `${checked} (every 15 minutes)` : 'No check recorded yet'}
            </Fact>
            <Fact label="Daily cap">{account.dailyCap.toLocaleString()} messages/day</Fact>
            <Fact label="Hourly cap">{account.hourlyCap.toLocaleString()} messages/hour</Fact>
            <Fact label="Connected">{formatDate(account.createdAt)}</Fact>
          </dl>
        </section>
      </div>

      {canWrite ? (
        <>
          <ConfigModal
            open={configOpen}
            account={account}
            tenantAddress={tenantAddress}
            onClose={() => setConfigOpen(false)}
            onSaved={(next, signatureHtml) => {
              setConfigOpen(false)
              onUpdated(next, signatureHtml, `${next.email} was updated.`)
            }}
          />

          <TestSendModal
            open={testOpen}
            account={account}
            onClose={() => setTestOpen(false)}
            onSend={handleTest}
          />

          <ConfirmDialog
            open={disconnectOpen}
            title={`Disconnect ${account.email}?`}
            description="Campaigns using this inbox will pause. Tokens are deleted from Reyvo; reconnecting creates a fresh grant."
            confirmLabel="Disconnect mailbox"
            loading={disconnecting}
            onConfirm={handleDisconnect}
            onCancel={() => {
              setDisconnectOpen(false)
              setDisconnectError(null)
            }}
          >
            {disconnectError ? (
              <p className="mail__error mail-detail__error" role="alert">
                <AlertTriangle size={14} aria-hidden="true" />
                {disconnectError}
              </p>
            ) : null}
          </ConfirmDialog>
        </>
      ) : null}

      <p className="mail-detail__back">
        <Button variant="ghost" size="sm" trailingIcon={ArrowRight} onClick={onBack}>
          Back to all mailboxes
        </Button>
      </p>
    </>
  )
}

function Fact({ label, children }) {
  return (
    <div className="mail-detail__fact">
      <dt>{label}</dt>
      <dd>
        {children || <span className="mail-detail__muted">—</span>}
      </dd>
    </div>
  )
}

function ConfigModal({ open, account, tenantAddress, onClose, onSaved }) {
  const [form, setForm] = useState({
    fromName: account.fromName ?? '',
    replyTo: account.replyTo ?? '',
    signatureHtml: account.signatureHtml ?? '',
    dailyCap: String(account.dailyCap),
    hourlyCap: String(account.hourlyCap),
  })
  const [errors, setErrors] = useState({})
  const [saving, setSaving] = useState(false)
  const [serverError, setServerError] = useState(null)

  function set(field, value) {
    setForm((current) => ({ ...current, [field]: value }))
  }

  async function save(event) {
    event.preventDefault()
    const validation = validate(form)
    setErrors(validation)
    if (Object.keys(validation).length > 0) return

    setSaving(true)
    setServerError(null)
    const signatureHtml = form.signatureHtml.trim() || null
    try {
      const next = await updateEmailAccount(account.id, {
        from_name: form.fromName.trim() || null,
        reply_to: form.replyTo.trim() || null,
        signature_html: signatureHtml,
        daily_cap: Number(form.dailyCap),
        hourly_cap: Number(form.hourlyCap),
      })
      onSaved(next, signatureHtml)
    } catch (caught) {
      setServerError(
        caught?.fieldErrors?.daily_cap?.[0] ||
          caught?.fieldErrors?.hourly_cap?.[0] ||
          caught?.message ||
          'The mailbox could not be saved.',
      )
      setSaving(false)
    }
  }

  return (
    <Modal
      open={open}
      title="Configure the mailbox"
      description="Identity and caps applied to every campaign that sends from this inbox."
      size="lg"
      onClose={saving ? undefined : onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button variant="primary" onClick={save} loading={saving}>
            Save changes
          </Button>
        </>
      }
    >
      <form className="mail-config" onSubmit={save} noValidate>
        <TextField
          id="mail-from-name"
          label="From name"
          optional
          value={form.fromName}
          maxLength={255}
          error={errors.fromName}
          hint="Shown exactly as typed on every message."
          onChange={(event) => set('fromName', event.target.value)}
        />
        <TextField
          id="mail-reply-to"
          label="Reply-to address"
          optional
          type="email"
          value={form.replyTo}
          maxLength={320}
          error={errors.replyTo}
          hint="Leave empty to use the mailbox address. Use a monitored alias so replies are seen."
          onChange={(event) => set('replyTo', event.target.value)}
        />
        <TextareaField
          id="mail-signature"
          label="Signature (HTML)"
          optional
          rows={5}
          value={form.signatureHtml}
          error={errors.signatureHtml}
          hint={`Appended to every message from this inbox.${tenantAddress ? ` The workspace physical address is on file: ${tenantAddress}.` : ' The workspace physical address is not set yet — add it in workspace settings.'} Unsubscribe links are added by the sending engine.`}
          onChange={(event) => set('signatureHtml', event.target.value)}
        />
        <div className="mail-config__caps">
          <TextField
            id="mail-daily-cap"
            label="Daily cap"
            type="number"
            min={1}
            max={DAILY_CAP_MAX}
            step={1}
            value={form.dailyCap}
            error={errors.dailyCap}
            hint={`1–${DAILY_CAP_MAX.toLocaleString()} messages per day (provider limit; plan limits apply when configured).`}
            onChange={(event) => set('dailyCap', event.target.value)}
          />
          <TextField
            id="mail-hourly-cap"
            label="Hourly cap"
            type="number"
            min={1}
            max={HOURLY_CAP_MAX}
            step={1}
            value={form.hourlyCap}
            error={errors.hourlyCap}
            hint={`1–${HOURLY_CAP_MAX.toLocaleString()} messages per hour; cannot exceed the daily cap.`}
            onChange={(event) => set('hourlyCap', event.target.value)}
          />
        </div>

        {serverError ? (
          <p className="mail__error mail-detail__error" role="alert">
            <AlertTriangle size={14} aria-hidden="true" />
            {serverError}
          </p>
        ) : null}
      </form>
    </Modal>
  )
}

function TestSendModal({ open, account, onClose, onSend }) {
  const [form, setForm] = useState({
    toEmail: '',
    subject: 'Reyvo test email',
    message: 'This is a Reyvo test email. If you received it, this inbox is ready to send.',
  })
  const [errors, setErrors] = useState({})
  const [sending, setSending] = useState(false)
  const [serverError, setServerError] = useState(null)

  useEffect(() => {
    if (!open) return
    setErrors({})
    setServerError(null)
  }, [open])

  async function send(event) {
    event.preventDefault()
    const toEmail = form.toEmail.trim()
    const validation = {}
    if (!EMAIL_RE.test(toEmail)) {
      validation.toEmail = 'Enter the recipient email address for the test.'
    }
    setErrors(validation)
    if (Object.keys(validation).length > 0) return

    setSending(true)
    setServerError(null)
    const failure = await onSend({
      to_email: toEmail,
      subject: form.subject.trim() || undefined,
      message: form.message.trim() || undefined,
    })
    if (failure) {
      setServerError(failure)
      setSending(false)
      return
    }
    setSending(false)
  }

  return (
    <Modal
      open={open}
      title="Send a test email"
      description={`Sends one real message from ${account.email} so you can confirm delivery before a campaign uses this inbox.`}
      size="md"
      onClose={sending ? undefined : onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={sending}>
            Cancel
          </Button>
          <Button variant="primary" leadingIcon={Refresh} onClick={send} loading={sending}>
            Send test email
          </Button>
        </>
      }
    >
      <form className="mail-config" onSubmit={send} noValidate>
        <TextField
          id="mail-test-to"
          label="Recipient"
          type="email"
          value={form.toEmail}
          error={errors.toEmail}
          hint="Use an address you can check — ideally not on the same domain as the mailbox."
          onChange={(event) => setForm((current) => ({ ...current, toEmail: event.target.value }))}
        />
        <TextField
          id="mail-test-subject"
          label="Subject"
          optional
          value={form.subject}
          maxLength={200}
          onChange={(event) => setForm((current) => ({ ...current, subject: event.target.value }))}
        />
        <TextareaField
          id="mail-test-message"
          label="Message"
          optional
          rows={3}
          value={form.message}
          maxLength={5000}
          onChange={(event) => setForm((current) => ({ ...current, message: event.target.value }))}
        />

        {serverError ? (
          <p className="mail__error mail-detail__error" role="alert">
            <AlertTriangle size={14} aria-hidden="true" />
            {serverError}
          </p>
        ) : null}
      </form>
    </Modal>
  )
}
