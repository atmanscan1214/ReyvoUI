import { Link } from 'react-router-dom'
import { ArrowRight, Check, Sparkles } from '../../components/icons'
import { usePageTitle } from '../../lib/usePageTitle'
import { APP_AREAS } from './navigation'

/**
 * Temporary screen for an app area that is routed and permission-aware but not
 * built yet. T04 deliberately ships these instead of dead navigation.
 */
export function AppPlaceholder({ area }) {
  usePageTitle(area.title)

  const Icon = area.icon
  const isDashboard = area === APP_AREAS.dashboard
  const headingId = `planned-${area.path || 'dashboard'}`

  return (
    <div className="app-page">
      <header className="app-page__head">
        <div className="app-page__head-copy">
          <p className="eyebrow">
            In build · {area.task}
          </p>
          <h1>{area.title}</h1>
          <p className="app-page__lead">{area.description}</p>
        </div>
        <span className="app-page__icon" aria-hidden="true">
          <Icon size={26} />
        </span>
      </header>

      <section className="app-card app-card--split" aria-labelledby={headingId}>
        <div className="app-page__planned">
          <p className="app-page__label" id={headingId}>
            What lands here
          </p>
          <ul className="app-page__bullets">
            {area.bullets.map((bullet) => (
              <li key={bullet}>
                <span className="app-page__bullet-icon" aria-hidden="true">
                  <Check size={13} />
                </span>
                <span>{bullet}</span>
              </li>
            ))}
          </ul>
        </div>

        <aside className="app-page__note">
          <span className="app-page__note-icon" aria-hidden="true">
            <Sparkles size={18} />
          </span>
          <div>
            <p className="app-page__note-title">Placeholder route</p>
            <p>
              The shell and navigation are wired. This screen is scheduled as{' '}
              <strong>{area.task}</strong> in the build backlog.
            </p>
            {!isDashboard ? (
              <Link to="/app" className="app-page__link">
                Back to dashboard
                <ArrowRight size={15} />
              </Link>
            ) : (
              <Link to="/welcome" className="app-page__link">
                Open the setup checklist
                <ArrowRight size={15} />
              </Link>
            )}
          </div>
        </aside>
      </section>
    </div>
  )
}

export function AppNotFound() {
  usePageTitle('Page not found')

  return (
    <div className="app-page">
      <header className="app-page__head">
        <div className="app-page__head-copy">
          <p className="eyebrow">404</p>
          <h1>That page isn’t here.</h1>
          <p className="app-page__lead">
            The link may be out of date, or the screen may not have been built yet. Your workspace
            and data are untouched.
          </p>
        </div>
      </header>

      <section className="app-card">
        <div className="app-page__empty-actions">
          <Link to="/app" className="btn btn--primary">
            Go to dashboard
            <ArrowRight size={17} />
          </Link>
          <Link to="/welcome" className="btn btn--ghost">
            Setup checklist
          </Link>
        </div>
      </section>
    </div>
  )
}
