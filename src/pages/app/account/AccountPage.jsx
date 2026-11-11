import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  Badge,
  Button,
  ConfirmDialog,
  PageHeader,
  Tabs,
  useToast,
} from '../../../components/ui'
import { PasswordField, TextField } from '../../../components/Field'
import {
  AlertCircle,
  ArrowRight,
  CheckCircle,
  Clock,
  Globe,
  Grid,
  Lock,
  LogOut,
  Mail,
  Refresh,
  Shield,
  UserCircle,
} from '../../../components/icons'
import {
  EMAIL_CHANGE_TTL_MS,
  cancelEmailChange,
  changePassword,
  confirmEmailChange,
  getAccountState,
  loadSessions,
  requestEmailChange,
  resetDevSessions,
  revokeAllSessions,
  revokeOtherSessions,
  revokeSession,
  saveProfile,
} from '../../../lib/account'
import { useSession } from '../../../lib/session'
import { usePageTitle } from '../../../lib/usePageTitle'
import { passwordStrength, validateEmail, validatePassword } from '../../../lib/validation'
import './account.css'

const ROLE_LABELS = { owner: 'Owner', admin: 'Admin', member: 'Member' }

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
      hour: 'numeric',
      minute: '2-digit',
    }).format(new Date(value))
  } catch {
    return '—'
  }
}

function formatRelative(value) {
  if (!value) return 'recently'
  const diff = Date.now() - new Date(value).getTime()
  if (!Number.isFinite(diff)) return 'recently'

  const minutes = Math.round(diff / 60_000)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes} min ago`

  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours} ${hours === 1 ? 'hour' : 'hours'} ago`

  const days = Math.round(hours / 24)
  if (days < 31) return `${days} ${days === 1 ? 'day' : 'days'} ago`

  return formatDate(value)
}

function initials(name, email) {
  const source = String(name || email || 'Reyvo').trim()
  const parts = source.split(/\s+/).filter(Boolean)
  if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase()
  return source.slice(0, 2).toUpperCase()
}

function PanelHead({ icon: Icon, title, children }) {
  return (
    <header className="account__panel-head">
      <span className="account__panel-icon" aria-hidden="true">
        <Icon size={20} />
      </span>
      <div>
        <h2>{title}</h2>
        <p>{children}</p>
      </div>
    </header>
  )
}

function DevNote({ children }) {
  return (
    <p className="account__devnote">
      <Badge tone="warning" size="sm" dot>
        Development
      </Badge>
      <span>{children}</span>
    </p>
  )
}

function ErrorNote({ children }) {
  return (
    <p className="account__error" role="alert">
      <AlertCircle size={15} aria-hidden="true" />
      <span>{children}</span>
    </p>
  )
}

/* Profile ----------------------------------------------------------------- */

