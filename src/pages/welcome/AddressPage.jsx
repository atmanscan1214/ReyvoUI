import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ArrowRight, Building, Check, Inbox, Shield } from '../../components/icons'
import { TextField } from '../../components/Field'
import { Badge, ErrorPanel, useToast } from '../../components/ui'
import { api } from '../../lib/api'
import {
  addressToValues,
  formatAddress,
  hasPhysicalAddress,
  normalizeAddress,
} from '../../lib/onboarding'
import { useSession } from '../../lib/session'
import { usePageTitle } from '../../lib/usePageTitle'

const EMPTY_VALUES = {
  line1: '',
  line2: '',
  city: '',
  state: '',
  postal: '',
  country: '',
}

const REQUIRED_FIELDS = ['line1', 'city', 'postal', 'country']

function validate(values) {
  const errors = {}

  if (!values.line1.trim()) errors.line1 = 'Enter the street address.'
  else if (values.line1.trim().length > 120) errors.line1 = 'Keep this under 120 characters.'

  if (values.line2.trim().length > 120) errors.line2 = 'Keep this under 120 characters.'
  if (values.city.trim().length > 80) errors.city = 'Keep this under 80 characters.'
  if (values.state.trim().length > 80) errors.state = 'Keep this under 80 characters.'

  if (!values.city.trim()) errors.city = 'Enter the city or town.'
  if (!values.postal.trim()) errors.postal = 'Enter the postal code.'
  else if (values.postal.trim().length > 20) errors.postal = 'Keep this under 20 characters.'

  if (!values.country.trim()) errors.country = 'Enter the country.'

  return errors
}

