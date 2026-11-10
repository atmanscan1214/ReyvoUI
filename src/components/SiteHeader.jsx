import { useEffect, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { Logo } from './Logo'
import { Close, Menu } from './icons'
import './site-header.css'

const NAV_ITEMS = [
  { label: 'Product', hash: 'product' },
  { label: 'How it works', hash: 'how-it-works' },
  { label: 'Pricing', hash: 'pricing' },
  { label: 'Security', hash: 'security' },
]

export function SiteHeader() {
  const [menuOpen, setMenuOpen] = useState(false)
  const [scrolled, setScrolled] = useState(false)
  const { pathname } = useLocation()

  useEffect(() => {
    setMenuOpen(false)
  }, [pathname])

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  useEffect(() => {
    if (!menuOpen) return undefined
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = previous
    }
  }, [menuOpen])

  const hrefFor = (hash) => (pathname === '/' ? `#${hash}` : `/#${hash}`)

  return (
    <header className={`site-header ${scrolled ? 'is-scrolled' : ''} ${menuOpen ? 'is-open' : ''}`}>
      <div className="container site-header__inner">
        <Link to="/" className="site-header__logo" aria-label="Reyvo home">
          <Logo size={30} />
        </Link>

        <nav className="site-header__nav" aria-label="Main">
          {NAV_ITEMS.map((item) => (
            <a key={item.hash} href={hrefFor(item.hash)} className="site-header__link">
              {item.label}
            </a>
          ))}
        </nav>

        <div className="site-header__actions">
          <Link to="/login" className="site-header__signin">
            Sign in
          </Link>
          <Link to="/register" className="btn btn--primary site-header__cta">
            Start free trial
          </Link>
        </div>

        <button
          type="button"
          className="site-header__toggle"
          aria-expanded={menuOpen}
          aria-controls="mobile-menu"
          aria-label={menuOpen ? 'Close menu' : 'Open menu'}
          onClick={() => setMenuOpen((open) => !open)}
        >
          {menuOpen ? <Close size={22} /> : <Menu size={22} />}
        </button>
      </div>

      <div id="mobile-menu" className="site-header__mobile" hidden={!menuOpen}>
        <nav className="site-header__mobile-nav" aria-label="Mobile">
          {NAV_ITEMS.map((item) => (
            <a key={item.hash} href={hrefFor(item.hash)} onClick={() => setMenuOpen(false)}>
              {item.label}
            </a>
          ))}
          <Link to="/login" onClick={() => setMenuOpen(false)}>
            Sign in
          </Link>
        </nav>
        <Link to="/register" className="btn btn--lime btn--block" onClick={() => setMenuOpen(false)}>
          Start your free trial
        </Link>
        <p className="site-header__mobile-note">14 days free. No credit card required.</p>
      </div>
    </header>
  )
}