function ProfilePanel({ user, role, account, onPatched }) {
  const { toast } = useToast()
  const [name, setName] = useState(user?.full_name ?? '')
  const [error, setError] = useState(null)
  const [saving, setSaving] = useState(false)
  const [savedWith, setSavedWith] = useState(null)

  useEffect(() => {
    setName(user?.full_name ?? '')
  }, [user?.full_name])

  async function handleSubmit(event) {
    event.preventDefault()
    setError(null)

    const trimmed = name.trim()
    if (!trimmed) {
      setError('Enter your full name.')
      return
    }
    if (trimmed.length > 255) {
      setError('Use 255 characters or fewer.')
      return
    }

    setSaving(true)
    try {
      const result = await saveProfile(user, trimmed)
      setName(trimmed)
      setSavedWith(result.development ? 'local' : 'api')
      onPatched(result.patch)
      toast.success('Profile updated.')
    } catch (caught) {
      setError(
        caught?.fieldErrors?.full_name ||
          caught?.message ||
          'We could not save your profile. Try again.',
      )
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="app-card account__card">
      <PanelHead icon={UserCircle} title="Profile">
        The name your teammates see across the workspace. Your sign-in email is managed separately.
      </PanelHead>

      <div className="account__identity">
        <span className="account__avatar" aria-hidden="true">
          {initials(user?.full_name, user?.email)}
        </span>
        <div>
          <p className="account__identity-name">{user?.full_name || 'Your account'}</p>
          <p className="account__identity-meta">
            {ROLE_LABELS[role] ?? 'Member'} · Member since {formatDate(user?.created_at)}
          </p>
        </div>
      </div>

      <form className="account__form" onSubmit={handleSubmit} noValidate>
        <TextField
          id="fullName"
          name="fullName"
          label="Full name"
          autoComplete="name"
          value={name}
          onChange={(event) => {
            setName(event.target.value)
            if (error) setError(null)
          }}
          error={error}
          maxLength={255}
        />

        <label className="account__readonly">
          <span>Sign-in email</span>
          <strong>{account.email || user?.email || '—'}</strong>
        </label>

        <div className="account__actions">
          <Button type="submit" variant="primary" loading={saving} trailingIcon={ArrowRight}>
            Save profile
          </Button>
          {savedWith ? (
            <span className="account__inline-ok">
              <CheckCircle size={15} aria-hidden="true" />
              Saved
            </span>
          ) : null}
        </div>
      </form>

      {import.meta.env.DEV ? (
        <DevNote>
          The API build has no profile-update route. In development the display name is stored in
          this browser under <code>reyvo.account.v1</code>; production reports the feature as
          unavailable instead.
        </DevNote>
      ) : null}
    </div>
  )
}

/* Email ------------------------------------------------------------------- */

function EmailPanel({ user, account, onAccountChange }) {
  const { toast } = useToast()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [errors, setErrors] = useState({})
  const [formError, setFormError] = useState(null)
  const [banner, setBanner] = useState(null)
  const [submitting, setSubmitting] = useState(false)
  const [confirming, setConfirming] = useState(false)

  const currentEmail = account.email || user?.email || ''
  const isLocalEmail = Boolean(account.email && account.email !== user?.email)
  const pendingExpiresAt = Number(account.pendingEmailExpiresAt ?? 0)
  const pendingExpired = Boolean(account.pendingEmail) && Date.now() > pendingExpiresAt

  async function handleSubmit(event) {
    event.preventDefault()
    setFormError(null)
    setBanner(null)

    const nextErrors = {}
    const emailError = validateEmail(email)
    if (emailError) nextErrors.email = emailError
    if (email.trim().toLowerCase() === currentEmail.toLowerCase()) {
      nextErrors.email = 'That is already your sign-in email.'
    }
    if (!password) nextErrors.password = 'Enter your current password to confirm.'

    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors)
      return
    }

    setErrors({})
    setSubmitting(true)

    try {
      const result = await requestEmailChange(user, {
        email,
        currentPassword: password,
      })
      setPassword('')
      setEmail('')
      onAccountChange()
      setBanner({
        tone: 'success',
        title: 'Verification pending.',
        text:
          result.development || import.meta.env.DEV
            ? `Use the development helper below to confirm ${result.pendingEmail}. Production sends a signed verification link and signs out every session.`
            : `We sent a verification link to ${result.pendingEmail}. Open it to finish the change.`,
      })
      toast.success('Verification requested for your new address.')
    } catch (caught) {
      if (caught?.fieldErrors?.email) {
        setErrors({ email: caught.fieldErrors.email })
      } else if (caught?.status === 401) {
        setErrors({ password: 'That password isn’t right. Try again.' })
      } else {
        setFormError(caught?.message || 'We could not start the email change. Try again.')
      }
    } finally {
      setSubmitting(false)
    }
  }

  async function handleConfirm() {
    setConfirming(true)
    setFormError(null)
    setBanner(null)

    try {
      const result = await confirmEmailChange(user.id)
      if (result.status === 'changed') {
        onAccountChange()
        setBanner({
          tone: 'success',
          title: 'Email confirmed.',
          text: `${result.email} is now the address stored for this account in this browser. Other demo sessions were signed out.`,
        })
        toast.success('New email confirmed.')
      } else if (result.status === 'expired') {
        onAccountChange()
        setBanner({
          tone: 'warning',
          title: 'That verification expired.',
          text: 'Start the change again to get a fresh 24-hour confirmation.',
        })
      } else {
        setBanner({
          tone: 'warning',
          title: 'Nothing left to confirm.',
          text: 'Start a new email change below.',
        })
      }
    } catch (caught) {
      setFormError(caught?.message || 'We could not confirm the new email. Try again.')
    } finally {
      setConfirming(false)
    }
  }

  async function handleCancel() {
    cancelEmailChange(user.id)
    onAccountChange()
    setBanner(null)
    toast.info('Email change cancelled.')
  }

  return (
    <div className="app-card account__card">
      <PanelHead icon={Mail} title="Email address">
        Changing your sign-in email needs your current password and a verified link. Every session
        is signed out when the new address is confirmed.
      </PanelHead>

      <div className="account__email-state">
        <div>
          <span className="account__field-label">Current address</span>
          <p className="account__email-value">{currentEmail || '—'}</p>
        </div>
        {isLocalEmail ? (
          <Badge tone="success" dot>
            Confirmed in this browser
          </Badge>
        ) : user?.email_verified_at ? (
          <Badge tone="success" dot>
            Verified
          </Badge>
        ) : (
          <>
            <Badge tone="warning" dot>
              Not verified
            </Badge>
            <Link to="/verify-email" className="account__inline-link">
              Verify now
            </Link>
          </>
        )}
      </div>

      {banner ? (
        <div className={`account__banner account__banner--${banner.tone}`} role="status">
          <p className="account__banner-title">{banner.title}</p>
          <p>{banner.text}</p>
        </div>
      ) : null}

      {account.pendingEmail && !pendingExpired ? (
        <div className="account__pending">
          <div className="account__pending-head">
            <span className="account__pending-icon" aria-hidden="true">
              <Clock size={16} />
            </span>
            <div>
              <p className="account__pending-title">Waiting on verification</p>
              <p className="account__pending-email">{account.pendingEmail}</p>
            </div>
          </div>
          <p className="account__pending-note">
            The link expires {formatDateTime(account.pendingEmailExpiresAt)} (24 hours).
            {import.meta.env.DEV
              ? ' This API build cannot send mail, so use the development confirmation below.'
              : ' Check the new inbox and open the link to finish.'}
          </p>
          <div className="account__actions">
            {import.meta.env.DEV ? (
              <Button
                variant="primary"
                loading={confirming}
                onClick={handleConfirm}
                leadingIcon={CheckCircle}
              >
                Confirm new email
              </Button>
            ) : null}
            <Button variant="ghost" onClick={handleCancel} disabled={confirming}>
              Cancel change
            </Button>
          </div>
          {import.meta.env.DEV ? (
            <DevNote>
              Development only: this confirms the pending address in <code>reyvo.account.v1</code>{' '}
              and revokes the other demo sessions. The API still holds the original address, so keep
              signing in with it until an email-change endpoint ships.
            </DevNote>
          ) : null}
        </div>
      ) : account.pendingEmail && pendingExpired ? (
        <div className="account__pending account__pending--expired">
          <p className="account__pending-title">That verification expired</p>
          <p className="account__pending-note">
            {account.pendingEmail} was not confirmed within {EMAIL_CHANGE_TTL_MS / 3_600_000} hours.
            Start again or cancel the request.
          </p>
          <div className="account__actions">
            <Button variant="ghost" onClick={handleCancel}>
              Cancel change
            </Button>
          </div>
        </div>
      ) : (
        <form className="account__form" onSubmit={handleSubmit} noValidate>
          <TextField
            id="email"
            name="email"
            type="email"
            label="New email address"
            placeholder="you@agency.com"
            autoComplete="email"
            value={email}
            onChange={(event) => {
              setEmail(event.target.value)
              if (errors.email) setErrors((current) => ({ ...current, email: null }))
              if (formError) setFormError(null)
            }}
            error={errors.email}
            maxLength={254}
          />

          <PasswordField
            id="emailPassword"
            name="emailPassword"
            label="Current password"
            placeholder="Confirm it’s you"
            autoComplete="current-password"
            value={password}
            onChange={(event) => {
              setPassword(event.target.value)
              if (errors.password) setErrors((current) => ({ ...current, password: null }))
              if (formError) setFormError(null)
            }}
            error={errors.password}
            maxLength={256}
          />

          {formError ? <ErrorNote>{formError}</ErrorNote> : null}

          <div className="account__actions">
            <Button type="submit" variant="primary" loading={submitting} trailingIcon={ArrowRight}>
              Send verification
            </Button>
          </div>
        </form>
      )}

      {import.meta.env.DEV ? (
        <DevNote>
          The API build has no email-change endpoint. Development verifies your current password
          against the live login route, then keeps the pending 24-hour change in this browser.
        </DevNote>
      ) : null}
    </div>
  )
}

