import { useEffect, useMemo, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { PasswordField } from '../../components/Field'
import { AlertCircle, ArrowRight, CheckCircle, Lock, Refresh } from '../../components/icons'
import {
  AuthFlowShell,
  DevPanel,
  FlowActions,
  FlowStatus,
} from '../../components/auth/AuthFlowShell'
import { clearAllSessions } from '../../lib/auth'
import {
  PASSWORD_RESET_TTL_MS,
  createResetDemoLinks,
  loadResetToken,
  resetErrorState,
  resetPassword,
} from '../../lib/passwordReset'
import { usePageTitle } from '../../lib/usePageTitle'
import { passwordStrength, validatePassword } from '../../lib/validation'

const MINUTES = Math.round(PASSWORD_RESET_TTL_MS / 60_000)

export function ResetPasswordPage() {
  usePageTitle('Reset password')

  const location = useLocation()
  const token = new URLSearchParams(location.search).get('token')

  const [tokenState, setTokenState] = useState({
    status: token ? 'checking' : 'invalid',
    reason: token ? null : 'missing',
    email: null,
  })
  const [values, setValues] = useState({ password: '', confirmPassword: '' })
  const [errors, setErrors] = useState({})
  const [formError, setFormError] = useState(null)
  const [submitting, setSubmitting] = useState(false)
  const [done, setDone] = useState(null)

  useEffect(() => {
    if (!token) {
      setTokenState({ status: 'invalid', reason: 'missing', email: null })
      return undefined
    }

    let active = true
    setTokenState({ status: 'checking', reason: null, email: null })

    loadResetToken(token)
      .then((result) => {
        if (active) setTokenState(result)
      })
      .catch(() => {
        if (active) setTokenState({ status: 'invalid', reason: 'unknown', email: null })
      })

    return () => {
      active = false
    }
  }, [token])

  const devEmail = tokenState.email || 'demo@reyvo.com'
  const devLinks = useMemo(() => {
    if (!import.meta.env.DEV) return null
    if (tokenState.status !== 'invalid' && tokenState.status !== 'expired') return null
    return createResetDemoLinks(devEmail)
  }, [tokenState.status, devEmail])

  const strength = passwordStrength(values.password)

  function handleChange(event) {
    const { name, value } = event.target
    setValues((current) => ({ ...current, [name]: value }))
    if (errors[name]) setErrors((current) => ({ ...current, [name]: null }))
    if (formError) setFormError(null)
  }

  async function handleSubmit(event) {
    event.preventDefault()
    setFormError(null)

    const nextErrors = {}
    const passwordError = validatePassword(values.password)
    if (passwordError) nextErrors.password = passwordError

    if (!values.confirmPassword) {
      nextErrors.confirmPassword = 'Re-enter your new password.'
    } else if (values.confirmPassword !== values.password) {
      nextErrors.confirmPassword = 'Passwords do not match.'
    }

    setErrors(nextErrors)
    if (Object.keys(nextErrors).length > 0) {
      document.getElementById(Object.keys(nextErrors)[0])?.focus()
      return
    }

    setSubmitting(true)

    try {
      const result = await resetPassword({ token, password: values.password })
      clearAllSessions()
      setDone(result)
      setSubmitting(false)
    } catch (error) {
      const resetState = resetErrorState(error)
      const retryable =
        String(error?.code ?? '').startsWith('reset_') || error?.status === 410

      if (retryable) {
        setTokenState({ status: resetState, reason: error?.code ?? null, email: tokenState.email })
      } else {
        setFormError(
          error?.message || 'We could not update your password. Please request a new link.',
        )
      }
      setSubmitting(false)
    }
  }

  if (tokenState.status === 'checking') {
    return (
      <AuthFlowShell
        asideEyebrow="Account recovery"
        asideTitle={
          <>
            A fresh start, in <em>one</em> link.
          </>
        }
        asideLead="Reset links are single-use, expire quickly, and sign you out everywhere."
        eyebrow="Password reset"
        title="Checking your reset link"
      >
        <FlowStatus tone="pending" icon={Refresh} title="One moment.">
          <p>We’re checking the link with Reyvo. Don’t close this tab.</p>
        </FlowStatus>
      </AuthFlowShell>
    )
  }

  if (tokenState.status === 'expired' || tokenState.status === 'invalid') {
    const expired = tokenState.status === 'expired'
    const used = tokenState.reason === 'used'

    return (
      <AuthFlowShell
        asideEyebrow="Account recovery"
        asideTitle={
          <>
            Links expire. <em>Access</em> shouldn’t.
          </>
        }
        asideLead={`Reset links are single-use and expire after ${MINUTES} minutes. A fresh link takes one request.`}
        asidePoints={[
          `Every reset link expires after ${MINUTES} minutes`,
          'A used link cannot be replayed',
          'Requesting a new link does not reveal account details',
        ]}
        eyebrow="Password reset"
        title={expired ? 'This link has expired.' : 'This link isn’t valid.'}
        lead={
          <>
            {used
              ? 'This link was already used. Request a fresh one to reset your password again.'
              : `Reset links only work once and expire after ${MINUTES} minutes. Request a new one below.`}
          </>
        }
      >
        <FlowStatus
          tone="warning"
          icon={AlertCircle}
          eyebrow={expired ? 'Expired link' : 'Invalid link'}
          title={expired ? 'Request a new reset link.' : 'Start with a fresh link.'}
        >
          <p>
            For your security we never reuse reset links. Requesting another one replaces the old
            link.
          </p>

          <FlowActions>
            <Link to="/forgot-password" className="btn btn--primary">
              Request a new link
              <ArrowRight size={17} />
            </Link>
            <Link to="/login" className="btn btn--ghost">
              Back to sign in
            </Link>
          </FlowActions>

          {devLinks ? (
            <DevPanel title="Development tools">
              <p>
                This API build has no reset endpoint, so links live in this browser. Open a fresh
                one, or replay the expired and invalid states.
              </p>
              <div className="flow__dev-actions">
                <Link to={devLinks.valid} className="flow__dev-btn">
                  Open fresh link
                  <ArrowRight size={14} />
                </Link>
                <Link to={devLinks.expired} className="flow__dev-btn">
                  Open expired link
                </Link>
                <Link to={devLinks.invalid} className="flow__dev-btn">
                  Open invalid link
                </Link>
              </div>
            </DevPanel>
          ) : null}
        </FlowStatus>
      </AuthFlowShell>
    )
  }

  if (done) {
    return (
      <AuthFlowShell
        asideEyebrow="Account recovery"
        asideTitle={
          <>
            Back in, with a <em>new</em> key.
          </>
        }
        asideLead="Every other session was signed out when this password changed. That includes phones, laptops, and shared browsers."
        asidePoints={[
          'All previous sessions were invalidated',
          `The reset link can no longer be used`,
          'Sign in with the new password to continue',
        ]}
        eyebrow="Password reset"
        title="You’re all set."
        lead={
          <>
            Your password was updated for <span className="flow__email">{tokenState.email}</span>.
          </>
        }
      >
        <FlowStatus tone="success" icon={CheckCircle} title="Password updated.">
          <p>
            We signed out every device that was using the old password. Sign in with your new
            password to get back to your workspace.
          </p>

          <FlowActions>
            <Link to="/login" className="btn btn--primary">
              Sign in
              <ArrowRight size={17} />
            </Link>
          </FlowActions>

          {done.development ? (
            <p className="flow__note">
              Development only: the password was not changed on the API because this build has no
              reset endpoint. The token was consumed locally and all browser sessions were cleared.
            </p>
          ) : null}
        </FlowStatus>
      </AuthFlowShell>
    )
  }

  return (
    <AuthFlowShell
      asideEyebrow="Account recovery"
      asideTitle={
        <>
          A fresh start, in <em>one</em> link.
        </>
      }
      asideLead={`Choose a new password and every other session is signed out. The link itself expires after ${MINUTES} minutes and works once.`}
      asidePoints={[
        'At least 12 characters, mixing letters, numbers and symbols',
        'Every other session is signed out on reset',
        'The link is destroyed the moment it is used',
      ]}
      asideFoot={['Your password is never stored in the link', 'Support never asks for your password']}
      eyebrow="Password reset"
      title="Choose a new password."
      lead={
        tokenState.email ? (
          <>
            Resetting the password for <span className="flow__email">{tokenState.email}</span>.
          </>
        ) : (
          'Use at least 12 characters and a mix of letters, numbers and symbols.'
        )
      }
    >
      <form className="auth__form" onSubmit={handleSubmit} noValidate>
        {formError ? (
          <div className="auth__alert" role="alert">
            <span className="auth__alert-icon" aria-hidden="true">
              !
            </span>
            <div>
              <p>{formError}</p>
            </div>
          </div>
        ) : null}

        <div>
          <PasswordField
            id="password"
            name="password"
            label="New password"
            placeholder="12+ characters"
            autoComplete="new-password"
            value={values.password}
            onChange={handleChange}
            error={errors.password}
            maxLength={256}
          />

          <div className="strength" aria-live="polite">
            <div className="strength__bars" aria-hidden="true">
              {[1, 2, 3, 4].map((bar) => (
                <span
                  key={bar}
                  className={`strength__bar ${values.password && bar <= strength.score ? `is-on strength--${strength.score}` : ''}`}
                />
              ))}
            </div>
            <p className="strength__text">
              {values.password ? (
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

        <button
          type="submit"
          className="btn btn--primary btn--block auth__submit"
          disabled={submitting}
        >
          {submitting ? (
            <>
              <span className="btn__spinner" aria-hidden="true" />
              Updating password…
            </>
          ) : (
            <>
              Update password
              <ArrowRight size={18} />
            </>
          )}
        </button>

        <p className="flow__note">
          <Lock size={13} aria-hidden="true" /> Changing your password signs out all active sessions.
        </p>
      </form>
    </AuthFlowShell>
  )
}
