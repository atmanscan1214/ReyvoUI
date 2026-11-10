import { useEffect, useRef, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import {
  AlertCircle,
  ArrowRight,
  CheckCircle,
  Inbox,
  MailCheck,
  Refresh,
  Shield,
} from '../../components/icons'
import { Badge } from '../../components/ui'
import { confirmVerificationToken, sendVerificationEmail } from '../../lib/emailVerification'
import { isEmailVerified } from '../../lib/onboarding'
import { useSession } from '../../lib/session'
import { usePageTitle } from '../../lib/usePageTitle'

const RESEND_COOLDOWN_SECONDS = 30

function StatusShell({ tone = 'neutral', icon: Icon, title, children }) {
  return (
    <div className={`verify verify--${tone}`}>
      <span className="verify__icon" aria-hidden="true">
        <Icon size={26} />
      </span>
      <h1>{title}</h1>
      {children}
    </div>
  )
}

function SignedOutNotice() {
  return (
    <div className="verify">
      <span className="verify__icon" aria-hidden="true">
        <Inbox size={26} />
      </span>
      <h1>Sign in to verify your email.</h1>
      <p className="verify__lead">
        Verification links are tied to your Reyvo account. Sign in and we’ll pick up where you left
        off.
      </p>
      <div className="verify__actions">
        <Link to="/login" className="btn btn--primary">
          Sign in
          <ArrowRight size={17} />
        </Link>
        <Link to="/welcome" className="btn btn--ghost">
          Back to checklist
        </Link>
      </div>
    </div>
  )
}

export function VerifyEmailPage() {
  usePageTitle('Verify email')

  const location = useLocation()
  const token = new URLSearchParams(location.search).get('token')
  const { session, user, retryProfile } = useSession()

  const [verifyState, setVerifyState] = useState({
    status: token ? 'verifying' : 'idle',
    message: null,
    development: false,
  })
  const [resendStatus, setResendStatus] = useState('idle')
  const [resendError, setResendError] = useState(null)
  const [devLink, setDevLink] = useState(null)
  const [cooldown, setCooldown] = useState(0)

  const started = useRef(false)

  // A token in the URL means the user just clicked the email link. Verify it
  // once, then hold the outcome so a re-render cannot replay a single-use token.
  useEffect(() => {
    if (!token || started.current) return
    started.current = true

    confirmVerificationToken(token)
      .then((result) => {
        setVerifyState({ status: 'success', message: null, development: result.development })
        retryProfile()
      })
      .catch((error) => {
        const expired = error?.code === 'verification_expired'
        setVerifyState({
          status: expired ? 'expired' : 'invalid',
          message: error?.message || null,
          development: false,
        })
      })
  }, [token, retryProfile])

  useEffect(() => {
    if (cooldown <= 0) return undefined
    const timer = window.setTimeout(() => setCooldown((current) => current - 1), 1000)
    return () => window.clearTimeout(timer)
  }, [cooldown])

  const verified = isEmailVerified(user)

  async function handleResend() {
    if (!user || resendStatus === 'sending' || cooldown > 0) return

    setResendStatus('sending')
    setResendError(null)
    setDevLink(null)

    try {
      const result = await sendVerificationEmail(user)
      setResendStatus('sent')
      if (result.development && result.verifyPath) {
        setDevLink(result.verifyPath)
      }
      setCooldown(RESEND_COOLDOWN_SECONDS)
    } catch (error) {
      setResendStatus('error')
      setResendError(
        error?.message || 'We could not send the verification email. Try again in a moment.',
      )
    }
  }

  if (!session && !token) return <SignedOutNotice />

  if (verifyState.status === 'verifying') {
    return (
      <StatusShell tone="pending" icon={Refresh} title="Verifying your email">
        <p className="verify__lead">
          One moment while we confirm this link with Reyvo. Don’t close this tab.
        </p>
        <span className="verify__spinner" aria-hidden="true" />
      </StatusShell>
    )
  }

  if (verifyState.status === 'success') {
    return (
      <StatusShell tone="success" icon={CheckCircle} title="Your email is verified.">
        <p className="verify__lead">
          {session
            ? 'Thanks — that was the last check on your account. Head back to the checklist to finish your mailing address.'
            : 'Thanks for confirming. Sign in to continue setting up your workspace.'}
        </p>
        {verifyState.development ? (
          <p className="verify__dev-note">
            <Badge tone="warning" size="sm" dot>
              Development
            </Badge>
            Verified with the local fallback because this API build has no verification endpoint.
          </p>
        ) : null}
        <div className="verify__actions">
          {session ? (
            <Link to="/welcome" className="btn btn--primary">
              Back to checklist
              <ArrowRight size={17} />
            </Link>
          ) : (
            <Link to="/login" className="btn btn--primary">
              Sign in
              <ArrowRight size={17} />
            </Link>
          )}
        </div>
      </StatusShell>
    )
  }

  if (verifyState.status === 'expired' || verifyState.status === 'invalid') {
    return (
      <StatusShell
        tone="warning"
        icon={AlertCircle}
        title={verifyState.status === 'expired' ? 'This link has expired.' : 'This link isn’t valid.'}
      >
        <p className="verify__lead">
          {verifyState.message ||
            'Verification links can only be used once and expire after 24 hours. Request a fresh one below.'}
        </p>
        <div className="verify__actions">
          <button
            type="button"
            className="btn btn--primary"
            onClick={handleResend}
            disabled={!user || resendStatus === 'sending' || cooldown > 0}
          >
            {resendStatus === 'sending'
              ? 'Sending…'
              : cooldown > 0
                ? `Resend in ${cooldown}s`
                : 'Send a new link'}
            <Refresh size={16} />
          </button>
          <Link to="/welcome" className="btn btn--ghost">
            Back to checklist
          </Link>
        </div>
        {resendError ? (
          <p className="verify__error" role="alert">
            {resendError}
          </p>
        ) : null}
        {devLink ? <DevLink path={devLink} /> : null}
        {!user ? (
          <p className="verify__muted">
            Sign in first, then request a new verification link.
          </p>
        ) : null}
      </StatusShell>
    )
  }

  if (verified) {
    return (
      <StatusShell tone="success" icon={CheckCircle} title="Your email is verified.">
        <p className="verify__lead">
          You’re all set. Next, add your agency’s mailing address so campaigns can send.
        </p>
        <div className="verify__actions">
          <Link to="/welcome" className="btn btn--primary">
            Back to checklist
            <ArrowRight size={17} />
          </Link>
        </div>
      </StatusShell>
    )
  }

  return (
    <div className="verify">
      <span className="verify__icon" aria-hidden="true">
        <MailCheck size={26} />
      </span>
      <p className="eyebrow">Onboarding · Required step</p>
      <h1>Check your inbox.</h1>
      <p className="verify__lead">
        We sent a verification link to{' '}
        <strong>{user?.email ?? 'your work email'}</strong>. Open it on any device to confirm your
        address. The link expires after 24 hours.
      </p>

      <div className="verify__steps">
        <div>
          <span>1</span>
          <p>Open the email from Reyvo.</p>
        </div>
        <div>
          <span>2</span>
          <p>Click <strong>Verify email</strong>. This page updates automatically.</p>
        </div>
        <div>
          <span>3</span>
          <p>Come back to the checklist and add your mailing address.</p>
        </div>
      </div>

      <div className="verify__actions">
        <button
          type="button"
          className="btn btn--primary"
          onClick={handleResend}
          disabled={!user || resendStatus === 'sending' || cooldown > 0}
        >
          {resendStatus === 'sending'
            ? 'Sending…'
            : cooldown > 0
              ? `Resend in ${cooldown}s`
              : 'Resend verification email'}
          <Refresh size={16} />
        </button>
        <Link to="/welcome" className="btn btn--ghost">
          Back to checklist
        </Link>
      </div>

      {resendStatus === 'sent' && !devLink ? (
        <p className="verify__notice" role="status">
          Sent. Check your inbox and spam folder — the new link replaces the old one.
        </p>
      ) : null}

      {resendError ? (
        <p className="verify__error" role="alert">
          {resendError}
        </p>
      ) : null}

      {devLink ? (
        <DevLink path={devLink}>
          The API has no mailing service in this build, so the verification link is shown here
          instead.
        </DevLink>
      ) : null}

      <p className="verify__muted">
        <Shield size={14} aria-hidden="true" />
        Wrong address? Sign out and register again, or contact{' '}
        <a href="mailto:hello@reyvo.com">hello@reyvo.com</a>.
      </p>
    </div>
  )
}

function DevLink({ path, children }) {
  return (
    <div className="verify__dev">
      <p className="verify__dev-head">
        <Badge tone="warning" size="sm" dot>
          Development only
        </Badge>
      </p>
      <p>
        {children ||
          'This API build has no verification endpoint, so this local link stands in for the email.'}
      </p>
      <Link to={path} className="verify__dev-link">
        Open verification link
        <ArrowRight size={15} />
      </Link>
    </div>
  )
}
