import { useEffect, useId, useState } from 'react'
import { Modal, Button, Badge, useToast } from '../../../components/ui'
import { TextField, TextareaField } from '../../../components/Field'
import { AlertCircle, Building, Plus, Close } from '../../../components/icons'
import {
  companyToForm,
  createCompany,
  findCompanyDuplicates,
  updateCompany,
  validateCompany,
} from '../../../lib/companies'

const API_FIELD_MAP = {
  name: 'name',
  domain: 'domain',
  website: 'website',
  employee_count: 'employeeCount',
  linkedin_url: 'linkedinUrl',
  industry: 'industry',
  city: 'city',
  state: 'state',
  country: 'country',
  source: 'source',
  notes: 'notes',
  custom_fields: 'customFields',
}

function CompanyForm({ formId, company, values, setValues, errors, banner, duplicates, onSubmit }) {
  function update(field, value) {
    setValues((current) => ({ ...current, [field]: value }))
  }

  function updateCustomField(index, part, value) {
    setValues((current) => ({
      ...current,
      customFields: current.customFields.map((row, rowIndex) =>
        rowIndex === index ? { ...row, [part]: value } : row,
      ),
    }))
  }

  function addCustomField() {
    setValues((current) => ({
      ...current,
      customFields: [...current.customFields, { key: '', value: '' }],
    }))
  }

  function removeCustomField(index) {
    setValues((current) => ({
      ...current,
      customFields: current.customFields.filter((_, rowIndex) => rowIndex !== index),
    }))
  }

  return (
    <form id={formId} className="company-form" onSubmit={onSubmit} noValidate>
      {banner ? (
        <p className="company-form__banner" role="alert">
          <AlertCircle size={16} aria-hidden="true" />
          <span>{banner}</span>
        </p>
      ) : null}

      {duplicates.length > 0 ? (
        <div className="company-form__duplicate" role="alert">
          <p className="company-form__duplicate-title">
            <Building size={16} aria-hidden="true" />
            Possible duplicate {duplicates.length === 1 ? 'company' : 'companies'}
          </p>
          <p className="company-form__duplicate-copy">
            The design warns when a company shares a domain or name. Save anyway if this is a
            genuinely separate employer.
          </p>
          <ul className="company-form__duplicate-list">
            {duplicates.map((match) => (
              <li key={match.id}>
                <strong>{match.name}</strong>
                <span>
                  {match.reason === 'domain'
                    ? `same domain${match.domain ? ` · ${match.domain}` : ''}`
                    : 'same name'}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <section className="company-form__section" aria-labelledby={`${formId}-basics`}>
        <h3 className="company-form__section-title" id={`${formId}-basics`}>
          Basics
        </h3>
        <div className="company-form__grid">
          <TextField
            id={`${formId}-name`}
            label="Company name"
            placeholder="Northwind Staffing"
            value={values.name}
            onChange={(event) => update('name', event.target.value)}
            error={errors.name}
            maxLength={255}
            className="company-form__span-2"
            autoFocus={!company}
          />

          <TextField
            id={`${formId}-domain`}
            label="Domain"
            placeholder="northwind.com"
            hint="Used to spot duplicates. Accepts a domain or full URL."
            value={values.domain}
            onChange={(event) => update('domain', event.target.value)}
            error={errors.domain}
            maxLength={255}
          />

          <TextField
            id={`${formId}-industry`}
            label="Industry"
            placeholder="Staffing"
            value={values.industry}
            onChange={(event) => update('industry', event.target.value)}
            maxLength={120}
          />

          <TextField
            id={`${formId}-employees`}
            label="Employees"
            type="number"
            min="0"
            step="1"
            inputMode="numeric"
            placeholder="50"
            value={values.employeeCount}
            onChange={(event) => update('employeeCount', event.target.value)}
            error={errors.employeeCount}
          />

          <TextField
            id={`${formId}-source`}
            label="Source"
            placeholder="Referral, LinkedIn, import…"
            value={values.source}
            onChange={(event) => update('source', event.target.value)}
            maxLength={120}
          />
        </div>
      </section>

      <section className="company-form__section" aria-labelledby={`${formId}-web`}>
        <h3 className="company-form__section-title" id={`${formId}-web`}>
          Web presence
        </h3>
        <div className="company-form__grid">
          <TextField
            id={`${formId}-website`}
            label="Website"
            placeholder="https://northwind.com"
            value={values.website}
            onChange={(event) => update('website', event.target.value)}
            error={errors.website}
            maxLength={500}
          />

          <TextField
            id={`${formId}-linkedin`}
            label="LinkedIn URL"
            placeholder="https://linkedin.com/company/northwind"
            value={values.linkedinUrl}
            onChange={(event) => update('linkedinUrl', event.target.value)}
            error={errors.linkedinUrl}
            maxLength={500}
          />
        </div>
      </section>

      <section className="company-form__section" aria-labelledby={`${formId}-location`}>
        <h3 className="company-form__section-title" id={`${formId}-location`}>
          Location
        </h3>
        <div className="company-form__grid company-form__grid--three">
          <TextField
            id={`${formId}-city`}
            label="City"
            placeholder="Manila"
            value={values.city}
            onChange={(event) => update('city', event.target.value)}
            maxLength={120}
          />

          <TextField
            id={`${formId}-state`}
            label="State / region"
            placeholder="Metro Manila"
            value={values.state}
            onChange={(event) => update('state', event.target.value)}
            maxLength={120}
          />

          <TextField
            id={`${formId}-country`}
            label="Country"
            placeholder="Philippines"
            value={values.country}
            onChange={(event) => update('country', event.target.value)}
            maxLength={120}
          />
        </div>
      </section>

      <section className="company-form__section" aria-labelledby={`${formId}-notes`}>
        <h3 className="company-form__section-title" id={`${formId}-notes`}>
          Notes
        </h3>
        <TextareaField
          id={`${formId}-notes-text`}
          label="Context for your team"
          optional
          placeholder="Why this employer is a good fit, who introduced you, anything the next person should know…"
          value={values.notes}
          onChange={(event) => update('notes', event.target.value)}
          rows={4}
        />
      </section>

      <section className="company-form__section" aria-labelledby={`${formId}-custom`}>
        <div className="company-form__section-head">
          <h3 className="company-form__section-title" id={`${formId}-custom`}>
            Custom fields
          </h3>
          <Badge tone="outline" size="sm">
            Optional
          </Badge>
        </div>

        {values.customFields.length === 0 ? (
          <p className="company-form__muted">
            Add your own labels, like “Recruitment focus” or “Account owner”.
          </p>
        ) : (
          <div className="company-form__custom-list">
            {values.customFields.map((field, index) => (
              <div className="company-form__custom-row" key={index}>
                <input
                  className="ui-input company-form__custom-key"
                  aria-label={`Custom field ${index + 1} name`}
                  placeholder="Field name"
                  value={field.key}
                  onChange={(event) => updateCustomField(index, 'key', event.target.value)}
                  maxLength={80}
                />
                <input
                  className="ui-input company-form__custom-value"
                  aria-label={`Custom field ${index + 1} value`}
                  placeholder="Value"
                  value={field.value}
                  onChange={(event) => updateCustomField(index, 'value', event.target.value)}
                  maxLength={500}
                />
                <button
                  type="button"
                  className="company-form__custom-remove"
                  onClick={() => removeCustomField(index)}
                  aria-label={`Remove custom field ${index + 1}`}
                >
                  <Close size={15} />
                </button>
              </div>
            ))}
          </div>
        )}

        {errors.customFields ? (
          <p className="company-form__field-error" role="alert">
            {errors.customFields}
          </p>
        ) : null}

        <Button variant="ghost" size="sm" leadingIcon={Plus} onClick={addCustomField}>
          Add field
        </Button>
      </section>

    </form>
  )
}

export function CompanyFormModal({ open, company = null, onClose, onSaved }) {
  const { toast } = useToast()
  const formId = useId().replace(/[^a-zA-Z0-9_-]/g, '')
  const [values, setValues] = useState(() => companyToForm(company))
  const [errors, setErrors] = useState({})
  const [banner, setBanner] = useState(null)
  const [duplicates, setDuplicates] = useState([])
  const [submitting, setSubmitting] = useState(false)

  const companyId = company?.id ?? null

  useEffect(() => {
    setValues(companyToForm(company))
    setErrors({})
    setBanner(null)
    setDuplicates([])
    // Only reset when a different record is opened, not on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId, open])

  function handleClose() {
    if (submitting) return
    onClose?.()
  }

  async function handleSubmit(event) {
    event.preventDefault()
    setBanner(null)

    const nextErrors = validateCompany(values)
    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors)
      return
    }

    setErrors({})
    setSubmitting(true)

    try {
      if (duplicates.length === 0) {
        const found = await findCompanyDuplicates(values, { excludeId: companyId })
        if (found.length > 0) {
          setDuplicates(found)
          return
        }
      }

      const saved = company
        ? await updateCompany(company.id, values)
        : await createCompany(values)

      toast.success(company ? 'Company updated.' : 'Company created.')
      onSaved?.(saved, { created: !company })
    } catch (caught) {
      const fieldErrors = caught?.fieldErrors ?? {}
      const mapped = {}
      for (const [key, message] of Object.entries(fieldErrors)) {
        const field = API_FIELD_MAP[key]
        if (field) mapped[field] = message
      }
      if (Object.keys(mapped).length > 0) setErrors(mapped)

      setBanner(
        caught?.status === 403
          ? 'Your role does not allow changes to company records.'
          : caught?.message || 'We could not save this company. Try again.',
      )
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal
      open={open}
      title={company ? 'Edit company' : 'New company'}
      description={
        company
          ? 'Update the record your team sees across contacts, campaigns, and replies.'
          : 'Add the employer you are targeting. You can fill in the rest later.'
      }
      size="lg"
      onClose={handleClose}
      footer={
        <>
          <Button variant="ghost" onClick={handleClose} disabled={submitting}>
            Cancel
          </Button>
          <Button
            type="submit"
            form={formId}
            variant="primary"
            loading={submitting}
            title={
              duplicates.length > 0
                ? 'The company shares a domain or name. Submit again to save anyway.'
                : undefined
            }
          >
            {duplicates.length > 0
              ? 'Save anyway'
              : company
                ? 'Save changes'
                : 'Create company'}
          </Button>
        </>
      }
    >
      <CompanyForm
        formId={formId}
        company={company}
        values={values}
        setValues={(updater) => {
          setValues(updater)
          if (Object.keys(errors).length > 0) setErrors({})
          if (duplicates.length > 0) setDuplicates([])
          if (banner) setBanner(null)
        }}
        errors={errors}
        banner={banner}
        duplicates={duplicates}
        onSubmit={handleSubmit}
      />
    </Modal>
  )
}
