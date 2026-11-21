import { api } from './api'
import { listCampaigns } from './campaigns'
import {
  LIST_MEMBER_MAX,
  fetchAllListContactIds,
  listContactLists,
  listListContacts,
} from './lists'
import {
  SEGMENT_SCAN_MAX,
  evaluateDefinition,
  getSavedSegment,
  loadAudienceSnapshot,
} from './segments'
import { listSuppressions } from './suppressions'
import { listEmailAccounts } from './emailAccounts'
import { readPendingAudience } from './audience'

/**
 * Wizard data layer for T21 (design §5.4.2 steps 1–2).
 *
 * There is no audience/exclusion endpoint in this API build, so the wizard
 * composes the numbers itself: audience contacts come from the list members
 * route or the segment snapshot evaluation, exclusions from the suppression
 * list, cross-campaign enrollments, and contact fields. Everything is capped
 * and labelled as an estimate.
 */

export const WIZARD_ENROLLMENT_CAP = 2000
export const WIZARD_SUPPRESSION_CAP = 2000
export const RECENT_CONTACT_DAYS = 30

/** Audience options: saved lists (API) + saved segments (this browser) + the
 * pending pick handed over by the lists page. */
export async function loadAudienceOptions(signal) {
  const [lists, pending] = await Promise.all([
    listContactLists(signal).catch(() => []),
    Promise.resolve(readPendingAudience()),
  ])

  const segments = listSavedSegmentsSafe().map((segment) => ({
    key: `segment:${segment.id}`,
    type: 'segment',
    id: segment.id,
    name: segment.name,
    description: segment.description ?? '',
    count: null, // evaluated against the snapshot when selected
  }))

  return {
    lists: lists.map((list) => ({
      key: `list:${list.id}`,
      type: 'list',
      id: list.id,
      name: list.name,
      description: list.description ?? '',
      count: list.contactCount,
    })),
    segments,
    pending,
  }
}

