import { api } from './api'

/**
 * Company adapter for T11.
 *
 * The API is live: list/detail/create/update/delete all exist under
 * `/api/v1/companies`. `GET /companies` is paginated and supports `search`
 * (substring on normalized name and domain) and an exact `industry` filter.
 *
 * `POST` and `PATCH` do not enforce uniqueness — the design calls for a warning
 * on `tenant_id + normalized_domain` (or name when no domain), so the form asks
 * this module for potential duplicates before writing.
 */

export const COMPANIES_PAGE_SIZE = 25

export function emptyCompanyForm() {
  return {
    name: '',
    domain: '',
    website: '',
    industry: '',
    employeeCount: '',
    city: '',
    state: '',
    country: '',
    linkedinUrl: '',
    source: '',
    notes: '',
    customFields: [],
  }
}

export function companyToForm(company) {
  if (!company) return emptyCompanyForm()

  return {
    name: company.name ?? '',
    domain: company.domain ?? '',
    website: company.website ?? '',
    industry: company.industry ?? '',
    employeeCount: company.employeeCount == null ? '' : String(company.employeeCount),
    city: company.city ?? '',
    state: company.state ?? '',
    country: company.country ?? '',
    linkedinUrl: company.linkedinUrl ?? '',
    source: company.source ?? '',
    notes: company.notes ?? '',
    customFields: Object.entries(company.customFields ?? {}).map(([key, value]) => ({
      key,
      value: value == null ? '' : String(value),
    })),
  }
}

export function normalizeDomain(value) {
  if (!value) return null
  let domain = String(value).trim().toLowerCase()
  if (!domain) return null
  for (const prefix of ['https://', 'http://']) {
    if (domain.startsWith(prefix)) domain = domain.slice(prefix.length)
  }
  domain = domain.split('/', 1)[0]
  domain = domain.replace(/^www\./, '')
  return domain || null
}

export function normalizeCompanyName(value) {
  return String(value ?? '').trim().toLowerCase()
}

export function companyLocation(company) {
  return [company?.city, company?.state, company?.country].filter(Boolean).join(', ')
}

/**
 * Location comparison for name-based duplicate checks. Two records are
 * considered compatible when each shared location field matches; blank fields
 * never create a conflict.
 */
function sameLocation(left, right) {
  for (const field of ['city', 'state', 'country']) {
    const a = String(left?.[field] ?? '').trim().toLowerCase()
    const b = String(right?.[field] ?? '').trim().toLowerCase()
    if (a && b && a !== b) return false
  }
  return true
}

export function withScheme(value) {
  if (!value) return null
  return /^https?:\/\//i.test(value) ? value : `https://${value}`
}

