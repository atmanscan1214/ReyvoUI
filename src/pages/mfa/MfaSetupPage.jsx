import { useEffect, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { TextField } from '../../components/Field'
import { AlertCircle, ArrowRight, CheckCircle, Refresh, Shield } from '../../components/icons'
import { AuthFlowShell, FlowActions, FlowStatus } from '../../components/auth/AuthFlowShell'
import { api } from '../../lib/api'
import { saveSession } from '../../lib/auth'
import { generateTotp, totpRemainingSeconds, verifyMfaChallenge } from '../../lib/mfa'
import { usePageTitle } from '../../lib/usePageTitle'

export function MfaSetupPage() {
  usePageTitle('Set up two-factor authentication')

  const location = useLocation()
  const navigate = useNavigate()
  const challengeId = new URLSearchParams(location.search).get('challenge')
  const [enrollment, setEnrollment] = useState(null)
  const [setupError, setSetupError] = useState(null)
  const [code, setCode] = useState('')
  const [error, setError] = useState(null)
  const [submitting, setSubmitting] = useState(false)
  const [devCode, setDevCode] = useState(null)
  const [secondsLeft, setSecondsLeft] = useState(totpRemainingSeconds())
  const [challengeStatus, setChallengeStatus] = useState(challengeId ? 'loading' : 'invalid')

  useEffect(() => {
    if (!challengeId) return undefined

    const controller = new AbortController()
    api
      .mfaSetup({ challenge_id: challengeId }, controller.signal)
      .then((result) => {
        setEnrollment(result)
        setChallengeStatus('ready')
      })
      .catch((caught) => {
        if (caught?.name === 'AbortError') return
        setSetupError(caught?.message || 'We could not start MFA setup.')
        setChallengeStatus('invalid')
      })
    return () => controller.abort()
  }, [challengeId])

  useEffect(() => {
    if (!import.meta.env.DEV || !enrollment?.secret) return undefined

    let active = true
    async function tick() {
      try {
        const next = await generateTotp(enrollment.secret)
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

  async function handleSubmit(event) {
    event.preventDefault()
    setError(null)
    const normalized = code.replace(/\s+/g, '')
    if (!/^\d{6}$/.test(normalized)) {
      setError('Enter the 6-digit code from your authenticator app.')
      return
    }

    setSubmitting(true)
    try {
      const tokenPair = await verifyMfaChallenge(challengeId, normalized)
      if (!saveSession(tokenPair)) {
        throw new Error('The server returned an unusable sign-in. Please start again.')
      }
      navigate('/app', { replace: true })
    } catch (caught) {
      if (caught?.code === 'mfa_challenge_expired') setChallengeStatus('expired')
      else if (caught?.code === 'mfa_challenge_locked') setChallengeStatus('locked')
      else setError(caught?.message || 'We could not verify that code. Try again.')
    } finally {
      setSubmitting(false)
    }
  }

  if (challengeStatus !== 'ready') {
    const expired = challengeStatus === 'expired'
    const locked = challengeStatus === 'locked'
    return (
      <AuthFlowShell
        asideEyebrow="Required account protection"
        asideTitle={
          <>
            Protect the <em>platform</em>.
          </>
        }
        asideLead="Platform administrator accounts must use two-factor authentication."
        eyebrow="Required setup"
        title={
          challengeStatus === 'loading'
            ? 'Preparing secure setup…'
            : locked
              ? 'Too many attempts.'
              : expired
                ? 'This setup has expired.'
                : 'Setup could not be opened.'
        }
      >
        <FlowStatus
          tone={challengeStatus === 'loading' ? 'pending' : 'warning'}
          icon={challengeStatus === 'loading' ? Refresh : AlertCircle}
          title={challengeStatus === 'loading' ? 'One moment.' : 'Start a new sign-in.'}
        >
          <p>
            {setupError ||
              'MFA setup links expire after ten minutes and lock after five incorrect codes.'}
          </p>
          <FlowActions>
            <Link to="/login" className="btn btn--primary">
              Back to sign in
              <Refresh size={16} />
            </Link>
          </FlowActions>
        </FlowStatus>
      </AuthFlowShell>
    )
  }

  return (
    <AuthFlowShell
      asideEyebrow="Required account protection"
      asideTitle={
        <>
          Secure your <em>account</em>.
        </>
      }
      asideLead="Scan or enter the setup key in an authenticator app, then confirm a current code."
      asidePoints={[
        'Use an authenticator app such as 1Password or Google Authenticator',
        'Codes rotate every thirty seconds',
        'Keep your setup key private',
      ]}
      eyebrow="Required setup"
      title="Set up two-factor authentication."
      lead="Platform administrators must finish this step before accessing the workspace."
    >
      <div className="security__secret">
        <div>
          <span className="security__secret-label">Setup key</span>
          <code>{enrollment.secret}</code>
        </div>
      </div>
      <details className="security__uri">
        <summary>Prefer a setup URI?</summary>
        <code>{enrollment.otpauth_uri}</code>
      </details>

      <form className="auth__form" onSubmit={handleSubmit} noValidate>
        {error ? (
          <div className="auth__alert" role="alert">
            <span className="auth__alert-icon" aria-hidden="true">
              !
            </span>
            <div>
              <p>{error}</p>
            </div>
          </div>
        ) : null}
        <TextField
          id="code"
          name="code"
          label="Authentication code"
          inputMode="numeric"
          autoComplete="one-time-code"
          placeholder="000000"
          value={code}
          onChange={(event) => {
            setCode(event.target.value.replace(/[^\d\s]/g, '').slice(0, 7))
            if (error) setError(null)
          }}
          maxLength={7}
          className="flow__code-field"
          autoFocus
        />
        <button
          type="submit"
          className="btn btn--primary btn--block auth__submit"
          disabled={submitting}
        >
          {submitting ? (
            <>
              <span className="btn__spinner" aria-hidden="true" />
              Verifying code…
            </>
          ) : (
            <>
              Enable MFA and continue
              <ArrowRight size={18} />
            </>
          )}
        </button>
      </form>

      {import.meta.env.DEV && devCode ? (
        <FlowStatus tone="pending" icon={CheckCircle} title="Development helper">
          <p>
            Current valid code: <code>{devCode}</code> · refreshes in {secondsLeft}s.
          </p>
        </FlowStatus>
      ) : null}
      <p className="flow__note">
        <Shield size={13} aria-hidden="true" /> Setup expires in ten minutes.
      </p>
    </AuthFlowShell>
  )
}
