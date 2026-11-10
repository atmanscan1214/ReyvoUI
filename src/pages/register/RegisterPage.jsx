import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Logo } from '../../components/Logo'
import { CheckboxField, PasswordField, SelectField, TextField } from '../../components/Field'
import { ArrowLeft, ArrowRight, Building, Check, Inbox, Shield, Sparkles } from '../../components/icons'
import { api, ApiError } from '../../lib/api'
import { saveSession } from '../../lib/auth'
import { detectTimezone, groupedTimezones } from '../../lib/timezones'
import { usePageTitle } from '../../lib/usePageTitle'
import { passwordStrength, validateRegister } from '../../lib/validation'
import '../../styles/auth.css'

const BENEFITS = [
  { icon: Inbox, text: 'Send from your own Gmail or Microsoft 365 mailbox' },
  { icon: Shield, text: 'Conservative sending caps on by default' },
  { icon: Sparkles, text: 'AI drafts you approve before anything sends' },
  { icon: Building, text: 'A tenant-isolated workspace with an audit trail' },
]

const FIELD_IDS = {
  fullName: 'fullName',
  email: 'email',
  agencyName: 'agencyName',
  timezone: 'timezone',
  password: 'password',
  confirmPassword: 'confirmPassword',
  terms: 'terms',
}

const SERVER_FIELD_MAP = {
  full_name: 'fullName',
  email: 'email',
  agency_name: 'agencyName',
  timezone: 'timezone',
  password: 'password',
}

function initialValues() {
  return {
    fullName: '',
    email: '',
    agencyName: '',
    timezone: detectTimezone(),
    password: '',
    confirmPassword: '',
    terms: false,
  }
}

