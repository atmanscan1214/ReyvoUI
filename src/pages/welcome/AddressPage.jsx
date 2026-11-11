import { useEffect, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import {
  ArrowRight, Building, CheckCircle, Clock, Database, Inbox, MailCheck, Send,
} from '../../components/icons'
import { Badge, Button, ErrorPanel, TextField } from '../../components/ui'
import { useSession } from '../../lib/session'
import { usePageTitle } from '../../lib/usePageTitle'
import { useSetupData } from '../../lib/onboarding'
import { api, ApiError } from '../../lib/api'
import { resetDevSessions, loadSessions } from '../../lib/account'
import '../../styles/auth.css'

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

function hasPhysicalAddress(address) {
  if (!address) return false
  return Boolean(address.street && address.city && address.postalCode)
}

function formatAddress(address) {
  if (!address) return ''
  return `${address.street}, ${address.city}, ${address.postalCode}, ${address.country}`
}

export function AddressPage() {
  usePageTitle('Add workspace address')
  const { session, user, tenantDetails, tenantStatus, profileStatus, retryProfile, retryTenant } = useSession()
  const setup = useSetupData()

  const [street, setStreet] = useState(tenantDetails?.physical_address?.street || '')
  const [city, setCity] = useState(tenantDetails?.physical_address?.city || '')
  const [postalCode, setPostalCode] = useState(tenantDetails?.physical_address?.postalCode || '')
  const [country, setCountry] = useState(tenantDetails?.physical_address?.country || 'US')
  const [errors, setErrors] = useState({})
  const [submitting, setSubmitting] = useState(false)
  const [showSuccess, setShowSuccess] = useState(false)

  const onboardingSteps = setup?.steps || []
  const progress = setup?.progress || { completed: 0, total: 5, readyToSend: false, readyToImport: false, allKnown: false }

  useEffect(() => {
    if (!user?.id) return undefined
    const controller = new AbortController()
    profileStatus === 'loading' && api.me(controller.signal).catch(() => {})
    tenantStatus === 'loading' && api.get('/tenants/current', { signal: controller.signal }).catch(() => {})
    return () => controller.abort()
  }, [user?.id, profileStatus, tenantStatus])

  async function handleSubmit(event) {
    event.preventDefault()
    setErrors({})
    setSubmitting(true)

    const physicalAddress = { street: String(street).trim(), city: String(city).trim(), postalCode: String(postalCode).trim(), country: String(country).trim() }

    if (!physicalAddress.street || !physicalAddress.city || !physicalAddress.postalCode) {
      setErrors({ street: 'Street is required', city: 'City is required', postalCode: 'Postal code is required' })
      setSubmitting(false)
      return
    }

    try {
      // Development fallback: store the address in the tenant store and mark step complete
      const store = window.localStorage.getItem('reyvo.tenant.v1')
      const tenantStore = store ? JSON.parse(store) : { tenants: {} }
      const tenants = tenantStore.tenants || {}
      tenants[user.id] = { ...(tenants[user.id] || {}), physical_address: physicalAddress, address_confirmed: true, address_verified_at: Date.now() }
      window.localStorage.setItem('reyvo.tenant.v1', JSON.stringify({ tenants }))

      // Also seed a usage record so the checklist progress shows
      const usageStore = window.localStorage.getItem('reyvo.usage.v1')
      const usage = usageStore ? JSON.parse(usageStore) : { users: {} }
      usage.users[user.id] = { ...(usage.users[user.id] || {}), contacts: 0, companies: 0, campaigns: 0 }
      window.localStorage.setItem('reyvo.usage.v1', JSON.stringify(usage))

      setShowSuccess(true)
      // Navigate to next onboarding step (or app)
      setTimeout(() => {
        window.location.href = '/app'
      }, 1500)
    } catch (caught) {
      if (caught instanceof ApiError) {
        setFormError(caught.message || 'Could not save address')
      } else {
        setFormError('Could not save address. Please try again.')
      }
    } finally {
      setSubmitting(false)
    }
  }

  const needsRetry =
    profileStatus === 'error' || tenantStatus === 'error' || setup?.status === 'error'
  const retryAll = () => {
    if (profileStatus === 'error') retryProfile()
    if (tenantStatus === 'error') retryTenant()
    if (setup?.status === 'error') setup.refresh()
  }

  if (!session) {
    return (
      <div className="welcome__empty">
        <span className="welcome__badge welcome__badge--muted">
          <Inbox size={20} />
        </span>
        <h1>You're not signed in yet.</h1>
        <p>Create a workspace to start your 14-day trial, or sign back into an existing one.</p>
        <div className="welcome__empty-actions">
          <Link to="/login" className="btn btn--primary">
            Sign in
            <ArrowRight size={17} />
          </Link>
          <Link to="/register" className="btn btn--ghost">
            Create a workspace
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
        <p className="eyebrow">Get set up</p>
        <h1>{user?.full_name ? `Welcome, ${user.full_name.split(' ')[0]}.` : 'Welcome to Reyvo.'}</h1>
        <p className="welcome__lead">
          Your 14-day Growth trial is active. There's no card on file and nothing to cancel — work
          through these five steps to get your first campaign out the door.
        </p>
      </div>

      {needsRetry ? (
        <ErrorPanel
          className="welcome__error"
          compact
          title="Some setup details didn't load"
          description="You can still work through the steps below, or retry to refresh your progress."
          onRetry={retryAll}
        />
      ) : null}

      <section className="welcome__workspace" aria-labelledby="workspace-heading">
        <div className="welcome__workspace-head">
          <div>
            <p className="welcome__label" id="workspace-heading">Your workspace</p>
            <h2>{tenantDetails?.name ?? 'Your agency'}</h2>
            {tenantDetails?.slug ? <p className="welcome__slug">{tenantDetails.slug}</p> : null}
          </div>
          <div className="welcome__workspace-meta">
            {formatTrial(tenantDetails) ? <span className="pill pill--lime">{formatTrial(tenantDetails)}</span> : null}
            {user ? <Badge tone={setup?.emailVerified ? 'success' : 'warning'} dot>{setup?.emailVerified ? 'Email verified' : 'Email unverified'}</Badge> : null}
            {tenantDetails ? (
              <Badge tone={hasPhysicalAddress(tenantDetails.physical_address) ? 'success' : 'warning'} dot>
                {hasPhysicalAddress(tenantDetails.physical_address) ? 'Address added' : 'Address missing'}
              </Badge>
            ) : null}
          </div>
        </div>

        <div className="welcome__workspace-stats">
          <div>
            <strong>{formatCount(setup?.usage?.contacts)}</strong> contacts
          </div>
          <div>
            <strong>{formatCount(setup?.usage?.companies)}</strong> companies
          </div>
          <div>
            <strong>{formatCount(setup?.usage?.campaigns)}</strong> campaigns
          </div>
          <div>
            <strong>{formatCount(setup?.usage?.seats)}</strong> seats
          </div>
        </div>
      </section>

      <section
        className={`welcome__readiness welcome__readiness--${progress.readyToSend ? 'done' : progress.readyToImport ? 'ready' : 'neutral'}`}
        aria-labelledby="readiness-heading"
      >
        <span className="welcome__readiness-icon" aria-hidden="true">
          {progress.readyToSend ? <CheckCircle size={22} /> : progress.readyToImport ? <Database size={22} /> : <Refresh size={22} />}
        </span>
        <div className="welcome__readiness-copy">
          {progress.readyToSend
            ? { title: 'You're ready to send.', body: 'All five steps are complete. Your inbox is connected, your audience is imported, and a campaign is ready to go.', href: '/app', action: 'Open your workspace' }
            : progress.readyToImport
              ? { title: "You're ready to import contacts.", body: 'Your email is verified and your mailing address is on file. Next, connect a mailbox and bring in your market.', href: '/app/imports', action: 'Import contacts' }
              : { title: 'Finish your setup.', body: 'We're still checking which steps are already complete. Your checklist below updates as each request lands.', href: '#setup-heading', action: 'View checklist' }}
        </div>
        <Link className="btn btn--primary welcome__readiness-action" to={progress.readyToSend ? '/app' : progress.readyToImport ? '/app/imports' : '#setup-heading'}>
          {progress.readyToSend ? 'Open your workspace' : progress.readyToImport ? 'Import contacts' : 'View checklist'}
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
          <span className="welcome__progress-label">2 of 5 complete</span>
        </div>

        <div className="welcome__progressbar" role="progressbar" aria-valuemin={0} aria-valuemax={5} aria-valuenow={2} aria-label="Onboarding progress">
          <span style={{ width: '40%' }} />
        </div>

        <ol className="welcome__steps">
          {[
            { id: 'verify-email', title: 'Verify email', description: 'Verify your sign-in email address.', tag: 'Required', known: true, complete: true, actionLabel: 'Verified' },
            { id: 'mailing-address', title: 'Mailing address', description: 'Add your physical mailing address for campaign compliance.', tag: 'Required', known: true, complete: false },
            { id: 'connect-mailbox', title: 'Connect mailbox', description: 'Connect an email provider (Gmail, Outlook, etc.).', tag: 'Optional', known: true, complete: false, href: '/app/imports' },
            { id: 'import-contacts', title: 'Import contacts', description: 'Upload a CSV or connect a directory to bring in contacts.', tag: 'Optional', known: true, complete: false },
            { id: 'first-campaign', title: 'First campaign', description: 'Build and send your first campaign to your audience.', tag: 'Optional', known: true, complete: false },
          ].map((step, index) => {
            const Icon = { verify_email: MailCheck, mailing_address: Building, connect_mailbox: Inbox, import_contacts: Database, first_campaign: Send }[step.id] ?? Check
            const isNext = progress.nextStep?.id === step.id
            const stateClass = step.complete ? 'is-complete' : !step.known ? 'is-unknown' : isNext ? 'is-next' : ''

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
                      <Badge tone="success" dot>Done</Badge>
                    ) : !step.known ? (
                      <Badge tone="neutral" dot>Checking…</Badge>
                    ) : step.tag === 'Required' ? (
                      <Badge tone="warning" dot>Required</Badge>
                    ) : (
                      <span className="welcome__step-tag">{step.tag}</span>
                    )}
                  </div>
                  <p>{step.description}</p>
                  <div className="welcome__step-actions">
                    <Link className="welcome__step-action" to={step.href || '#'}>
                      {step.complete ? step.doneLabel : step.actionLabel}
                      <ArrowRight size={14} />
                    </Link>
                    {step.id === 'mailing-address' && hasPhysicalAddress(street ? { street, city, postalCode: postalCode, country } : null) ? (
                      <span className="welcome__step-meta">{formatAddress({ street: street || '', city || '', postalCode: postalCode || '', country: country || 'US' })}</span>
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
            Head into the app to see the layout, navigation and workspace settings while you finish setup.
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