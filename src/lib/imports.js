import { api } from './api'

/**
 * CSV contact import adapter for T13 and T14.
 *
 * The live API accepts one synchronous multipart upload at
 * `POST /contacts/import` and matches columns by their canonical headers
 * (`email`, `first_name`, …). It has no preview request, mapping payload,
 * background job, update mode, or rollback endpoint. This module therefore:
 *
 * - parses, maps, and validates the file in the browser;
 * - reads the tenant contact and suppression lists so review can preview
 *   existing duplicates and suppressed addresses;
 * - plans skip / update / review-queue behaviour;
 * - posts only the rows that should be created and patches existing contacts
 *   for update mode;
 * - builds a row-level report from server errors plus browser findings; and
 * - records a 24-hour client-side rollback window that deletes contacts this
 *   import created, after checking they have not been used.
 *
 * Tenant-wide checks are capped at `IMPORT_LOOKUP_MAX` records each. When the
 * cap is hit, the API still skips remaining duplicates and suppressions; the
 * report labels those counts without individual rows.
 */

export const IMPORT_MAX_BYTES = 10 * 1024 * 1024
export const IMPORT_MAX_ROWS = 5000
export const IMPORT_PREVIEW_LIMIT = 50
export const IMPORT_REPORT_ROW_LIMIT = 200
export const IMPORT_TEMPLATE_FILENAME = 'reyvo-contacts-template.csv'
export const IMPORT_LOOKUP_PAGE = 100
export const IMPORT_LOOKUP_MAX = 1000
export const IMPORT_ROLLBACK_HOURS = 24
export const IMPORT_ROLLBACK_MAX_RECORDS = 10
export const IMPORT_ROLLBACK_KEY = 'reyvo.importRollbacks.v1'

/**
 * Duplicate handling choices shown at review. The API only supports "skip" on
 * its own; "update" patches matching contacts through `/contacts/{id}` and
 * "review" holds flagged rows back in a browser-side queue.
 */
export const IMPORT_MODES = [
  {
    id: 'skip',
    label: 'Skip duplicates',
    shortLabel: 'Skip',
    description:
      'Create new contacts only. Emails that already exist or are suppressed stay untouched.',
  },
  {
    id: 'update',
    label: 'Update existing',
    shortLabel: 'Update',
    description:
      'Create new contacts and apply the mapped values to contacts that already exist. Suppressed addresses stay untouched.',
  },
  {
    id: 'review',
    label: 'Build a review queue',
    shortLabel: 'Review',
    description:
      'Import clean new rows only. Existing contacts, suppressed addresses, and role-based inboxes are held for manual review.',
  },
]

export const IMPORT_RESULT_LABELS = {
  imported: 'Imported',
  sent: 'Sent',
  updated: 'Updated',
  duplicate_in_file: 'Duplicate in file',
  existing_contact: 'Existing contact',
  suppressed: 'Suppressed',
  review_existing: 'Review · existing',
  review_role: 'Review · role address',
  review_suppressed: 'Review · suppressed',
  missing_email: 'Missing email',
  invalid_email: 'Invalid email',
  value_too_long: 'Value too long',
  update_failed: 'Update failed',
  server_error: 'Server error',
  error: 'Error',
}

export const IMPORT_ROLLBACK_STATUS = {
  available: 'Rollback available',
  rolled_back: 'Rolled back',
  partial: 'Partly rolled back',
}

export const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

const ROLE_LOCAL_PARTS = new Set([
  'admin',
  'billing',
  'contact',
  'hello',
  'help',
  'hr',
  'info',
  'office',
  'sales',
  'support',
  'team',
])

export const IMPORT_STEPS = [
  { id: 'upload', label: 'Upload', description: 'Choose a CSV file' },
  { id: 'map', label: 'Map columns', description: 'Match headers to fields' },
  { id: 'review', label: 'Review', description: 'Check rows and errors' },
  { id: 'report', label: 'Report', description: 'See what imported' },
]

/**
 * Canonical contact columns, in API order. `aliases` cover the header spellings
 * people commonly export from CRMs and spreadsheets.
 */
