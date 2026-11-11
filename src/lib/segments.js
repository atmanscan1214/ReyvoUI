import { fetchContactsForView } from './contactBulk'
import { listCompanies } from './companies'
import {
  CONTACT_STATUSES,
  EMAIL_STATUSES,
  TAG_STORAGE_AVAILABLE,
  getAllContactTags,
  normalizeTag,
} from './contacts'
import { fetchAllListContactIds } from './lists'

/**
 * Saved segment definitions for T16.
 *
 * The design calls segments "saved, dynamic filters", but this API build has a
 * `segments` table and no `/segments` route. Campaign resolution on the server
 * understands only `status` and `company_id` from `segment.definition`, so the
 * UI cannot persist a segment there. Segments are therefore stored per browser
 * in `reyvo.segments.v1` and evaluated against a paged contact snapshot. The
 * campaign wizard can read the same definitions through `src/lib/audience.js`.
 *
 * Evaluation is deliberately parameterized data, never SQL: rules are plain
 * field/operator/value objects checked in JavaScript. Counts are estimated from
 * up to `SEGMENT_SCAN_MAX` contacts because `GET /contacts` caps a page at 100.
 */

export const SEGMENT_STORAGE_KEY = 'reyvo.segments.v1'
export const SEGMENT_SCAN_MAX = 5000
export const SEGMENT_LIMIT = 50
export const SEGMENT_NAME_LENGTH = 120
export const SEGMENT_DESCRIPTION_LENGTH = 500
export const SEGMENT_COMPANY_MAX = 1000

export const SEGMENT_OPERATORS = {
  equals: { label: 'equals', valueKind: 'text' },
  not_equals: { label: 'does not equal', valueKind: 'text' },
  contains: { label: 'contains', valueKind: 'text' },
  not_contains: { label: 'does not contain', valueKind: 'text' },
  starts_with: { label: 'starts with', valueKind: 'text' },
  is_empty: { label: 'is empty', valueKind: 'none' },
  is_not_empty: { label: 'is not empty', valueKind: 'none' },
  before: { label: 'is before', valueKind: 'date' },
  after: { label: 'is after', valueKind: 'date' },
  in_last_days: { label: 'is in the last', valueKind: 'days' },
  has_tag: { label: 'has tag', valueKind: 'tag' },
  in_list: { label: 'is in list', valueKind: 'list' },
}

const TEXT_OPERATORS = [
  'equals',
  'not_equals',
  'contains',
  'not_contains',
  'starts_with',
  'is_empty',
  'is_not_empty',
]

const DATE_OPERATORS = ['before', 'after', 'is_empty', 'is_not_empty']

export const SEGMENT_FIELDS = [
  {
    key: 'status',
    label: 'Contact status',
    kind: 'enum',
    options: CONTACT_STATUSES,
    operators: ['equals', 'not_equals'],
  },
  {
    key: 'email_status',
    label: 'Email health',
    kind: 'enum',
    options: EMAIL_STATUSES,
    operators: ['equals', 'not_equals'],
  },
  { key: 'full_name', label: 'Contact name', kind: 'text', operators: TEXT_OPERATORS },
  { key: 'email', label: 'Email address', kind: 'text', operators: TEXT_OPERATORS },
  { key: 'title', label: 'Job title', kind: 'text', operators: TEXT_OPERATORS },
  { key: 'source', label: 'Source', kind: 'text', operators: TEXT_OPERATORS },
  { key: 'phone', label: 'Phone', kind: 'text', operators: TEXT_OPERATORS },
  { key: 'linkedin_url', label: 'LinkedIn URL', kind: 'text', operators: TEXT_OPERATORS },
  { key: 'notes', label: 'Notes', kind: 'text', operators: TEXT_OPERATORS },
  {
    key: 'company_id',
    label: 'Company',
    kind: 'company',
    operators: ['equals', 'not_equals'],
  },
  { key: 'company_name', label: 'Company name', kind: 'text', operators: TEXT_OPERATORS },
  {
    key: 'industry',
    label: 'Company industry',
    kind: 'text',
    operators: ['equals', 'not_equals', 'contains', 'not_contains', 'is_empty', 'is_not_empty'],
  },
  {
    key: 'location',
    label: 'Company location',
    kind: 'text',
    operators: ['equals', 'not_equals', 'contains', 'not_contains', 'is_empty', 'is_not_empty'],
  },
  {
    key: 'created_at',
    label: 'Created date',
    kind: 'date',
    operators: DATE_OPERATORS,
  },
  {
    key: 'last_contacted_at',
    label: 'Last contacted',
    kind: 'date',
    operators: ['before', 'after', 'in_last_days', 'is_empty', 'is_not_empty'],
  },
  {
    key: 'last_replied_at',
    label: 'Last replied',
    kind: 'date',
    operators: ['before', 'after', 'in_last_days', 'is_empty', 'is_not_empty'],
  },
  {
    key: 'in_list',
    label: 'List membership',
    kind: 'list',
    operators: ['in_list'],
  },
]

