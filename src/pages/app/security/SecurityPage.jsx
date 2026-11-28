import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { PageHeader, Badge, Button, useToast } from '../../../components/ui'
import { TextField } from '../../../components/Field'
import { AlertCircle, ArrowRight, CheckCircle, Lock, Refresh, Shield } from '../../../components/icons'
import { api } from '../../../lib/api'
import {
  beginMfaEnrollment,
  cancelMfaEnrollment,
  confirmMfaEnrollment,
  disableMfa,
  generateTotp,
  getMfaStatus,
  isMfaRequired,
  totpRemainingSeconds,
} from '../../../lib/mfa'
import { useSession } from '../../../lib/session'
import { usePageTitle } from '../../../lib/usePageTitle'
import { getWorkspaceSupportAccess } from '../../../lib/platformAdmin'
import './security.css'

function formatDate(value) {
  if (!value) return '—'
  try {
    return new Intl.DateTimeFormat(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    }).format(new Date(value))
  } catch {
    return '—'
  }
}

function formatDateTime(value) {
  if (!value) return '—'
  try {
    return new Intl.DateTimeFormat(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    }).format(new Date(value))
  } catch {
    return '—'
  }
}

export function SecurityPage() {
  usePageTitle('Security')

  const { toast } = useToast()
  const { user, isPlatformAdmin, profileStatus } = useSession()

  const [refreshKey, setRefreshKey] = useState(0)
  const [status, setStatus] = useState({
    enabled: false,
    enabledAt: null,
    pending: false,
    pendingExpiresAt: null,
  })
  const [statusError, setStatusError] = useState(null)
  const [statusLoaded, setStatusLoaded] = useState(false)

  const [enrollment, setEnrollment] = useState(null)
  const [enrolling, setEnrolling] = useState(false)
  const [enrollError, setEnrollError] = useState(null)
  const [code, setCode] = useState('')
  const [confirmError, setConfirmError] = useState(null)
  const [confirming, setConfirming] = useState(false)
  const [copied, setCopied] = useState(false)

  const [devCode, setDevCode] = useState(null)
  const [secondsLeft, setSecondsLeft] = useState(totpRemainingSeconds())

  const [disableOpen, setDisableOpen] = useState(false)
  const [disableCode, setDisableCode] = useState('')
  const [disableError, setDisableError] = useState(null)
  const [disabling, setDisabling] = useState(false)

  const [auditEntries, setAuditEntries] = useState([])
  const [auditStatus, setAuditStatus] = useState('loading')
  const [auditError, setAuditError] = useState(null)
  const [auditSearchInput, setAuditSearchInput] = useState('')
  const [auditSearch, setAuditSearch] = useState('')
  const [auditOffset, setAuditOffset] = useState(0)
  const [auditTotal, setAuditTotal] = useState(0)
  const [auditRefresh, setAuditRefresh] = useState(0)
  const [exportingAudit, setExportingAudit] = useState(false)
  const [exportError, setExportError] = useState(null)

  const [supportGrants, setSupportGrants] = useState([])
  const [supportStatus, setSupportStatus] = useState('loading')
  const [supportError, setSupportError] = useState(null)

  useEffect(() => {
    if (!user?.id) return undefined

    const controller = new AbortController()
    setStatusError(null)
    setStatusLoaded(false)
    getMfaStatus(user.id, controller.signal)
      .then((nextStatus) => {
        setStatus(nextStatus)
        setStatusLoaded(true)
      })
      .catch((error) => {
        if (error?.name !== 'AbortError') {
          setStatusError(error?.message || 'We could not load your MFA settings.')
          setStatusLoaded(true)
        }
      })
    return () => controller.abort()
  }, [user?.id, refreshKey])

  useEffect(() => {
    const controller = new AbortController()
    const params = new URLSearchParams({ limit: '30', offset: String(auditOffset) })
    if (auditSearch) params.set('search', auditSearch)
    setAuditStatus('loading')
    setAuditError(null)

    api
      .get(`/tenants/current/audit-logs?${params}`, { signal: controller.signal })
      .then((page) => {
        setAuditEntries((current) =>
          auditOffset === 0 ? page.items ?? [] : [...current, ...(page.items ?? [])],
        )
        setAuditTotal(page.total ?? 0)
        setAuditStatus('ready')
      })
      .catch((error) => {
        if (error?.name === 'AbortError') return
        setAuditError(error?.message || 'We could not load the workspace audit log.')
        setAuditStatus('error')
      })

    return () => controller.abort()
  }, [auditOffset, auditRefresh, auditSearch])

  // T47: platform support access must be visible to the tenant while it is active.
  useEffect(() => {
    const controller = new AbortController()
    setSupportStatus('loading')
    setSupportError(null)

    getWorkspaceSupportAccess(controller.signal)
      .then((items) => {
        setSupportGrants(Array.isArray(items) ? items : [])
        setSupportStatus('ready')
      })
      .catch((error) => {
        if (error?.name === 'AbortError') return
        setSupportError(error?.message || 'We could not load platform support access.')
        setSupportStatus('error')
      })

    return () => controller.abort()
  }, [auditRefresh])

  // Keep the development helper code current while enrollment is open.
  useEffect(() => {
    if (!import.meta.env.DEV || !enrollment?.secret) return undefined

    let active = true
    const secret = enrollment.secret

    async function tick() {
      try {
        const next = await generateTotp(secret)
        if (active) {
          setDevCode(next)
          setSecondsLeft(totpRemainingSeconds())
        }
      } catch {
        if (active) setDevCode(null)
      }
    }

    tick()
    const timer = window.setInterval(tick, 1000)
    return () => {
      active = false
      window.clearInterval(timer)
    }
  }, [enrollment?.secret])

  const required = isMfaRequired({ isPlatformAdmin })

  async function handleBegin() {
    if (!user?.id) return
    setEnrolling(true)
    setEnrollError(null)
    setConfirmError(null)
    setCode('')
    setCopied(false)

    try {
      const result = await beginMfaEnrollment(user.id, { email: user.email })
      setEnrollment(result)
    } catch (error) {
      setEnrollError(
        error?.message || 'We could not start MFA enrollment. Wait a moment and try again.',
      )
    } finally {
      setEnrolling(false)
    }
  }

  function submitAuditSearch(event) {
    event.preventDefault()
    setAuditEntries([])
    setAuditOffset(0)
    setAuditSearch(auditSearchInput.trim())
  }

  async function handleAuditExport() {
    setExportingAudit(true)
    setExportError(null)
    const params = new URLSearchParams()
    if (auditSearch) params.set('search', auditSearch)
    const suffix = params.size ? `?${params}` : ''

    try {
      const file = await api.download(
        `/tenants/current/audit-logs/export${suffix}`,
      )
      const url = URL.createObjectURL(file)
      const link = document.createElement('a')
      link.href = url
      link.download = 'tenant-audit.csv'
      document.body.append(link)
      link.click()
      link.remove()
      window.setTimeout(() => URL.revokeObjectURL(url), 1000)
    } catch (error) {
      setExportError(error?.message || 'We could not export the audit log.')
    } finally {
      setExportingAudit(false)
    }
  }

  async function handleCancel() {
    if (user?.id) {
      try {
        await cancelMfaEnrollment(user.id)
      } catch (error) {
        setEnrollError(error?.message || 'We could not cancel MFA setup. Try again.')
        return
      }
    }
    setEnrollment(null)
    setCode('')
    setConfirmError(null)
    setDevCode(null)
  }

  async function handleConfirm() {
    if (!user?.id) return
    setConfirmError(null)

    if (!/^\d{6}$/.test(code.replace(/\s+/g, ''))) {
      setConfirmError('Enter the 6-digit code from your authenticator app.')
      return
    }

    setConfirming(true)

    try {
      const result = await confirmMfaEnrollment(user.id, code, { email: user.email })

      if (result.status === 'enabled') {
        setEnrollment(null)
        setCode('')
        setDevCode(null)
        setRefreshKey((current) => current + 1)
        toast.success('Two-factor authentication is on. You’ll be asked for a code next sign-in.')
      } else if (result.status === 'expired') {
        setEnrollment(null)
        setConfirmError('That setup expired. Start again to get a new secret.')
      } else {
        setConfirmError('That code isn’t valid. Check the code and try again.')
      }
    } catch (error) {
      setConfirmError(error?.message || 'We could not confirm that code. Try again.')
    } finally {
      setConfirming(false)
    }
  }

  async function copySecret() {
    if (!enrollment?.secret) return
    try {
      await navigator.clipboard.writeText(enrollment.secret)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2500)
    } catch {
      setCopied(false)
    }
  }

  async function handleDisable() {
    if (!user?.id) return
    setDisableError(null)

    if (!/^\d{6}$/.test(disableCode.replace(/\s+/g, ''))) {
      setDisableError('Enter a current 6-digit code to turn off MFA.')
      return
    }

    setDisabling(true)

    try {
      const result = await disableMfa(user.id, disableCode)
      if (result.status === 'disabled') {
        setDisableOpen(false)
        setDisableCode('')
        setRefreshKey((current) => current + 1)
        toast.success('Two-factor authentication is off for this account.')
      } else {
        setDisableError('That code isn’t valid. Try the current code from your authenticator app.')
      }
    } catch (error) {
      setDisableError(error?.message || 'We could not turn off MFA. Try again.')
    } finally {
      setDisabling(false)
    }
  }

  return (
    <div className="app-page">
      <PageHeader
        eyebrow="Settings · Security"
        title="Security"
        description="Protect your account with two-factor authentication, review active sessions, and search security-sensitive workspace activity."
        meta={
          <>
            <Badge tone={status.enabled ? 'success' : 'neutral'} dot>
              MFA {status.enabled ? 'on' : 'off'}
            </Badge>
            {required && !status.enabled ? (
              <Badge tone="warning" dot>
                Required for platform staff
              </Badge>
            ) : null}
          </>
        }
        actions={
          <Link to="/forgot-password" className="btn btn--ghost btn--sm">
            Reset password
          </Link>
        }
      />

      <div className="security-page">
        <section className="app-card security__mfa" aria-labelledby="mfa-heading">
          <header className="security__section-head">
            <span className="security__icon" aria-hidden="true">
              <Shield size={22} />
            </span>
            <div>
              <h2 id="mfa-heading">Two-factor authentication</h2>
              <p>
                A six-digit code from an authenticator app, on top of your password. Optional for
                owners and admins; required for Reyvo platform staff.
              </p>
            </div>
            <Badge tone={status.enabled ? 'success' : 'neutral'} dot>
              {status.enabled ? 'On' : 'Off'}
            </Badge>
          </header>

          {profileStatus === 'loading' || !statusLoaded ? (
            <p className="security__loading">Checking your security settings…</p>
          ) : statusError ? (
            <p className="security__error" role="alert">
              {statusError}
            </p>
          ) : status.enabled ? (
            <>
              <dl className="security__facts">
                <div>
                  <dt>Status</dt>
                  <dd className="security__fact-ok">
                    <CheckCircle size={15} aria-hidden="true" />
                    Enabled
                  </dd>
                </div>
                <div>
                  <dt>Method</dt>
                  <dd>Authenticator app (TOTP)</dd>
                </div>
                <div>
                  <dt>Enrolled</dt>
                  <dd>{formatDate(status.enabledAt)}</dd>
                </div>
              </dl>

              <div className="security__actions">
                {required ? (
                  <p className="security__mini-note">
                    MFA is required for platform administrators and cannot be disabled here.
                  </p>
                ) : (
                  <Button
                    variant="ghost"
                    onClick={() => {
                      setDisableOpen((current) => !current)
                      setDisableError(null)
                    }}
                  >
                    Turn off MFA
                  </Button>
                )}
              </div>

              {disableOpen && !required ? (
                <div className="security__disable">
                  <p className="security__disable-title">
                    <AlertCircle size={16} aria-hidden="true" />
                    Turn off the second factor?
                  </p>
                  <p>
                    Sign-in will only need your password. Enter a current code to confirm this
                    change.
                  </p>
                  <TextField
                    id="disable-code"
                    name="disableCode"
                    label="Current authentication code"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    placeholder="000000"
                    value={disableCode}
                    onChange={(event) => {
                      setDisableCode(event.target.value.replace(/[^\d\s]/g, '').slice(0, 7))
                      if (disableError) setDisableError(null)
                    }}
                    maxLength={7}
                  />
                  {disableError ? (
                    <p className="security__error" role="alert">
                      {disableError}
                    </p>
                  ) : null}
                  <div className="security__actions security__actions--tight">
                    <Button
                      variant="danger"
                      loading={disabling}
                      onClick={handleDisable}
                      leadingIcon={Lock}
                    >
                      Turn off MFA
                    </Button>
                    <Button
                      variant="quiet"
                      onClick={() => {
                        setDisableOpen(false)
                        setDisableCode('')
                        setDisableError(null)
                      }}
                    >
                      Keep it on
                    </Button>
                  </div>
                </div>
              ) : null}
            </>
          ) : enrollment ? (
            <div className="security__enroll">
              <h3>Set up your authenticator app</h3>
              <ol className="security__steps">
                <li>
                  <span>1</span>
                  <p>
                    Open 1Password, Authy, Google Authenticator, or another TOTP app and add a new
                    account.
                  </p>
                </li>
                <li>
                  <span>2</span>
                  <p>Enter this setup key, then use the six-digit code the app shows.</p>
                </li>
              </ol>

              <div className="security__secret">
                <div>
                  <span className="security__secret-label">Setup key</span>
                  <code>{enrollment.secret}</code>
                </div>
                <button type="button" className="security__copy" onClick={copySecret}>
                  {copied ? 'Copied' : 'Copy'}
                </button>
              </div>

              <details className="security__uri">
                <summary>Prefer a setup URI?</summary>
                <code>{enrollment.uri}</code>
              </details>

              <TextField
                id="mfa-code"
                name="mfaCode"
                label="Six-digit code"
                inputMode="numeric"
                autoComplete="one-time-code"
                placeholder="000000"
                value={code}
                onChange={(event) => {
                  setCode(event.target.value.replace(/[^\d\s]/g, '').slice(0, 7))
                  if (confirmError) setConfirmError(null)
                }}
                maxLength={7}
                className="security__code-field"
              />

              {confirmError ? (
                <p className="security__error" role="alert">
                  {confirmError}
                </p>
              ) : null}

              <div className="security__actions">
                <Button variant="primary" loading={confirming} onClick={handleConfirm}>
                  Turn on MFA
                </Button>
                <Button variant="ghost" onClick={handleCancel}>
                  Cancel
                </Button>
              </div>

              {import.meta.env.DEV && devCode ? (
                <div className="security__helper">
                  <p className="security__helper-title">Development helper</p>
                  <p>
                    Current valid code: <code>{devCode}</code> · refreshes in {secondsLeft}s.
                  </p>
                </div>
              ) : null}
            </div>
          ) : (
            <>
              <p className="security__note">
                MFA is off. Turning it on adds one prompt at sign-in and protects the workspace even
                if your password is reused or leaked.
              </p>
              <div className="security__actions">
                <Button
                  variant="primary"
                  loading={enrolling}
                  onClick={handleBegin}
                  trailingIcon={ArrowRight}
                >
                  Set up authenticator
                </Button>
              </div>
              {enrollError ? (
                <p className="security__error" role="alert">
                  {enrollError}
                </p>
              ) : null}
            </>
          )}

          {import.meta.env.DEV ? (
            <p className="security__devnote">
              <Badge tone="warning" size="sm" dot>
                Development
              </Badge>
              <span>
                The setup key is shown once and held only while this setup screen is open. Reyvo
                stores an encrypted copy after confirmation.
              </span>
            </p>
          ) : null}
        </section>

        <aside className="security__aside">
          <section className="app-card" aria-labelledby="password-heading">
            <header className="security__mini-head">
              <span className="security__mini-icon" aria-hidden="true">
                <Lock size={18} />
              </span>
              <h2 id="password-heading">Password</h2>
            </header>
            <p>
              Send yourself a single-use reset link. It expires in 30 minutes and signs out every
              active session when used.
            </p>
            <Link to="/forgot-password" className="btn btn--ghost btn--sm security__mini-action">
              Send reset link
              <ArrowRight size={15} />
            </Link>
            <p className="security__mini-note">
              Change your password with your current password in Account settings. A reset link is
              the recovery path if you have forgotten it.
            </p>
          </section>

          <section className="app-card" aria-labelledby="sessions-heading">
            <header className="security__mini-head">
              <span className="security__mini-icon" aria-hidden="true">
                <Refresh size={18} />
              </span>
              <h2 id="sessions-heading">Active sessions</h2>
            </header>
            <p>
              Review active browsers and devices, sign out other sessions, or sign out everywhere
              from Account settings. Signing out everywhere clears every remembered workspace on
              this device.
            </p>
            <Link
              to="/app/settings/account"
              className="btn btn--ghost btn--sm security__mini-action"
            >
              Account settings
              <ArrowRight size={15} />
            </Link>
          </section>

          <section className="app-card" aria-labelledby="support-access-heading">
            <header className="security__mini-head">
              <span className="security__mini-icon" aria-hidden="true">
                <Shield size={18} />
              </span>
              <h2 id="support-access-heading">Platform support access</h2>
            </header>
            <p>
              Reyvo platform staff can request time-boxed access to investigate a problem. Every
              grant requires a reason and expires automatically; this list shows only grants that are
              still active.
            </p>
            {supportStatus === 'loading' ? (
              <p className="security__loading">Checking support access…</p>
            ) : supportStatus === 'error' ? (
              <p className="security__error" role="alert">
                {supportError}
              </p>
            ) : supportGrants.length === 0 ? (
              <p className="security__mini-note">
                No platform staff currently have access to this workspace.
              </p>
            ) : (
              <ul className="security__support-list">
                {supportGrants.map((grant) => (
                  <li key={grant.id}>
                    <strong>{grant.reason}</strong>
                    <span>
                      Granted {formatDateTime(grant.granted_at)} · expires{' '}
                      {formatDateTime(grant.expires_at)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="app-card security__audit" aria-labelledby="audit-heading">
            <header className="security__mini-head">
              <span className="security__mini-icon" aria-hidden="true">
                <Shield size={18} />
              </span>
              <h2 id="audit-heading">Audit log</h2>
            </header>
            <p>Search security-sensitive workspace events, including actions by platform staff.</p>
            <form className="security__audit-search" onSubmit={submitAuditSearch}>
              <TextField
                id="audit-search"
                name="auditSearch"
                label="Search audit log"
                placeholder="Action, actor, or record ID"
                value={auditSearchInput}
                onChange={(event) => setAuditSearchInput(event.target.value)}
                maxLength={255}
              />
              <div className="security__actions security__actions--tight">
                <Button type="submit" variant="primary">
                  Search
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  loading={exportingAudit}
                  onClick={handleAuditExport}
                >
                  Export CSV
                </Button>
              </div>
            </form>
            {exportError ? (
              <p className="security__error" role="alert">
                {exportError}
              </p>
            ) : null}
            {auditError ? (
              <p className="security__error" role="alert">
                {auditError}
              </p>
            ) : auditStatus === 'loading' && auditEntries.length === 0 ? (
              <p className="security__loading">Loading audit events…</p>
            ) : auditEntries.length === 0 ? (
              <p className="security__mini-note">No matching audit events.</p>
            ) : (
              <>
                <ol className="security__audit-list">
                  {auditEntries.map((entry) => (
                    <li key={entry.id}>
                      <strong>{entry.action.replaceAll('.', ' · ').replaceAll('_', ' ')}</strong>
                      <span>
                        <Badge
                          tone={entry.actor_type === 'platform_admin' ? 'warning' : 'neutral'}
                          size="sm"
                        >
                          {entry.actor_type.replaceAll('_', ' ')}
                        </Badge>
                        {entry.entity_type ? ` · ${entry.entity_type}` : ''}
                      </span>
                      <time dateTime={entry.created_at}>{formatDateTime(entry.created_at)}</time>
                    </li>
                  ))}
                </ol>
                {auditEntries.length < auditTotal ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    loading={auditStatus === 'loading'}
                    onClick={() => setAuditOffset((offset) => offset + 30)}
                  >
                    Load older events
                  </Button>
                ) : null}
              </>
            )}
          </section>
        </aside>
      </div>
    </div>
  )
}
