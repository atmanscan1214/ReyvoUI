import { api } from './api'

/**
 * Contact adapter for T12.
 *
 * The API is live: list/detail/create/update/delete all exist under
 * `/api/v1/contacts`. `GET /contacts` is paginated and supports `search`
 * (substring on normalized email and full name), an exact `status` filter,
 * and a `company_id` filter — company detail links here with that filter.
 *
 * Email is the identity: `POST` and `PATCH` enforce tenant-wide uniqueness on
 * the normalized email (409), so the form probes for duplicates before
 * writing. Unlike companies, there is no “save anyway” — the server would
 * reject the write anyway.
 *
 * `status` (pipeline state) is only writable on `PATCH`; `email_status` is
 * only writable on `POST`. The form reflects that split instead of faking
 * both on every screen.
 *
 * Contact records carry only `company_id`; the API has no embedded company
 * summary and no batch lookup, so screens resolve names through the
 * companies API (sampled directory for lists, an exact fetch for detail).
 */

export const CONTACTS_PAGE_SIZE = 25

/** Pipeline statuses from `ContactStatus`; set on create by the server. */
export const CONTACT_STATUSES = [
  'new',
  'contacted',
  'replied',
  'meeting',
  'won',
  'not_interested',
  'unsubscribed',
  'bounced',
  'archived',
]

/** Deliverability states from `EmailStatus`; writable only on create. */
export const EMAIL_STATUSES = ['unknown', 'valid', 'risky', 'invalid']

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/

export function emptyContactForm() {
  return {
    email: '',
    firstName: '',
    lastName: '',
    title: '',
    phone: '',
    linkedinUrl: '',
    source: '',
    companyId: '',
    emailStatus: 'unknown',
    status: 'new',
    notes: '',
    customFields: [],
  }
}

export function contactToForm(contact) {
  if (!contact) return emptyContactForm()

  return {
    email: contact.email ?? '',
    firstName: contact.firstName ?? '',
    lastName: contact.lastName ?? '',
    title: contact.title ?? '',
    phone: contact.phone ?? '',
    linkedinUrl: contact.linkedinUrl ?? '',
    source: contact.source ?? '',
    companyId: contact.companyId ?? '',
    emailStatus: contact.emailStatus ?? 'unknown',
    status: contact.status ?? 'new',
    notes: contact.notes ?? '',
    customFields: Object.entries(contact.customFields ?? {}).map(([key, value]) => ({
      key,
      value: value == null ? '' : String(value),
    })),
  }
}

export function normalizeEmail(value) {
  return String(value ?? '').trim().toLowerCase()
}

export function contactDisplayName(contact) {
  return contact?.fullName || contact?.email || 'Unnamed contact'
}

function toQuery(params) {
  const query = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '') continue
    query.set(key, String(value))
  }
  const text = query.toString()
  return text ? `?${text}` : ''
}

function normalizeContact(raw) {
  return {
    id: String(raw?.id ?? ''),
    companyId: raw?.company_id ? String(raw.company_id) : null,
    firstName: raw?.first_name ?? null,
    lastName: raw?.last_name ?? null,
    fullName: raw?.full_name ?? '',
    title: raw?.title ?? null,
    email: raw?.email ?? '',
    emailNormalized: raw?.email_normalized ?? raw?.email ?? '',
    emailStatus: raw?.email_status ?? 'unknown',
    phone: raw?.phone ?? null,
    linkedinUrl: raw?.linkedin_url ?? null,
    source: raw?.source ?? null,
    status: raw?.status ?? 'new',
    notes: raw?.notes ?? null,
    customFields:
      raw?.custom_fields && typeof raw.custom_fields === 'object' ? raw.custom_fields : {},
    lastContactedAt: raw?.last_contacted_at ?? null,
    lastRepliedAt: raw?.last_replied_at ?? null,
    createdAt: raw?.created_at ?? null,
    updatedAt: raw?.updated_at ?? null,
  }
}

export async function listContacts(
  { search, status, companyId, listId, limit, offset } = {},
  signal,
) {
  const data = await api.get(
    `/contacts${toQuery({ search: search?.trim(), status, company_id: companyId, list_id: listId, limit, offset })}`,
    { signal },
  )

  const items = Array.isArray(data?.items) ? data.items.map(normalizeContact) : []
  return {
    items,
    total: Number(data?.total ?? items.length),
    limit: Number(data?.limit ?? limit ?? CONTACTS_PAGE_SIZE),
    offset: Number(data?.offset ?? offset ?? 0),
  }
}

export async function getContact(contactId, signal) {
  const data = await api.get(`/contacts/${encodeURIComponent(contactId)}`, { signal })
  return normalizeContact(data)
}

export async function createContact(values) {
  const data = await api.post('/contacts', toContactPayload(values, { editing: false }))
  return normalizeContact(data)
}

