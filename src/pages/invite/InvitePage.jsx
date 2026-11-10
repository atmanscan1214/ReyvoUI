import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { CheckboxField, PasswordField, TextField } from '../../components/Field'
import { AlertCircle, ArrowRight, CheckCircle, Refresh, UserPlus } from '../../components/icons'
import {
  AuthFlowShell,
  DevPanel,
  FlowActions,
  FlowStatus,
} from '../../components/auth/AuthFlowShell'
import {
  INVITE_TTL_MS,
  acceptInvite,
  createDevInvite,
  inviteRoleLabel,
  loadInvite,
} from '../../lib/invites'
import { usePageTitle } from '../../lib/usePageTitle'
import { passwordStrength, validatePassword } from '../../lib/validation'

const EXPIRY_LABEL = `${Math.round(INVITE_TTL_MS / (24 * 60 * 60 * 1000))} days`

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

export function InvitePage() {
  usePageTitle('Workspace invitation')

  const { token } = useParams()
  const navigate = useNavigate()

  const [inviteState, setInviteState] = useState({ status: 'checking' })
  const [attempt, setAttempt] = useState(0)
  const [values, setValues] = useState({
    fullName: '',
    password: '',
    confirmPassword: '',
    terms: false,
  })
  const [errors, setErrors] = useState({})
  const [formError, setFormError] = useState(null)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    let active = true
    setInviteState({ status: 'checking' })

    loadInvite(token)
      .then((result) => {
        if (active) setInviteState(result)
      })
      .catch((error) => {
        if (!active) return
        setInviteState({
          status: 'error',
          message:
            error?.message ||
            'We could not check this invitation just now. Try again in a moment.',
        })
      })

    return () => {
      active = false
    }
  }, [token, attempt])

  const strength = passwordStrength(values.password)
  const invite = inviteState.invite

  const retry = useCallback(() => setAttempt((current) => current + 1), [])

  function handleChange(event) {
    const { name, value, checked, type } = event.target
    setValues((current) => ({ ...current, [name]: type === 'checkbox' ? checked : value }))
    if (errors[name]) setErrors((current) => ({ ...current, [name]: null }))
    if (formError) setFormError(null)
  }

  async function handleSubmit(event) {
    event.preventDefault()
    setFormError(null)

    const nextErrors = {}
    if (!values.fullName.trim()) nextErrors.fullName = 'Enter your full name.'
    else if (values.fullName.trim().length > 255) nextErrors.fullName = 'Use 255 characters or fewer.'

    const passwordError = validatePassword(values.password)
    if (passwordError) nextErrors.password = passwordError

    if (!values.confirmPassword) nextErrors.confirmPassword = 'Re-enter your password.'
    else if (values.confirmPassword !== values.password) {
      nextErrors.confirmPassword = 'Passwords do not match.'
    }

    if (!values.terms) nextErrors.terms = 'Accept the terms to join this workspace.'

    setErrors(nextErrors)
    if (Object.keys(nextErrors).length > 0) {
      document.getElementById(Object.keys(nextErrors)[0])?.focus()
      return
    }

    setSubmitting(true)

    try {
      const result = await acceptInvite(token, {
        fullName: values.fullName,
        password: values.password,
      })
      setInviteState({ status: 'success', invite: result.invite, development: result.development })
      setSubmitting(false)
    } catch (error) {
      const nextStatus = error?.details?.inviteStatus || error?.inviteStatus
      if (nextStatus) {
        setInviteState({ status: nextStatus, reason: nextStatus, invite })
      } else {
        setFormError(error?.message || 'We could not accept this invitation. Please try again.')
      }
      setSubmitting(false)
    }
  }

  const devTools = useMemo(
    () =>
      import.meta.env.DEV ? (
        <DevPanel title="No invitation endpoint on this API build">
          <p>
            Invitations are stored in this browser for development. Create a link to exercise the
            valid, expired, accepted, and invalid states.
          </p>
          <div className="flow__dev-actions">
            <button
              type="button"
              className="flow__dev-btn"
              onClick={() => openDevInvite('valid')}
            >
              Create valid invitation
            </button>
            <button
              type="button"
              className="flow__dev-btn"
              onClick={() => openDevInvite('expired')}
            >
              Create expired invitation
            </button>
            <button
              type="button"
              className="flow__dev-btn"
              onClick={() => openDevInvite('accepted')}
            >
              Create accepted invitation
            </button>
            <button
              type="button"
              className="flow__dev-btn"
              onClick={() => navigate('/invite/not-a-valid-token')}
            >
              Try an invalid token
            </button>
          </div>
        </DevPanel>
      ) : null,
    // The navigation helpers are stable for the lifetime of the page.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  )

  function openDevInvite(kind) {
    const next = createDevInvite({
      ageMs: kind === 'expired' ? INVITE_TTL_MS + 60 * 60 * 1000 : 0,
      accepted: kind === 'accepted',
    })
    navigate(`/invite/${encodeURIComponent(next.token)}`)
  }

  if (inviteState.status === 'checking') {
    return (
      <AuthFlowShell
        asideEyebrow="Workspace invitation"
        asideTitle={
          <>
            The next <em>seat</em> is yours.
          </>
        }
        asideLead="Reyvo workspaces are shared by teams. This link is your way in."
        eyebrow="Invitation"
        title="Checking your invitation"
      >
        <FlowStatus tone="pending" icon={Refresh} title="One moment.">
          <p>We’re checking that this invitation is still valid.</p>
        </FlowStatus>
      </AuthFlowShell>
    )
  }

  if (inviteState.status === 'error') {
    return (
      <AuthFlowShell
        asideEyebrow="Workspace invitation"
        asideTitle={
          <>
            The next <em>seat</em> is yours.
          </>
        }
        asideLead="Reyvo workspaces are shared by teams. This link is your way in."
        eyebrow="Invitation"
        title="We couldn’t check this invitation."
      >
        <FlowStatus tone="danger" icon={AlertCircle} title="Something got in the way.">
          <p>{inviteState.message}</p>
          <FlowActions>
            <button type="button" className="btn btn--primary" onClick={retry}>
              Try again
              <Refresh size={16} />
            </button>
            <Link to="/login" className="btn btn--ghost">
              Back to sign in
            </Link>
          </FlowActions>
        </FlowStatus>
      </AuthFlowShell>
    )
  }

  if (inviteState.status === 'expired' || inviteState.status === 'invalid') {
    const expired = inviteState.status === 'expired'
    return (
      <AuthFlowShell
        asideEyebrow="Workspace invitation"
        asideTitle={
          <>
            Invitations move <em>fast</em>.
          </>
        }
        asideLead={`Invitations expire after ${EXPIRY_LABEL}. Ask the workspace owner for a fresh one — it takes seconds.`}
        asidePoints={[
          `Invitations expire after ${EXPIRY_LABEL}`,
          'Each invitation works exactly once',
          'The owner can resend or revoke at any time',
        ]}
        eyebrow="Invitation"
        title={expired ? 'This invitation has expired.' : 'This invitation isn’t valid.'}
        lead={
          expired
            ? `Invitations expire after ${EXPIRY_LABEL} for security. Ask the workspace owner to send a new one.`
            : 'The link may be out of date, already used, or copied incompletely.'
        }
      >
        <FlowStatus
          tone="warning"
          icon={AlertCircle}
          eyebrow={expired ? 'Expired invitation' : 'Invalid invitation'}
          title="Ask for a fresh invitation."
        >
          <p>
            {invite?.tenantName
              ? `Contact the owner of ${invite.tenantName} and ask them to resend the invitation.`
              : 'Contact the workspace owner and ask them to resend the invitation.'}
          </p>

          <FlowActions>
            <Link to="/login" className="btn btn--primary">
              Sign in to an existing account
              <ArrowRight size={17} />
            </Link>
            <Link to="/register" className="btn btn--ghost">
              Create a workspace
            </Link>
          </FlowActions>

          {devTools}
        </FlowStatus>
      </AuthFlowShell>
    )
  }

  if (inviteState.status === 'accepted') {
    return (
      <AuthFlowShell
        asideEyebrow="Workspace invitation"
        asideTitle={
          <>
            You’re already <em>in</em>.
          </>
        }
        asideLead="This invitation has been used. Sign in to the workspace you already belong to."
        eyebrow="Invitation"
        title="This invitation was already accepted."
      >
        <FlowStatus tone="warning" icon={UserPlus} title="Nothing left to accept.">
          <p>
            {invite?.tenantName
              ? `Your account is already part of ${invite.tenantName}. Sign in to pick up where you left off.`
              : 'Your account already belongs to this workspace. Sign in to continue.'}
          </p>
          <FlowActions>
            <Link to="/login" className="btn btn--primary">
              Sign in
              <ArrowRight size={17} />
            </Link>
            <Link to="/forgot-password" className="btn btn--ghost">
              Forgot password?
            </Link>
          </FlowActions>
          {devTools}
        </FlowStatus>
      </AuthFlowShell>
    )
  }

  if (inviteState.status === 'success') {
    return (
      <AuthFlowShell
        asideEyebrow="Workspace invitation"
        asideTitle={
          <>
            Welcome to the <em>team</em>.
          </>
        }
        asideLead="Your account is ready. Sign in to open the workspace and finish setting up your sending details."
        asidePoints={[
          'Your role is waiting exactly as the owner set it',
          'The workspace stays isolated from other tenants',
          'An owner can adjust your role at any time',
        ]}
        eyebrow="Invitation accepted"
        title="You’re in."
        lead={
          <>
            Your Reyvo account is ready for{' '}
            <span className="flow__email">{inviteState.invite?.email}</span>.
          </>
        }
      >
        <FlowStatus tone="success" icon={CheckCircle} title="Invitation accepted.">
          <p>
            {inviteState.invite?.tenantName
              ? `You joined ${inviteState.invite.tenantName} as ${inviteRoleLabel(inviteState.invite.role)}. Sign in to open it.`
              : 'Sign in to open your new workspace.'}
          </p>

          <FlowActions>
            <Link
              to="/login"
              state={{ email: inviteState.invite?.email }}
              className="btn btn--primary"
            >
              Sign in to your workspace
              <ArrowRight size={17} />
            </Link>
          </FlowActions>

          {inviteState.development ? (
            <p className="flow__note">
              Development only: the invitation was accepted in this browser because the API build
              has no invite endpoint. No account was created on the server.
            </p>
          ) : null}
        </FlowStatus>
      </AuthFlowShell>
    )
  }

  return (
    <AuthFlowShell
      asideEyebrow="Workspace invitation"
      asideTitle={
        <>
          The next <em>seat</em> is yours.
        </>
      }
      asideLead={`You were invited to join a Reyvo workspace. Set a password now and use it any time after the invitation expires in ${EXPIRY_LABEL}.`}
      asidePoints={[
        'Your own login — never a shared password',
        'The role the workspace owner chose for you',
        'A workspace isolated from every other tenant',
      ]}
      asideFoot={['Invitation links work once', 'Your password is never shared with the owner']}
      eyebrow="Invitation"
      title={`Join ${invite?.tenantName ?? 'the workspace'}.`}
      lead={
        <>
          {invite?.inviterName
            ? `${invite.inviterName} invited you to ${invite.tenantName}.`
            : `You’ve been invited to ${invite?.tenantName ?? 'a Reyvo workspace'}.`}{' '}
          Set a password to accept.
        </>
      }
    >
      <div className="flow__invite">
        <p className="flow__invite-label">Invited email</p>
        <p className="flow__invite-email">{invite?.email}</p>
        <div className="flow__invite-grid">
          <div>
            <span>Workspace</span>
            <strong>{invite?.tenantName ?? '—'}</strong>
          </div>
          <div>
            <span>Role</span>
            <strong>{inviteRoleLabel(invite?.role)}</strong>
          </div>
          <div>
            <span>Invited by</span>
            <strong>{invite?.inviterName ?? 'Workspace owner'}</strong>
          </div>
          <div>
            <span>Expires</span>
            <strong>{formatDate(invite?.expiresAt)}</strong>
          </div>
        </div>
      </div>

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

        <TextField
          id="fullName"
          name="fullName"
          label="Your full name"
          placeholder="Dana Whitfield"
          autoComplete="name"
          value={values.fullName}
          onChange={handleChange}
          error={errors.fullName}
          maxLength={255}
        />

        <div>
          <PasswordField
            id="password"
            name="password"
            label="Password"
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
          label="Confirm password"
          placeholder="Repeat your password"
          autoComplete="new-password"
          value={values.confirmPassword}
          onChange={handleChange}
          error={errors.confirmPassword}
          maxLength={256}
        />

        <CheckboxField
          id="terms"
          name="terms"
          checked={values.terms}
          onChange={handleChange}
          error={errors.terms}
        >
          I agree to the <Link to="/terms">Terms</Link> and <Link to="/privacy">Privacy Policy</Link>.
        </CheckboxField>

        <button
          type="submit"
          className="btn btn--primary btn--block auth__submit"
          disabled={submitting}
        >
          {submitting ? (
            <>
              <span className="btn__spinner" aria-hidden="true" />
              Joining workspace…
            </>
          ) : (
            <>
              Accept invitation
              <ArrowRight size={18} />
            </>
          )}
        </button>

        <p className="flow__note">
          Already have a Reyvo account? <Link to="/login">Sign in first</Link> and the invitation
          will attach to it.
        </p>
      </form>
    </AuthFlowShell>
  )
}
