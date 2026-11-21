import { api } from './api'

/**
 * Opportunities adapter (minimal slice for T35 task links; the pipeline board
 * in T36 extends it).
 *
 * Live API reality:
 * - `GET /opportunities` accepts `stage`, `owner_id`, `contact_id`, `limit`,
 *   `offset` and returns `Page_OpportunityRead_`.
 * - `OpportunityRead` has **no name field** — an opportunity is identified by
 *   its company/contact pair, so UI labels are derived ("Opportunity ·
 *   <contact name>") from the enriched contact map.
 * - `OpportunityStage`: new / contacted / replied / meeting / won /
 *   not_interested. Value is `value_cents` + `currency`.
 */

export const OPPORTUNITY_STAGES = {
  new: { label: 'New', tone: 'neutral' },
  contacted: { label: 'Contacted', tone: 'info' },
  replied: { label: 'Replied', tone: 'warning' },
  meeting: { label: 'Meeting', tone: 'info' },
  won: { label: 'Won', tone: 'success' },
  not_interested: { label: 'Not interested', tone: 'danger' },
}

export function normalizeOpportunity(raw) {
  return {
    id: String(raw?.id ?? ''),
    companyId: raw?.company_id ? String(raw.company_id) : null,
    contactId: raw?.contact_id ? String(raw.contact_id) : null,
    stage: raw?.stage ?? 'new',
    valueCents: raw?.value_cents == null ? null : Number(raw.value_cents),
    currency: raw?.currency ?? 'USD',
    ownerId: raw?.owner_id ? String(raw.owner_id) : null,
    sourceCampaignId: raw?.source_campaign_id ? String(raw.source_campaign_id) : null,
    expectedCloseDate: raw?.expected_close_date ?? null,
    notes: raw?.notes ?? null,
    createdAt: raw?.created_at ?? null,
    updatedAt: raw?.updated_at ?? null,
  }
}

export async function listOpportunities({ stage, ownerId, contactId, limit = 100, offset = 0 } = {}, signal) {
  const params = new URLSearchParams()
  if (stage) params.set('stage', stage)
  if (ownerId) params.set('owner_id', ownerId)
  if (contactId) params.set('contact_id', contactId)
  if (limit != null) params.set('limit', String(limit))
  if (offset != null) params.set('offset', String(offset))
  const query = params.toString()
  const data = await api.get(`/opportunities${query ? `?${query}` : ''}`, { signal })
  const items = Array.isArray(data?.items) ? data.items.map(normalizeOpportunity) : []
  return {
    items,
    total: Number(data?.total ?? items.length),
    limit: Number(data?.limit ?? limit),
    offset: Number(data?.offset ?? offset),
  }
}

export function opportunityValue(opportunity) {
  if (opportunity?.valueCents == null) return null
  return new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency: opportunity.currency || 'USD',
    maximumFractionDigits: 0,
  }).format(opportunity.valueCents / 100)
}

export async function createOpportunity(
  {
    companyId,
    contactId,
    stage,
    valueCents,
    currency,
    ownerId,
    sourceCampaignId,
    expectedCloseDate,
    notes,
  } = {},
  signal,
) {
  const payload = {}
  if (companyId) payload.company_id = companyId
  if (contactId) payload.contact_id = contactId
  if (stage) payload.stage = stage
  if (valueCents != null) payload.value_cents = valueCents
  if (currency) payload.currency = currency
  if (ownerId) payload.owner_id = ownerId
  if (sourceCampaignId) payload.source_campaign_id = sourceCampaignId
  if (expectedCloseDate) payload.expected_close_date = expectedCloseDate
  if (notes) payload.notes = notes
  const data = await api.post('/opportunities', payload, { signal })
  return normalizeOpportunity(data)
}

/**
 * Stage moves / value / owner / close date / notes via `PATCH`. A stage change
 * to won or not_interested carries its reason through `notes` (the API has no
 * dedicated reason field), and the backend audits
 * `opportunity.updated` with before/after stage data.
 */
export async function updateOpportunity(
  opportunityId,
  { stage, valueCents, currency, ownerId, expectedCloseDate, notes } = {},
) {
  const payload = {}
  if (stage !== undefined) payload.stage = stage
  if (valueCents !== undefined) payload.value_cents = valueCents
  if (currency !== undefined) payload.currency = currency
  if (ownerId !== undefined) payload.owner_id = ownerId
  if (expectedCloseDate !== undefined) payload.expected_close_date = expectedCloseDate
  if (notes !== undefined) payload.notes = notes
  const data = await api.patch(
    `/opportunities/${encodeURIComponent(opportunityId)}`,
    payload,
  )
  return normalizeOpportunity(data)
}

export async function deleteOpportunity(opportunityId) {
  await api.delete(`/opportunities/${encodeURIComponent(opportunityId)}`)
}

/** `GET /opportunities/{id}` exists in this build. */
export async function fetchOpportunity(opportunityId, signal) {
  const data = await api.get(`/opportunities/${encodeURIComponent(opportunityId)}`, { signal })
  return normalizeOpportunity(data)
}

/** Count and value by stage, computed server-side. */
export async function fetchPipelineSummary(signal) {
  const data = await api.get('/opportunities/pipeline', { signal })
  const items = Array.isArray(data) ? data : Array.isArray(data?.items) ? data.items : []
  return items.map((raw) => ({
    stage: raw?.stage ?? 'new',
    count: Number(raw?.count ?? 0),
    valueCents: Number(raw?.value_cents ?? 0),
  }))
}

/**
 * The backend audits every stage change as `opportunity.updated` with
 * before/after stage data; this reads the tenant audit log filtered to those
 * entries for the board's audit trail.
 */
export async function listOpportunityAudit({ limit = 10, offset = 0 } = {}, signal) {
  const params = new URLSearchParams()
  params.set('action', 'opportunity.updated')
  if (limit != null) params.set('limit', String(limit))
  if (offset != null) params.set('offset', String(offset))
  const data = await api.get(`/tenants/current/audit-logs?${params.toString()}`, { signal })
  const items = Array.isArray(data?.items) ? data.items : []
  return {
    items,
    total: Number(data?.total ?? items.length),
    limit: Number(data?.limit ?? limit),
    offset: Number(data?.offset ?? offset),
  }
}
