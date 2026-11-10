import { useEffect, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { Logo } from '../../components/Logo'
import {
  ArrowRight,
  Building,
  Check,
  Database,
  Inbox,
  MailCheck,
  Send,
  Users,
} from '../../components/icons'
import { api } from '../../lib/api'
import { clearSession, readSession } from '../../lib/auth'
import { usePageTitle } from '../../lib/usePageTitle'
import './welcome.css'

const NEXT_STEPS = [
  {
    icon: Inbox,
    title: 'Connect a mailbox',
    body: 'Link Google Workspace or Microsoft 365 so Reyvo can send as you.',
    tag: '2 minutes',
  },
  {
    icon: Building,
    title: 'Add your mailing address',
    body: 'Required before your first campaign goes out. It appears in your email footer.',
    tag: 'Required',
  },
  {
    icon: Database,
    title: 'Import your market',
    body: 'Bring in employers by CSV or add them by hand. Dedupe and suppression checks run automatically.',
    tag: '5 minutes',
  },
  {
    icon: Send,
    title: 'Launch your first campaign',
    body: 'Build a multi-step sequence, approve the copy, and choose a conservative daily cap.',
    tag: 'The good part',
  },
]

export function WelcomePage() {
  usePageTitle('Welcome')
  const navigate = useNavigate()
  const location = useLocation()
  const [session] = useState(readSession)
  const [profile, setProfile] = useState(null)
  const [profileStatus, setProfileStatus] = useState(session ? 'loading' : 'anonymous')

  useEffect(() => {
    if (!session?.accessToken) return undefined

    const controller = new AbortController()

    api
      .me(session.accessToken, controller.signal)
      .then((data) => {
        setProfile(data)
        setProfileStatus('ready')
      })
      .catch((error) => {
        if (error?.name === 'AbortError') return
        setProfileStatus('error')
      })

    return () => controller.abort()
  }, [session])

  function handleSignOut() {
    clearSession()
    navigate('/', { replace: true })
  }

  const tenant = profile?.tenant ?? session?.tenant
  const role = profile?.role
  const firstName = profile?.user?.full_name?.trim().split(/\s+/)[0]
  const justRegistered = Boolean(location.state?.justRegistered)

  return (
    <div className="welcome">
      <header className="welcome__header">
        <div className="container welcome__header-inner">
          <Link to="/" aria-label="Reyvo home">
            <Logo size={28} />
          </Link>

          {session ? (
            <button type="button" className="welcome__signout" onClick={handleSignOut}>
              Sign out
            </button>
          ) : (
            <Link to="/" className="welcome__signout">
              Back to home
            </Link>
          )}
        </div>
      </header>

      <main className="container welcome__main">
        {!session ? (
          <div className="welcome__empty">
            <span className="welcome__badge welcome__badge--muted">
              <Users size={20} />
            </span>
            <h1>You’re not signed in yet.</h1>
            <p>Create a workspace to start your 14-day trial, or sign back into an existing one.</p>
            <div className="welcome__empty-actions">
              <Link to="/register" className="btn btn--primary">
                Create a workspace
                <ArrowRight size={17} />
              </Link>
              <Link to="/login" className="btn btn--ghost">
                Sign in
              </Link>
            </div>
          </div>
        ) : (
          <>
            <div className="welcome__intro">
              <span className="welcome__badge">
                <Check size={22} />
              </span>
              <p className="eyebrow">{justRegistered ? 'Workspace created' : 'Workspace ready'}</p>
              <h1>
                {firstName ? `Welcome, ${firstName}.` : 'Welcome to Reyvo.'}
              </h1>
              <p className="welcome__lead">
                Your 14-day Growth trial is active. There’s no card on file and nothing to cancel —
                take the next few minutes to get set up.
              </p>
            </div>

            {profileStatus === 'error' ? (
              <div className="welcome__notice" role="status">
                We couldn’t refresh your profile just now, but your workspace and trial are safe.
                Refresh the page in a moment.
              </div>
            ) : null}

            <section className="welcome__workspace" aria-labelledby="workspace-heading">
              <div className="welcome__workspace-head">
                <div>
                  <p className="welcome__label" id="workspace-heading">
                    Your workspace
                  </p>
                  <h2>{tenant?.name ?? 'Your agency'}</h2>
                  {tenant?.slug ? <p className="welcome__slug">{tenant.slug}</p> : null}
                </div>
                <div className="welcome__workspace-meta">
                  <span className="pill pill--lime">Trial · 14 days</span>
                  {role ? <span className="pill">{role}</span> : null}
                </div>
              </div>

              <div className="welcome__workspace-stats">
                <div>
                  <strong>5</strong>
                  <span>seats included</span>
                </div>
                <div>
                  <strong>3</strong>
                  <span>inboxes</span>
                </div>
                <div>
                  <strong>10k</strong>
                  <span>contacts</span>
                </div>
                <div>
                  <strong>20k</strong>
                  <span>emails / month</span>
                </div>
              </div>
            </section>

            <section className="welcome__next" aria-labelledby="next-heading">
              <div className="welcome__next-head">
                <h2 id="next-heading">Your setup checklist</h2>
                <span className="welcome__progress">0 of 4 complete</span>
              </div>

              <ol className="welcome__steps">
                {NEXT_STEPS.map(({ icon: Icon, title, body, tag }, index) => (
                  <li key={title} className="welcome__step">
                    <span className="welcome__step-icon">
                      <Icon size={19} />
                    </span>
                    <div className="welcome__step-copy">
                      <div className="welcome__step-title">
                        <span className="welcome__step-number">{String(index + 1).padStart(2, '0')}</span>
                        <h3>{title}</h3>
                        <span className="welcome__step-tag">{tag}</span>
                      </div>
                      <p>{body}</p>
                    </div>
                  </li>
                ))}
              </ol>
            </section>

            <div className="welcome__cta">
              <div>
                <MailCheck size={20} />
                <p>
                  <strong>The dashboard is next on the build list.</strong> For now, your account,
                  workspace and trial are live and ready.
                </p>
              </div>
              <Link to="/" className="btn btn--ghost">
                Back to home
              </Link>
            </div>
          </>
        )}
      </main>
    </div>
  )
}
