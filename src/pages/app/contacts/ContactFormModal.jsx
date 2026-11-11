import { useEffect, useId, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Badge, Button, Modal, formatStatus, useToast } from '../../../components/ui'
import { SelectField, TextField, TextareaField } from '../../../components/Field'
import { AlertCircle, ArrowRight, Close, Mail, Plus } from '../../../components/icons'
import { getCompany } from '../../../lib/companies'
import {
  CONTACT_STATUSES,
  EMAIL_STATUSES,
  contactDisplayName,
  contactToForm,
  createContact,
  findContactDuplicates,
  listCompanyDirectory,
  updateContact,
  validateContact,
} from '../../../lib/contacts'

const API_FIELD_MAP = {
  email: 'email',
  first_name: 'firstName',
  last_name: 'lastName',
  title: 'title',
  phone: 'phone',
  linkedin_url: 'linkedinUrl',
  source: 'source',
  notes: 'notes',
  custom_fields: 'customFields',
  company_id: 'companyId',
  status: 'status',
  email_status: 'emailStatus',
}

function ContactForm({
  formId,
  contact,
  values,
  setValues,
  errors,
  banner,
  duplicates,
  companyOptions,
  onOpenDuplicate,
  onSubmit,
}) {
  function update(field, value) {
    setValues((current) => ({ ...current, [field]: value }))
  }

  function updateCustomField(index, part, value) {
    setValues((current) => ({
      ...current,
      customFields: current.customFields.map((field, fieldIndex) =>
        fieldIndex === index ? { ...field, [part]: value } : field,
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
      customFields: current.customFields.filter((_, fieldIndex) => fieldIndex !== index),
    }))
  }

  const editing = Boolean(contact)

  return (
    <form id={formId} className="contact-form" onSubmit={onSubmit} noValidate>
      {banner ? (
        <p className="contact-form__banner" role="alert">
          <AlertCircle size={16} aria-hidden="true" />
          <span>{banner}</span>
        </p>
      ) : null}

      {duplicates.length > 0 ? (
        <div className="contact-form__duplicate" role="alert">
          <p className="contact-form__duplicate-title">
            <Mail size={16} aria-hidden="true" />
            This email is already in your workspace
          </p>
          <p className="contact-form__duplicate-copy">
            Contact emails are unique, so the server rejects a second record for the same address.
            Change the email, or open the existing contact to edit it instead.
          </p>
          <ul className="contact-form__duplicate-list">
            {duplicates.map((match) => (
              <li key={match.id}>
                <div className="contact-form__duplicate-main">
                  <strong>{contactDisplayName(match)}</strong>
                  <span>{match.email}</span>
                </div>
                <button
                  type="button"
                  className="contact-form__duplicate-open"
                  onClick={() => onOpenDuplicate(match.id)}
                >
                  View contact
                  <ArrowRight size={13} aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <section className="contact-form__section" aria-labelledby={`${formId}-basics`}>
        <h3 className="contact-form__section-title" id={`${formId}-basics`}>
          Basics
        </h3>
        <div className="contact-form__grid">
          <TextField
            id={`${formId}-email`}
            label="Email"
            type="email"
            placeholder="dana@northwind.com"
            hint="The unique identifier for this contact across lists and campaigns."
            value={values.email}
            onChange={(event) => update('email', event.target.value)}
            error={errors.email}
            maxLength={254}
            className="contact-form__span-2"
            autoFocus={!editing}
          />

          <TextField
            id={`${formId}-first-name`}
            label="First name"
            optional
            placeholder="Dana"
            value={values.firstName}
            onChange={(event) => update('firstName', event.target.value)}
            error={errors.firstName}
            maxLength={120}
          />

          <TextField
            id={`${formId}-last-name`}
            label="Last name"
            optional
            placeholder="Reed"
            value={values.lastName}
            onChange={(event) => update('lastName', event.target.value)}
            error={errors.lastName}
            maxLength={120}
          />

          <TextField
            id={`${formId}-title`}
            label="Job title"
            optional
            placeholder="Head of Talent"
            value={values.title}
            onChange={(event) => update('title', event.target.value)}
            error={errors.title}
            maxLength={255}
          />

          <TextField
            id={`${formId}-phone`}
            label="Phone"
            optional
            type="tel"
            placeholder="+1 555 0100"
            value={values.phone}
            onChange={(event) => update('phone', event.target.value)}
            error={errors.phone}
            maxLength={64}
          />
        </div>
      </section>

      <section className="contact-form__section" aria-labelledby={`${formId}-company`}>
        <h3 className="contact-form__section-title" id={`${formId}-company`}>
          Company &amp; source
        </h3>
        <div className="contact-form__grid">
          <SelectField
            id={`${formId}-company`}
            label="Company"
            hint="Keeps this contact linked in the company’s People card."
            value={values.companyId}
            onChange={(event) => update('companyId', event.target.value)}
            error={errors.companyId}
            className="contact-form__span-2"
          >
            <option value="">No company</option>
            {companyOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </SelectField>

          <TextField
            id={`${formId}-linkedin`}
            label="LinkedIn"
            optional
            placeholder="https://linkedin.com/in/dana-reed"
            value={values.linkedinUrl}
            onChange={(event) => update('linkedinUrl', event.target.value)}
            error={errors.linkedinUrl}
            maxLength={500}
          />

          <TextField
            id={`${formId}-source`}
            label="Source"
            optional
            placeholder="Referral"
            value={values.source}
            onChange={(event) => update('source', event.target.value)}
            error={errors.source}
            maxLength={120}
          />
        </div>
      </section>

      <section className="contact-form__section" aria-labelledby={`${formId}-status`}>
        <div className="contact-form__section-head">
          <h3 className="contact-form__section-title" id={`${formId}-status`}>
            Status
          </h3>
          {editing ? (
            <Badge tone="outline" size="sm">
              Pipeline
            </Badge>
          ) : (
            <Badge tone="outline" size="sm">
              Email health
            </Badge>
          )}
        </div>
        <div className="contact-form__grid">
          {editing ? (
            <SelectField
              id={`${formId}-status`}
              label="Pipeline status"
              hint="Where this contact sits in your outreach. New contacts start as “New”."
              value={values.status}
              onChange={(event) => update('status', event.target.value)}
              error={errors.status}
              className="contact-form__span-2"
            >
              {CONTACT_STATUSES.map((status) => (
                <option key={status} value={status}>
                  {formatStatus(status)}
                </option>
              ))}
            </SelectField>
          ) : (
            <SelectField
              id={`${formId}-email-status`}
              label="Email health"
              hint="Set once deliverability is verified. It cannot be changed after the contact exists."
              value={values.emailStatus}
              onChange={(event) => update('emailStatus', event.target.value)}
              error={errors.emailStatus}
              className="contact-form__span-2"
            >
              {EMAIL_STATUSES.map((status) => (
                <option key={status} value={status}>
                  {formatStatus(status)}
                </option>
              ))}
            </SelectField>
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
          placeholder="What this person cares about, who introduced you, the best time to reach out…"
          value={values.notes}
          onChange={(event) => update('notes', event.target.value)}
          rows={4}
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
            Add your own labels, like “Preferred name” or “Timezone”.
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
          <p className="contact-form__field-error" role="alert">
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

export function ContactFormModal({
  open,
  contact = null,
  defaultCompanyId = '',
  onClose,
  onSaved,
}) {
  const navigate = useNavigate()
  const { toast } = useToast()
  const formId = useId().replace(/[^a-zA-Z0-9_-]/g, '')
  const [values, setValues] = useState(() => contactToForm(contact))
  const [errors, setErrors] = useState({})
  const [banner, setBanner] = useState(null)
  const [duplicates, setDuplicates] = useState([])
  const [submitting, setSubmitting] = useState(false)
  const [companyOptions, setCompanyOptions] = useState([])

  const contactId = contact?.id ?? null

  useEffect(() => {
    const next = contactToForm(contact)
    // Creating from a company-filtered list pre-selects that company.
    if (!contact && defaultCompanyId) next.companyId = defaultCompanyId
    setValues(next)
    setErrors({})
    setBanner(null)
    setDuplicates([])
    // Only reset when a different record is opened, not on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contactId, open])

  // Company options for the select. The directory is a sample of the first
  // 100 records, so the contact's own company is also fetched exactly —
  // it stays selectable even when the sample does not include it.
  useEffect(() => {
    if (!open) return undefined
    const controller = new AbortController()

    listCompanyDirectory(controller.signal)
      .then((directory) => {
        if (controller.signal.aborted) return
        setCompanyOptions(directory.options)
        if (!contactId) return
        const hasCurrent = directory.options.some((option) => option.value === contact.companyId)
        if (contact.companyId && !hasCurrent) {
          getCompany(contact.companyId, controller.signal)
            .then((found) => {
              if (controller.signal.aborted) return
              setCompanyOptions((current) => [
                ...current,
                { value: found.id, label: found.name },
              ])
            })
            .catch(() => {})
        }
      })
      .catch(() => {})

    return () => controller.abort()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, contactId])

  function handleClose() {
    if (submitting) return
    onClose?.()
  }

  function handleOpenDuplicate(duplicateId) {
    if (submitting) return
    onClose?.()
    navigate(`/app/contacts/${duplicateId}`)
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
      // Email uniqueness is enforced by the server (409), so this is a hard
      // stop: there is no "save anyway" path like the company form.
      const found = await findContactDuplicates(values, { excludeId: contactId })
      if (found.length > 0) {
        setDuplicates(found)
        return
      }

      const saved = contact
        ? await updateContact(contact.id, values)
        : await createContact(values)

      toast.success(contact ? 'Contact updated.' : 'Contact created.')
      onSaved?.(saved, { created: !contact })
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
          ? 'Your role does not allow changes to contact records.'
          : caught?.status === 409
            ? 'A contact with this email already exists in this workspace.'
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
          ? 'Updates the record your team sees across companies, lists, and campaigns.'
          : 'Add a person to reach out to. You can fill in the rest later.'
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
          if (duplicates.length > 0) setDuplicates([])
          if (banner) setBanner(null)
        }}
        errors={errors}
        banner={banner}
        duplicates={duplicates}
        companyOptions={companyOptions}
        onOpenDuplicate={handleOpenDuplicate}
        onSubmit={handleSubmit}
      />
    </Modal>
  )
}