function listSavedSegmentsSafe() {
  try {
    // Imported lazily to keep segments.js free of wizard concerns; the store
    // read is synchronous and local.
    const raw = typeof window !== 'undefined' ? window.localStorage.getItem('reyvo.segments.v1') : null
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

/**
 * Materializes the audience into normalized contacts.
 * - list → paged `/lists/{id}/contacts` reads (capped, `truncated` flag).
 * - segment → the contact snapshot evaluated in the browser (capped).
 */
export async function loadAudienceContacts(option, signal) {
  if (!option) {
    return { contacts: [], total: 0, truncated: false, source: null }
  }

  if (option.type === 'list') {
    const ids = await fetchAllListContactIds(option.id, {
      signal,
      max: LIST_MEMBER_MAX,
    })
    const contacts = []
    const pageSize = 100
    let offset = 0
    while (contacts.length < LIST_MEMBER_MAX) {
      const data = await listListContacts(
        option.id,
        { limit: pageSize, offset },
        signal,
      )
      contacts.push(...data.items)
      offset += data.items.length
      if (data.items.length === 0 || offset >= data.total) break
    }
    return {
      contacts,
      total: ids.total,
      truncated: ids.truncated || contacts.length < ids.total,
      source: 'list',
    }
  }

  const segment = getSavedSegment(option.id)
  if (!segment) {
    throw new Error('This segment was deleted from this browser. Pick another audience.')
  }
  const snapshot = await loadAudienceSnapshot({ signal, max: SEGMENT_SCAN_MAX })
  const matched = evaluateDefinition(segment.definition, snapshot.contacts, snapshot)
  return {
    contacts: matched,
    total: matched.length,
    truncated: snapshot.truncated,
    source: 'segment',
  }
}

/** Emails the tenant has suppressed, capped. */
export async function loadSuppressionEmails(signal) {
  const emails = new Set()
  let offset = 0
  const pageSize = 100
  while (emails.size < WIZARD_SUPPRESSION_CAP) {
    const data = await listSuppressions(
      { limit: pageSize, offset },
      signal,
    )
    for (const item of data.items) {
      if (item.email) emails.add(item.email.toLowerCase())
    }
    offset += data.items.length
    if (data.items.length === 0 || offset >= data.total) break
  }
  return emails
}

/**
 * Contact ids already enrolled in any campaign (any status), capped. Enrollment
 * reads are per campaign, so this walks the campaign list; a workspace with
 * many campaigns stops at the cap.
 */
export async function loadEnrolledContactIds(signal) {
  const { items: campaigns } = await listCampaigns({ limit: 100 }, signal)
  const enrolled = new Set()
  let truncated = false

  for (const campaign of campaigns) {
    if (enrolled.size >= WIZARD_ENROLLMENT_CAP) break
    let offset = 0
    while (enrolled.size < WIZARD_ENROLLMENT_CAP) {
      const query = new URLSearchParams({
        limit: '100',
        offset: String(offset),
      })
      let page
      try {
        page = await api.get(
          `/campaigns/${encodeURIComponent(campaign.id)}/enrollments?${query.toString()}`,
          { signal },
        )
      } catch (caught) {
        if (caught?.name === 'AbortError') throw caught
        truncated = true
        break
      }
      for (const item of page?.items ?? []) {
        if (item?.contact_id) enrolled.add(String(item.contact_id))
      }
      offset += (page?.items ?? []).length
      const total = Number(page?.total ?? 0)
      if ((page?.items ?? []).length === 0 || offset >= total) break
    }
    if (enrolled.size >= WIZARD_ENROLLMENT_CAP) truncated = true
  }

  return { enrolled, truncated: truncated || campaigns.length >= 100 }
}

const DAY_MS = 24 * 60 * 60 * 1000

/**
 * Exclusion breakdown. Categories are counted per contact by priority
 * (suppressed → no email → already enrolled → recently contacted) so the parts
 * sum to the total, and a contact is never double-counted.
 */
export function computeExclusions(contacts, { suppressionEmails, enrolledIds, now = new Date() } = {}) {
  const breakdown = {
    suppressed: 0,
    noEmail: 0,
    alreadyEnrolled: 0,
    recentlyContacted: 0,
  }
  const excludedIds = new Set()
  const cutoff = now.getTime() - RECENT_CONTACT_DAYS * DAY_MS

  for (const contact of contacts) {
    let reason = null
    if (suppressionEmails?.has(String(contact.email ?? '').toLowerCase())) {
      reason = 'suppressed'
    } else if (!String(contact.email ?? '').trim()) {
      reason = 'noEmail'
    } else if (enrolledIds?.has(contact.id)) {
      reason = 'alreadyEnrolled'
    } else if (
      contact.lastContactedAt &&
      new Date(contact.lastContactedAt).getTime() > cutoff
    ) {
      reason = 'recentlyContacted'
    }
    if (reason) {
      breakdown[reason] += 1
      excludedIds.add(contact.id)
    }
  }

  return { breakdown, excludedIds }
}

/**
 * Estimated sends: the audience minus exclusions, expressed against the daily
 * capacity of the selected mailboxes (how many days the first pass needs).
 */
export function summarizeEstimate({ included, excluded, capacity }) {
  const estimatedSends = Math.max(0, included - excluded)
  const safeCapacity = Math.max(0, Number(capacity) || 0)
  return {
    estimatedSends,
    firstDaySends: Math.min(estimatedSends, safeCapacity),
    daysToComplete:
      estimatedSends > 0 && safeCapacity > 0 ? Math.ceil(estimatedSends / safeCapacity) : null,
  }
}

/**
 * Healthy inboxes for sending. `connected` is selectable; `degraded` is
 * selectable with a warning; anything else is blocked with its reason.
 */
export function splitMailboxes(accounts) {
  const usable = []
  const blocked = []
  for (const account of accounts) {
    const status = account.status
    if (status === 'connected') usable.push({ account, warning: false })
    else if (status === 'degraded') usable.push({ account, warning: true })
    else blocked.push(account)
  }
  return { usable, blocked }
}
