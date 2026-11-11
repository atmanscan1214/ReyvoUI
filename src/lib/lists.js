import { api } from './api'
import { CONTACTS_PAGE_SIZE, normalizeContact } from './contacts'

/**
 * Static contact-list adapter for T16.
 *
 * The live API exposes the whole static-list route under `/lists`:
 * list, create, read members, add members, remove a member, and delete. It has
 * no rename or description update, so the UI treats a list's name as fixed
 * after creation rather than pretending an edit persisted.
 *
 * Counts come from `GET /lists` (`contact_count`) and members are paged through
 * `GET /lists/{id}/contacts`. The API caps `limit` at 100.
 */

export const LISTS_PAGE_SIZE = 25
export const LIST_MEMBER_MAX = 2000

export function normalizeContactList(raw) {
  return {
    id: String(raw?.id ?? ''),
    name: raw?.name ?? 'Untitled list',
    description: raw?.description ?? '',
    contactCount: Number(raw?.contact_count ?? 0),
    createdAt: raw?.created_at ?? null,
  }
}

export async function listContactLists(signal) {
  const data = await api.get('/lists', { signal })
  return Array.isArray(data) ? data.map(normalizeContactList) : []
}

export async function createContactList({ name, description } = {}, signal) {
  const data = await api.post(
    '/lists',
    {
      name: String(name ?? '').trim(),
      description: String(description ?? '').trim() || null,
    },
    { signal },
  )
  return normalizeContactList(data)
}

export async function listListContacts(
  listId,
  { limit = LISTS_PAGE_SIZE, offset = 0 } = {},
  signal,
) {
  const query = new URLSearchParams({
    limit: String(limit),
    offset: String(offset),
  })
  const data = await api.get(
    `/lists/${encodeURIComponent(listId)}/contacts?${query.toString()}`,
    { signal },
  )
  const items = Array.isArray(data?.items) ? data.items.map(normalizeContact) : []

  return {
    items,
    total: Number(data?.total ?? items.length),
    limit: Number(data?.limit ?? limit),
    offset: Number(data?.offset ?? offset),
  }
}

/** Adds members and returns the API's human-readable result message. */
export async function addContactsToList(listId, contactIds, signal) {
  const data = await api.post(
    `/lists/${encodeURIComponent(listId)}/contacts`,
    { contact_ids: [...contactIds] },
    { signal },
  )
  return data?.message ?? null
}

export async function removeContactFromList(listId, contactId, signal) {
  await api.delete(
    `/lists/${encodeURIComponent(listId)}/contacts/${encodeURIComponent(contactId)}`,
    { signal },
  )
}

export async function deleteContactList(listId, signal) {
  await api.delete(`/lists/${encodeURIComponent(listId)}`, { signal })
}

/**
 * Loads every member id for a list so segment rules that reference a list can
 * be evaluated in the browser. Capped because the API only offers paged reads.
 */
export async function fetchAllListContactIds(listId, { signal, max = LIST_MEMBER_MAX } = {}) {
  const ids = new Set()
  let offset = 0
  let total = 0
  let truncated = false

  while (ids.size < max) {
    const limit = Math.min(CONTACTS_PAGE_SIZE * 4, max - ids.size)
    const data = await listListContacts(listId, { limit, offset }, signal)
    total = data.total

    for (const contact of data.items) ids.add(contact.id)

    offset += data.items.length
    if (data.items.length === 0 || offset >= total) break
  }

  if (offset < total) truncated = true

  return { ids, total, truncated }
}
