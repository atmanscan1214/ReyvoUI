import { api } from './api'
import { listCompanies } from './companies'

/**
 * Contact adapter for T12.
 *
 * The API is live: list/detail/create/update/delete all exist under
 * `/api/v1/contacts`. `GET /contacts` is paginated and supports `search`
 * (substring on normalized email and full name), `status`, `company_id`, and
 * `list_id`.
 *
 * Two gaps are handled here rather than invented in the UI:
 * - `ContactRead` carries `company_id` but not the company itself. Screens load
 *   `/companies/{id}` for context and sample `/companies?limit=100` for the
 *   filter and name lookup, the same approach T11 uses for industries.
 * - The design lists tags on a contact, but no tags endpoint exists. Development
 *   builds keep tags in `reyvo.contactTags.v1` per browser; production builds
 *   report the feature as unavailable instead of pretending they persisted.
 */

export const CONTACTS_PAGE_SIZE = 25
export const CONTACT_TAGS_KEY = 'reyvo.contactTags.v1'
export const CONTACT_TAG_LIMIT = 8
export const CONTACT_TAG_LENGTH = 24

export const TAG_STORAGE_AVAILABLE = Boolean(import.meta.env.DEV)

export const CONTACT_STATUSES = [
  { value: 'new', label: 'New' },
  { value: 'contacted', label: 'Contacted' },
  { value: 'replied', label: 'Replied' },
  { value: 'meeting', label: 'Meeting' },
  { value: 'won', label: 'Won' },
  { value: 'not_interested', label: 'Not interested' },
  { value: 'unsubscribed', label: 'Unsubscribed' },
  { value: 'bounced', label: 'Bounced' },
  { value: 'archived', label: 'Archived' },
]

export const EMAIL_STATUSES = [
  { value: 'valid', label: 'Valid' },
  { value: 'risky', label: 'Risky' },
  { value: 'invalid', label: 'Invalid' },
  { value: 'unknown', label: 'Unknown' },
]

export const EMAIL_STATUS_COPY = {
  valid: 'The address is expected to deliver. Safe to include in a campaign.',
  risky: 'A role-based or catch-all address. Delivery is less certain — review before sending.',
  invalid: 'The address is undeliverable. Fix it before this contact is used in a campaign.',
  unknown: 'This address has not been verified yet. It may still deliver normally.',
}

export function emptyContactForm() {
  return {
    firstName: '',
    lastName: '',
    email: '',
    title: '',
    companyId: '',
    phone: '',
    linkedinUrl: '',
    source: '',
    emailStatus: 'unknown',
    status: 'new',
    notes: '',
    customFields: [],
    tags: [],
  }
}

export function contactToForm(contact) {
  if (!contact) return emptyContactForm()

  return {
    firstName: contact.firstName ?? '',
    lastName: contact.lastName ?? '',
    email: contact.email ?? '',
    title: contact.title ?? '',
    companyId: contact.companyId ?? '',
    phone: contact.phone ?? '',
    linkedinUrl: contact.linkedinUrl ?? '',
    source: contact.source ?? '',
    emailStatus: contact.emailStatus ?? 'unknown',
    status: contact.status ?? 'new',
    notes: contact.notes ?? '',
    customFields: Object.entries(contact.customFields ?? {}).map(([key, value]) => ({
      key,
      value: value == null ? '' : String(value),
    })),
    tags: getContactTags(contact.id),
  }
}

export function normalizeContact(raw) {
  const firstName = raw?.first_name ?? ''
  const lastName = raw?.last_name ?? ''
  const joined = [firstName, lastName].filter(Boolean).join(' ').trim()
  const email = raw?.email ?? ''

  return {
    id: String(raw?.id ?? ''),
    companyId: raw?.company_id ? String(raw.company_id) : null,
    firstName,
    lastName,
    fullName: raw?.full_name || joined || email.split('@')[0] || 'Unnamed contact',
    title: raw?.title ?? null,
    email,
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

function toQuery(params) {
  const query = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '') continue
    query.set(key, String(value))
  }
  const text = query.toString()
  return text ? `?${text}` : ''
}

function text(value) {
  const trimmed = String(value ?? '').trim()
  return trimmed || null
}

