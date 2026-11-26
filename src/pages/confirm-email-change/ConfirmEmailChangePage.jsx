import { useEffect, useRef, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { AlertCircle, ArrowRight, CheckCircle, MailCheck, Refresh } from '../../components/icons'
import {
  AuthFlowShell,
  FlowActions,
  FlowStatus,
} from '../../components/auth/AuthFlowShell'
import { confirmEmailChange } from '../../lib/account'
import { clearAllSessions } from '../../lib/auth'
import { usePageTitle } from '../../lib/usePageTitle'

/**
 * Public landing page for the emailed email-change link. Confirmation is
 * token-based and revokes every session, so this page never depends on the
 * browser that started the change being signed in.
 */
export function ConfirmEmailChangePage() {
  usePageTitle('Confirm email change')

  const location = useLocation()
  const token = new URLSearchParams(location.search).get('token')

  const [state, setState] = useState({
    status: token ? 'confirming' : 'invalid',
    email: null,
    message: null,
  })

  const started = useRef(false)

  useEffect(() => {
    if (!token || started.current) return
    started.current = true

    confirmEmailChange(null, token)
      .then((result) => {
        if (result.status === 'changed') {
          clearAllSessions()
          setState({ status: 'success', email: result.email, message: null })
          return
        }
        setState({
          status: result.status === 'expired' ? 'expired' : 'invalid',
          email: null,
          message: null,
        })
      })
      .catch((error) => {
        setState({
          status: error?.code === 'email_change_expired' ? 'expired' : 'invalid',
          email: null,
          message: error?.message || null,
        })
      })
  }, [token])

  if (state.status === 'confirming') {
    return (
      <AuthFlowShell
        asideEyebrow="Account security"
        asideTitle={
          <>
            One address, <em>confirmed</em>.
          </>
        }
        asideLead="Confirmation links are single-use, expire after 24 hours, and sign you out everywhere."
        eyebrow="Email change"
        title="Confirming your new address"
      >
        <FlowStatus tone="pending" icon={Refresh} title="One moment.">
          <p>We’re confirming this link with Reyvo. Don’t close this tab.</p>
        </FlowStatus>
      </AuthFlowShell>
    )
  }

  if (state.status === 'success') {
    return (
      <AuthFlowShell
        asideEyebrow="Account security"
        asideTitle={
          <>
            The new address is <em>live</em>.
          </>
        }
        asideLead="Every other session was signed out when this change completed. Sign in again with the new address to get back to work."
        asidePoints={[
          'The new address is now your sign-in email',
          'Every previous session was invalidated',
          'The confirmation link can no longer be used',
        ]}
        eyebrow="Email change"
        title="Your email address was updated."
        lead={
          state.email ? (
            <>
              Sign in with <span className="flow__email">{state.email}</span> from now on.
            </>
          ) : (
            'Sign in with your new address from now on.'
          )
        }
      >
        <FlowStatus tone="success" icon={CheckCircle} title="Email confirmed.">
          <p>
            We signed out every device that was using the old address. Sign in with the new address
            to continue.
          </p>

          <FlowActions>
            <Link to="/login" className="btn btn--primary">
              Sign in
              <ArrowRight size={17} />
            </Link>
          </FlowActions>
        </FlowStatus>
      </AuthFlowShell>
    )
  }

  const expired = state.status === 'expired'

  return (
    <AuthFlowShell
      asideEyebrow="Account security"
      asideTitle={
        <>
          Links expire. <em>Access</em> shouldn’t.
        </>
      }
      asideLead="Email-change links are single-use and expire after 24 hours. Start the change again from your account settings to get a fresh link."
      asidePoints={[
        'Every confirmation link expires after 24 hours',
        'A used link cannot be replayed',
        'Your current sign-in address stays active until the new one is confirmed',
      ]}
      eyebrow="Email change"
      title={expired ? 'This link has expired.' : 'This link isn’t valid.'}
      lead={
        state.message ||
        (expired
          ? 'Start the email change again to get a fresh 24-hour confirmation link.'
          : 'Confirmation links only work once. Start the change again from your account settings.')
      }
    >
      <FlowStatus
        tone="warning"
        icon={AlertCircle}
        eyebrow={expired ? 'Expired link' : 'Invalid link'}
        title="Start a new email change."
      >
        <p>
          Open Account settings → Email, enter the new address and your current password, then use
          the fresh link we send.
        </p>

        <FlowActions>
          <Link to="/app/settings/account" className="btn btn--primary">
            Account settings
            <ArrowRight size={17} />
          </Link>
          <Link to="/login" className="btn btn--ghost">
            Back to sign in
          </Link>
        </FlowActions>

        <p className="flow__note">
          <MailCheck size={13} aria-hidden="true" /> Need help? Contact support from the sign-in
          screen.
        </p>
      </FlowStatus>
    </AuthFlowShell>
  )
}
