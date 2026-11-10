const FALLBACK_ZONES = [
  'UTC',
  'Africa/Cairo',
  'Africa/Johannesburg',
  'Africa/Lagos',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
  'America/New_York',
  'America/Sao_Paulo',
  'America/Toronto',
  'Asia/Dubai',
  'Asia/Kolkata',
  'Asia/Singapore',
  'Asia/Tokyo',
  'Australia/Melbourne',
  'Australia/Sydney',
  'Europe/Amsterdam',
  'Europe/Berlin',
  'Europe/Dublin',
  'Europe/Lisbon',
  'Europe/London',
  'Europe/Madrid',
  'Europe/Paris',
  'Europe/Rome',
  'Pacific/Auckland',
]

const REGION_LABELS = {
  Africa: 'Africa',
  America: 'Americas',
  Antarctica: 'Antarctica',
  Asia: 'Asia',
  Atlantic: 'Atlantic',
  Australia: 'Australia',
  Europe: 'Europe',
  Indian: 'Indian Ocean',
  Pacific: 'Pacific',
  Other: 'Other',
  UTC: 'UTC',
}

let cachedZones = null

function allZones() {
  if (cachedZones) return cachedZones

  let zones = []
  try {
    if (typeof Intl !== 'undefined' && typeof Intl.supportedValuesOf === 'function') {
      zones = Intl.supportedValuesOf('timeZone')
    }
  } catch {
    zones = []
  }

  if (!zones.length) zones = FALLBACK_ZONES
  if (!zones.includes('UTC')) zones = ['UTC', ...zones]

  cachedZones = [...new Set(zones)].sort((a, b) => a.localeCompare(b))
  return cachedZones
}

/** Timezones grouped for a native <select> with <optgroup> sections. */
export function groupedTimezones() {
  const groups = new Map()

  for (const zone of allZones()) {
    const region = zone.includes('/') ? zone.split('/')[0] : 'UTC'
    const key = REGION_LABELS[region] ? region : 'Other'

    if (!groups.has(key)) groups.set(key, [])
    groups.get(key).push(zone)
  }

  return [...groups.entries()]
    .sort(([a], [b]) => {
      if (a === 'UTC') return -1
      if (b === 'UTC') return 1
      return REGION_LABELS[a].localeCompare(REGION_LABELS[b])
    })
    .map(([region, zones]) => ({ label: REGION_LABELS[region], zones }))
}

export function detectTimezone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
  } catch {
    return 'UTC'
  }
}