export async function listContacts(
  { search, status, companyId, listId, limit, offset } = {},
  signal,
) {
  const data = await api.get(
    `/contacts${toQuery({
      search: search?.trim(),
      status,
      company_id: companyId,
      list_id: listId,
      limit,
      offset,
    })}`,
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

/**
 * Companies used by the contact filter, the company picker, and list rows.
 * There is no lightweight index endpoint, so this samples the first 100
 * companies — the same trade-off as the industry filter in T11.
 */
export async function loadContactCompanies(signal) {
  const data = await listCompanies({ limit: 100 }, signal)
  return data.items
}

export function validateContact(values) {
  const errors = {}

  const email = String(values.email ?? '').trim()
  if (!email) errors.email = 'Enter an email address.'
  else if (email.length > 320) errors.email = 'Use 320 characters or fewer.'
  else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    errors.email = 'Enter a valid email address.'
  }

  if (String(values.firstName ?? '').trim().length > 120) {
    errors.firstName = 'Use 120 characters or fewer.'
  }

  if (String(values.lastName ?? '').trim().length > 120) {
    errors.lastName = 'Use 120 characters or fewer.'
  }

  if (String(values.title ?? '').trim().length > 255) {
    errors.title = 'Use 255 characters or fewer.'
  }

  if (String(values.phone ?? '').trim().length > 64) {
    errors.phone = 'Use 64 characters or fewer.'
  }

  if (String(values.source ?? '').trim().length > 120) {
    errors.source = 'Use 120 characters or fewer.'
  }

  if (String(values.linkedinUrl ?? '').trim()) {
    const link = String(values.linkedinUrl).trim()
    if (link.length > 500) {
      errors.linkedinUrl = 'Use 500 characters or fewer.'
    } else if (!/^(https?:\/\/)?[^\s/]+\.[^\s]+$/i.test(link)) {
      errors.linkedinUrl = 'Enter a full LinkedIn URL.'
    }
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

  if ((values.tags ?? []).length > CONTACT_TAG_LIMIT) {
    errors.tags = `Use ${CONTACT_TAG_LIMIT} tags or fewer.`
  }

  return errors
}

export function toContactPayload(values, { includeStatus = false } = {}) {
  const customFields = {}
  for (const field of values.customFields ?? []) {
    const key = String(field.key ?? '').trim()
    if (!key) continue
    customFields[key] = String(field.value ?? '')
  }

  const payload = {
    email: String(values.email ?? '').trim(),
    first_name: text(values.firstName),
    last_name: text(values.lastName),
    title: text(values.title),
    company_id: values.companyId || null,
    phone: text(values.phone),
    linkedin_url: text(values.linkedinUrl),
    source: text(values.source),
    notes: text(values.notes),
    custom_fields: customFields,
  }

  // Email health is accepted only on create; `ContactUpdate` has no such field.
  if (!includeStatus) payload.email_status = values.emailStatus || 'unknown'

  // ContactCreate deliberately starts every contact at `new`; the status is
  // writable only through PATCH, so the create form exposes it as read-only.
  if (includeStatus) payload.status = values.status || 'new'

  return payload
}

export async function createContact(values) {
  const data = await api.post('/contacts', toContactPayload(values))
  return normalizeContact(data)
}

export async function updateContact(contactId, values) {
  const data = await api.patch(
    `/contacts/${encodeURIComponent(contactId)}`,
    toContactPayload(values, { includeStatus: true }),
  )
  return normalizeContact(data)
}

export async function deleteContact(contactId) {
  await api.delete(`/contacts/${encodeURIComponent(contactId)}`)
  removeContactTags(contactId)
}

/* Company helpers --------------------------------------------------------- */

export function companyName(company) {
  return company?.name ?? null
}

export function companyLabel(company) {
  if (!company) return null
  return company.domain ? `${company.name} · ${company.domain}` : company.name
}

/* Tags -------------------------------------------------------------------- */

function readTagStore() {
  if (typeof window === 'undefined') return { contacts: {} }
  try {
    const raw = window.localStorage.getItem(CONTACT_TAGS_KEY)
    if (!raw) return { contacts: {} }
    const parsed = JSON.parse(raw)
    return {
      contacts:
        parsed?.contacts && typeof parsed.contacts === 'object' ? parsed.contacts : {},
    }
  } catch {
    return { contacts: {} }
  }
}

function writeTagStore(store) {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(CONTACT_TAGS_KEY, JSON.stringify(store))
  } catch {
    // Storage can be blocked; tags simply do not persist.
  }
}

export function normalizeTag(value) {
  return String(value ?? '')
    .trim()
    .replace(/\s+/g, ' ')
    .slice(0, CONTACT_TAG_LENGTH)
}

export function sanitizeTags(tags) {
  const seen = new Set()
  const next = []
  for (const raw of tags ?? []) {
    const tag = normalizeTag(raw)
    if (!tag) continue
    const key = tag.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    next.push(tag)
    if (next.length >= CONTACT_TAG_LIMIT) break
  }
  return next
}

export function getContactTags(contactId) {
  if (!TAG_STORAGE_AVAILABLE || !contactId) return []
  const tags = readTagStore().contacts[contactId]
  return Array.isArray(tags) ? tags.filter((tag) => typeof tag === 'string') : []
}

export function getAllContactTags() {
  if (!TAG_STORAGE_AVAILABLE) return {}
  const store = readTagStore()
  const output = {}
  for (const [contactId, tags] of Object.entries(store.contacts)) {
    if (!Array.isArray(tags)) continue
    const clean = tags.filter((tag) => typeof tag === 'string' && tag)
    if (clean.length > 0) output[contactId] = clean
  }
  return output
}

export function saveContactTags(contactId, tags) {
  if (!TAG_STORAGE_AVAILABLE || !contactId) return []
  const clean = sanitizeTags(tags)
  const store = readTagStore()

  if (clean.length === 0) delete store.contacts[contactId]
  else store.contacts[contactId] = clean

  writeTagStore(store)
  return clean
}

export function removeContactTags(contactId) {
  if (!TAG_STORAGE_AVAILABLE || !contactId) return
  const store = readTagStore()
  if (!(contactId in store.contacts)) return
  delete store.contacts[contactId]
  writeTagStore(store)
}

/* Formatting -------------------------------------------------------------- */

export function formatContactDate(value) {
  if (!value) return null
  try {
    return new Intl.DateTimeFormat(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    }).format(new Date(value))
  } catch {
    return null
  }
}

export function formatContactDateTime(value) {
  if (!value) return null
  try {
    return new Intl.DateTimeFormat(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    }).format(new Date(value))
  } catch {
    return null
  }
}
