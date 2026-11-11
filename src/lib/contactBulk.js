import { api } from './api'
import { listCompanies } from './companies'
import {
  TAG_STORAGE_AVAILABLE,
  deleteContact,
  getContactTags,
  listContacts,
  normalizeContact,
  sanitizeTags,
  saveContactTags,
} from './contacts'

/**
 * Contact export, bulk actions, and duplicate merge for T15.
 *
 * The live API exposes only `GET /contacts/export`, and that endpoint returns
 * every contact in the tenant: it ignores `search`, `status`, and `company_id`,
 * does not neutralise formula-leading cells, and is not audited. The browser
 * therefore builds the current filtered view itself:
 *
 * - `fetchContactsForView` pages through `/contacts` with the active filters.
 * - `buildContactsCsv` mirrors the design's injection rule: a cell that begins
 *   with `=`, `+`, `-`, or `@` is prefixed with a single quote.
 *
 * There is no `/contacts/bulk` or `/contacts/merge` endpoint. Bulk archive and
 * bulk update send one `PATCH /contacts/{id}` per selected record, and merge
 * patches the survivor then deletes each duplicate. Both routes already write
 * `contact.updated` and `contact.deleted` audit entries.
 */

export const CONTACT_FETCH_PAGE = 100
export const CONTACT_EXPORT_MAX = 5000
export const CONTACT_SCAN_MAX = 1000
export const CONTACT_COMPANY_MAX = 1000

export const CONTACT_EXPORT_HEADERS = [
  'email',
  'first_name',
  'last_name',
  'full_name',
  'title',
  'company',
  'company_domain',
  'phone',
  'linkedin_url',
  'source',
  'status',
  'created_at',
]

/* CSV export --------------------------------------------------------------- */

/**
 * Neutralises CSV formula injection. The design calls for a single leading
 * apostrophe when a value starts with `=`, `+`, `-`, or `@`; tab and carriage
 * return are included because spreadsheet apps treat them the same way.
 */
export function sanitizeCsvValue(value) {
  const text = String(value ?? '')
  if (/^[=+\-@\t\r]/.test(text)) return `'${text}`
  return text
}

