import { useState } from 'react'
import { Link } from 'react-router-dom'
import { TextField } from '../../components/Field'
import { ArrowRight, MailCheck } from '../../components/icons'
import {
  AuthFlowShell,
  DevPanel,
  FlowActions,
  FlowStatus,
} from '../../components/auth/AuthFlowShell'
import { ApiError } from '../../lib/api'
import { requestPasswordReset } from '../../lib/passwordReset'
import { usePageTitle } from '../../lib/usePageTitle'
import { validateEmail } from '../../lib/validation'

export function ForgotPasswordPage() {
  usePageTitle('Forgot password')

  const [values, setValues] = useState({ email: '' })
  const [error, setError] = useState(null)
  const [formError, setFormError] = useState(null)
  const [submitting, setSubmitting] = useState(false)
  const [result, setResult] = useState(null)
  const [requestedEmail, setRequestedEmail] = useState('')

  function handleChange(event) {
    const { name, value } = event.target
    setValues((current) => ({ ...current, [name]: value }))
    if (error) setError(null)
    if (formError) setFormError(null)
  }

  function startOver() {
    setResult(null)
    setValues({ email: requestedEmail })
    setError(null)
    setFormError(null)
  }

  async function handleSubmit(event) {
    event.preventDefault()
    setFormError(null)

    const emailError = validateEmail(values.email)
    setError(emailError)
    if (emailError) {
      document.getElementById('email')?.focus()
      return
    }

    const email = values.email.trim().toLowerCase()
    setSubmitting(true)

    try {
      const response = await requestPasswordReset(email)
      setRequestedEmail(email)
      setResult(response)
      setSubmitting(false)
    } catch (caught) {
      setFormError(
        caught instanceof ApiError
          ? caught.message
          : 'Something unexpected happened. Please try again.',
      )
      setSubmitting(false)
    }
  }

  return (
    <AuthFlowShell
      asideEyebrow="Account recovery"
      asideTitle={
        <>
          A lost password shouldn’t cost you a <em>day</em>.
        </>
      }
      asideLead="Reset links are single-use, expire in 30 minutes, and sign you out of every device. That is the point — not a side effect."
      asidePoints={[
        'Single-use links that expire after 30 minutes',
        'Every active session is signed out on reset',
        'The same response whether the email exists or not',
      ]}
      asideFoot={['Support never asks for your password', 'Reset links never contain your password']}
      eyebrow="Password reset"
      title="Forgot your password?"
      lead={
        <>
          Enter the work email on your account and we’ll send a reset link. Remembered it?{' '}
          <Link to="/login">Back to sign in</Link>.
        </>
      }
      footer={
        <span>
          Still stuck? <a href="mailto:hello@reyvo.com">hello@reyvo.com</a>
        </span>
      }
    >
      {result ? (
        <FlowStatus
          tone="success"
          icon={MailCheck}
          eyebrow="Check your inbox"
          title="If that email is registered, the link is on its way."
        >
          <p>
            We sent recovery instructions to <span className="flow__email">{requestedEmail}</span>.
            The link expires after 30 minutes and can only be used once.
          </p>
          <p>
            Nothing arrived? Check spam, then wait a minute before trying again. To keep accounts
            private, we show this message whether or not the address is registered.
          </p>

          <FlowActions>
            <Link to="/login" className="btn btn--ghost">
              Back to sign in
            </Link>
            <button type="button" className="btn btn--primary" onClick={startOver}>
              Use a different email
              <ArrowRight size={17} />
            </button>
          </FlowActions>

          {result.development ? (
            <DevPanel title="No mail service on this API build">
              <p>
                The reset link is shown here instead of being emailed. It is single-use and expires
                in 30 minutes, exactly like the real flow.
              </p>
              <div className="flow__dev-actions">
                <Link to={result.resetPath} className="flow__dev-btn">
                  Open valid reset link
                  <ArrowRight size={14} />
                </Link>
                <Link to={result.demoLinks.expired} className="flow__dev-btn">
                  Open expired link
                </Link>
                <Link to={result.demoLinks.invalid} className="flow__dev-btn">
                  Open invalid link
                </Link>
              </div>
            </DevPanel>
          ) : null}
        </FlowStatus>
      ) : (
        <form className="auth__form" onSubmit={handleSubmit} noValidate>
          {formError ? (
            <div className="auth__alert" role="alert">
              <span className="auth__alert-icon" aria-hidden="true">
                !
              </span>
              <div>
                <p>{formError}</p>
                {formError.toLowerCase().includes('could not reach') ? (
                  <p className="auth__alert-hint">Start the API on port 8000, then try again.</p>
                ) : null}
              </div>
            </div>
          ) : null}

          <TextField
            id="email"
            name="email"
            label="Work email"
            type="email"
            inputMode="email"
            placeholder="dana@youragency.com"
            autoComplete="email"
            value={values.email}
            onChange={handleChange}
            error={error}
            maxLength={254}
          />

          <button
            type="submit"
            className="btn btn--primary btn--block auth__submit"
            disabled={submitting}
          >
            {submitting ? (
              <>
                <span className="btn__spinner" aria-hidden="true" />
                Sending reset link…
              </>
            ) : (
              <>
                Send reset link
                <ArrowRight size={18} />
              </>
            )}
          </button>

          <p className="flow__note">
            Requests are rate-limited per account and per IP.
          </p>
        </form>
      )}
    </AuthFlowShell>
  )
}
