import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Logo } from '../../components/Logo'
import { PasswordField, TextField } from '../../components/Field'
import { ArrowLeft, ArrowRight, Check, Clock, Inbox, Send } from '../../components/icons'
import { api, ApiError } from '../../lib/api'
import { saveSession } from '../../lib/auth'
import { usePageTitle } from '../../lib/usePageTitle'
import { validateLogin } from '../../lib/validation'
import '../../styles/auth.css'
import './login.css'

const BENEFITS = [
  { icon: Inbox, text: 'Replies keep landing in the right workspace' },
  { icon: Send, text: 'Campaigns stay on schedule while you are away' },
  { icon: Clock, text: 'Follow-ups stop automatically when someone responds' },
]

export function LoginPage() {
  usePageTitle('Sign in')
  const navigate = useNavigate()
  const [values, setValues] = useState({ email: '', password: '', tenantSlug: '' })
  const [errors, setErrors] = useState({})
  const [formError, setFormError] = useState(null)
  const [submitting, setSubmitting] = useState(false)
  const [showSlug, setShowSlug] = useState(false)

  function handleChange(event) {
    const { name, value } = event.target
    setValues((current) => ({ ...current, [name]: value }))
    if (errors[name]) {
      setErrors((current) => ({ ...current, [name]: null }))
    }
  }

  async function handleSubmit(event) {
    event.preventDefault()
    setFormError(null)

    const nextErrors = validateLogin(values)
    setErrors(nextErrors)

    if (Object.keys(nextErrors).length > 0) {
      document.getElementById(Object.keys(nextErrors)[0])?.focus()
      return
    }

    setSubmitting(true)

    try {
      const tokenPair = await api.login({
        email: values.email.trim().toLowerCase(),
        password: values.password,
        tenant_slug: values.tenantSlug.trim() || null,
      })

      saveSession(tokenPair)
      navigate('/welcome', { replace: true })
    } catch (error) {
      if (error instanceof ApiError) {
        setFormError(error.message)
        if (error.fieldErrors.email) {
          setErrors((current) => ({ ...current, email: error.fieldErrors.email }))
        }
        if (error.fieldErrors.password) {
          setErrors((current) => ({ ...current, password: error.fieldErrors.password }))
        }
      } else {
        setFormError('Something unexpected happened. Please try again.')
      }
      setSubmitting(false)
    }
  }

  return (
    <div className="auth">
      <aside className="auth__aside">
        <div className="auth__aside-top">
          <Link to="/" aria-label="Reyvo home" className="auth__logo">
            <Logo size={30} />
          </Link>
          <Link to="/" className="auth__back">
            <ArrowLeft size={15} />
            Back to site
          </Link>
        </div>

        <div className="auth__aside-body">
          <p className="auth__eyebrow">Welcome back</p>
          <h1>
            Pick up where the <em>conversation</em> left off.
          </h1>
          <p className="auth__aside-lead">
            Your workspace is exactly where you left it — contacts, campaigns and the replies that
            need a human.
          </p>

          <ul className="auth__benefits">
            {BENEFITS.map(({ icon: Icon, text }) => (
              <li key={text}>
                <span className="auth__benefit-icon">
                  <Icon size={16} />
                </span>
                {text}
              </li>
            ))}
          </ul>
        </div>

        <div className="auth__aside-foot">
          <div className="auth__trial auth__trial--quiet">
            <p>
              <Check size={14} /> No credit card required during your trial
            </p>
            <p>
              <Check size={14} /> Your data stays inside your workspace
            </p>
          </div>
        </div>
      </aside>

      <main className="auth__main">
        <div className="auth__mobile-top">
          <Link to="/" aria-label="Reyvo home">
            <Logo size={28} />
          </Link>
          <Link to="/" className="auth__back auth__back--light">
            <ArrowLeft size={15} />
            Back
          </Link>
        </div>

        <div className="auth__card">
          <header className="auth__head">
            <p className="eyebrow">Sign in</p>
            <h2>Welcome back</h2>
            <p>
              New to Reyvo? <Link to="/register">Create your workspace</Link>
            </p>
          </header>

          <form className="auth__form" onSubmit={handleSubmit} noValidate>
            {formError ? (
              <div className="auth__alert" role="alert">
                <span className="auth__alert-icon" aria-hidden="true">
                  !
                </span>
                <div>
                  <p>{formError}</p>
                  {formError.toLowerCase().includes('could not reach') ? (
                    <p className="auth__alert-hint">
                      Start the API on port 8000, then try again.
                    </p>
                  ) : null}
                </div>
              </div>
            ) : null}

            <TextField
              id="email"
              name="email"
              label="Work email"
              type="email"
              inputMode="email"
              placeholder="dana@youragency.com"
              autoComplete="email"
              value={values.email}
              onChange={handleChange}
              error={errors.email}
              maxLength={254}
            />

            <PasswordField
              id="password"
              name="password"
              label="Password"
              placeholder="Your password"
              autoComplete="current-password"
              value={values.password}
              onChange={handleChange}
              error={errors.password}
              maxLength={256}
            />

            {showSlug ? (
              <TextField
                id="tenantSlug"
                name="tenantSlug"
                label="Workspace slug"
                placeholder="northline-talent"
                autoComplete="organization"
                value={values.tenantSlug}
                onChange={handleChange}
                hint="Only needed when this email belongs to more than one workspace."
                error={errors.tenantSlug}
              />
            ) : (
              <button
                type="button"
                className="login__slug-toggle"
                onClick={() => setShowSlug(true)}
              >
                Signing into more than one workspace?
              </button>
            )}

            <button type="submit" className="btn btn--primary btn--block auth__submit" disabled={submitting}>
              {submitting ? (
                <>
                  <span className="btn__spinner" aria-hidden="true" />
                  Signing you in…
                </>
              ) : (
                <>
                  Sign in
                  <ArrowRight size={18} />
                </>
              )}
            </button>
          </form>
        </div>

        <p className="auth__footer-note">
          Trouble signing in? <a href="mailto:hello@reyvo.com">hello@reyvo.com</a>
        </p>
      </main>
    </div>
  )
}
