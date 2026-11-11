import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { PageHeader, Badge, Button, useToast } from '../../../components/ui'
import { TextField } from '../../../components/Field'
import {
  AlertCircle,
  ArrowRight,
  CheckCircle,
  Lock,
  Refresh,
  Shield,
} from '../../../components/icons'
import {
  MFA_CHALLENGE_TTL_MS,
  beginMfaEnrollment,
  cancelMfaEnrollment,
  confirmMfaEnrollment,
  createMfaChallenge,
  disableMfa,
  generateTotp,
  getMfaStatus,
  isMfaRequired,
  totpRemainingSeconds,
} from '../../../lib/mfa'
import { useSession } from '../../../lib/session'
import { usePageTitle } from '../../../lib/usePageTitle'
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

export function SecurityPage() {
  usePageTitle('Security')

  const navigate = useNavigate()
  const { toast } = useToast()
  const { user, isPlatformAdmin, profileStatus } = useSession()

  const [refreshKey, setRefreshKey] = useState(0)
  const [status, setStatus] = useState(() => getMfaStatus(user?.id))

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

  useEffect(() => {
    setStatus(getMfaStatus(user?.id))
  }, [user?.id, refreshKey])

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

  function handleCancel() {
    if (user?.id) cancelMfaEnrollment(user.id)
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

  function handleTestChallenge() {
    if (!user?.id) return
    const challenge = createMfaChallenge(user.id)
    navigate(`/mfa/challenge?challenge=${encodeURIComponent(challenge.id)}`)
  }

  function handleDevChallenge(kind) {
    if (!user?.id) return
    if (kind === 'invalid') {
      navigate('/mfa/challenge?challenge=not-a-valid-challenge')
      return
    }

    const challenge = createMfaChallenge(user.id, {
      ageMs: kind === 'expired' ? MFA_CHALLENGE_TTL_MS + 60_000 : 0,
    })
    navigate(`/mfa/challenge?challenge=${encodeURIComponent(challenge.id)}`)
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
        description="Protect your Reyvo account with a second factor and keep recovery actions close at hand. Workspace-wide policy and audit history follow in T43."
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

          {profileStatus === 'loading' ? (
            <p className="security__loading">Checking your security settings…</p>
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
                <Button
                  variant="primary"
                  trailingIcon={ArrowRight}
                  onClick={handleTestChallenge}
                >
                  Test sign-in challenge
                </Button>
                <Button
                  variant="ghost"
                  onClick={() => {
                    setDisableOpen((current) => !current)
                    setDisableError(null)
                  }}
                >
                  Turn off MFA
                </Button>
              </div>

              {import.meta.env.DEV ? (
                <div className="security__dev-actions">
                  <p className="security__dev-actions-title">Development challenge states</p>
                  <div className="security__dev-buttons">
                    <button
                      type="button"
                      className="security__dev-btn"
                      onClick={() => handleDevChallenge('expired')}
                    >
                      Expired challenge
                    </button>
                    <button
                      type="button"
                      className="security__dev-btn"
                      onClick={() => handleDevChallenge('invalid')}
                    >
                      Invalid challenge
                    </button>
                  </div>
                </div>
              ) : null}

              {disableOpen ? (
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
                Enrollment is stored in this browser because the current API build has no MFA
                endpoints. Production builds never keep a TOTP secret in localStorage.
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

          <section className="app-card" aria-labelledby="audit-heading">
            <header className="security__mini-head">
              <span className="security__mini-icon" aria-hidden="true">
                <Shield size={18} />
              </span>
              <h2 id="audit-heading">Audit log</h2>
            </header>
            <p>
              A searchable, exportable record of security-sensitive changes lands with the
              workspace settings build (T43).
            </p>
            <p className="security__mini-note">
              MFA enrollment, password resets, and session changes will be written there.
            </p>
          </section>
        </aside>
      </div>
    </div>
  )
}
