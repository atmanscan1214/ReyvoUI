import { api } from './api'

/**
 * Unified replies-inbox adapter for T32 (§5.7.4).
 *
 * Live API reality:
 * - `GET /replies` accepts `category`, `needs_review`, `campaign_id`,
 *   `limit`, `offset` and returns `Page_ReplyRead_` (`items`, `total`,
 *   `limit`, `offset`). Category and review status are server-side filters;
 *   campaign filtering is server-side by id.
 * - `ReplyRead` carries ids and a `snippet` only: no inbox/mailbox field, no
 *   message bodies, no thread history, no date filter parameter, and no
 *   create endpoint (replies arrive from inbound email processing). The page
 *   names those gaps instead of faking them.
 * - `PATCH /replies/{id}` exists (consumed in T33/T34, not here).
 *
 * Enrichment is client-side: contacts, campaigns, and workspace members are
 * fetched and mapped by id so rows can show names and an assignee filter —
 * the same sampling trade-off as the contact/company pickers (first 100).
 */

/** Real `ReplyCategory` enum values, not the demo-era fake ones. */
export const REPLY_CATEGORIES = {
  positive: { label: 'Positive', tone: 'success' },
  negative: { label: 'Negative', tone: 'danger' },
  question: { label: 'Question', tone: 'info' },
  out_of_office: { label: 'Out of office', tone: 'neutral' },
  unsubscribe: { label: 'Unsubscribe', tone: 'warning' },
  bounce: { label: 'Bounce', tone: 'danger' },
  neutral: { label: 'Neutral', tone: 'outline' },
  other: { label: 'Other', tone: 'neutral' },
}

export function categoryMeta(category) {
  return (
    REPLY_CATEGORIES[category] ?? {
      label: category ? String(category).replace(/_/g, ' ') : 'Unknown',
      tone: 'neutral',
    }
  )
}

export function normalizeReply(raw) {
  return {
    id: String(raw?.id ?? ''),
    messageId: raw?.message_id ? String(raw.message_id) : null,
    contactId: raw?.contact_id ? String(raw.contact_id) : null,
    campaignId: raw?.campaign_id ? String(raw.campaign_id) : null,
    category: raw?.category ?? 'other',
    confidence: raw?.confidence == null ? null : Number(raw.confidence),
    classifiedBy: raw?.classified_by ?? 'unknown',
    needsReview: Boolean(raw?.needs_review),
    snippet: raw?.snippet ?? '',
    receivedAt: raw?.received_at ?? null,
    assignedTo: raw?.assigned_to ? String(raw.assigned_to) : null,
    createdAt: raw?.created_at ?? null,
  }
}

export async function listReplies(
  { category, needsReview, campaignId, limit = 100, offset = 0 } = {},
  signal,
) {
  const params = new URLSearchParams()
  if (category) params.set('category', category)
  if (needsReview != null) params.set('needs_review', String(needsReview))
  if (campaignId) params.set('campaign_id', campaignId)
  if (limit != null) params.set('limit', String(limit))
  if (offset != null) params.set('offset', String(offset))
  const query = params.toString()
  const data = await api.get(`/replies${query ? `?${query}` : ''}`, { signal })
  const items = Array.isArray(data?.items) ? data.items.map(normalizeReply) : []
  return {
    items,
    total: Number(data?.total ?? items.length),
    limit: Number(data?.limit ?? limit ?? 0),
    offset: Number(data?.offset ?? offset ?? 0),
  }
}

export async function getReply(replyId, signal) {
  const data = await api.get(`/replies/${encodeURIComponent(replyId)}`, { signal })
  return normalizeReply(data)
}

/**
 * There is no `GET /replies/{id}` in this build (the detail route supports
 * `PATCH` only), so a single reply is located by walking the list endpoint.
 * Capped at 5 pages (500 rows) — deep history beyond that is not reachable.
 */
