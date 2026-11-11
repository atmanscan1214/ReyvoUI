/**
 * Campaign audience selection contract for T16 → T21.
 *
 * T16 owns saved lists and saved segments. T21's wizard owns the audience step,
 * and no campaign wizard exists yet. Rather than invent a wizard here, the
 * lists page records the audience the user picked in
 * `reyvo.campaignAudience.v1`; T21 reads it through these helpers and falls back
 * to the first step when nothing is pending.
 */

export const CAMPAIGN_AUDIENCE_KEY = 'reyvo.campaignAudience.v1'

export const AUDIENCE_TYPES = {
  list: 'Static list',
  segment: 'Saved segment',
}

export function audienceTypeLabel(type) {
  return AUDIENCE_TYPES[type] ?? 'Audience'
}

export function audienceKey(type, id) {
  return `${type}:${id}`
}

export function buildAudienceOption({ type, id, name, count = 0 }) {
  return {
    key: audienceKey(type, id),
    type,
    id: String(id),
    name: String(name ?? '').trim() || 'Untitled audience',
    count: Number(count) || 0,
    typeLabel: audienceTypeLabel(type),
  }
}

export function readPendingAudience() {
  if (typeof window === 'undefined') return null

  try {
    const raw = window.localStorage.getItem(CAMPAIGN_AUDIENCE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (!parsed || !parsed.id || !parsed.type) return null
    if (!AUDIENCE_TYPES[parsed.type]) return null
    return {
      ...buildAudienceOption(parsed),
      savedAt: parsed.savedAt ?? null,
    }
  } catch {
    return null
  }
}

export function savePendingAudience({ type, id, name, count = 0 }) {
  if (typeof window === 'undefined') return null
  if (!AUDIENCE_TYPES[type]) throw new Error('Choose a list or segment.')

  const option = {
    ...buildAudienceOption({ type, id, name, count }),
    savedAt: new Date().toISOString(),
  }

  try {
    window.localStorage.setItem(CAMPAIGN_AUDIENCE_KEY, JSON.stringify(option))
  } catch {
    throw new Error('This browser blocked local storage, so the audience was not saved.')
  }

  return option
}

export function clearPendingAudience() {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.removeItem(CAMPAIGN_AUDIENCE_KEY)
  } catch {
    // Nothing to clear when storage is blocked.
  }
}