export const IMPORT_FIELDS = [
  {
    key: 'email',
    label: 'Email',
    required: true,
    example: 'ada@acme.com',
    hint: 'One address per row. Required.',
    maxLength: 320,
    aliases: [
      'email',
      'e mail',
      'email address',
      'email address 1',
      'email address primary',
      'email work',
      'work email',
      'business email',
      'primary email',
      'primary email address',
      'contact email',
    ],
  },
  {
    key: 'first_name',
    label: 'First name',
    example: 'Ada',
    maxLength: 120,
    aliases: ['first name', 'firstname', 'given name', 'forename', 'name first'],
  },
  {
    key: 'last_name',
    label: 'Last name',
    example: 'Lovelace',
    maxLength: 120,
    aliases: ['last name', 'lastname', 'surname', 'family name', 'name last'],
  },
  {
    key: 'full_name',
    label: 'Full name',
    example: 'Ada Lovelace',
    maxLength: 255,
    aliases: ['full name', 'fullname', 'name', 'contact name', 'display name', 'person'],
  },
  {
    key: 'title',
    label: 'Job title',
    example: 'Head of Talent',
    maxLength: 255,
    aliases: ['title', 'job title', 'jobtitle', 'position', 'role', 'job role'],
  },
  {
    key: 'company',
    label: 'Company',
    example: 'Acme Studio',
    maxLength: 255,
    aliases: [
      'company',
      'company name',
      'organization',
      'organisation',
      'org',
      'account',
      'account name',
      'employer',
    ],
  },
  {
    key: 'company_domain',
    label: 'Company domain',
    example: 'acme.com',
    maxLength: 255,
    aliases: [
      'company domain',
      'company website',
      'domain',
      'website',
      'website url',
      'web address',
    ],
  },
  {
    key: 'phone',
    label: 'Phone',
    example: '+1 415 555 0134',
    maxLength: 64,
    aliases: ['phone', 'phone number', 'telephone', 'mobile', 'mobile phone', 'cell', 'cell phone'],
  },
  {
    key: 'linkedin_url',
    label: 'LinkedIn URL',
    example: 'linkedin.com/in/ada',
    maxLength: 500,
    aliases: ['linkedin', 'linkedin url', 'linkedin profile', 'linkedin profile url'],
  },
  {
    key: 'source',
    label: 'Source',
    example: 'Conference list',
    maxLength: 120,
    aliases: ['source', 'lead source', 'origin', 'list source'],
  },
]

export const IMPORT_ERROR_COPY = {
  invalid_email: 'The email address is missing or not valid.',
  invalid_file: 'The file could not be read as a CSV.',
  empty_file: 'The file is empty.',
  encoding: 'The file is not valid UTF-8.',
  no_header: 'The file has no header row.',
  no_rows: 'The file has a header row but no contact rows.',
  too_many_rows: 'The file has too many rows for one import.',
  missing_email_column: 'The file has no email column.',
  network_error: 'The API could not be reached.',
  duplicate_in_file: 'This row repeats an earlier email in the file. The first one is kept.',
  existing_contact: 'A contact with this email already exists in your workspace.',
  suppressed:
    'This address is on a suppression list. Reyvo will not contact it, so the row is skipped.',
  review_existing: 'Held for review because this email already exists in your workspace.',
  review_role: 'Held for review because it is a shared, role-based inbox.',
  review_suppressed: 'Held for review because this address is suppressed.',
  update_failed: 'The existing contact could not be updated.',
}

export class ImportFileError extends Error {
  constructor(message, code = 'invalid_file') {
    super(message)
    this.name = 'ImportFileError'
    this.code = code
  }
}

function normalizeHeader(value) {
  return String(value ?? '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

const ALIAS_LOOKUP = (() => {
  const lookup = new Map()
  for (const field of IMPORT_FIELDS) {
    const names = new Set([
      normalizeHeader(field.key),
      normalizeHeader(field.label),
      ...field.aliases.map(normalizeHeader),
    ])
    for (const name of names) {
      if (name && !lookup.has(name)) lookup.set(name, field.key)
    }
  }
  return lookup
})()

export function emptyImportMapping() {
  return Object.fromEntries(IMPORT_FIELDS.map((field) => [field.key, null]))
}

/**
 * Matches detected headers to canonical fields without guessing across
 * ambiguous columns: exact normalized aliases only, first unused column wins.
 */
export function autoMapColumns(headers) {
  const mapping = emptyImportMapping()
  const used = new Set()

  for (const field of IMPORT_FIELDS) {
    for (const header of headers) {
      if (used.has(header.index)) continue
      if (ALIAS_LOOKUP.get(normalizeHeader(header.label)) !== field.key) continue
      mapping[field.key] = header.index
      used.add(header.index)
      break
    }
  }

  return mapping
}

function countDelimiter(line, delimiter) {
  let count = 0
  let quoted = false
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index]
    if (char === '"') {
      if (quoted && line[index + 1] === '"') {
        index += 1
        continue
      }
      quoted = !quoted
    } else if (!quoted && char === delimiter) {
      count += 1
    }
  }
  return count
}

function detectDelimiter(text) {
  const firstLine = text.split(/\r?\n/, 1)[0] ?? ''
  const candidates = [
    { value: ',', label: 'comma separated' },
    { value: ';', label: 'semicolon separated' },
    { value: '\t', label: 'tab separated' },
  ]

  let best = candidates[0]
  let bestCount = 0
  for (const candidate of candidates) {
    const count = countDelimiter(firstLine, candidate.value)
    if (count > bestCount) {
      best = candidate
      bestCount = count
    }
  }
  return best
}

