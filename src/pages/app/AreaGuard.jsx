import { Link } from 'react-router-dom'
import { ArrowRight, Lock, Shield } from '../../components/icons'
import { usePageTitle } from '../../lib/usePageTitle'
import { useSession } from '../../lib/session'
import { areaRequirement, canAccessArea } from './navigation'
import './app.css'

/**
 * Route guard for an app area. The shell already hides links the current role
 * cannot use; this blocks direct URL visits too.
 *
 * The profile request decides the role, so the guard must wait for it. Rendering
 * "denied" while `/auth/me` is still loading would flash the wrong state on every
 * hard refresh.
 */
export function AreaGuard({ area, children }) {
  const { profileStatus, role, isPlatformAdmin, tenant, retryProfile } = useSession()

  if (profileStatus === 'loading') {
    return <AccessPending />
  }

  if (profileStatus === 'error') {
    return <AccessUnverified onRetry={retryProfile} />
  }

  if (!canAccessArea(area, { role, isPlatformAdmin })) {
    return (
      <AccessDenied
        area={area}
        role={role}
        isPlatformAdmin={isPlatformAdmin}
        tenant={tenant}
      />
    )
  }

  return children
}

function AccessPending() {
  usePageTitle('Checking access')

  return (
    <div className="app-access-state app-access-state--pending" role="status" aria-live="polite">
      <span className="app-access-state__spinner" aria-hidden="true" />
      <p>Checking your access…</p>
    </div>
  )
}

function AccessUnverified({ onRetry }) {
  usePageTitle('Access unavailable')

  return (
    <div className="app-access-state app-access-state--error" role="alert">
      <span className="app-access-state__icon" aria-hidden="true">
        <Shield size={22} />
      </span>
      <h1>We couldn’t verify your access.</h1>
      <p>
        Your session is still active, but the workspace profile did not load. Retry before assuming
        this area is restricted.
      </p>
      <button type="button" className="btn btn--primary" onClick={onRetry}>
        Try again
        <ArrowRight size={17} />
      </button>
    </div>
  )
}

function AccessDenied({ area, role, isPlatformAdmin, tenant }) {
  usePageTitle('No access')

  const requirement = areaRequirement(area)
  const platformArea = Boolean(area.platformAdmin)
  const roleLabel = role ?? 'unknown'

  return (
    <div className="app-page app-access-denied">
      <header className="app-page__head">
        <div className="app-page__head-copy">
          <p className="eyebrow">Restricted area</p>
          <h1>You don’t have access to {area.title}.</h1>
          <p className="app-page__lead">
            {platformArea
              ? 'The platform admin console is limited to Reyvo staff accounts. Tenant workspaces cannot open it.'
              : `${area.title} is limited to ${requirement}. Your role in ${
                  tenant?.name ?? 'this workspace'
                } is ${roleLabel}. Ask a workspace owner if you need access.`}
          </p>
        </div>
        <span className="app-page__icon app-page__icon--muted" aria-hidden="true">
          <Lock size={25} />
        </span>
      </header>

      <section className="app-card app-access" aria-labelledby="access-summary">
        <div>
          <p className="app-page__label" id="access-summary">
            Access summary
          </p>
          <dl className="app-access__grid">
            <div>
              <dt>Workspace</dt>
              <dd>{tenant?.name ?? '—'}</dd>
            </div>
            <div>
              <dt>Your role</dt>
              <dd className="app-access__role">
                <span className="pill">{roleLabel}</span>
                {isPlatformAdmin ? <span className="pill pill--lime">Platform staff</span> : null}
              </dd>
            </div>
            <div>
              <dt>Required for this area</dt>
              <dd>{requirement}</dd>
            </div>
          </dl>
        </div>
        <p className="app-access__note">
          Nothing has changed and no data was exposed. Links you cannot use are hidden from the
          sidebar.
        </p>
      </section>

      <div className="app-page__empty-actions">
        <Link to="/app" className="btn btn--primary">
          Back to dashboard
          <ArrowRight size={17} />
        </Link>
        <Link to="/app/settings/account" className="btn btn--ghost">
          Account settings
        </Link>
      </div>
    </div>
  )
}