export async function updateContact(contactId, values) {
  const data = await api.patch(
    `/contacts/${encodeURIComponent(contactId)}`,
    toContactPayload(values, { editing: true }),
  )
  return normalizeContact(data)
}

export async function deleteContact(contactId) {
  await api.delete(`/contacts/${encodeURIComponent(contactId)}`)
}

/**
 * Contact emails are unique per workspace and the server rejects duplicates
 * with a 409, so the probe is a hard stop rather than a warning: the form
 * surfaces the existing record instead of offering “save anyway”.
 *
 * `search` matches the normalized email (and full name), so results are
 * filtered again on an exact normalized-email comparison.
 */
export async function findContactDuplicates(values, { excludeId = null, signal } = {}) {
  const email = normalizeEmail(values.email)
  if (!email) return []

  const data = await api
    .get(`/contacts${toQuery({ search: email, limit: 10 })}`, { signal })
    .catch((error) => {
      if (error?.name === 'AbortError') throw error
      // A failed probe must not block the save; the server still enforces
      // uniqueness with a 409 if a duplicate slips through.
      return { items: [] }
    })

  const items = Array.isArray(data?.items) ? data.items : []
  return items
    .map(normalizeContact)
    .filter(
      (candidate) =>
        candidate.id &&
        candidate.id !== excludeId &&
        normalizeEmail(candidate.emailNormalized || candidate.email) === email,
    )
}

/**
 * Company context. The contacts API returns only `company_id`, so list
 * screens sample the first 100 companies (`GET /companies?limit=100`) for a
 * name lookup — the same sampling the industry filter uses. Detail screens
 * fetch the exact record through `getCompany` from `lib/companies.js`.
 */
export async function listCompanyDirectory(signal) {
  const data = await api.get(`/companies${toQuery({ limit: 100 })}`, { signal })
  const items = Array.isArray(data?.items) ? data.items : []
  const companies = items.map((raw) => ({
    id: String(raw?.id ?? ''),
    name: raw?.name ?? 'Unnamed company',
  }))
  return {
    options: companies.map(({ id, name }) => ({ value: id, label: name })),
    nameById: new Map(companies.map(({ id, name }) => [id, name])),
  }
}

export function validateContact(values) {
  const errors = {}

  const email = String(values.email ?? '').trim()
  if (!email) {
    errors.email = 'Enter an email address.'
  } else if (!EMAIL_PATTERN.test(email)) {
    errors.email = 'Enter a valid email address, like dana@northwind.com.'
  } else if (email.length > 254) {
    errors.email = 'That email address is too long.'
  }

  for (const [field, label, max] of [
    ['firstName', 'First name', 120],
    ['lastName', 'Last name', 120],
    ['title', 'Title', 255],
    ['phone', 'Phone', 64],
    ['source', 'Source', 120],
  ]) {
    const value = String(values[field] ?? '').trim()
    if (value.length > max) {
      errors[field] = `${label} must be ${max} characters or fewer.`
    }
  }

  const linkedin = String(values.linkedinUrl ?? '').trim()
  if (linkedin && !/^https?:\/\/\S+$/i.test(linkedin)) {
    errors.linkedinUrl = 'Enter a full LinkedIn URL, like https://linkedin.com/in/dana-reed.'
  } else if (linkedin.length > 500) {
    errors.linkedinUrl = 'That LinkedIn URL is too long.'
  }

  const seen = new Set()
  for (const field of values.customFields ?? []) {
    const key = String(field.key ?? '').trim()
    if (!key) {
      errors.customFields = 'Every custom field needs a name.'
      break
    }
    const normalized = key.toLowerCase()
    if (seen.has(normalized)) {
      errors.customFields = `“${key}” is used more than once.`
      break
    }
    seen.add(normalized)
  }

  return errors
}

/**
 * `status` is only accepted by `PATCH` and `email_status` only by `POST`, so
 * the payload reflects the mode instead of sending fields the endpoint
 * would silently drop.
 */
export function toContactPayload(values, { editing = false } = {}) {
  const customFields = {}
  for (const field of values.customFields ?? []) {
    const key = String(field.key ?? '').trim()
    if (!key) continue
    customFields[key] = String(field.value ?? '')
  }

  const text = (value) => {
    const trimmed = String(value ?? '').trim()
    return trimmed || null
  }

  return {
    email: String(values.email ?? '').trim(),
    first_name: text(values.firstName),
    last_name: text(values.lastName),
    title: text(values.title),
    phone: text(values.phone),
    linkedin_url: text(values.linkedinUrl),
    source: text(values.source),
    notes: text(values.notes),
    custom_fields: customFields,
    company_id: values.companyId || null,
    ...(editing ? { status: values.status || 'new' } : { email_status: values.emailStatus }),
  }
}