function parseDelimited(text, delimiter) {
  const rows = []
  let row = []
  let field = ''
  let quoted = false
  let index = 0

  while (index < text.length) {
    const char = text[index]

    if (quoted) {
      if (char === '"') {
        if (text[index + 1] === '"') {
          field += '"'
          index += 2
          continue
        }
        quoted = false
        index += 1
        continue
      }
      field += char
      index += 1
      continue
    }

    if (char === '"') {
      quoted = true
      index += 1
      continue
    }

    if (char === delimiter) {
      row.push(field)
      field = ''
      index += 1
      continue
    }

    if (char === '\r' || char === '\n') {
      if (char === '\r' && text[index + 1] === '\n') index += 1
      row.push(field)
      rows.push(row)
      row = []
      field = ''
      index += 1
      continue
    }

    field += char
    index += 1
  }

  row.push(field)
  rows.push(row)
  return rows
}

/**
 * Parses CSV text into headers and value arrays. Quoted fields, escaped quotes,
 * CRLF/LF endings, and comma/semicolon/tab delimiters are supported. Blank rows
 * are ignored, matching Python's csv reader on the API side.
 */
export function parseCsvText(rawText) {
  const text = String(rawText ?? '').replace(/^\uFEFF/, '')

  if (!text.trim()) {
    throw new ImportFileError(
      'This file is empty. Add a header row and at least one contact, then try again.',
      'empty_file',
    )
  }

  if (text.includes('\uFFFD')) {
    throw new ImportFileError(
      'This file contains characters that are not valid UTF-8. Re-export it as UTF-8 and try again.',
      'encoding',
    )
  }

  const delimiter = detectDelimiter(text)
  const matrix = parseDelimited(text, delimiter.value).filter((row) =>
    row.some((value) => String(value ?? '').trim() !== ''),
  )

  if (matrix.length === 0) {
    throw new ImportFileError(
      'This file has no readable rows. Add a header row and at least one contact.',
      'empty_file',
    )
  }

  const seenLabels = new Map()
  const headers = matrix[0].map((value, index) => {
    const base = String(value ?? '').trim() || `Column ${index + 1}`
    const seen = (seenLabels.get(base.toLowerCase()) ?? 0) + 1
    seenLabels.set(base.toLowerCase(), seen)
    return {
      index,
      label: seen > 1 ? `${base} (${seen})` : base,
    }
  })

  if (headers.length === 0) {
    throw new ImportFileError('The file has no header row.', 'no_header')
  }

  const rows = matrix.slice(1).map((cells, index) => ({
    line: index + 2,
    values: headers.map((_, column) => String(cells[column] ?? '').trim()),
  }))

  if (rows.length === 0) {
    throw new ImportFileError(
      'The file has a header row but no contacts. Add one contact per row and try again.',
      'no_rows',
    )
  }

  if (rows.length > IMPORT_MAX_ROWS) {
    throw new ImportFileError(
      `This file has ${rows.length.toLocaleString()} rows. Import at most ${IMPORT_MAX_ROWS.toLocaleString()} rows at a time.`,
      'too_many_rows',
    )
  }

  return {
    headers,
    rows,
    delimiter: delimiter.value,
    delimiterLabel: delimiter.label,
  }
}

export async function readCsvFile(file) {
  if (!file) {
    throw new ImportFileError('Choose a CSV file to import.', 'invalid_file')
  }

  if (file.size > IMPORT_MAX_BYTES) {
    throw new ImportFileError('This file is larger than 10 MB. Split it and try again.', 'invalid_file')
  }

  let text
  try {
    text = await file.text()
  } catch {
    throw new ImportFileError('This file could not be read. Choose it again or re-export it.', 'invalid_file')
  }

  return {
    ...parseCsvText(text),
    fileName: file.name,
    fileSize: file.size,
  }
}

function mappedValues(row, mapping) {
  const values = {}
  for (const field of IMPORT_FIELDS) {
    const column = mapping[field.key]
    values[field.key] = column == null ? '' : String(row.values[column] ?? '').trim()
  }
  return values
}

function emailWarning(email) {
  const localPart = email.split('@')[0]?.toLowerCase() ?? ''
  return ROLE_LOCAL_PARTS.has(localPart)
}

/**
 * Validates mapped rows locally so obviously bad rows never cause a server
 * error. The first occurrence of an email is kept; later rows are marked as
 * in-file duplicates and left for the API to skip and count.
 */
