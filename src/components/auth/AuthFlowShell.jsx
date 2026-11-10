import { Link } from 'react-router-dom'
import { Logo } from '../Logo'
import { Badge } from '../ui'
import { ArrowLeft, Check } from '../icons'
import '../../styles/auth.css'
import './auth-flow.css'

/**
 * Shared split layout for the public auth completion flows: password reset,
 * invitation acceptance, and the MFA challenge. It mirrors the sign-in screen
 * so these pages feel like the same product rather than detached utilities.
 */
export function AuthFlowShell({
  asideEyebrow = 'Reyvo',
  asideTitle,
  asideLead,
  asidePoints = [],
  asideFoot = [],
  eyebrow,
  title,
  lead,
  backTo = '/login',
  backLabel = 'Back to sign in',
  footer,
  children,
}) {
  return (
    <div className="auth">
      <aside className="auth__aside">
        <div className="auth__aside-top">
          <Link to="/" aria-label="Reyvo home" className="auth__logo">
            <Logo size={30} />
          </Link>
          <Link to={backTo} className="auth__back">
            <ArrowLeft size={15} />
            {backLabel}
          </Link>
        </div>

        <div className="auth__aside-body">
          <p className="auth__eyebrow">{asideEyebrow}</p>
          <h1>{asideTitle}</h1>
          {asideLead ? <p className="auth__aside-lead">{asideLead}</p> : null}

          {asidePoints.length > 0 ? (
            <ul className="auth__benefits">
              {asidePoints.map((point) => (
                <li key={point}>
                  <span className="auth__benefit-icon">
                    <Check size={16} />
                  </span>
                  {point}
                </li>
              ))}
            </ul>
          ) : null}
        </div>

        {asideFoot.length > 0 ? (
          <div className="auth__aside-foot">
            <div className="auth__trial auth__trial--quiet">
              {asideFoot.map((line) => (
                <p key={line}>
                  <Check size={14} /> {line}
                </p>
              ))}
            </div>
          </div>
        ) : null}
      </aside>

      <main className="auth__main">
        <div className="auth__mobile-top">
          <Link to="/" aria-label="Reyvo home">
            <Logo size={28} />
          </Link>
          <Link to={backTo} className="auth__back auth__back--light">
            <ArrowLeft size={15} />
            {backLabel}
          </Link>
        </div>

        <div className="auth__card">
          <header className="auth__head">
            {eyebrow ? <p className="eyebrow">{eyebrow}</p> : null}
            <h2>{title}</h2>
            {lead ? <p>{lead}</p> : null}
          </header>

          {children}
        </div>

        {footer ? <p className="auth__footer-note">{footer}</p> : null}
      </main>
    </div>
  )
}

/** Centred outcome panel used for success, expired, and invalid states. */
export function FlowStatus({ tone = 'neutral', icon: Icon, eyebrow, title, children }) {
  return (
    <div className={`flow flow--${tone}`} role="status">
      {Icon ? (
        <span className="flow__icon" aria-hidden="true">
          <Icon size={26} />
        </span>
      ) : null}
      {eyebrow ? <p className="eyebrow">{eyebrow}</p> : null}
      <h3>{title}</h3>
      {children}
    </div>
  )
}

export function FlowActions({ children }) {
  return <div className="flow__actions">{children}</div>
}

/**
 * Clearly labelled development-only tooling. Production builds never render
 * this because the calling pages gate it behind `import.meta.env.DEV`.
 */
export function DevPanel({ title = 'Development tools', children }) {
  return (
    <div className="flow__dev">
      <p className="flow__dev-head">
        <Badge tone="warning" size="sm" dot>
          Development only
        </Badge>
      </p>
      <p className="flow__dev-title">{title}</p>
      {children}
    </div>
  )
}