if (TAG_STORAGE_AVAILABLE) {
  SEGMENT_FIELDS.push({
    key: 'tag',
    label: 'Tag',
    kind: 'tag',
    operators: ['has_tag'],
  })
}

export function getSegmentField(fieldKey) {
  return SEGMENT_FIELDS.find((field) => field.key === fieldKey) ?? null
}

export function segmentOperatorOptions(fieldKey) {
  const field = getSegmentField(fieldKey)
  if (!field) return []
  return field.operators.map((key) => ({
    value: key,
    label: SEGMENT_OPERATORS[key]?.label ?? key,
    valueKind: segmentValueKind(field, key),
  }))
}

export function segmentValueKind(fieldOrKey, operator) {
  const field =
    typeof fieldOrKey === 'string' ? getSegmentField(fieldOrKey) : fieldOrKey
  if (!field) return 'none'
  if (field.kind === 'list') return 'list'
  if (field.kind === 'tag') return 'tag'
  if (field.kind === 'company') return 'company'
  if (field.kind === 'enum') return 'enum'
  return SEGMENT_OPERATORS[operator]?.valueKind ?? 'text'
}

function newId(prefix) {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${prefix}_${crypto.randomUUID()}`
  }
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
}

export function newSegmentRule() {
  return { id: newId('rule'), field: '', operator: '', value: '' }
}

export function newSegmentGroup() {
  return { id: newId('group'), match: 'all', rules: [newSegmentRule()] }
}

export function newSegmentDefinition() {
  return { match: 'all', groups: [newSegmentGroup()] }
}

/* Validation --------------------------------------------------------------- */

function hasValue(value) {
  return String(value ?? '').trim().length > 0
}

export function isRuleTouched(rule) {
  return Boolean(
    hasValue(rule?.field) || hasValue(rule?.operator) || hasValue(rule?.value),
  )
}

export function isRuleComplete(rule) {
  const field = getSegmentField(rule?.field)
  if (!field || !field.operators.includes(rule?.operator)) return false

  const kind = segmentValueKind(field, rule.operator)
  if (kind === 'none') return true
  if (kind === 'days') {
    const days = Number(rule.value)
    return Number.isFinite(days) && days > 0 && days <= 3650
  }
  return hasValue(rule.value)
}

export function definitionRuleStats(definition) {
  let complete = 0
  let incomplete = 0

  for (const group of definition?.groups ?? []) {
    for (const rule of group?.rules ?? []) {
      if (isRuleComplete(rule)) complete += 1
      else if (isRuleTouched(rule)) incomplete += 1
    }
  }

  return { complete, incomplete }
}

export function validateSegmentDraft(draft, { segments = listSavedSegments() } = {}) {
  const errors = {}
  const name = String(draft?.name ?? '').trim()

  if (!name) errors.name = 'Enter a segment name.'
  else if (name.length > SEGMENT_NAME_LENGTH) {
    errors.name = `Use ${SEGMENT_NAME_LENGTH} characters or fewer.`
  } else if (
    segments.some(
      (segment) =>
        segment.id !== draft.id &&
        segment.name.trim().toLowerCase() === name.toLowerCase(),
    )
  ) {
    errors.name = 'A segment with this name already exists.'
  }

  const { complete, incomplete } = definitionRuleStats(draft?.definition)
  if (complete === 0) {
    errors.rules = 'Add at least one complete rule before saving.'
  } else if (incomplete > 0) {
    errors.rules = `${incomplete} ${
      incomplete === 1 ? 'rule needs' : 'rules need'
    } a field, operator, and value — or remove ${
      incomplete === 1 ? 'it' : 'them'
    }.`
  }

  if (String(draft?.description ?? '').length > SEGMENT_DESCRIPTION_LENGTH) {
    errors.description = `Use ${SEGMENT_DESCRIPTION_LENGTH} characters or fewer.`
  }

  return errors
}

/* Storage ------------------------------------------------------------------ */

function readStore() {
  if (typeof window === 'undefined') return []
  try {
    const raw = window.localStorage.getItem(SEGMENT_STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter(
      (segment) =>
        segment &&
        typeof segment.id === 'string' &&
        typeof segment.name === 'string' &&
        segment.definition &&
        Array.isArray(segment.definition.groups),
    )
  } catch {
    return []
  }
}

function writeStore(segments) {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(SEGMENT_STORAGE_KEY, JSON.stringify(segments))
  } catch {
    // Storage can be blocked; saving then reports failure at the call site.
  }
}

export function listSavedSegments() {
  return [...readStore()].sort(
    (left, right) =>
      new Date(right.updatedAt ?? 0).getTime() -
      new Date(left.updatedAt ?? 0).getTime(),
  )
}

export function getSavedSegment(segmentId) {
  return readStore().find((segment) => segment.id === segmentId) ?? null
}

/**
 * Creates or updates a segment in the browser store. Throws a plain `Error`
 * with a user-facing message when the draft is invalid or storage is full.
 */
export function saveSavedSegment({ id, name, description, definition } = {}) {
  const segments = listSavedSegments()
  const draft = {
    id: id || newId('segment'),
    name: String(name ?? '').trim(),
    description: String(description ?? '').trim(),
    definition,
  }

  const errors = validateSegmentDraft(draft, { segments })
  const firstError = errors.name || errors.rules || errors.description
  if (firstError) throw new Error(firstError)

  if (!id && segments.length >= SEGMENT_LIMIT) {
    throw new Error(`This browser holds up to ${SEGMENT_LIMIT} saved segments.`)
  }

  const existing = segments.find((segment) => segment.id === draft.id)
  const now = new Date().toISOString()
  const record = {
    id: draft.id,
    name: draft.name,
    description: draft.description,
    definition: normalizeDefinition(definition),
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  }

  const next = existing
    ? segments.map((segment) => (segment.id === record.id ? record : segment))
    : [record, ...segments]

  writeStore(next)

  if (!readStore().some((segment) => segment.id === record.id)) {
    throw new Error('This browser blocked local storage, so the segment was not saved.')
  }

  return record
}

export function deleteSavedSegment(segmentId) {
  writeStore(readStore().filter((segment) => segment.id !== segmentId))
}

export function duplicateSavedSegment(segmentId) {
  const source = getSavedSegment(segmentId)
  if (!source) throw new Error('That segment no longer exists.')

  const baseName = `${source.name} copy`
  const names = new Set(listSavedSegments().map((segment) => segment.name.toLowerCase()))
  let name = baseName
  let counter = 2
  while (names.has(name.toLowerCase())) {
    name = `${baseName} ${counter}`
    counter += 1
  }

  return saveSavedSegment({
    name,
    description: source.description,
    definition: source.definition,
  })
}

/** Drops untouched rules, empty groups, and trims values before saving. */
export function normalizeDefinition(definition) {
  return {
    match: definition?.match === 'any' ? 'any' : 'all',
    groups: (definition?.groups ?? [])
      .map((group) => ({
        id: group.id || newId('group'),
        match: group.match === 'any' ? 'any' : 'all',
        rules: (group.rules ?? [])
          .filter(isRuleTouched)
          .map((rule) => ({
            id: rule.id || newId('rule'),
            field: rule.field ?? '',
            operator: rule.operator ?? '',
            value: String(rule.value ?? '').trim(),
          })),
      }))
      .filter((group) => group.rules.length > 0),
  }
}

/** Every list id referenced by an `in_list` rule in this definition. */
export function definitionListIds(definition) {
  const ids = new Set()

  for (const group of definition?.groups ?? []) {
    for (const rule of group?.rules ?? []) {
      if (rule?.field === 'in_list' && rule.value) ids.add(String(rule.value))
    }
  }

  return [...ids]
}

/* Evaluation --------------------------------------------------------------- */

function fieldValues(contact, fieldKey, context) {
  const company = contact?.companyId
    ? context?.companyMap?.get(contact.companyId)
    : null

  switch (fieldKey) {
    case 'status':
      return [contact.status]
    case 'email_status':
      return [contact.emailStatus]
    case 'full_name':
      return [contact.fullName]
    case 'email':
      return [contact.email]
    case 'title':
      return [contact.title]
    case 'source':
      return [contact.source]
    case 'phone':
      return [contact.phone]
    case 'linkedin_url':
      return [contact.linkedinUrl]
    case 'notes':
      return [contact.notes]
    case 'company_id':
      return [contact.companyId]
    case 'company_name':
      return [company?.name]
    case 'industry':
      return [company?.industry]
    case 'location':
      return [company?.city, company?.state, company?.country].filter(Boolean)
    case 'created_at':
      return [contact.createdAt]
    case 'last_contacted_at':
      return [contact.lastContactedAt]
    case 'last_replied_at':
      return [contact.lastRepliedAt]
    default:
      return []
  }
}

function normalized(value) {
  return String(value ?? '').trim().toLowerCase()
}

function matchText(values, operator, target) {
  const wanted = normalized(target)
  const texts = values.map(normalized)

  switch (operator) {
    case 'equals':
      return texts.some((value) => value === wanted)
    case 'not_equals':
      return texts.every((value) => value !== wanted)
    case 'contains':
      return texts.some((value) => value.includes(wanted))
    case 'not_contains':
      return texts.every((value) => !value.includes(wanted))
    case 'starts_with':
      return texts.some((value) => value.startsWith(wanted))
    case 'is_empty':
      return texts.every((value) => value.length === 0)
    case 'is_not_empty':
      return texts.some((value) => value.length > 0)
    default:
      return false
  }
}

function dateValue(value) {
  if (!value) return null
  const time = Date.parse(value)
  return Number.isFinite(time) ? time : null
}

function matchDate(value, operator, target) {
  if (operator === 'is_empty') return dateValue(value) === null
  if (operator === 'is_not_empty') return dateValue(value) !== null
  if (operator === 'in_last_days') {
    const days = Number(target)
    const time = dateValue(value)
    if (!Number.isFinite(days) || days <= 0 || time === null) return false
    return time >= Date.now() - days * 86400000
  }

  const time = dateValue(value)
  const targetTime = dateValue(target)
  if (time === null || targetTime === null) return false

  if (operator === 'before') return time < targetTime
  if (operator === 'after') return time > targetTime + 86400000 - 1
  return false
}

export function matchesRule(contact, rule, context = {}) {
  const field = getSegmentField(rule?.field)
  if (!field || !isRuleComplete(rule)) return false

  if (field.key === 'in_list') {
    const members = context.listMembership?.get(String(rule.value))
    return Boolean(members?.has(contact.id))
  }

  if (field.key === 'tag') {
    const tags = context.tagsByContact?.[contact.id] ?? []
    const wanted = normalizeTag(rule.value).toLowerCase()
    if (!wanted) return false
    return tags.some((tag) => tag.toLowerCase() === wanted)
  }

  const values = fieldValues(contact, field.key, context)

  if (field.kind === 'date') {
    return matchDate(values[0], rule.operator, rule.value)
  }

  return matchText(values, rule.operator, rule.value)
}

function usableGroups(definition) {
  return (definition?.groups ?? [])
    .map((group) => ({
      match: group.match === 'any' ? 'any' : 'all',
      rules: (group.rules ?? []).filter(isRuleComplete),
    }))
    .filter((group) => group.rules.length > 0)
}

/**
 * Evaluates a definition against a contact snapshot. A definition with no
 * complete rules matches nobody, which keeps a blank segment from silently
 * becoming an everyone audience.
 */
export function evaluateDefinition(definition, contacts, context = {}) {
  const groups = usableGroups(definition)
  if (groups.length === 0) return []
  const match = definition?.match === 'any' ? 'any' : 'all'

  return (contacts ?? []).filter((contact) => {
    const results = groups.map((group) =>
      group.match === 'any'
        ? group.rules.some((rule) => matchesRule(contact, rule, context))
        : group.rules.every((rule) => matchesRule(contact, rule, context)),
    )
    return match === 'any' ? results.some(Boolean) : results.every(Boolean)
  })
}

export function countSegment(definition, snapshot) {
  if (!snapshot) {
    return {
      count: 0,
      matched: [],
      scanned: 0,
      total: 0,
      truncated: false,
      ready: false,
    }
  }

  const matched = evaluateDefinition(definition, snapshot.contacts, snapshot)
  return {
    count: matched.length,
    matched,
    scanned: snapshot.contacts.length,
    total: snapshot.total,
    truncated: snapshot.truncated,
    ready: true,
  }
}

/* Human-readable summaries ------------------------------------------------ */

function optionLabel(field, value) {
  return field?.options?.find((option) => option.value === value)?.label ?? value
}

export function describeRule(rule, { companyMap, lists } = {}) {
  const field = getSegmentField(rule?.field)
  if (!field || !rule?.operator) return 'Incomplete rule'

  const operator = SEGMENT_OPERATORS[rule.operator]?.label ?? rule.operator
  const kind = segmentValueKind(field, rule.operator)
  if (kind === 'none') return `${field.label} ${operator}`

  let value = rule.value
  if (kind === 'enum') value = optionLabel(field, rule.value)
  else if (kind === 'company') {
    value = companyMap?.get(String(rule.value))?.name ?? 'a company'
  } else if (kind === 'list') {
    value = lists?.find((list) => list.id === String(rule.value))?.name ?? 'a list'
  } else if (kind === 'days') {
    value = `${rule.value} day${Number(rule.value) === 1 ? '' : 's'}`
  }

  return `${field.label} ${operator} ${value}`
}

/**
 * Compact one-line summary used by the segment table. Returns `null` until at
 * least one rule is complete.
 */
export function describeDefinition(definition, options = {}) {
  const groups = usableGroups(definition)
  if (groups.length === 0) return null

  const top = definition?.match === 'any' ? ' or ' : ' and '
  return groups
    .map((group) => {
      const join = group.match === 'any' ? ' or ' : ' and '
      return group.rules
        .map((rule) => describeRule(rule, options))
        .join(join)
    })
    .join(top)
}

/* Snapshot ---------------------------------------------------------------- */

async function fetchAllCompanies(signal, max = SEGMENT_COMPANY_MAX) {
  const items = []
  let offset = 0
  let total = 0

  while (items.length < max) {
    const data = await listCompanies(
      { limit: Math.min(100, max - items.length), offset },
      signal,
    )
    total = data.total
    items.push(...data.items)
    if (data.items.length === 0 || items.length >= total) break
    offset += data.items.length
  }

  return { items, total, truncated: items.length < total }
}

/**
 * Loads one contact snapshot plus the company, list-membership, and tag context
 * needed to evaluate every supported rule. The contact and company reads are
 * capped; `truncated` tells the UI the count is an estimate.
 */
export async function loadAudienceSnapshot({
  lists = [],
  signal,
  max = SEGMENT_SCAN_MAX,
} = {}) {
  const [contactScan, companyScan] = await Promise.all([
    fetchContactsForView({ signal, max }),
    fetchAllCompanies(signal),
  ])

  const listMembership = new Map()
  let membershipTruncated = false

  for (const list of lists) {
    if (signal?.aborted) break
    const { ids, truncated } = await fetchAllListContactIds(list.id, {
      signal,
      max,
    })
    listMembership.set(list.id, ids)
    if (truncated) membershipTruncated = true
  }

  return {
    contacts: contactScan.items,
    total: contactScan.total,
    truncated: contactScan.truncated,
    companies: companyScan.items,
    companiesTruncated: companyScan.truncated,
    companyMap: new Map(companyScan.items.map((company) => [company.id, company])),
    listMembership,
    membershipTruncated,
    tagsByContact: getAllContactTags(),
    loadedAt: Date.now(),
  }
}

/**
 * Adds membership sets for list rules introduced after the snapshot loaded,
 * without re-reading the contact or company lists.
 */
export async function hydrateListMembership(snapshot, listIds, signal) {
  if (!snapshot) return snapshot

  const missing = [...new Set(listIds.map(String))].filter(
    (id) => id && !snapshot.listMembership.has(id),
  )
  if (missing.length === 0) return snapshot

  const listMembership = new Map(snapshot.listMembership)
  let membershipTruncated = snapshot.membershipTruncated

  for (const listId of missing) {
    if (signal?.aborted) break
    const { ids, truncated } = await fetchAllListContactIds(listId, { signal })
    listMembership.set(listId, ids)
    if (truncated) membershipTruncated = true
  }

  return { ...snapshot, listMembership, membershipTruncated }
}
