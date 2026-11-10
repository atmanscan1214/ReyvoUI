import { Link } from 'react-router-dom'
import { Logo } from './Logo'
import './site-footer.css'

const COLUMNS = [
  {
    title: 'Product',
    links: [
      { label: 'Overview', to: '/#product' },
      { label: 'How it works', to: '/#how-it-works' },
      { label: 'Pricing', to: '/#pricing' },
      { label: 'Security', to: '/#security' },
    ],
  },
  {
    title: 'Company',
    links: [
      { label: 'Contact', to: 'mailto:hello@reyvo.com' },
      { label: 'Create account', to: '/register' },
      { label: 'Sign in', to: '/login' },
    ],
  },
  {
    title: 'Legal',
    links: [
      { label: 'Terms of service', to: '/terms' },
      { label: 'Privacy policy', to: '/privacy' },
    ],
  },
]

export function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="container">
        <div className="site-footer__top">
          <div className="site-footer__brand">
            <Link to="/" aria-label="Reyvo home">
              <Logo size={32} />
            </Link>
            <p>Outbound growth, built for staffing agencies that live on relationships.</p>
            <a className="site-footer__email" href="mailto:hello@reyvo.com">
              hello@reyvo.com
            </a>
          </div>

          <div className="site-footer__columns">
            {COLUMNS.map((column) => (
              <div key={column.title} className="site-footer__column">
                <h2>{column.title}</h2>
                <ul>
                  {column.links.map((link) => (
                    <li key={link.label}>
                      {link.to.startsWith('mailto:') ? (
                        <a href={link.to}>{link.label}</a>
                      ) : (
                        <Link to={link.to}>{link.label}</Link>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>

        <div className="site-footer__bottom">
          <p>© {new Date().getFullYear()} Reyvo. All rights reserved.</p>
          <p className="site-footer__note">Built for compliant outbound. Gmail and Microsoft 365 are trademarks of their respective owners.</p>
        </div>
      </div>
    </footer>
  )
}