/* Password ---------------------------------------------------------------- */

function PasswordPanel({ user, account, onAccountChange, onSessionsChanged }) {
  const { toast } = useToast()
  const [values, setValues] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  })
  const [errors, setErrors] = useState({})
  const [formError, setFormError] = useState(null)
  const [submitting, setSubmitting] = useState(false)
  const [success, setSuccess] = useState(null)

  const strength = passwordStrength(values.newPassword)

  function handleChange(event) {
    const { name, value } = event.target
    setValues((current) => ({ ...current, [name]: value }))
    if (errors[name]) setErrors((current) => ({ ...current, [name]: null }))
    if (formError) setFormError(null)
  }

  async function handleSubmit(event) {
    event.preventDefault()
    setFormError(null)
    setSuccess(null)

    const nextErrors = {}
    if (!values.currentPassword) nextErrors.currentPassword = 'Enter your current password.'

    const passwordError = validatePassword(values.newPassword)
    if (passwordError) nextErrors.newPassword = passwordError
    if (values.newPassword && values.newPassword === values.currentPassword) {
      nextErrors.newPassword = 'Choose a password that differs from the current one.'
    }

    if (!values.confirmPassword) {
      nextErrors.confirmPassword = 'Re-enter your new password.'
    } else if (values.confirmPassword !== values.newPassword) {
      nextErrors.confirmPassword = 'Passwords do not match.'
    }

    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors)
      return
    }

    setErrors({})
    setSubmitting(true)

    try {
      const result = await changePassword(user, {
        currentPassword: values.currentPassword,
        newPassword: values.newPassword,
      })
      setValues({ currentPassword: '', newPassword: '', confirmPassword: '' })
      setSuccess(result)
      onAccountChange()
      onSessionsChanged()
      toast.success('Password updated.')
    } catch (caught) {
      if (caught?.fieldErrors?.new_password) {
        setErrors({ newPassword: caught.fieldErrors.new_password })
      } else if (caught?.status === 401) {
        setErrors({ currentPassword: 'That password isn’t right. Try again.' })
      } else {
        setFormError(caught?.message || 'We could not change your password. Try again.')
      }
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="app-card account__card">
      <PanelHead icon={Lock} title="Password">
        Use at least 12 characters. Changing your password signs out every other session and every
        remembered workspace on this device will need a fresh sign-in.
      </PanelHead>

      {success ? (
        <div className="account__banner account__banner--success" role="status">
          <p className="account__banner-title">Password changed.</p>
          <p>
            Updated {formatDateTime(success.changedAt)}
            {success.revokedOthers ? ' · other sessions were signed out' : ''}.
          </p>
        </div>
      ) : null}

      <form className="account__form" onSubmit={handleSubmit} noValidate>
        <PasswordField
          id="currentPassword"
          name="currentPassword"
          label="Current password"
          placeholder="Confirm it’s you"
          autoComplete="current-password"
          value={values.currentPassword}
          onChange={handleChange}
          error={errors.currentPassword}
          maxLength={256}
        />

        <div>
          <PasswordField
            id="newPassword"
            name="newPassword"
            label="New password"
            placeholder="12+ characters"
            autoComplete="new-password"
            value={values.newPassword}
            onChange={handleChange}
            error={errors.newPassword}
            maxLength={256}
          />

          <div className="strength" aria-live="polite">
            <div className="strength__bars" aria-hidden="true">
              {[1, 2, 3, 4].map((bar) => (
                <span
                  key={bar}
                  className={`strength__bar ${values.newPassword && bar <= strength.score ? `is-on strength--${strength.score}` : ''}`}
                />
              ))}
            </div>
            <p className="strength__text">
              {values.newPassword ? (
                <>
                  Strength: <strong>{strength.label}</strong>
                  {strength.hints.length > 0 ? ` — add ${strength.hints.join(', ')}.` : '.'}
                </>
              ) : (
                'Use 12+ characters with a mix of letters, numbers and symbols.'
              )}
            </p>
          </div>
        </div>

        <PasswordField
          id="confirmPassword"
          name="confirmPassword"
          label="Confirm new password"
          placeholder="Repeat your new password"
          autoComplete="new-password"
          value={values.confirmPassword}
          onChange={handleChange}
          error={errors.confirmPassword}
          maxLength={256}
        />

        {formError ? <ErrorNote>{formError}</ErrorNote> : null}

        <div className="account__actions">
          <Button type="submit" variant="primary" loading={submitting} trailingIcon={ArrowRight}>
            Update password
          </Button>
          <Link to="/forgot-password" className="account__inline-link">
            Forgot your password?
          </Link>
        </div>
      </form>

      {account.passwordChangedAt ? (
        <p className="account__last-changed">
          <Clock size={14} aria-hidden="true" />
          Last password change in this browser: {formatDateTime(account.passwordChangedAt)}
        </p>
      ) : null}

      {import.meta.env.DEV ? (
        <DevNote>
          The API build has no password-change endpoint. Development verifies the current password
          against the live login route, records the change in <code>reyvo.account.v1</code>, and
          revokes other demo sessions — but it cannot rotate the server password.
        </DevNote>
      ) : null}
    </div>
  )
}

