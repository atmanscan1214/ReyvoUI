import { useEffect, useId, useState } from 'react'
import { Modal, Button, Badge, StatusBadge, useToast } from '../../../components/ui'
import { TextField, TextareaField, SelectField } from '../../../components/Field'
import { AlertCircle, Plus, Close } from '../../../components/icons'
import {
  CONTACT_STATUSES,
  CONTACT_TAG_LENGTH,
  CONTACT_TAG_LIMIT,
  EMAIL_STATUSES,
  TAG_STORAGE_AVAILABLE,
  contactToForm,
  createContact,
  normalizeTag,
  saveContactTags,
  updateContact,
  validateContact,
} from '../../../lib/contacts'
import { CompanyPicker } from './CompanyPicker'

const API_FIELD_MAP = {
  email: 'email',
  first_name: 'firstName',
  last_name: 'lastName',
  title: 'title',
  company_id: 'companyId',
  phone: 'phone',
  linkedin_url: 'linkedinUrl',
  source: 'source',
  email_status: 'emailStatus',
  status: 'status',
  notes: 'notes',
  custom_fields: 'customFields',
}

function TagsInput({ tags, onChange, error }) {
  const [draft, setDraft] = useState('')

  function commit(value) {
    const tag = normalizeTag(value)
    setDraft('')
    if (!tag) return
    if (tags.some((existing) => existing.toLowerCase() === tag.toLowerCase())) return
    if (CONTACT_TAG_LIMIT <= tags.length) return
    onChange([...tags, tag])
  }

  function handleKeyDown(event) {
    if (event.key === 'Enter' || event.key === ',') {
      event.preventDefault()
      commit(draft)
      return
    }
    if (event.key === 'Backspace' && !draft && tags.length > 0) {
      event.preventDefault()
      onChange(tags.slice(0, -1))
    }
  }

  return (
    <div className="contact-tags">
      {tags.length > 0 ? (
        <ul className="contact-tags__list">
          {tags.map((tag) => (
            <li key={tag} className="contact-tags__chip">
              <span>{tag}</span>
              <button
                type="button"
                className="contact-tags__remove"
                onClick={() => onChange(tags.filter((existing) => existing !== tag))}
                aria-label={`Remove tag ${tag}`}
                disabled={!TAG_STORAGE_AVAILABLE}
              >
                <Close size={12} />
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      <div className="contact-tags__input-row">
        <input
          className="ui-input contact-tags__input"
          placeholder={
            TAG_STORAGE_AVAILABLE
              ? 'Add a tag and press Enter'
              : 'Tags are not available on this API build'
          }
          value={draft}
          onChange={(event) => setDraft(event.target.value.slice(0, CONTACT_TAG_LENGTH))}
          onKeyDown={handleKeyDown}
          onBlur={() => commit(draft)}
          disabled={!TAG_STORAGE_AVAILABLE || tags.length >= CONTACT_TAG_LIMIT}
          maxLength={CONTACT_TAG_LENGTH}
          aria-label="Add a tag"
          aria-describedby={error ? 'contact-tags-error' : 'contact-tags-hint'}
        />
        <Button
          variant="ghost"
          size="sm"
          leadingIcon={Plus}
          onClick={() => commit(draft)}
          disabled={!TAG_STORAGE_AVAILABLE || !draft.trim() || tags.length >= CONTACT_TAG_LIMIT}
        >
          Add
        </Button>
      </div>

      {error ? (
        <p className="field__error" id="contact-tags-error">
          {error}
        </p>
      ) : (
        <p className="field__hint" id="contact-tags-hint">
          {TAG_STORAGE_AVAILABLE
            ? `Development only: this API build has no tags endpoint, so tags are stored in this browser. Up to ${CONTACT_TAG_LIMIT}.`
            : 'Tag storage needs a tags endpoint, which this API build does not expose.'}
        </p>
      )}
    </div>
  )
}

function ContactForm({
  formId,
  contact,
  values,
  setValues,
  errors,
  banner,
  selectedCompany,
  onCompanyChange,
  onSubmit,
}) {
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

  return (
    <form id={formId} className="contact-form" onSubmit={onSubmit} noValidate>
      {banner ? (
        <p className="contact-form__banner" role="alert">
          <AlertCircle size={16} aria-hidden="true" />
          <span>{banner}</span>
        </p>
      ) : null}

      <section className="contact-form__section" aria-labelledby={`${formId}-identity`}>
        <h3 className="contact-form__section-title" id={`${formId}-identity`}>
          Identity
        </h3>
        <div className="contact-form__grid">
          <TextField
            id={`${formId}-first`}
            label="First name"
            placeholder="Ana"
            value={values.firstName}
            onChange={(event) => update('firstName', event.target.value)}
            error={errors.firstName}
            maxLength={120}
            autoComplete="off"
            autoFocus={!contact}
          />

          <TextField
            id={`${formId}-last`}
            label="Last name"
            placeholder="Reyes"
            value={values.lastName}
            onChange={(event) => update('lastName', event.target.value)}
            error={errors.lastName}
            maxLength={120}
            autoComplete="off"
          />

          <TextField
            id={`${formId}-email`}
            label="Email"
            type="email"
            placeholder="ana.reyes@northwind.com"
            value={values.email}
            onChange={(event) => update('email', event.target.value)}
            error={errors.email}
            maxLength={320}
            className="contact-form__span-2"
            autoComplete="off"
          />

          <TextField
            id={`${formId}-title`}
            label="Job title"
            placeholder="Talent Director"
            value={values.title}
            onChange={(event) => update('title', event.target.value)}
            error={errors.title}
            maxLength={255}
            className="contact-form__span-2"
          />
        </div>
      </section>

      <section className="contact-form__section" aria-labelledby={`${formId}-company`}>
        <h3 className="contact-form__section-title" id={`${formId}-company`}>
          Company
        </h3>
        <div className="contact-form__grid">
          <CompanyPicker
            value={values.companyId}
            selectedCompany={selectedCompany}
            onChange={onCompanyChange}
            error={errors.companyId}
          />

          <TextField
            id={`${formId}-source`}
            label="Source"
            placeholder="Referral, LinkedIn, import…"
            value={values.source}
            onChange={(event) => update('source', event.target.value)}
            error={errors.source}
            maxLength={120}
          />
        </div>
      </section>

      <section className="contact-form__section" aria-labelledby={`${formId}-reach`}>
        <h3 className="contact-form__section-title" id={`${formId}-reach`}>
          Contact details
        </h3>
        <div className="contact-form__grid">
          <TextField
            id={`${formId}-phone`}
            label="Phone"
            type="tel"
            placeholder="+63 917 000 0000"
            value={values.phone}
            onChange={(event) => update('phone', event.target.value)}
            error={errors.phone}
            maxLength={64}
          />

          <TextField
            id={`${formId}-linkedin`}
            label="LinkedIn URL"
            placeholder="https://linkedin.com/in/anareyes"
            value={values.linkedinUrl}
            onChange={(event) => update('linkedinUrl', event.target.value)}
            error={errors.linkedinUrl}
            maxLength={500}
          />
        </div>
      </section>

      <section className="contact-form__section" aria-labelledby={`${formId}-deliverability`}>
        <h3 className="contact-form__section-title" id={`${formId}-deliverability`}>
          Deliverability
        </h3>
        <div className="contact-form__grid">
          {contact ? (
            <div className="contact-form__note">
              <p className="contact-form__note-title contact-form__note-title--row">
                Current email health
                <StatusBadge status={contact.emailStatus} size="sm" dot={false} />
              </p>
              <p>
                Email health is set when a contact is created. Updates arrive from verification
                once that service is connected.
              </p>
            </div>
          ) : (
            <SelectField
              id={`${formId}-email-status`}
              label="Email health"
              value={values.emailStatus}
              onChange={(event) => update('emailStatus', event.target.value)}
              error={errors.emailStatus}
              hint="Set manually until the verification service is connected."
            >
              {EMAIL_STATUSES.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </SelectField>
          )}

          {contact ? (
            <SelectField
              id={`${formId}-status`}
              label="Contact status"
              value={values.status}
              onChange={(event) => update('status', event.target.value)}
              error={errors.status}
              hint="Status normally follows sends and replies; you can correct it here."
            >
              {CONTACT_STATUSES.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </SelectField>
          ) : (
            <div className="contact-form__note">
              <p className="contact-form__note-title">New contacts start as “New”</p>
              <p>
                Sends and replies move the status automatically. You can change it from the
                contact record after creating it.
              </p>
            </div>
          )}
        </div>
      </section>

      <section className="contact-form__section" aria-labelledby={`${formId}-notes`}>
        <h3 className="contact-form__section-title" id={`${formId}-notes`}>
          Notes
        </h3>
        <TextareaField
          id={`${formId}-notes-text`}
          label="Context for your team"
          optional
          placeholder="How you met, what they care about, the next step…"
          value={values.notes}
          onChange={(event) => update('notes', event.target.value)}
          rows={4}
        />
      </section>

      <section className="contact-form__section" aria-labelledby={`${formId}-tags`}>
        <div className="contact-form__section-head">
          <h3 className="contact-form__section-title" id={`${formId}-tags`}>
            Tags
          </h3>
          <Badge tone="outline" size="sm">
            Optional
          </Badge>
        </div>
        <TagsInput
          tags={values.tags}
          onChange={(tags) => update('tags', tags)}
          error={errors.tags}
        />
      </section>

      <section className="contact-form__section" aria-labelledby={`${formId}-custom`}>
        <div className="contact-form__section-head">
          <h3 className="contact-form__section-title" id={`${formId}-custom`}>
            Custom fields
          </h3>
          <Badge tone="outline" size="sm">
            Optional
          </Badge>
        </div>

        {values.customFields.length === 0 ? (
          <p className="contact-form__muted">
            Add your own labels, like “Preferred channel” or “Time zone”.
          </p>
        ) : (
          <div className="contact-form__custom-list">
            {values.customFields.map((field, index) => (
              <div className="contact-form__custom-row" key={index}>
                <input
                  className="ui-input contact-form__custom-key"
                  aria-label={`Custom field ${index + 1} name`}
                  placeholder="Field name"
                  value={field.key}
                  onChange={(event) => updateCustomField(index, 'key', event.target.value)}
                  maxLength={80}
                />
                <input
                  className="ui-input contact-form__custom-value"
                  aria-label={`Custom field ${index + 1} value`}
                  placeholder="Value"
                  value={field.value}
                  onChange={(event) => updateCustomField(index, 'value', event.target.value)}
                  maxLength={500}
                />
                <button
                  type="button"
                  className="contact-form__custom-remove"
                  onClick={() =>
                    setValues((current) => ({
                      ...current,
                      customFields: current.customFields.filter(
                        (_, rowIndex) => rowIndex !== index,
                      ),
                    }))
                  }
                  aria-label={`Remove custom field ${index + 1}`}
                >
                  <Close size={15} />
                </button>
              </div>
            ))}
          </div>
        )}

        {errors.customFields ? (
          <p className="contact-form__field-error" role="alert">
            {errors.customFields}
          </p>
        ) : null}

        <Button
          variant="ghost"
          size="sm"
          leadingIcon={Plus}
          onClick={() =>
            setValues((current) => ({
              ...current,
              customFields: [...current.customFields, { key: '', value: '' }],
            }))
          }
        >
          Add field
        </Button>
      </section>
    </form>
  )
}

export function ContactFormModal({
  open,
  contact = null,
  defaultCompany = null,
  onClose,
  onSaved,
}) {
  const { toast } = useToast()
  const formId = useId().replace(/[^a-zA-Z0-9_-]/g, '')
  const [values, setValues] = useState(() => contactToForm(contact))
  const [selectedCompany, setSelectedCompany] = useState(defaultCompany)
  const [errors, setErrors] = useState({})
  const [banner, setBanner] = useState(null)
  const [submitting, setSubmitting] = useState(false)

  const contactId = contact?.id ?? null

  useEffect(() => {
    const next = contactToForm(contact)
    // A contact created from a company-scoped list starts attached to that
    // company, so the picker, the payload, and the user's expectation agree.
    if (!contact && defaultCompany?.id) next.companyId = defaultCompany.id

    setValues(next)
    setSelectedCompany(defaultCompany)
    setErrors({})
    setBanner(null)
    // Only reset when a different record is opened, not on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contactId, open])

  function handleClose() {
    if (submitting) return
    onClose?.()
  }

  function handleCompanyChange(company) {
    setSelectedCompany(company)
    setValues((current) => ({ ...current, companyId: company?.id ?? '' }))
    if (errors.companyId) setErrors((current) => ({ ...current, companyId: undefined }))
    if (banner) setBanner(null)
  }

  async function handleSubmit(event) {
    event.preventDefault()
    setBanner(null)

    const nextErrors = validateContact(values)
    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors)
      return
    }

    setErrors({})
    setSubmitting(true)

    try {
      const saved = contact
        ? await updateContact(contact.id, values)
        : await createContact(values)

      saveContactTags(saved.id, values.tags)

      toast.success(contact ? 'Contact updated.' : 'Contact created.')
      onSaved?.(saved, { created: !contact })
    } catch (caught) {
      const fieldErrors = caught?.fieldErrors ?? {}
      const mapped = {}
      for (const [key, message] of Object.entries(fieldErrors)) {
        const field = API_FIELD_MAP[key]
        if (field) mapped[field] = message
      }

      if (caught?.status === 409) {
        mapped.email = 'A contact with this email already exists in this workspace.'
      }

      if (Object.keys(mapped).length > 0) setErrors(mapped)

      setBanner(
        caught?.status === 403
          ? 'Your role does not allow changes to contact records.'
          : caught?.status === 409
            ? 'A contact with this email already exists in this workspace. Open that record to update it.'
            : caught?.message || 'We could not save this contact. Try again.',
      )
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal
      open={open}
      title={contact ? 'Edit contact' : 'New contact'}
      description={
        contact
          ? 'Update the person, their company, or how your team should reach them.'
          : 'Add a person manually. Email is required; everything else can be filled in later.'
      }
      size="lg"
      onClose={handleClose}
      footer={
        <>
          <Button variant="ghost" onClick={handleClose} disabled={submitting}>
            Cancel
          </Button>
          <Button type="submit" form={formId} variant="primary" loading={submitting}>
            {contact ? 'Save changes' : 'Create contact'}
          </Button>
        </>
      }
    >
      <ContactForm
        formId={formId}
        contact={contact}
        values={values}
        setValues={(updater) => {
          setValues(updater)
          if (Object.keys(errors).length > 0) setErrors({})
          if (banner) setBanner(null)
        }}
        errors={errors}
        banner={banner}
        selectedCompany={selectedCompany}
        onCompanyChange={handleCompanyChange}
        onSubmit={handleSubmit}
      />
    </Modal>
  )
}