export function RegisterPage() {
  usePageTitle('Create your workspace')
  const navigate = useNavigate()
  const [values, setValues] = useState(initialValues)
  const [errors, setErrors] = useState({})
  const [touched, setTouched] = useState({})
  const [formError, setFormError] = useState(null)
  const [submitting, setSubmitting] = useState(false)

  const zones = useMemo(() => {
    const groups = groupedTimezones()
    const known = groups.some((group) => group.zones.includes(values.timezone))
    if (!known && values.timezone) {
      return [{ label: 'Detected', zones: [values.timezone] }, ...groups]
    }
    return groups
  }, [values.timezone])

  const strength = passwordStrength(values.password)

  function validate(valuesToCheck) {
    return validateRegister(valuesToCheck)
  }

  function handleChange(event) {
    const { name, type, checked, value } = event.target
    const next = { ...values, [name]: type === 'checkbox' ? checked : value }
    setValues(next)

    if (errors[name] || touched[name]) {
      const nextErrors = validate(next)
      setErrors((current) => ({
        ...current,
        [name]: nextErrors[name],
        ...(name === 'password' && next.confirmPassword ? { confirmPassword: nextErrors.confirmPassword } : null),
      }))
    }
  }

  function handleBlur(event) {
    const { name } = event.target
    setTouched((current) => ({ ...current, [name]: true }))
    const nextErrors = validate(values)
    setErrors((current) => ({ ...current, [name]: nextErrors[name] }))
  }

  function focusFirstError(nextErrors) {
    const order = ['fullName', 'email', 'agencyName', 'timezone', 'password', 'confirmPassword', 'terms']
    const first = order.find((field) => nextErrors[field])
    if (!first) return
    const element = document.getElementById(FIELD_IDS[first])
    element?.focus()
    element?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }

  async function handleSubmit(event) {
    event.preventDefault()
    setFormError(null)

    const nextErrors = validate(values)
    setErrors(nextErrors)
    setTouched({
      fullName: true,
      email: true,
      agencyName: true,
      timezone: true,
      password: true,
      confirmPassword: true,
      terms: true,
    })

    if (Object.keys(nextErrors).length > 0) {
      focusFirstError(nextErrors)
      return
    }

    setSubmitting(true)

    try {
      const tokenPair = await api.register({
        email: values.email.trim().toLowerCase(),
        password: values.password,
        full_name: values.fullName.trim(),
        agency_name: values.agencyName.trim(),
        timezone: values.timezone,
      })

      saveSession(tokenPair)
      navigate('/welcome', { replace: true, state: { justRegistered: true } })
    } catch (error) {
      if (error instanceof ApiError) {
        const mapped = {}
        for (const [serverField, message] of Object.entries(error.fieldErrors)) {
          const clientField = SERVER_FIELD_MAP[serverField]
          if (clientField) mapped[clientField] = message
        }

        if (error.status === 409) {
          mapped.email = 'An account with this email already exists.'
        }

        setErrors(mapped)
        setFormError(error.message)
        focusFirstError(mapped)
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
          <p className="auth__eyebrow">Free for 14 days</p>
          <h1>
            Set up your agency’s outbound in <em>under 30 minutes.</em>
          </h1>
          <p className="auth__aside-lead">
            One workspace for contacts, campaigns, replies and pipeline. No credit card, no sales
            call, no lock-in.
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
          <div className="auth__trial">
            <div className="auth__trial-head">
              <span>Inside your trial</span>
              <span className="pill pill--lime">Growth</span>
            </div>
            <div className="auth__trial-grid">
              <div>
                <strong>5</strong>
                <span>seats</span>
              </div>
              <div>
                <strong>3</strong>
                <span>inboxes</span>
              </div>
              <div>
                <strong>10k</strong>
                <span>contacts</span>
              </div>
            </div>
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
            <p className="eyebrow">Create your workspace</p>
            <h2>Start your free trial</h2>
            <p>
              Already have an account? <Link to="/login">Sign in</Link>
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
                      Start the API with{' '}
                      <code>uv run uvicorn reyvo.main:app --reload --loop reyvo.dev:selector_loop_factory</code>{' '}
                      and try again.
                    </p>
                  ) : null}
                </div>
              </div>
            ) : null}

            <TextField
              id={FIELD_IDS.fullName}
              name="fullName"
              label="Full name"
              placeholder="Dana Kim"
              autoComplete="name"
              value={values.fullName}
              onChange={handleChange}
              onBlur={handleBlur}
              error={errors.fullName}
              maxLength={255}
            />

            <TextField
              id={FIELD_IDS.email}
              name="email"
              label="Work email"
              type="email"
              inputMode="email"
              placeholder="dana@youragency.com"
              autoComplete="email"
              value={values.email}
              onChange={handleChange}
              onBlur={handleBlur}
              error={errors.email}
              maxLength={254}
            />

            <TextField
              id={FIELD_IDS.agencyName}
              name="agencyName"
              label="Agency name"
              placeholder="Northline Talent"
              autoComplete="organization"
              value={values.agencyName}
              onChange={handleChange}
              onBlur={handleBlur}
              error={errors.agencyName}
              hint="This becomes your workspace name. You can change it later."
              maxLength={255}
            />

            <SelectField
              id={FIELD_IDS.timezone}
              name="timezone"
              label="Timezone"
              value={values.timezone}
              onChange={handleChange}
              onBlur={handleBlur}
              error={errors.timezone}
              hint="Used for sending windows and campaign schedules."
            >
              {zones.map((group) => (
                <optgroup key={group.label} label={group.label}>
                  {group.zones.map((zone) => (
                    <option key={zone} value={zone}>
                      {zone.replaceAll('_', ' ')}
                    </option>
                  ))}
                </optgroup>
              ))}
            </SelectField>

            <PasswordField
              id={FIELD_IDS.password}
              name="password"
              label="Password"
              placeholder="At least 12 characters"
              autoComplete="new-password"
              value={values.password}
              onChange={handleChange}
              onBlur={handleBlur}
              error={errors.password}
              maxLength={256}
            />

            <div className="strength" aria-live="polite">
              <div className="strength__bars" aria-hidden="true">
                {[1, 2, 3, 4].map((bar) => (
                  <span
                    key={bar}
                    className={`strength__bar ${values.password && bar <= strength.score ? `is-on strength--${strength.score}` : ''}`}
                  />
                ))}
              </div>
              <p className="strength__text">
                {values.password ? (
                  <>
                    Strength: <strong>{strength.label}</strong>
                    {strength.hints.length > 0 ? ` — add ${strength.hints.join(', ')}.` : '.'}
                  </>
                ) : (
                  'Use 12+ characters with a mix of letters, numbers and symbols.'
                )}
              </p>
            </div>

            <PasswordField
              id={FIELD_IDS.confirmPassword}
              name="confirmPassword"
              label="Confirm password"
              placeholder="Re-enter your password"
              autoComplete="new-password"
              value={values.confirmPassword}
              onChange={handleChange}
              onBlur={handleBlur}
              error={errors.confirmPassword}
              maxLength={256}
            />

            <CheckboxField
              id={FIELD_IDS.terms}
              name="terms"
              checked={values.terms}
              onChange={handleChange}
              error={errors.terms}
            >
              I agree to the{' '}
              <Link to="/terms" onClick={(event) => event.stopPropagation()}>
                Terms of Service
              </Link>{' '}
              and{' '}
              <Link to="/privacy" onClick={(event) => event.stopPropagation()}>
                Privacy Policy
              </Link>
              .
            </CheckboxField>

            <button type="submit" className="btn btn--primary btn--block auth__submit" disabled={submitting}>
              {submitting ? (
                <>
                  <span className="btn__spinner" aria-hidden="true" />
                  Creating your workspace…
                </>
              ) : (
                <>
                  Create my workspace
                  <ArrowRight size={18} />
                </>
              )}
            </button>

            <p className="auth__fineprint">
              <Check size={13} /> 14 days free · No credit card · Cancel anytime
            </p>
          </form>
        </div>

        <p className="auth__footer-note">
          Need a hand? <a href="mailto:hello@reyvo.com">hello@reyvo.com</a>
        </p>
      </main>
    </div>
  )
}
