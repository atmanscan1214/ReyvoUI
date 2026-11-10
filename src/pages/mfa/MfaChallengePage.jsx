import { useEffect, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { TextField } from '../../components/Field'
import {
  AlertCircle,
  ArrowRight,
  CheckCircle,
  Lock,
  Refresh,
  Shield,
} from '../../components/icons'
import {
  AuthFlowShell,
  DevPanel,
  FlowActions,
  FlowStatus,
} from '../../components/auth/AuthFlowShell'
import {
  MFA_MAX_ATTEMPTS,
  generateTotp,
  getChallengeUser,
  getMfaSecret,
  readMfaChallenge,
  totpRemainingSeconds,
  verifyMfaChallenge,
} from '../../lib/mfa'
import { useSession } from '../../lib/session'
import { usePageTitle } from '../../lib/usePageTitle'

export function MfaChallengePage() {
  usePageTitle('Two-factor authentication')

  const location = useLocation()
  const navigate = useNavigate()
  const { session, user, profileStatus, signOut } = useSession()

  const challengeId = new URLSearchParams(location.search).get('challenge')
  const [challengeState, setChallengeState] = useState(() => readMfaChallenge(challengeId))
  const [code, setCode] = useState('')
  const [error, setError] = useState(null)
  const [submitting, setSubmitting] = useState(false)
  const [devCode, setDevCode] = useState(null)
  const [secondsLeft, setSecondsLeft] = useState(totpRemainingSeconds())

  const challengeUser = challengeState.challenge
    ? getChallengeUser(challengeState.challenge.userId)
    : null

  useEffect(() => {
    setChallengeState(readMfaChallenge(challengeId))
  }, [challengeId])

  // Development helper: show the current valid code so the challenge can be
  // exercised without configuring an external authenticator app.
  useEffect(() => {
    if (!import.meta.env.DEV || challengeState.status !== 'valid') return undefined
    const userId = challengeState.challenge?.userId
    const secret = getMfaSecret(userId)
    if (!secret) return undefined

    let active = true

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
  }, [challengeState.status, challengeState.challenge?.userId])

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
      const result = await verifyMfaChallenge(challengeId, normalized)

      if (result.status === 'success') {
        setChallengeState((current) => ({
          status: 'success',
          challenge: current.challenge,
          development: result.development,
        }))
      } else if (result.status === 'invalid' && result.reason === 'code') {
        setError(
          result.attemptsLeft > 0
            ? `That code isn’t valid. ${result.attemptsLeft} ${
                result.attemptsLeft === 1 ? 'attempt' : 'attempts'
              } left.`
            : 'That code isn’t valid.',
        )
        setCode('')
      } else {
        setChallengeState((current) => ({
          status: result.status,
          challenge: current.challenge,
          development: result.development,
        }))
      }
    } catch (caught) {
      setError(
        caught?.message || 'We could not verify that code just now. Wait a moment and try again.',
      )
    } finally {
      setSubmitting(false)
    }
  }

  function startOver() {
    if (session) {
      signOut()
    } else {
      navigate('/login', { replace: true })
    }
  }

  const status = challengeState.status

  if (status === 'success') {
    return (
      <AuthFlowShell
        asideEyebrow="Two-factor authentication"
        asideTitle={
          <>
            Verified. <em>Welcome</em> back.
          </>
        }
        asideLead="The second factor matched. Your workspace is waiting exactly where you left it."
        eyebrow="Two-factor authentication"
        title="You’re verified."
        lead={
          challengeUser?.email ? (
            <>
              Signed in as <span className="flow__email">{challengeUser.email}</span>.
            </>
          ) : (
            'Your second factor matched.'
          )
        }
      >
        <FlowStatus tone="success" icon={CheckCircle} title="Identity confirmed.">
          <p>
            That code was accepted. Continue to your workspace — this challenge cannot be replayed.
          </p>
          <FlowActions>
            <button
              type="button"
              className="btn btn--primary"
              onClick={() => navigate('/app', { replace: true })}
            >
              Continue to workspace
              <ArrowRight size={17} />
            </button>
          </FlowActions>
          {challengeState.development ? (
            <p className="flow__note">
              Development only: this challenge was verified against a locally stored authenticator
              secret because the API build has no MFA endpoint.
            </p>
          ) : null}
        </FlowStatus>
      </AuthFlowShell>
    )
  }

  if (status === 'expired' || status === 'invalid' || status === 'locked') {
    const expired = status === 'expired'
    const locked = status === 'locked'

    return (
      <AuthFlowShell
        asideEyebrow="Two-factor authentication"
        asideTitle={
          <>
            One more <em>step</em>.
          </>
        }
        asideLead="Challenges are short-lived on purpose. Starting over takes one sign-in."
        asidePoints={[
          'Challenges expire after five minutes',
          `A challenge locks after ${MFA_MAX_ATTEMPTS} wrong codes`,
          'Codes rotate every thirty seconds',
        ]}
        eyebrow="Two-factor authentication"
        title={
          locked
            ? 'Too many attempts.'
            : expired
              ? 'This challenge has expired.'
              : 'This challenge isn’t valid.'
        }
        lead={
          locked
            ? `This challenge locked after ${MFA_MAX_ATTEMPTS} incorrect codes. Sign in again to start a fresh one.`
            : expired
              ? 'Challenges last five minutes. Sign in again to get a new one.'
              : 'The challenge may have been used already, or the link is incomplete.'
        }
      >
        <FlowStatus
          tone="warning"
          icon={locked ? Lock : AlertCircle}
          eyebrow={expired ? 'Expired challenge' : locked ? 'Locked challenge' : 'Invalid challenge'}
          title={locked ? 'Start a new sign-in.' : 'Sign in again to continue.'}
        >
          <p>
            Nothing is wrong with your account. Two-factor challenges are deliberately short-lived
            and single-use.
          </p>
          <FlowActions>
            <button type="button" className="btn btn--primary" onClick={startOver}>
              Sign out and start over
              <Refresh size={16} />
            </button>
          </FlowActions>
          {session ? (
            <p className="flow__note">
              Or <Link to="/app">return to your workspace</Link> if you already finished signing in.
            </p>
          ) : (
            <p className="flow__note">
              <Link to="/login">Back to sign in</Link>
            </p>
          )}
        </FlowStatus>
      </AuthFlowShell>
    )
  }

  if (status === 'used') {
    return (
      <AuthFlowShell
        asideEyebrow="Two-factor authentication"
        asideTitle={
          <>
            Already <em>verified</em>.
          </>
        }
        asideLead="This challenge was completed. Continue to the workspace rather than replaying it."
        eyebrow="Two-factor authentication"
        title="This challenge was already used."
      >
        <FlowStatus tone="success" icon={CheckCircle} title="Nothing left to verify.">
          <p>The second factor already matched for this sign-in.</p>
          <FlowActions>
            <button
              type="button"
              className="btn btn--primary"
              onClick={() => navigate('/app', { replace: true })}
            >
              Continue to workspace
              <ArrowRight size={17} />
            </button>
          </FlowActions>
        </FlowStatus>
      </AuthFlowShell>
    )
  }

  if (!session) {
    return (
      <AuthFlowShell
        asideEyebrow="Two-factor authentication"
        asideTitle={
          <>
            One more <em>step</em>.
          </>
        }
        asideLead="The MFA challenge finishes a sign-in. Start from the sign-in page so Reyvo can tie the challenge to your account."
        eyebrow="Two-factor authentication"
        title="Sign in to continue."
      >
        <FlowStatus tone="warning" icon={Shield} title="This challenge needs an active sign-in.">
          <p>Sign in with your email and password, then enter the code from your authenticator app.</p>
          <FlowActions>
            <Link to="/login" className="btn btn--primary">
              Go to sign in
              <ArrowRight size={17} />
            </Link>
          </FlowActions>
        </FlowStatus>
      </AuthFlowShell>
    )
  }

  if (profileStatus === 'loading') {
    return (
      <AuthFlowShell
        asideEyebrow="Two-factor authentication"
        asideTitle={
          <>
            One more <em>step</em>.
          </>
        }
        asideLead="We’re confirming the account behind this challenge."
        eyebrow="Two-factor authentication"
        title="Checking your account"
      >
        <FlowStatus tone="pending" icon={Refresh} title="One moment.">
          <p>We’re matching this challenge to your sign-in.</p>
        </FlowStatus>
      </AuthFlowShell>
    )
  }

  if (
    user?.id &&
    challengeState.challenge?.userId &&
    user.id !== challengeState.challenge.userId
  ) {
    return (
      <AuthFlowShell
        asideEyebrow="Two-factor authentication"
        asideTitle={
          <>
            One more <em>step</em>.
          </>
        }
        asideLead="This challenge belongs to a different account than the one currently signed in."
        eyebrow="Two-factor authentication"
        title="This challenge belongs to another account."
      >
        <FlowStatus tone="warning" icon={AlertCircle} title="Sign in again with the right account.">
          <p>Sign out, then start the sign-in again with the account that owns this challenge.</p>
          <FlowActions>
            <button type="button" className="btn btn--primary" onClick={startOver}>
              Sign out
              <Refresh size={16} />
            </button>
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
      asideLead="Enter the six-digit code from your authenticator app. Codes rotate every thirty seconds and each challenge can only be used once."
      asidePoints={[
        'Codes rotate every thirty seconds',
        'Previous and next codes are accepted for clock drift',
        `Five wrong codes lock this challenge`,
      ]}
      asideFoot={['Reyvo never asks for your TOTP secret by email', 'Lost your device? Ask an owner to reset MFA']}
      eyebrow="Two-factor authentication"
      title="Enter your authentication code."
      lead={
        challengeUser?.email ? (
          <>
            Confirming the sign-in for <span className="flow__email">{challengeUser.email}</span>.
          </>
        ) : (
          'Enter the code shown in your authenticator app.'
        )
      }
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

      {import.meta.env.DEV && devCode ? (
        <DevPanel title="Authenticator helper">
          <p>
            In production this code lives in your authenticator app. For this build, the current
            valid code is:
          </p>
          <p className="flow__code" aria-live="polite">
            {devCode}
          </p>
          <p>Refreshes in {secondsLeft}s.</p>
        </DevPanel>
      ) : null}
    </AuthFlowShell>
  )
}
