import { Link, Outlet, useLocation } from 'react-router-dom'
import { Logo } from '../../components/Logo'
import { ArrowLeft } from '../../components/icons'
import { useSession } from '../../lib/session'
import './welcome.css'

/**
 * Shared chrome for the onboarding route group: `/welcome`, `/welcome/address`
 * and `/verify-email`. Keeping the header in one place means the sign-out and
 * back links behave the same on every step.
 */
export function WelcomeLayout() {
  const { session, signOut } = useSession()
  const location = useLocation()
  const onChecklist = location.pathname === '/welcome'

  return (
    <div className="welcome">
      <header className="welcome__header">
        <div className="container welcome__header-inner">
          <Link to="/welcome" aria-label="Reyvo setup checklist">
            <Logo size={26} />
          </Link>

          <div className="welcome__header-actions">
            {onChecklist ? null : (
              <Link to="/welcome" className="welcome__back">
                <ArrowLeft size={15} aria-hidden="true" />
                Checklist
              </Link>
            )}

            {session ? (
              <button type="button" className="welcome__signout" onClick={signOut}>
                Sign out
              </button>
            ) : (
              <Link to="/login" className="welcome__signout">
                Sign in
              </Link>
            )}
          </div>
        </div>
      </header>

      <main className="container welcome__main">
        <Outlet />
      </main>
    </div>
  )
}