export function validateImportRows(rows, mapping) {
  const seen = new Map()

  const validated = rows.map((row) => {
    const values = mappedValues(row, mapping)
    const errors = []
    const email = values.email

    for (const field of IMPORT_FIELDS) {
      const limit = field.maxLength
      if (limit && values[field.key].length > limit) {
        errors.push({
          code: 'value_too_long',
          field: field.key,
          message: `${field.label} is longer than ${limit} characters.`,
        })
      }
    }

    if (!email) {
      errors.unshift({
        code: 'missing_email',
        field: 'email',
        message: 'Email is missing.',
      })
    } else if (!EMAIL_PATTERN.test(email)) {
      errors.unshift({
        code: 'invalid_email',
        field: 'email',
        message: 'The email address is not valid.',
      })
    }

    const emailKey = email.toLowerCase()
    let duplicateOf = null
    if (emailKey && errors.length === 0) {
      if (seen.has(emailKey)) duplicateOf = seen.get(emailKey)
      else seen.set(emailKey, row.line)
    }

    return {
      ...row,
      values,
      errors,
      duplicateOf,
      roleAddress: Boolean(email) && !errors.length && emailWarning(email),
    }
  })

  const counts = {
    total: validated.length,
    invalid: validated.filter((row) => row.errors.length > 0).length,
    duplicates: validated.filter((row) => row.duplicateOf != null).length,
    roleAddresses: validated.filter((row) => row.roleAddress).length,
    valid: validated.filter((row) => row.errors.length === 0).length,
    importable: validated.filter((row) => row.errors.length === 0 && !row.duplicateOf).length,
  }

  return { rows: validated, counts }
}

