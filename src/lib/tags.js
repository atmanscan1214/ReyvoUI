import {
  getAllContactTags,
  normalizeTag,
  sanitizeTags,
  saveContactTags,
} from './contacts'

/**
 * Tag management helpers for T16.
 *
 * Tags are not part of this API build, so the per-browser store from T12
 * (`reyvo.contactTags.v1`) is the source of truth. These helpers only reshape
 * that store; the contact detail editor remains the place to tag one record.
 */

export function collectContactTags(tagsByContact = {}) {
  const groups = new Map()

  for (const [contactId, tags] of Object.entries(tagsByContact)) {
    for (const tag of tags ?? []) {
      const key = tag.toLowerCase()
      if (!groups.has(key)) groups.set(key, { tag, contactIds: [] })
      groups.get(key).contactIds.push(contactId)
    }
  }

  return [...groups.values()].sort(
    (left, right) =>
      right.contactIds.length - left.contactIds.length ||
      left.tag.localeCompare(right.tag),
  )
}

export function contactIdsForTag(tagsByContact, tag) {
  const key = String(tag ?? '').toLowerCase()
  return Object.entries(tagsByContact)
    .filter(([, tags]) => (tags ?? []).some((value) => value.toLowerCase() === key))
    .map(([contactId]) => contactId)
}

/**
 * Renames a tag on every contact that carries it. When the new name already
 * exists on a contact, `sanitizeTags` deduplicates it instead of writing twice.
 */
export function renameContactTag({ oldTag, newTag, tagsByContact }) {
  const target = normalizeTag(oldTag)
  const replacement = normalizeTag(newTag)
  if (!target) throw new Error('Choose a tag to rename.')
  if (!replacement) throw new Error('Enter the new tag name.')

  const key = target.toLowerCase()
  let changed = 0

  for (const [contactId, tags] of Object.entries(tagsByContact)) {
    if (!(tags ?? []).some((tag) => tag.toLowerCase() === key)) continue
    const next = sanitizeTags(
      tags.map((tag) => (tag.toLowerCase() === key ? replacement : tag)),
    )
    saveContactTags(contactId, next)
    changed += 1
  }

  return { changed, tag: replacement }
}

export function deleteContactTag({ tag, tagsByContact }) {
  const key = String(tag ?? '').toLowerCase()
  let changed = 0

  for (const [contactId, tags] of Object.entries(tagsByContact)) {
    if (!(tags ?? []).some((value) => value.toLowerCase() === key)) continue
    saveContactTags(
      contactId,
      tags.filter((value) => value.toLowerCase() !== key),
    )
    changed += 1
  }

  return { changed }
}

export function applyContactTag({ tag, contactIds, tagsByContact }) {
  const clean = normalizeTag(tag)
  if (!clean) throw new Error('Enter a tag name.')
  if (!contactIds?.length) throw new Error('Choose at least one contact.')

  const key = clean.toLowerCase()
  let changed = 0

  for (const contactId of contactIds) {
    const current = tagsByContact[contactId] ?? []
    if (current.some((value) => value.toLowerCase() === key)) continue
    saveContactTags(contactId, [...current, clean])
    changed += 1
  }

  return { changed, tag: clean }
}

/** Re-reads the store after a mutation so callers keep one tag snapshot. */
export function refreshContactTags() {
  return getAllContactTags()
}