export function companyWebsite(company) {
  if (company?.website) return withScheme(company.website)
  if (company?.domain) return `https://${company.domain}`
  return null
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

function normalizeCompany(raw) {
  return {
    id: String(raw?.id ?? ''),
    name: raw?.name ?? '',
    domain: raw?.domain ?? null,
    industry: raw?.industry ?? null,
    employeeCount: raw?.employee_count ?? null,
    city: raw?.city ?? null,
    state: raw?.state ?? null,
    country: raw?.country ?? null,
    website: raw?.website ?? null,
    linkedinUrl: raw?.linkedin_url ?? null,
    source: raw?.source ?? null,
    status: raw?.status ?? 'active',
    notes: raw?.notes ?? null,
    customFields:
      raw?.custom_fields && typeof raw.custom_fields === 'object' ? raw.custom_fields : {},
    createdAt: raw?.created_at ?? null,
    updatedAt: raw?.updated_at ?? null,
  }
}

export async function listCompanies({ search, industry, limit, offset } = {}, signal) {
  const data = await api.get(
    `/companies${toQuery({ search: search?.trim(), industry, limit, offset })}`,
    { signal },
  )

  const items = Array.isArray(data?.items) ? data.items.map(normalizeCompany) : []
  return {
    items,
    total: Number(data?.total ?? items.length),
    limit: Number(data?.limit ?? limit ?? COMPANIES_PAGE_SIZE),
    offset: Number(data?.offset ?? offset ?? 0),
  }
}

export async function getCompany(companyId, signal) {
  const data = await api.get(`/companies/${encodeURIComponent(companyId)}`, { signal })
  return normalizeCompany(data)
}

/**
 * Contacts attached to a company. T12 owns the contacts screens; this read is
 * only used for the "People" card on company detail.
 */
export async function listCompanyContacts(companyId, { limit = 5, offset = 0 } = {}, signal) {
  const data = await api.get(
    `/contacts${toQuery({ company_id: companyId, limit, offset })}`,
    { signal },
  )

  const items = Array.isArray(data?.items) ? data.items : []
  return {
    items: items.map((contact) => ({
      id: String(contact?.id ?? ''),
      fullName: contact?.full_name || contact?.email || 'Unnamed contact',
      title: contact?.title ?? null,
      email: contact?.email ?? '',
      emailStatus: contact?.email_status ?? 'unknown',
      status: contact?.status ?? 'new',
    })),
    total: Number(data?.total ?? items.length),
  }
}

function isHttpUrl(value) {
  const text = String(value).trim()
  if (!text) return true
  try {
    const url = new URL(/^https?:\/\//i.test(text) ? text : `https://${text}`)
    return Boolean(url.hostname.includes('.'))
  } catch {
    return false
  }
}

export function validateCompany(values) {
  const errors = {}

  const name = String(values.name ?? '').trim()
  if (!name) errors.name = 'Enter the company name.'
  else if (name.length > 255) errors.name = 'Use 255 characters or fewer.'

  if (String(values.domain ?? '').trim().length > 255) {
    errors.domain = 'Use 255 characters or fewer.'
  }

  if (!isHttpUrl(values.website)) {
    errors.website = 'Enter a link like acme.com or https://acme.com.'
  }

  if (!isHttpUrl(values.linkedinUrl)) {
    errors.linkedinUrl = 'Enter a full LinkedIn URL.'
  }

  const employees = String(values.employeeCount ?? '').trim()
  if (employees) {
    const parsed = Number(employees)
    if (!Number.isInteger(parsed) || parsed < 0) {
      errors.employeeCount = 'Enter a whole number of employees.'
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

  return errors
}

export function toCompanyPayload(values) {
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

  const employees = String(values.employeeCount ?? '').trim()

  return {
    name: String(values.name ?? '').trim(),
    domain: text(values.domain),
    industry: text(values.industry),
    employee_count: employees ? Number(employees) : null,
    city: text(values.city),
    state: text(values.state),
    country: text(values.country),
    website: text(values.website),
    linkedin_url: text(values.linkedinUrl),
    source: text(values.source),
    notes: text(values.notes),
    custom_fields: customFields,
  }
}

export async function createCompany(values) {
  const data = await api.post('/companies', toCompanyPayload(values))
  return normalizeCompany(data)
}

export async function updateCompany(companyId, values) {
  const data = await api.patch(
    `/companies/${encodeURIComponent(companyId)}`,
    toCompanyPayload(values),
  )
  return normalizeCompany(data)
}

export async function deleteCompany(companyId) {
  await api.delete(`/companies/${encodeURIComponent(companyId)}`)
}

/**
 * Finds companies that would collide under the design's dedupe rules
 * (`tenant_id + normalized_domain`, or `tenant_id + normalized_name + location`).
 *
 * `search` is a substring match, so results are filtered again on the exact
 * normalized name or domain. When two records both carry a domain, only a
 * domain match counts — a shared name at a different domain is a different
 * employer. When either side has no domain, a name match is reported only if
 * the location fields do not conflict.
 */
export async function findCompanyDuplicates(values, { excludeId = null, signal } = {}) {
  const name = String(values.name ?? '').trim()
  const domain = normalizeDomain(values.domain)
  const nameKey = normalizeCompanyName(name)

  const probes = new Set()
  if (domain && domain.length >= 3) probes.add(domain)
  if (nameKey && nameKey.length >= 3) probes.add(nameKey)

  if (probes.size === 0) return []

  const responses = await Promise.all(
    [...probes].map((probe) =>
      api
        .get(`/companies${toQuery({ search: probe, limit: 10 })}`, { signal })
        .catch((error) => {
          if (error?.name === 'AbortError') throw error
          // A failed duplicate probe must not block the primary save.
          return { items: [] }
        }),
    ),
  )

  const matches = new Map()

  for (const data of responses) {
    for (const raw of data?.items ?? []) {
      const candidate = normalizeCompany(raw)
      if (!candidate.id || candidate.id === excludeId) continue

      const candidateDomain = normalizeDomain(candidate.domain)
      const domainMatch = Boolean(domain && candidateDomain === domain)
      const nameMatch =
        Boolean(nameKey) &&
        normalizeCompanyName(candidate.name) === nameKey &&
        !(domain && candidateDomain) &&
        sameLocation(values, candidate)

      if (!domainMatch && !nameMatch) continue

      const existing = matches.get(candidate.id)
      if (existing) {
        if (domainMatch) existing.reason = 'domain'
        continue
      }

      matches.set(candidate.id, {
        ...candidate,
        reason: domainMatch ? 'domain' : 'name',
      })
    }
  }

  return [...matches.values()]
}

/** Industry options are not exposed by the API; sample the first 100 records. */
export async function listIndustryOptions(signal) {
  const data = await listCompanies({ limit: 100 }, signal)
  return [...new Set(data.items.map((company) => company.industry).filter(Boolean))].sort(
    (a, b) => a.localeCompare(b),
  )
}