/* Sessions ---------------------------------------------------------------- */

function SessionsPanel({ user }) {
  const { toast } = useToast()
  const { signOut } = useSession()
  const [sessions, setSessions] = useState([])
  const [status, setStatus] = useState('loading')
  const [error, setError] = useState(null)
  const [refreshKey, setRefreshKey] = useState(0)
  const [pendingAction, setPendingAction] = useState(null)
  const [dialogLoading, setDialogLoading] = useState(false)
  const [dialogError, setDialogError] = useState(null)

  useEffect(() => {
    if (!user?.id) return undefined

    const controller = new AbortController()
    setStatus('loading')
    setError(null)

    loadSessions(user, controller.signal)
      .then((result) => {
        setSessions(result.sessions)
        setStatus('ready')
      })
      .catch((caught) => {
        if (caught?.name === 'AbortError') return
        setError(caught?.message || 'We could not load your active sessions.')
        setStatus('error')
      })

    return () => controller.abort()
  }, [user?.id, refreshKey])

  function reload() {
    setRefreshKey((current) => current + 1)
  }

  async function handleConfirm() {
    if (!pendingAction) return
    setDialogLoading(true)
    setDialogError(null)

    try {
      if (pendingAction.type === 'one') {
        const result = await revokeSession(user, pendingAction.session.id)
        if (result.current) {
          signOut()
          return
        }
        toast.success('That session was signed out.')
        setPendingAction(null)
        reload()
      } else if (pendingAction.type === 'others') {
        await revokeOtherSessions(user)
        toast.success('Every other session was signed out.')
        setPendingAction(null)
        reload()
      } else {
        await revokeAllSessions(user)
        toast.success('You were signed out everywhere.')
        signOut()
        return
      }
    } catch (caught) {
      setDialogError(caught?.message || 'We could not complete that sign-out. Try again.')
    } finally {
      setDialogLoading(false)
    }
  }

  async function handleResetDemo() {
    const result = await resetDevSessions(user)
    setSessions(result.sessions)
    setStatus('ready')
  }

  const otherCount = sessions.filter((session) => !session.current).length

  const dialogCopy = (() => {
    if (!pendingAction) return null
    if (pendingAction.type === 'one') {
      return {
        title: `Sign out ${pendingAction.session.device}?`,
        description: pendingAction.session.current
          ? 'This is the session you are using now. You will be returned to the sign-in screen.'
          : 'That device will need to sign in again with its email and password.',
        confirmLabel: 'Sign out session',
      }
    }
    if (pendingAction.type === 'others') {
      return {
        title: 'Sign out every other session?',
        description: `This keeps the browser you are using now and signs out ${otherCount} ${
          otherCount === 1 ? 'other session' : 'other sessions'
        }.`,
        confirmLabel: 'Sign out others',
      }
    }
    return {
      title: 'Sign out everywhere?',
      description:
        'Every device, including this one, will be signed out. You will need your email and password — and your authenticator code, if MFA is on — to get back in.',
      confirmLabel: 'Sign out everywhere',
    }
  })()

  return (
    <div className="app-card account__card">
      <PanelHead icon={Shield} title="Active sessions">
        Every browser and device with a live sign-in. Review the list and sign out anything you do
        not recognise.
      </PanelHead>

      {status === 'loading' ? (
        <p className="account__loading">Checking active sessions…</p>
      ) : status === 'error' ? (
        <div className="account__banner account__banner--danger" role="alert">
          <p className="account__banner-title">Sessions unavailable</p>
          <p>{error}</p>
          <div className="account__actions">
            <Button variant="ghost" onClick={reload} leadingIcon={Refresh}>
              Try again
            </Button>
          </div>
        </div>
      ) : sessions.length === 0 ? (
        <div className="account__empty">
          <p className="account__empty-title">No active sessions recorded.</p>
          <p>
            Signing out everywhere clears this list. Sign in again to create a fresh session.
          </p>
          {import.meta.env.DEV ? (
            <Button variant="ghost" size="sm" onClick={handleResetDemo}>
              Reset demo sessions
            </Button>
          ) : null}
        </div>
      ) : (
        <>
          <ul className="account__sessions">
            {sessions.map((session) => (
              <li key={session.id} className="account__session">
                <span className="account__session-icon" aria-hidden="true">
                  {session.current ? <Grid size={18} /> : <Globe size={18} />}
                </span>
                <div className="account__session-main">
                  <p className="account__session-device">
                    {session.device}
                    {session.current ? (
                      <Badge tone="success" size="sm" dot>
                        This device
                      </Badge>
                    ) : null}
                  </p>
                  {session.detail ? (
                    <p className="account__session-detail">{session.detail}</p>
                  ) : null}
                  <p className="account__session-meta">
                    <span>{session.location || 'Unknown location'}</span>
                    {session.ip ? <span>{session.ip}</span> : null}
                    <span>Active {formatRelative(session.lastActiveAt)}</span>
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="account__session-action"
                  onClick={() => {
                    setDialogError(null)
                    setPendingAction({ type: 'one', session })
                  }}
                >
                  Sign out
                </Button>
              </li>
            ))}
          </ul>

          <div className="account__actions account__actions--spread">
            <Button
              variant="ghost"
              onClick={() => {
                setDialogError(null)
                setPendingAction({ type: 'others' })
              }}
              disabled={otherCount === 0}
            >
              Sign out other sessions
            </Button>
            <Button
              variant="danger"
              onClick={() => {
                setDialogError(null)
                setPendingAction({ type: 'all' })
              }}
              leadingIcon={LogOut}
            >
              Sign out everywhere
            </Button>
          </div>
        </>
      )}

      {import.meta.env.DEV ? (
        <DevNote>
          The API build has no session endpoints. Development keeps this list in{' '}
          <code>reyvo.sessions.v1</code>; revoking a session updates the local list, and “sign out
          everywhere” clears every saved workspace on this device.
        </DevNote>
      ) : null}

      {pendingAction && dialogCopy ? (
        <ConfirmDialog
          open
          title={dialogCopy.title}
          description={dialogCopy.description}
          confirmLabel={dialogCopy.confirmLabel}
          loading={dialogLoading}
          onCancel={() => {
            if (dialogLoading) return
            setPendingAction(null)
            setDialogError(null)
          }}
          onConfirm={handleConfirm}
        >
          {dialogError ? <ErrorNote>{dialogError}</ErrorNote> : null}
          {pendingAction.type === 'all' ? (
            <p className="account__dialog-note">
              Prefer to keep this browser signed in? Use “Sign out other sessions” instead.
            </p>
          ) : null}
        </ConfirmDialog>
      ) : null}
    </div>
  )
}