export async function findReplyById(replyId, { signal, maxPages = 5 } = {}) {
  let offset = 0
  for (let i = 0; i < maxPages; i += 1) {
    const page = await listReplies({ limit: 100, offset }, signal)
    const found = page.items.find((item) => item.id === replyId)
    if (found) return found
    if (page.items.length === 0 || offset + page.items.length >= page.total) break
    offset += page.items.length
  }
  return null
}

/**
 * Reclassify / flag for review / reassign via `PATCH /replies/{reply_id}`.
 * `ReplyUpdate` accepts `category`, `needs_review`, and `assigned_to` only.
 */
export async function updateReply(replyId, { category, needsReview, assignedTo } = {}) {
  const payload = {}
  if (category !== undefined) payload.category = category
  if (needsReview !== undefined) payload.needs_review = needsReview
  if (assignedTo !== undefined) payload.assigned_to = assignedTo || null
  const data = await api.patch(`/replies/${encodeURIComponent(replyId)}`, payload)
  return normalizeReply(data)
}

/**
 * `ReplyRead` has no contact/campaign names, so the page maps ids through the
 * live contact, campaign, and member lists (first 100 each).
 */
export async function fetchReplyContext(signal) {
  const [contactsData, campaignsData, membersData] = await Promise.all([
    api.get('/contacts?limit=100', { signal }),
    api.get('/campaigns?limit=100', { signal }),
    api.get('/tenants/current/members', { signal }),
  ])

  const contacts = new Map()
  for (const raw of Array.isArray(contactsData?.items) ? contactsData.items : []) {
    contacts.set(String(raw?.id ?? ''), {
      name: raw?.full_name || raw?.email || 'Unnamed contact',
      email: raw?.email ?? '',
      companyId: raw?.company_id ? String(raw.company_id) : null,
    })
  }

  const campaigns = new Map()
  for (const raw of Array.isArray(campaignsData?.items) ? campaignsData.items : []) {
    campaigns.set(String(raw?.id ?? ''), {
      name: raw?.name ?? 'Unnamed campaign',
      status: raw?.status ?? '',
    })
  }

  const members = new Map()
  for (const raw of Array.isArray(membersData) ? membersData : []) {
    const id = String(raw?.user_id ?? raw?.membership_id ?? '')
    if (id) members.set(String(raw?.user_id ?? id), raw?.full_name || raw?.email || id)
  }

  return { contacts, campaigns, members }
}

/**
 * Done-when for T32: unmatched replies (no contact or no campaign linkage)
 * are identifiable so they can be separated from classified traffic.
 */
export function isUnmatchedReply(reply) {
  return !reply.contactId || !reply.campaignId
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/**
 * Strip remote content and tracking attributes before `dangerouslySetInnerHTML`.
 * The API delivers `snippet` as untrusted provider HTML, so script/iframe/img
 * blocks are removed, unknown tags are dropped, and link attributes are
 * stripped; plain-text snippets are escaped into a paragraph instead.
 */
export function sanitizeReplyHtml(value) {
  const raw = String(value ?? '')
  if (!raw.trim()) return '<p></p>'

  const strippedScripts = raw.replace(/<script[\s\S]*?<\/script>/gi, '')
  const strippedRemote = strippedScripts.replace(
    /<(?:iframe|img|svg|object|embed|video|audio|source|track)\b[^>]*>.*?<\/\s*(?:iframe|img|svg|object|embed|video|audio|source|track)>/gi,
    '',
  )
  const sanitized = strippedRemote.replace(
    /<(?!\/?(?:p|br|strong|b|em|i|ul|ol|li|blockquote|a|span)\b)[^>]*>/gi,
    '',
  )
  const withoutLinkAttrs = sanitized.replace(
    /<a\b([^>]*)>/gi,
    (match, attrs) => `<a${attrs.replace(/\s(?:href|target|rel)\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '')}>`,
  )

  if (!/<[a-z][\s\S]*>/i.test(withoutLinkAttrs)) {
    return `<p>${escapeHtml(raw).replace(/\n/g, '<br />')}</p>`
  }

  return withoutLinkAttrs
}

/** Plain-text version of a snippet for list previews. */
export function snippetPreview(value) {
  return String(value ?? '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}
