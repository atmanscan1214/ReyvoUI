import { useMemo } from 'react'
import { Link, useLocation } from 'react-router-dom'
import {
  ArrowRight,
  Building,
  Check,
  CheckCircle,
  Database,
  Inbox,
  MailCheck,
  Refresh,
  Send,
} from '../../components/icons'
import { Badge, ErrorPanel } from '../../components/ui'
import {
  buildOnboardingSteps,
  formatAddress,
  hasPhysicalAddress,
  isEmailVerified,
  summarizeOnboarding,
  useSetupData,
} from '../../lib/onboarding'
import { useSession } from '../../lib/session'
import { usePageTitle } from '../../lib/usePageTitle'

const STEP_ICONS = {
  'verify-email': MailCheck,
  'mailing-address': Building,
  'connect-mailbox': Inbox,
  'import-contacts': Database,
  'first-campaign': Send,
}

function formatTrial(tenantDetails) {
  if (!tenantDetails) return null
  if (tenantDetails.status === 'trial' && tenantDetails.trial_ends_at) {
    const ends = new Date(tenantDetails.trial_ends_at)
    if (!Number.isNaN(ends.getTime())) {
      return `Trial · ends ${new Intl.DateTimeFormat(undefined, {
        month: 'short',
        day: 'numeric',
      }).format(ends)}`
    }
  }
  return tenantDetails.status
    ? tenantDetails.status.replace(/[_-]+/g, ' ')
    : null
}

function formatCount(value, fallback = '—') {
  return Number.isFinite(value) ? Number(value).toLocaleString() : fallback
}

function readinessFor(progress, steps) {
  if (progress.readyToSend) {
    return {
      tone: 'done',
      icon: CheckCircle,
      title: 'You’re ready to send.',
      body: 'All five steps are complete. Your inbox is connected, your audience is imported, and a campaign is ready to go.',
      href: '/app',
      action: 'Open your workspace',
    }
  }

  if (progress.readyToImport) {
    return {
      tone: 'ready',
      icon: Database,
      title: 'You’re ready to import contacts.',
      body: 'Your email is verified and your mailing address is on file. Next, connect a mailbox and bring in your market.',
      href: '/app/imports',
      action: 'Import contacts',
    }
  }

  if (!progress.allKnown) {
    return {
      tone: 'neutral',
      icon: Refresh,
      title: 'Finish your setup.',
      body: 'We’re still checking which steps are already complete. Your checklist below updates as each request lands.',
      href: '#setup-heading',
      action: 'View checklist',
    }
  }

  const requiredLeft = steps.filter(
    (step) => step.tag === 'Required' && !step.complete,
  ).length
  const next = progress.nextStep
  const nextIcon = next ? STEP_ICONS[next.id] ?? Building : Building

  return {
    tone: 'required',
    icon: nextIcon,
    title:
      requiredLeft === 1 ? 'One required step to go.' : 'Two required steps to go.',
    body: next
      ? `Next up: ${next.title.toLowerCase()}. ${
          requiredLeft === 1
            ? 'Once that’s done, you’re ready to import contacts.'
            : 'Both the email check and the mailing address are required before your first campaign can send.'
        }`
      : 'Both the email check and the mailing address are required before your first campaign can send.',
    href: next?.href ?? '#setup-heading',
    action: next?.actionLabel ?? 'View checklist',
  }
}