/* Page -------------------------------------------------------------------- */

export function AccountPage() {
  usePageTitle('Account')

  const { user, role, tenant, profileStatus, retryProfile, updateUser, signOut } = useSession()
  const [account, setAccount] = useState(() => getAccountState(user?.id))
  const [sessionsRefreshKey, setSessionsRefreshKey] = useState(0)

  useEffect(() => {
    setAccount(getAccountState(user?.id))
  }, [user?.id])

  function refreshAccount() {
    setAccount(getAccountState(user?.id))
  }

  if (!user) {
    return (
      <div className="app-page account-page">
        <PageHeader
          eyebrow="Settings · Account"
          title="Account"
          description="Your profile, sign-in email, password, and the devices currently signed into this account."
        />
        <div className="app-card account__card">
          {profileStatus === 'error' ? (
            <>
              <ErrorNote>We could not load your account just now.</ErrorNote>
              <div className="account__actions">
                <Button variant="ghost" onClick={retryProfile} leadingIcon={Refresh}>
                  Try again
                </Button>
                <Button variant="quiet" onClick={signOut} leadingIcon={LogOut}>
                  Sign out
                </Button>
              </div>
            </>
          ) : (
            <p className="account__loading">Loading your account…</p>
          )}
        </div>
      </div>
    )
  }

  const canSeeSecurity = role === 'owner' || role === 'admin'

  return (
    <div className="app-page account-page">
      <PageHeader
        eyebrow="Settings · Account"
        title="Account"
        description="Your profile, sign-in email, password, and the devices currently signed into this account."
        meta={
          <>
            <Badge tone="neutral" dot>
              {ROLE_LABELS[role] ?? 'Member'}
            </Badge>
            <span className="account__meta-email">{account.email || user.email}</span>
            {tenant?.name ? (
              <span className="account__meta-tenant">{tenant.name}</span>
            ) : null}
          </>
        }
        actions={
          canSeeSecurity ? (
            <Link to="/app/settings/security" className="btn btn--ghost btn--sm">
              Security &amp; MFA
              <ArrowRight size={15} />
            </Link>
          ) : null
        }
      />

      <div className="account-page__body">
        <Tabs
          className="account-tabs"
          panelClassName="account-tabs__panel"
          label="Account settings"
          items={[
            {
              id: 'profile',
              label: 'Profile',
              content: (
                <ProfilePanel
                  user={user}
                  role={role}
                  account={account}
                  onPatched={(patch) => {
                    updateUser(patch)
                    refreshAccount()
                  }}
                />
              ),
            },
            {
              id: 'email',
              label: 'Email',
              content: (
                <EmailPanel user={user} account={account} onAccountChange={refreshAccount} />
              ),
            },
            {
              id: 'password',
              label: 'Password',
              content: (
                <PasswordPanel
                  user={user}
                  account={account}
                  onAccountChange={refreshAccount}
                  onSessionsChanged={() => setSessionsRefreshKey((key) => key + 1)}
                />
              ),
            },
            {
              id: 'sessions',
              label: 'Sessions',
              content: <SessionsPanel key={sessionsRefreshKey} user={user} />,
            },
          ]}
        />
      </div>
    </div>
  )
}