/** Quotes a cell only when the value contains a delimiter, quote, or newline. */
export function csvCell(value) {
  const text = sanitizeCsvValue(value)
  if (/[",\r\n]/.test(text) || /^\s|\s$/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`
  }
  return text
}

export function buildContactsCsv(contacts, companyMap = new Map()) {
  const lines = [CONTACT_EXPORT_HEADERS.join(',')]

  for (const contact of contacts ?? []) {
    const company = contact.companyId ? companyMap.get(contact.companyId) : null
    const cells = [
      contact.email,
      contact.firstName,
      contact.lastName,
      contact.fullName,
      contact.title,
      company?.name,
      company?.domain,
      contact.phone,
      contact.linkedinUrl,
      contact.source,
      contact.status,
      contact.createdAt,
    ]
    lines.push(cells.map(csvCell).join(','))
  }

  // A UTF-8 BOM keeps Excel from mangling names with accents. The trailing
  // newline matches the import template and most spreadsheet exports.
  return `\uFEFF${lines.join('\r\n')}\r\n`
}

export function contactExportFilename({ hasFilters = false, date = new Date() } = {}) {
  const pad = (value) => String(value).padStart(2, '0')
  const stamp = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
  return `reyvo-contacts${hasFilters ? '-filtered' : ''}-${stamp}.csv`
}

export function downloadCsv(csv, filename) {
  if (typeof window === 'undefined') return false

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
  const url = window.URL.createObjectURL(blob)
  const link = window.document.createElement('a')
  link.href = url
  link.download = filename
  link.rel = 'noopener'
  window.document.body.appendChild(link)
  link.click()
  link.remove()
  window.setTimeout(() => window.URL.revokeObjectURL(url), 1000)
  return true
}

/**
 * Pages through the filtered contact list until every record is loaded or the
 * export cap is reached. The API caps `limit` at 100.
 */
export async function fetchContactsForView(
  { search, status, companyId, signal, max = CONTACT_EXPORT_MAX } = {},
) {
  const items = []
  const seen = new Set()
  let total = 0
  let offset = 0

  while (items.length < max) {
    const limit = Math.min(CONTACT_FETCH_PAGE, max - items.length)
    const data = await listContacts(
      { search, status, companyId, limit, offset },
      signal,
    )

    total = data.total
    if (data.items.length === 0) break

    for (const contact of data.items) {
      if (seen.has(contact.id)) continue
      seen.add(contact.id)
      items.push(contact)
    }

    offset += data.items.length
    if (items.length >= total) break
  }

  return {
    items,
    total,
    truncated: items.length < total,
  }
}

async function fetchCompaniesForExport(signal, max = CONTACT_COMPANY_MAX) {
  const items = []
  let offset = 0

  while (items.length < max) {
    const data = await listCompanies(
      { limit: Math.min(CONTACT_FETCH_PAGE, max - items.length), offset },
      signal,
    )
    items.push(...data.items)
    if (data.items.length === 0 || items.length >= data.total) break
    offset += data.items.length
  }

  return items
}

/**
 * Builds the CSV for the current filtered view. Company names and domains come
 * from a paged `/companies` read because `ContactRead` carries only
 * `company_id`.
 */
export async function exportContactsView(
  { search, status, companyId, signal, max = CONTACT_EXPORT_MAX } = {},
) {
  const [{ items, total, truncated }, companies] = await Promise.all([
    fetchContactsForView({ search, status, companyId, signal, max }),
    fetchCompaniesForExport(signal),
  ])

  const companyMap = new Map(companies.map((company) => [company.id, company]))
  const hasFilters = Boolean(search || status || companyId)
  const csv = buildContactsCsv(items, companyMap)

  return {
    csv,
    count: items.length,
    total,
    truncated,
    hasFilters,
    filename: contactExportFilename({ hasFilters }),
  }
}

/* Bulk actions ------------------------------------------------------------- */

function encodeContactId(contactId) {
  return encodeURIComponent(String(contactId))
}

/**
 * Applies the same partial `ContactUpdate` to each contact. Requests run in
 * sequence so progress is truthful and a large selection does not flood the
 * API. A failed record does not stop the rest; the caller reports both counts.
 */
export async function bulkPatchContacts(contactIds, patch, { onProgress, signal } = {}) {
  const ids = [...(contactIds ?? [])]
  const updated = []
  const failed = []
  let done = 0

  for (const id of ids) {
    if (signal?.aborted) break

    try {
      const data = await api.patch(`/contacts/${encodeContactId(id)}`, patch, { signal })
      updated.push(normalizeContact(data))
    } catch (error) {
      if (error?.name === 'AbortError') throw error
      failed.push({ id, error })
    }

    done += 1
    onProgress?.(done, ids.length)
  }

  return { updated, failed, total: ids.length }
}

/* Duplicate merge ---------------------------------------------------------- */

const MERGE_FIELDS = [
  { key: 'firstName', patchKey: 'first_name', label: 'first name' },
  { key: 'lastName', patchKey: 'last_name', label: 'last name' },
  { key: 'title', patchKey: 'title', label: 'job title' },
  { key: 'companyId', patchKey: 'company_id', label: 'company' },
  { key: 'phone', patchKey: 'phone', label: 'phone' },
  { key: 'linkedinUrl', patchKey: 'linkedin_url', label: 'LinkedIn URL' },
  { key: 'source', patchKey: 'source', label: 'source' },
  { key: 'notes', patchKey: 'notes', label: 'notes' },
]

function isBlank(value) {
  return value == null || (typeof value === 'string' && value.trim() === '')
}

/** Case-, accent-, and punctuation-insensitive name key for duplicate scans. */
export function duplicateNameKey(value) {
  return String(value ?? '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
}

/**
 * Duplicate key used for manual merge: normalised name plus company. Emails are
 * unique in the API, so two records for the same person can only coexist under
 * different addresses.
 */
export function duplicateGroupKey(contact) {
  const name = duplicateNameKey(contact?.fullName)
  if (!name) return null
  return `${name}::${contact.companyId ?? 'no-company'}`
}

/** Returns groups of two or more contacts that share a name and company. */
export function groupDuplicateContacts(contacts) {
  const groups = new Map()

  for (const contact of contacts ?? []) {
    const key = duplicateGroupKey(contact)
    if (!key) continue
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key).push(contact)
  }

  return [...groups.entries()]
    .filter(([, list]) => list.length > 1)
    .map(([key, list]) => ({
      key,
      companyId: list[0].companyId ?? null,
      contacts: [...list].sort((left, right) => {
        const a = new Date(left.createdAt ?? 0).getTime() || 0
        const b = new Date(right.createdAt ?? 0).getTime() || 0
        return a - b
      }),
    }))
    .sort((left, right) => {
      if (right.contacts.length !== left.contacts.length) {
        return right.contacts.length - left.contacts.length
      }
      return left.contacts[0].fullName.localeCompare(right.contacts[0].fullName)
    })
}

/**
 * Builds the survivor patch for a merge. The chosen record keeps every value it
 * already has; blanks are filled from the first duplicate that has a value.
 * Custom fields are unioned, and dev-only tags are combined separately.
 */
export function buildMergePlan(survivor, duplicates) {
  const patch = {}
  const filledFields = []

  for (const field of MERGE_FIELDS) {
    if (!isBlank(survivor?.[field.key])) continue
    const source = (duplicates ?? []).find((contact) => !isBlank(contact[field.key]))
    if (!source) continue
    patch[field.patchKey] = source[field.key]
    filledFields.push(field.label)
  }

  const customFields = { ...(survivor?.customFields ?? {}) }
  const addedCustomFields = []

  for (const duplicate of duplicates ?? []) {
    for (const [key, value] of Object.entries(duplicate.customFields ?? {})) {
      if (isBlank(customFields[key]) && !isBlank(value)) {
        customFields[key] = value
        addedCustomFields.push(key)
      }
    }
  }

  if (addedCustomFields.length > 0) {
    patch.custom_fields = customFields
  }

  return { patch, filledFields, customFields: addedCustomFields }
}

/**
 * Merges duplicates into a survivor: one audited `PATCH`, then one audited
 * `DELETE` per duplicate. Tags are combined before the deletes because deleting
 * a contact clears its browser-side tag entry.
 *
 * The API has no merge endpoint, tombstone, 30-day restore, or relation
 * transfer, so related campaigns/opportunities/tasks/activities are not moved.
 */
export async function mergeDuplicateGroup(
  { survivor, duplicates, signal, tagsEnabled = TAG_STORAGE_AVAILABLE } = {},
) {
  if (!survivor) throw new Error('Choose a contact to keep.')
  if (!Array.isArray(duplicates) || duplicates.length === 0) {
    throw new Error('There are no duplicate records to merge.')
  }

  const { patch, filledFields, customFields } = buildMergePlan(survivor, duplicates)
  let updated = survivor

  if (Object.keys(patch).length > 0) {
    const data = await api.patch(`/contacts/${encodeContactId(survivor.id)}`, patch, {
      signal,
    })
    updated = normalizeContact(data)
  }

  if (tagsEnabled) {
    const mergedTags = sanitizeTags([
      ...getContactTags(survivor.id),
      ...duplicates.flatMap((contact) => getContactTags(contact.id)),
    ])
    if (mergedTags.length > 0) saveContactTags(survivor.id, mergedTags)
  }

  const deleted = []
  const failed = []

  for (const duplicate of duplicates) {
    if (signal?.aborted) break
    try {
      await deleteContact(duplicate.id)
      deleted.push(duplicate.id)
    } catch (error) {
      failed.push({ contact: duplicate, error })
    }
  }

  return {
    survivor: updated,
    filledFields,
    customFields,
    deleted,
    failed,
    total: duplicates.length,
  }
}
