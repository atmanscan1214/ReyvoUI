import { useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { TextField } from '../../components/Field'
import { AlertCircle, ArrowRight, CheckCircle, Lock, Refresh } from '../../components/icons'
import { AuthFlowShell, FlowActions, FlowStatus } from '../../components/auth/AuthFlowShell'
import { saveSession } from '../../lib/auth'
import { verifyMfaChallenge } from '../../lib/mfa'
import { usePageTitle } from '../../lib/usePageTitle'

export function MfaChallengePage() {
  usePageTitle('Two-factor authentication')

  const location = useLocation()
  const navigate = useNavigate()
  const challengeId = new URLSearchParams(location.search).get('challenge')
  const [code, setCode] = useState('')
  const [error, setError] = useState(null)
  const [submitting, setSubmitting] = useState(false)
  const [challengeStatus, setChallengeStatus] = useState(challengeId ? 'ready' : 'invalid')

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
      else if (caught?.code === 'mfa_challenge_used') setChallengeStatus('used')
      else setError(caught?.message || 'We could not verify that code. Try again.')
    } finally {
      setSubmitting(false)
    }
  }

  if (challengeStatus !== 'ready') {
    const expired = challengeStatus === 'expired'
    const locked = challengeStatus === 'locked'
    const used = challengeStatus === 'used'
    return (
      <AuthFlowShell
        asideEyebrow="Two-factor authentication"
        asideTitle={
          <>
            One more <em>step</em>.
          </>
        }
        asideLead="Challenges are deliberately short-lived and can only be used once."
        eyebrow="Two-factor authentication"
        title={
          used
            ? 'This challenge was already used.'
            : locked
              ? 'Too many attempts.'
              : expired
                ? 'This challenge has expired.'
                : 'This challenge is not valid.'
        }
        lead={
          used
            ? 'Sign in again if you need a new challenge.'
            : `Sign in again to start a fresh ${locked ? 'challenge' : 'sign-in'}.`
        }
      >
        <FlowStatus
          tone={used ? 'success' : 'warning'}
          icon={used ? CheckCircle : AlertCircle}
          title={used ? 'Already verified.' : 'Start a new sign-in.'}
        >
          <p>Challenges expire after five minutes and lock after five incorrect codes.</p>
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
      asideEyebrow="Two-factor authentication"
      asideTitle={
        <>
          One more <em>step</em> before the workspace.
        </>
      }
      asideLead="Enter the six-digit code from your authenticator app to finish signing in."
      asidePoints={[
        'Codes rotate every thirty seconds',
        'Previous and next codes are accepted for clock drift',
        'Five incorrect attempts lock this challenge',
      ]}
      asideFoot={['Reyvo never asks for your TOTP secret by email']}
      eyebrow="Two-factor authentication"
      title="Enter your authentication code."
      lead="Your password was accepted. Complete the second factor to continue."
    >
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
              Verify code
              <ArrowRight size={18} />
            </>
          )}
        </button>

        <p className="flow__note">
          <Lock size={13} aria-hidden="true" /> This challenge expires in five minutes.
        </p>
      </form>
    </AuthFlowShell>
  )
}