export function WelcomePage() {
  usePageTitle('Welcome')
  const location = useLocation()
  const {
    session,
    user,
    tenantDetails,
    tenantStatus,
    profileStatus,
    retryProfile,
    retryTenant,
  } = useSession()
  const setup = useSetupData()

  const steps = useMemo(
    () =>
      buildOnboardingSteps({
        user,
        tenant: tenantDetails,
        usage: setup.usage,
        emailAccounts: setup.emailAccounts,
        setupStatus: setup.status,
      }),
    [user, tenantDetails, setup.usage, setup.emailAccounts, setup.status],
  )
  const progress = useMemo(() => summarizeOnboarding(steps), [steps])

  const justRegistered = Boolean(location.state?.justRegistered)
  const firstName = user?.full_name?.trim().split(/\s+/)[0]
  const trialLabel = formatTrial(tenantDetails)
  const address = tenantDetails?.physical_address
  const addressText = formatAddress(address)
  const addressSaved = hasPhysicalAddress(address)
  const emailVerified = isEmailVerified(user)

  const progressLoading =
    setup.status === 'loading' || profileStatus === 'loading' || tenantStatus === 'loading'
  const progressLabel = progress.allKnown
    ? `${progress.completed} of ${progress.total} complete`
    : progressLoading
      ? 'Checking progress…'
      : 'Progress unavailable'
  const percent = progress.total > 0 ? Math.round((progress.completed / progress.total) * 100) : 0
  const readiness = readinessFor(progress, steps)
  const ReadinessIcon = readiness.icon

  const needsRetry =
    profileStatus === 'error' || tenantStatus === 'error' || setup.status === 'error'
  const retryAll = () => {
    if (profileStatus === 'error') retryProfile()
    if (tenantStatus === 'error') retryTenant()
    if (setup.status === 'error') setup.refresh()
  }

  if (!session) {
    return (
      <div className="welcome__empty">
        <span className="welcome__badge welcome__badge--muted">
          <Inbox size={20} />
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
    )
  }

  return (
    <>
      <div className="welcome__intro">
        <span className="welcome__badge">
          <Check size={22} />
        </span>
        <p className="eyebrow">{justRegistered ? 'Workspace created' : 'Get set up'}</p>
        <h1>{firstName ? `Welcome, ${firstName}.` : 'Welcome to Reyvo.'}</h1>
        <p className="welcome__lead">
          Your 14-day Growth trial is active. There’s no card on file and nothing to cancel — work
          through these five steps to get your first campaign out the door.
        </p>
      </div>

      {needsRetry ? (
        <ErrorPanel
          className="welcome__error"
          compact
          title="Some setup details didn’t load"
          description="You can still work through the steps below, or retry to refresh your progress."
          onRetry={retryAll}
        />
      ) : null}

      <section className="welcome__workspace" aria-labelledby="workspace-heading">
        <div className="welcome__workspace-head">
          <div>
            <p className="welcome__label" id="workspace-heading">
              Your workspace
            </p>
            <h2>{user ? (tenantDetails?.name ?? 'Your agency') : 'Your agency'}</h2>
            {tenantDetails?.slug ? <p className="welcome__slug">{tenantDetails.slug}</p> : null}
          </div>
          <div className="welcome__workspace-meta">
            {trialLabel ? <span className="pill pill--lime">{trialLabel}</span> : null}
            {user ? <Badge tone={emailVerified ? 'success' : 'warning'} dot>{emailVerified ? 'Email verified' : 'Email unverified'}</Badge> : null}
            {tenantDetails ? (
              <Badge tone={addressSaved ? 'success' : 'warning'} dot>
                {addressSaved ? 'Address added' : 'Address missing'}
              </Badge>
            ) : null}
          </div>
        </div>

        <div className="welcome__workspace-stats">
          <div>
            <strong>{formatCount(setup.usage?.contacts)}</strong>
            <span>contacts</span>
          </div>
          <div>
            <strong>{formatCount(setup.usage?.companies)}</strong>
            <span>companies</span>
          </div>
          <div>
            <strong>{formatCount(setup.usage?.campaigns)}</strong>
            <span>campaigns</span>
          </div>
          <div>
            <strong>{formatCount(setup.usage?.seats)}</strong>
            <span>seats</span>
          </div>
        </div>
      </section>

      <section
        className={`welcome__readiness welcome__readiness--${readiness.tone}`}
        aria-labelledby="readiness-heading"
      >
        <span className="welcome__readiness-icon" aria-hidden="true">
          <ReadinessIcon size={22} />
        </span>
        <div className="welcome__readiness-copy">
          <strong id="readiness-heading">{readiness.title}</strong>
          <p>{readiness.body}</p>
        </div>
        <Link className="btn btn--primary welcome__readiness-action" to={readiness.href}>
          {readiness.action}
          <ArrowRight size={16} />
        </Link>
      </section>

      <section className="welcome__next" aria-labelledby="setup-heading">
        <div className="welcome__next-head">
          <div>
            <h2 id="setup-heading">Your setup checklist</h2>
            <p className="welcome__next-sub">
              Required steps are marked. Everything else improves deliverability.
            </p>
          </div>
          <span className="welcome__progress-label">{progressLabel}</span>
        </div>

        <div
          className="welcome__progressbar"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={progress.total}
          aria-valuenow={progress.completed}
          aria-valuetext={progressLabel}
          aria-label="Onboarding progress"
        >
          <span style={{ width: `${percent}%` }} />
        </div>

        <ol className="welcome__steps">
          {steps.map((step, index) => {
            const Icon = STEP_ICONS[step.id] ?? Check
            const isNext = progress.nextStep?.id === step.id
            const stateClass = step.complete
              ? 'is-complete'
              : !step.known
                ? 'is-unknown'
                : isNext
                  ? 'is-next'
                  : ''

            return (
              <li key={step.id} className={`welcome__step ${stateClass}`.trim()}>
                <span className="welcome__step-icon" aria-hidden="true">
                  {step.complete ? <Check size={19} /> : <Icon size={19} />}
                </span>
                <div className="welcome__step-copy">
                  <div className="welcome__step-title">
                    <span className="welcome__step-number">{String(index + 1).padStart(2, '0')}</span>
                    <h3>{step.title}</h3>
                    {step.complete ? (
                      <Badge tone="success" dot>
                        Done
                      </Badge>
                    ) : !step.known ? (
                      <Badge tone="neutral" dot>
                        Checking…
                      </Badge>
                    ) : step.tag === 'Required' ? (
                      <Badge tone="warning" dot>
                        Required
                      </Badge>
                    ) : (
                      <span className="welcome__step-tag">{step.tag}</span>
                    )}
                  </div>
                  <p>{step.description}</p>
                  <div className="welcome__step-actions">
                    <Link className="welcome__step-action" to={step.href}>
                      {step.complete ? step.doneLabel : step.actionLabel}
                      <ArrowRight size={14} />
                    </Link>
                    {step.id === 'mailing-address' && addressSaved ? (
                      <span className="welcome__step-meta">{addressText}</span>
                    ) : null}
                  </div>
                </div>
              </li>
            )
          })}
        </ol>
      </section>

      <div className="welcome__cta">
        <div>
          <MailCheck size={20} />
          <p>
            <strong>{progress.readyToSend ? 'Your workspace is ready.' : 'You can explore any time.'}</strong>{' '}
            Head into the app to see the layout, navigation and workspace settings while you finish
            setup.
          </p>
        </div>
        <Link to="/app" className="btn btn--primary">
          Open your workspace
          <ArrowRight size={17} />
        </Link>
      </div>
    </>
  )
}