function csvCell(value) {
  const text = String(value ?? '')
  if (/[",\r\n]/.test(text) || /^\s|\s$/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`
  }
  return text
}

/**
 * Rewrites validated rows with the canonical headers the API matches exactly.
 * Rows with local errors are excluded by the caller so the API never receives
 * values the UI already knows are unusable.
 */
export function buildCanonicalCsv(rows, mapping) {
  const fields = IMPORT_FIELDS.filter((field) => mapping[field.key] != null)
  const lines = [fields.map((field) => field.key).join(',')]

  for (const row of rows) {
    lines.push(fields.map((field) => csvCell(row.values[field.key])).join(','))
  }

  return lines.join('\r\n')
}

export function buildTemplateCsv() {
  const headers = IMPORT_FIELDS.map((field) => field.key).join(',')
  return `\uFEFF${headers}\r\n`
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
  // Give the browser a tick to start the download before revoking the URL.
  window.setTimeout(() => window.URL.revokeObjectURL(url), 1000)
  return true
}

export function importErrorCopy(reason) {
  return IMPORT_ERROR_COPY[reason] ?? 'This row could not be imported.'
}

export function normalizeImportReport(raw) {
  return {
    importId: String(raw?.import_id ?? ''),
    status: String(raw?.status ?? 'completed'),
    rowCount: Number(raw?.row_count ?? 0),
    importedCount: Number(raw?.imported_count ?? 0),
    duplicateCount: Number(raw?.duplicate_count ?? 0),
    suppressedCount: Number(raw?.suppressed_count ?? 0),
    errorCount: Number(raw?.error_count ?? 0),
    errors: Array.isArray(raw?.errors)
      ? raw.errors.map((error) => ({
          row: Number(error?.row ?? 0),
          email: error?.email ? String(error.email) : null,
          reason: String(error?.reason ?? 'error'),
          message: importErrorCopy(error?.reason),
        }))
      : [],
  }
}

/**
 * Sends the canonical CSV as multipart/form-data. The endpoint is synchronous
 * and returns the completed `ImportReport`; T14 adds staged browser progress
 * around this request.
 */
export async function importContactsCsv({ csv, filename = 'contacts.csv', signal } = {}) {
  const form = new FormData()
  form.append('file', new Blob([csv], { type: 'text/csv;charset=utf-8' }), filename)

  const data = await api.postForm('/contacts/import', form, { signal })
  return normalizeImportReport(data)
}

/* ---------------------------------------------------------------------------
   T14 — workspace preview, mode planning, updates, report, rollback
   --------------------------------------------------------------------------- */

export function normalizeImportEmail(value) {
  return String(value ?? '').trim().toLowerCase()
}

export function importRowName(values = {}) {
  return (
    [values.first_name, values.last_name].filter(Boolean).join(' ') ||
    values.full_name ||
    ''
  )
}

function normalizeSuppressionReason(reason) {
  const text = String(reason ?? '').trim()
  if (!text) return 'suppressed'
  return text.replace(/_/g, ' ')
}

async function collectAllPages(path, { signal, max = IMPORT_LOOKUP_MAX } = {}) {
  const items = []
  let offset = 0
  let total = 0

  while (offset < max) {
    const params = new URLSearchParams({ limit: String(IMPORT_LOOKUP_PAGE), offset: String(offset) })
    const data = await api.get(`${path}?${params.toString()}`, { signal })
    const pageItems = Array.isArray(data?.items) ? data.items : []
    total = Number(data?.total ?? pageItems.length)
    items.push(...pageItems)
    if (pageItems.length === 0) break
    offset += pageItems.length
    if (items.length >= total) break
  }

  return {
    items: items.slice(0, max),
    total: Math.max(total, items.length),
    truncated: Math.max(total, items.length) > max,
  }
}

/**
 * Reads just enough of the tenant contact and suppression lists to explain
 * duplicates and suppressions at review. This is not a preview endpoint; it is
 * a capped browser-side scan of the live lists. Larger tenants still get
 * server-side skips, but without row-level detail for records past the cap.
 */
export async function loadWorkspaceImportIndex({ signal, max = IMPORT_LOOKUP_MAX } = {}) {
  const [contacts, suppressions] = await Promise.all([
    collectAllPages('/contacts', { signal, max }),
    collectAllPages('/suppressions', { signal, max }),
  ])

  const contactsByEmail = new Map()
  for (const contact of contacts.items) {
    const key = normalizeImportEmail(contact.email_normalized ?? contact.email)
    if (key) contactsByEmail.set(key, contact)
  }

  const suppressionsByEmail = new Map()
  for (const suppression of suppressions.items) {
    const key = normalizeImportEmail(suppression.email_normalized)
    if (key) suppressionsByEmail.set(key, suppression)
  }

  return {
    contactsByEmail,
    suppressionsByEmail,
    contactCount: contacts.total,
    suppressionCount: suppressions.total,
    contactsTruncated: contacts.truncated,
    suppressionsTruncated: suppressions.truncated,
  }
}

export function applyWorkspaceImportIndex(validation, index) {
  if (!validation || !index) return validation

  const rows = validation.rows.map((row) => {
    const key = normalizeImportEmail(row.values?.email)
    return {
      ...row,
      existingContact: key ? index.contactsByEmail.get(key) ?? null : null,
      suppression: key ? index.suppressionsByEmail.get(key) ?? null : null,
    }
  })

  const firsts = rows.filter((row) => !row.errors.length && !row.duplicateOf)
  const counts = {
    ...validation.counts,
    // A suppressed address wins over the existing-contact check, matching the
    // order used when the plan is classified.
    suppressed: firsts.filter((row) => row.suppression).length,
    existing: firsts.filter((row) => row.existingContact && !row.suppression).length,
  }

  return { rows, counts }
}

/**
 * Fields safe to send through `PATCH /contacts/{id}`. Email is the match key
 * and company needs a `company_id`, which this build cannot resolve without a
 * find-or-create endpoint, so neither is updated here.
 */
export function buildContactUpdatePayload(row) {
  const payload = {}
  for (const key of ['first_name', 'last_name', 'full_name', 'title', 'phone', 'linkedin_url', 'source']) {
    const value = String(row.values?.[key] ?? '').trim()
    if (value) payload[key] = value
  }
  return payload
}

function skipEntry(row, reason, message) {
  return {
    row: row.line,
    email: row.values?.email || null,
    name: importRowName(row.values),
    reason,
    message,
    source: 'client',
    contactId: row.existingContact?.id ?? null,
    suppressionReason: row.suppression?.reason ?? null,
  }
}

/**
 * Assigns every row an outcome for the chosen mode. Invalid rows are reported
 * separately by `buildImportOutcome`; this function owns the duplicate,
 * suppression, update, and review decisions.
 */
export function classifyImportRows(rows, mode = 'skip') {
  const sendRows = []
  const updateRows = []
  const skippedRows = []
  const reviewRows = []

  const classified = rows.map((row) => {
    if (row.errors.length > 0) {
      return { ...row, planResult: 'invalid', planDetail: row.errors[0].message }
    }

    if (row.duplicateOf) {
      const entry = skipEntry(
        row,
        'duplicate_in_file',
        `Repeats row ${row.duplicateOf}. The first one is kept.`,
      )
      skippedRows.push(entry)
      return { ...row, planResult: 'duplicate_in_file', planDetail: entry.message }
    }

    if (row.suppression) {
      const reason = normalizeSuppressionReason(row.suppression.reason)
      const entry = skipEntry(
        row,
        'suppressed',
        `Suppressed (${reason}). Reyvo will not contact this address.`,
      )
      skippedRows.push(entry)
      return { ...row, planResult: 'suppressed', planDetail: entry.message }
    }

    if (row.existingContact) {
      if (mode === 'update') {
        const updateValues = buildContactUpdatePayload(row)
        if (Object.keys(updateValues).length > 0) {
          updateRows.push({ ...row, updateValues })
          return {
            ...row,
            planResult: 'update',
            planDetail: 'Existing contact. Mapped values will be applied.',
          }
        }
        const entry = skipEntry(
          row,
          'existing_contact',
          'Existing contact. The file had no new values to apply.',
        )
        skippedRows.push(entry)
        return { ...row, planResult: 'existing_contact', planDetail: entry.message }
      }

      if (mode === 'review') {
        const entry = skipEntry(
          row,
          'review_existing',
          'Held for review because this email already exists. The contact was not changed.',
        )
        reviewRows.push(entry)
        return { ...row, planResult: 'review_existing', planDetail: entry.message }
      }

      const entry = skipEntry(
        row,
        'existing_contact',
        'Existing contact. Skipped and left unchanged.',
      )
      skippedRows.push(entry)
      return { ...row, planResult: 'existing_contact', planDetail: entry.message }
    }

    if (mode === 'review' && row.roleAddress) {
      const entry = skipEntry(
        row,
        'review_role',
        'Held for review because role-based inboxes (info@, sales@, hr@) need a human check.',
      )
      reviewRows.push(entry)
      return { ...row, planResult: 'review_role', planDetail: entry.message }
    }

    sendRows.push(row)
    return {
      ...row,
      planResult: 'import',
      planDetail: row.roleAddress
        ? 'New contact. Role-based address is allowed but worth reviewing before a campaign.'
        : 'New contact.',
    }
  })

  const counts = {
    total: classified.length,
    invalid: classified.filter((row) => row.planResult === 'invalid').length,
    inFileDuplicates: classified.filter((row) => row.planResult === 'duplicate_in_file').length,
    existing: classified.filter(
      (row) => row.existingContact && !row.errors.length && !row.duplicateOf,
    ).length,
    suppressed: classified.filter(
      (row) => row.suppression && !row.errors.length && !row.duplicateOf,
    ).length,
    review: reviewRows.length,
    skipped: skippedRows.length,
    updates: updateRows.length,
    newContacts: sendRows.length,
    roleAddresses: classified.filter((row) => row.roleAddress && row.planResult === 'import').length,
  }

  return {
    mode,
    rows: classified,
    sendRows,
    updateRows,
    skippedRows,
    reviewRows,
    counts,
  }
}

/**
 * Applies mapped values to contacts that already exist. One failure does not
 * stop the rest; each result is reported individually.
 */
export async function updateExistingContacts(
  rows,
  { signal, onProgress, concurrency = 4 } = {},
) {
  const results = new Array(rows.length)
  let nextIndex = 0
  let completed = 0
  let aborted = null

  async function worker() {
    while (true) {
      const index = nextIndex
      nextIndex += 1
      if (index >= rows.length || aborted) return

      const row = rows[index]
      try {
        const contact = await api.patch(
          `/contacts/${row.existingContact.id}`,
          row.updateValues,
          { signal },
        )
        results[index] = { row, ok: true, contact }
      } catch (error) {
        if (error?.name === 'AbortError') {
          aborted = error
          return
        }
        results[index] = { row, ok: false, error }
      }

      completed += 1
      onProgress?.(completed, rows.length)
    }
  }

  const workerCount = Math.min(Math.max(1, concurrency), rows.length)
  await Promise.all(Array.from({ length: workerCount }, worker))

  if (aborted) throw aborted
  return results.filter(Boolean)
}

/**
 * Turns the server report plus browser findings into one explained outcome.
 * Every original file row gets a detail entry when the browser can identify it;
 * server-only duplicate or suppression counts are surfaced separately.
 */
export function buildImportOutcome({
  mode,
  plan,
  validation,
  serverReport,
  updateResults = [],
  startedAt,
  completedAt,
  fileName,
  index = null,
}) {
  const sendRows = plan?.sendRows ?? []
  const serverErrors = (serverReport?.errors ?? []).map((error) => ({
    row: sendRows[error.row - 2]?.line ?? error.row,
    email: error.email || sendRows[error.row - 2]?.values?.email || null,
    name: importRowName(sendRows[error.row - 2]?.values),
    reason: error.reason || 'server_error',
    message: error.message ?? importErrorCopy(error.reason),
    source: 'server',
  }))
  const serverErrorLines = new Set(serverErrors.map((error) => error.row))

  const serverDuplicateCount = Number(serverReport?.duplicateCount ?? 0)
  const serverSuppressedCount = Number(serverReport?.suppressedCount ?? 0)
  const serverUnknownSkips = serverDuplicateCount + serverSuppressedCount > 0

  const importedRows = sendRows
    .filter((row) => !serverErrorLines.has(row.line))
    .map((row) => ({
      row: row.line,
      email: row.values.email,
      name: importRowName(row.values),
      result: serverUnknownSkips ? 'sent' : 'imported',
      reason: serverUnknownSkips ? 'sent' : 'imported',
      message: serverUnknownSkips
        ? 'Sent. The server counts the final imported, duplicate, and suppressed totals above.'
        : 'Created as a new contact.',
      source: 'server',
    }))

  const updateOk = updateResults.filter((result) => result.ok)
  const updateFailures = updateResults
    .filter((result) => !result.ok)
    .map((result) => ({
      row: result.row.line,
      email: result.row.values.email,
      name: importRowName(result.row.values),
      result: 'update_failed',
      reason: result.error?.code || 'update_failed',
      message: result.error?.message || 'The existing contact could not be updated.',
      source: 'client',
      contactId: result.row.existingContact?.id ?? null,
    }))

  const updatedRows = updateOk.map((result) => ({
    row: result.row.line,
    email: result.row.values.email,
    name: importRowName(result.row.values),
    result: 'updated',
    reason: 'updated',
    message: 'Existing contact updated with the mapped values.',
    source: 'client',
    contactId: result.row.existingContact?.id ?? null,
  }))

  const invalidRows = (validation?.rows ?? [])
    .filter((row) => row.errors.length > 0)
    .map((row) => ({
      row: row.line,
      email: row.values.email || null,
      name: importRowName(row.values),
      result: row.errors[0].code,
      reason: row.errors[0].code,
      message: row.errors[0].message,
      source: 'client',
    }))

  const skipped = (plan?.skippedRows ?? []).map((entry) => ({
    ...entry,
    result: entry.reason,
  }))
  const review = (plan?.reviewRows ?? []).map((entry) => ({
    ...entry,
    result: entry.reason,
  }))

  const details = [
    ...importedRows,
    ...updatedRows,
    ...skipped,
    ...review,
    ...invalidRows,
    ...updateFailures,
    ...serverErrors,
  ].sort((a, b) => a.row - b.row)

  const clientDuplicateCount = skipped.filter((entry) =>
    ['duplicate_in_file', 'existing_contact'].includes(entry.reason),
  ).length
  const clientSuppressedCount = skipped.filter((entry) => entry.reason === 'suppressed').length

  const importedCount = Number(serverReport?.importedCount ?? 0)
  const updatedCount = updatedRows.length
  const duplicateCount = clientDuplicateCount + serverDuplicateCount
  const suppressedCount = clientSuppressedCount + serverSuppressedCount
  const reviewCount = review.length
  const errorCount = invalidRows.length + updateFailures.length + serverErrors.length
  const explainedCount = importedCount + updatedCount + duplicateCount + suppressedCount + reviewCount + errorCount

  return {
    importId: serverReport?.importId || `local-${startedAt}`,
    status: serverReport?.status ?? 'completed',
    mode,
    fileName,
    startedAt,
    completedAt,
    fileRowCount: validation?.counts?.total ?? 0,
    sentRowCount: sendRows.length,
    rollbackEmails: [...new Set(sendRows.map((row) => normalizeImportEmail(row.values.email)).filter(Boolean))],
    importedCount,
    updatedCount,
    duplicateCount,
    suppressedCount,
    reviewCount,
    errorCount,
    explainedCount,
    counts: {
      imported: importedCount,
      updated: updatedCount,
      duplicate: duplicateCount,
      suppressed: suppressedCount,
      review: reviewCount,
      error: errorCount,
    },
    details,
    serverErrors,
    updateFailures,
    invalidRows,
    skipped,
    review,
    updatedRows,
    unexplainedCount: Math.max(0, explainedCount - details.length),
    indexTruncated: Boolean(index?.contactsTruncated || index?.suppressionsTruncated),
  }
}

export function buildImportReportCsv(outcome) {
  const lines = ['row,email,name,result,reason,message']
  for (const detail of outcome?.details ?? []) {
    lines.push(
      [
        detail.row,
        detail.email ?? '',
        detail.name ?? '',
        IMPORT_RESULT_LABELS[detail.result] ?? detail.result ?? '',
        detail.reason ?? '',
        detail.message ?? '',
      ]
        .map(csvCell)
        .join(','),
    )
  }
  return `\uFEFF${lines.join('\r\n')}`
}

/* Rollback storage --------------------------------------------------------- */

function readRawRollbacks() {
  if (typeof window === 'undefined' || !window.localStorage) return []
  try {
    const raw = window.localStorage.getItem(IMPORT_ROLLBACK_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed.filter((record) => record?.id) : []
  } catch {
    return []
  }
}

function writeRollbacks(records) {
  if (typeof window === 'undefined' || !window.localStorage) return records
  try {
    window.localStorage.setItem(IMPORT_ROLLBACK_KEY, JSON.stringify(records))
  } catch {
    // Storage can be full or unavailable; the current report still works.
  }
  return records
}

export function readImportRollbacks() {
  const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000
  const records = readRawRollbacks()
    .filter((record) => {
      const time = new Date(record.completedAt ?? 0).getTime()
      return Number.isFinite(time) && time >= cutoff
    })
    .slice(0, IMPORT_ROLLBACK_MAX_RECORDS)
  return records.sort(
    (a, b) => new Date(b.completedAt ?? 0).getTime() - new Date(a.completedAt ?? 0).getTime(),
  )
}

export function saveImportRollback(record) {
  const records = readImportRollbacks()
  const next = [record, ...records.filter((item) => item.id !== record.id)].slice(
    0,
    IMPORT_ROLLBACK_MAX_RECORDS,
  )
  writeRollbacks(next)
  return next
}

export function updateImportRollback(id, patch) {
  const records = readImportRollbacks()
  const next = records.map((record) =>
    record.id === id ? { ...record, ...patch, updatedAt: new Date().toISOString() } : record,
  )
  writeRollbacks(next)
  return next
}

export function removeImportRollback(id) {
  const records = readRollbacks().filter((record) => record.id !== id)
  writeRollbacks(records)
  return records
}

export function rollbackWindowMs(record, now = Date.now()) {
  if (!record?.completedAt) return 0
  const completed = new Date(record.completedAt).getTime()
  if (!Number.isFinite(completed)) return 0
  return Math.max(0, completed + IMPORT_ROLLBACK_HOURS * 60 * 60 * 1000 - now)
}

export function isRollbackOpen(record, now = Date.now()) {
  return record?.status === 'available' && rollbackWindowMs(record, now) > 0
}

export function formatRollbackWindow(ms) {
  if (ms <= 0) return 'Rollback window closed'
  const hours = Math.floor(ms / (60 * 60 * 1000))
  const minutes = Math.floor((ms % (60 * 60 * 1000)) / (60 * 1000))
  if (hours > 0) return `${hours}h ${minutes}m left`
  return `${Math.max(1, minutes)}m left`
}

export function createImportRollbackRecord(outcome) {
  return {
    id: outcome.importId,
    importId: outcome.importId,
    fileName: outcome.fileName,
    mode: outcome.mode,
    startedAt: outcome.startedAt,
    completedAt: outcome.completedAt,
    status: 'available',
    importedCount: outcome.importedCount,
    updatedCount: outcome.updatedCount,
    duplicateCount: outcome.duplicateCount,
    suppressedCount: outcome.suppressedCount,
    reviewCount: outcome.reviewCount,
    errorCount: outcome.errorCount,
    emails: outcome.rollbackEmails,
    rolledBackAt: null,
    rollbackResult: null,
  }
}

export function rememberImportOutcome(outcome) {
  if (!outcome?.importId) return readImportRollbacks()
  return saveImportRollback(createImportRollbackRecord(outcome))
}

/**
 * Deletes the contacts an import created. It searches each submitted email,
 * accepts only a contact created after this import started, and refuses to
 * delete a contact that has since been contacted or has replied. Existing
 * contacts and updated records are never deleted, and updates are not
 * reversible. Companies created by the import are left in place because they
 * may now be shared by other records.
 */
export async function rollbackImportContacts(
  record,
  { signal, onProgress, concurrency = 4 } = {},
) {
  if (!record?.emails?.length) {
    return { deleted: 0, used: 0, missing: 0, failed: 0, errors: [], status: 'rolled_back' }
  }
  if (!isRollbackOpen(record)) {
    throw new Error('The 24-hour rollback window for this import has closed.')
  }

  const emails = [...new Set(record.emails.map(normalizeImportEmail).filter(Boolean))]
  const startedAt = Number(record.startedAt ?? new Date(record.completedAt).getTime())
  const results = new Array(emails.length)
  let nextIndex = 0
  let completed = 0
  let aborted = null

  async function worker() {
    while (true) {
      const index = nextIndex
      nextIndex += 1
      if (index >= emails.length || aborted) return

      const email = emails[index]
      try {
        const params = new URLSearchParams({ search: email, limit: '20' })
        const data = await api.get(`/contacts?${params.toString()}`, { signal })
        const matches = (data?.items ?? []).filter(
          (contact) => normalizeImportEmail(contact.email_normalized ?? contact.email) === email,
        )
        const created = matches.filter((contact) => {
          const time = new Date(contact.created_at ?? 0).getTime()
          return Number.isFinite(time) && time >= startedAt - 5000
        })

        if (created.length === 0) {
          results[index] = { email, status: 'missing' }
        } else {
          const contact = created[0]
          const usedAt = [contact.last_contacted_at, contact.last_replied_at]
            .filter(Boolean)
            .map((value) => new Date(value).getTime())
            .filter((value) => Number.isFinite(value))
            .sort((a, b) => b - a)[0]
          if (usedAt && usedAt >= startedAt - 5000) {
            results[index] = { email, status: 'used', contactId: contact.id }
          } else {
            await api.delete(`/contacts/${contact.id}`, { signal })
            results[index] = { email, status: 'deleted', contactId: contact.id }
          }
        }
      } catch (error) {
        if (error?.name === 'AbortError') {
          aborted = error
          return
        }
        results[index] = {
          email,
          status: 'failed',
          message: error?.message || 'The contact could not be deleted.',
        }
      }

      completed += 1
      onProgress?.(completed, emails.length)
    }
  }

  const workerCount = Math.min(Math.max(1, concurrency), emails.length)
  await Promise.all(Array.from({ length: workerCount }, worker))
  if (aborted) throw aborted

  const summary = {
    deleted: results.filter((item) => item?.status === 'deleted').length,
    used: results.filter((item) => item?.status === 'used').length,
    missing: results.filter((item) => item?.status === 'missing').length,
    failed: results.filter((item) => item?.status === 'failed').length,
    errors: results
      .filter((item) => item?.status === 'failed')
      .map((item) => ({ email: item.email, message: item.message })),
  }
  summary.status =
    summary.failed > 0 || summary.used > 0 ? 'partial' : 'rolled_back'
  return summary
}