function SignedOut() {
  return (
    <div className="welcome__empty">
      <span className="welcome__badge welcome__badge--muted">
        <Inbox size={20} />
      </span>
      <h1>Sign in to add your address.</h1>
      <p>Your mailing address is stored on your workspace, so we need to know who you are first.</p>
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

export function AddressPage() {
  usePageTitle('Mailing address')

  const navigate = useNavigate()
  const { toast } = useToast()
  const { session, tenantDetails, tenantStatus, retryTenant, updateTenant } = useSession()

  const [values, setValues] = useState(EMPTY_VALUES)
  const [errors, setErrors] = useState({})
  const [formError, setFormError] = useState(null)
  const [saving, setSaving] = useState(false)
  const initialised = useRef(false)

  // Populate the form once the tenant request lands, without clobbering edits
  // if the provider refreshes in the background.
  useEffect(() => {
    if (initialised.current || !tenantDetails) return
    setValues(addressToValues(tenantDetails.physical_address))
    initialised.current = true
  }, [tenantDetails])

  const existing = tenantDetails?.physical_address
  const alreadySaved = hasPhysicalAddress(existing)
  const savedText = formatAddress(existing)

  function handleChange(event) {
    const { name, value } = event.target
    setValues((current) => ({ ...current, [name]: value }))
    if (errors[name]) {
      setErrors((current) => {
        const next = { ...current }
        delete next[name]
        return next
      })
    }
    if (formError) setFormError(null)
  }

  function handleBlur(event) {
    const { name } = event.target
    if (!REQUIRED_FIELDS.includes(name)) return
    const fieldErrors = validate(values)
    if (fieldErrors[name]) {
      setErrors((current) => ({ ...current, [name]: fieldErrors[name] }))
    }
  }

  async function handleSubmit(event) {
    event.preventDefault()
    if (saving) return

    const nextErrors = validate(values)
    setErrors(nextErrors)

    if (Object.keys(nextErrors).length > 0) {
      const first = document.getElementById(`address-${REQUIRED_FIELDS.find((key) => nextErrors[key])}`)
      first?.focus()
      return
    }

    setSaving(true)
    setFormError(null)

    const physicalAddress = normalizeAddress(values)

    try {
      const response = await api.patch('/tenants/current', {
        physical_address: physicalAddress,
      })

      updateTenant(
        response && typeof response === 'object' && response.id
          ? response
          : { ...tenantDetails, physical_address: physicalAddress },
      )

      toast.success('Mailing address saved.')
      navigate('/welcome', { replace: true })
    } catch (error) {
      if (error?.fieldErrors && Object.keys(error.fieldErrors).length > 0) {
        const mapped = {}
        for (const key of Object.keys(EMPTY_VALUES)) {
          if (error.fieldErrors[key]) mapped[key] = error.fieldErrors[key]
        }
        setErrors((current) => ({ ...current, ...mapped }))
      }
      setFormError(
        error?.message || 'We could not save your address. Check the details and try again.',
      )
    } finally {
      setSaving(false)
    }
  }

  if (!session) return <SignedOut />

  if (tenantStatus === 'error') {
    return (
      <div className="welcome__page">
        <ErrorPanel
          title="We couldn’t load your workspace"
          description="The address form needs your current workspace details. Retry to try again."
          onRetry={retryTenant}
        />
      </div>
    )
  }

  return (
    <div className="welcome__page">
      <div className="welcome__page-head">
        <span className="welcome__page-icon" aria-hidden="true">
          <Building size={22} />
        </span>
        <p className="eyebrow">Onboarding · Required step</p>
        <h1>Add your mailing address</h1>
        <p className="welcome__lead">
          Every commercial email needs a real physical address in its footer. Add your agency’s
          mailing address once and Reyvo appends it to every campaign automatically.
        </p>
        {alreadySaved ? (
          <p className="welcome__saved">
            <Badge tone="success" dot>
              Address on file
            </Badge>
            <span>{savedText}</span>
          </p>
        ) : (
          <p className="welcome__saved welcome__saved--pending">
            <Badge tone="warning" dot>
              Required
            </Badge>
            <span>You can explore the app, but campaigns cannot send until this is saved.</span>
          </p>
        )}
      </div>

      <div className="welcome__split">
        <form className="welcome__card" onSubmit={handleSubmit} noValidate>
          <div className="welcome__form-grid">
            <TextField
              id="address-line1"
              name="line1"
              label="Street address"
              placeholder="1200 Market Street"
              autoComplete="address-line1"
              className="welcome__field--full"
              value={values.line1}
              onChange={handleChange}
              onBlur={handleBlur}
              error={errors.line1}
              maxLength={120}
              required
            />

            <TextField
              id="address-line2"
              name="line2"
              label="Apartment, suite, unit"
              placeholder="Suite 400"
              autoComplete="address-line2"
              optional
              className="welcome__field--full"
              value={values.line2}
              onChange={handleChange}
              error={errors.line2}
              maxLength={120}
            />

            <TextField
              id="address-city"
              name="city"
              label="City"
              placeholder="San Francisco"
              autoComplete="address-level2"
              value={values.city}
              onChange={handleChange}
              onBlur={handleBlur}
              error={errors.city}
              maxLength={80}
              required
            />

            <TextField
              id="address-state"
              name="state"
              label="State, province or region"
              placeholder="California"
              autoComplete="address-level1"
              optional
              value={values.state}
              onChange={handleChange}
              error={errors.state}
              maxLength={80}
            />

            <TextField
              id="address-postal"
              name="postal"
              label="Postal code"
              placeholder="94103"
              autoComplete="postal-code"
              value={values.postal}
              onChange={handleChange}
              onBlur={handleBlur}
              error={errors.postal}
              maxLength={20}
              required
            />

            <TextField
              id="address-country"
              name="country"
              label="Country"
              placeholder="United States"
              autoComplete="country-name"
              value={values.country}
              onChange={handleChange}
              onBlur={handleBlur}
              error={errors.country}
              maxLength={60}
              required
            />
          </div>

          {formError ? (
            <div className="welcome__form-error" role="alert">
              {formError}
            </div>
          ) : null}

          <p className="welcome__form-hint">
            <Shield size={14} aria-hidden="true" />
            Only the street, city, postal code and country are required. We never publish this
            anywhere except the legal footer of your emails.
          </p>

          <div className="welcome__form-actions">
            <button type="submit" className="btn btn--primary" disabled={saving}>
              {saving ? (
                <>
                  <span className="btn__spinner" aria-hidden="true" />
                  Saving address…
                </>
              ) : (
                <>
                  {alreadySaved ? 'Update address' : 'Save address'}
                  <ArrowRight size={17} />
                </>
              )}
            </button>
            <Link to="/welcome" className="btn btn--ghost">
              Back to checklist
            </Link>
          </div>
        </form>

        <aside className="welcome__aside" aria-label="Why we ask for this">
          <h2>Why Reyvo needs this</h2>
          <ul className="welcome__aside-list">
            <li>
              <Check size={15} aria-hidden="true" />
              <span>
                <strong>Legal compliance.</strong> CAN-SPAM, CASL and GDPR require a physical
                mailing address in commercial email.
              </span>
            </li>
            <li>
              <Check size={15} aria-hidden="true" />
              <span>
                <strong>Deliverability.</strong> A real address reduces spam complaints and helps
                mailbox providers trust your domain.
              </span>
            </li>
            <li>
              <Check size={15} aria-hidden="true" />
              <span>
                <strong>One place to update it.</strong> Change it here and every future campaign
                picks up the new footer.
              </span>
            </li>
          </ul>
          <p className="welcome__aside-note">
            You can also change this later in Workspace settings.
          </p>
        </aside>
      </div>
    </div>
  )
}
