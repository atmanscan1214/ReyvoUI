import { Link } from 'react-router-dom'
import { Logo } from '../../components/Logo'
import { ArrowRight } from '../../components/icons'
import { usePageTitle } from '../../lib/usePageTitle'
import './not-found.css'

export function NotFoundPage() {
  usePageTitle('Page not found')

  return (
    <div className="not-found">
      <header className="not-found__header">
        <Link to="/" aria-label="Reyvo home">
          <Logo size={30} />
        </Link>
      </header>

      <main className="not-found__main">
        <p className="not-found__code">404</p>
        <h1>This page went quiet.</h1>
        <p>The link may be old, or the page may have moved. The good stuff is still on the home page.</p>
        <div className="not-found__actions">
          <Link to="/" className="btn btn--primary">
            Back to home
            <ArrowRight size={17} />
          </Link>
          <Link to="/register" className="btn btn--ghost">
            Start a free trial
          </Link>
        </div>
      </main>
    </div>
  )
}
