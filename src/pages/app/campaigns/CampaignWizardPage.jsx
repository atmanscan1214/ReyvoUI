import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Mail as MailIcon, Send } from '../../../components/icons'
import { CheckboxField, SelectField, TextField, TextareaField } from '../../../components/Field'
import {
  Badge,
  Button,
  EmptyState,
  ErrorPanel,
  PageHeader,
  Skeleton,
  StatusBadge,
  Stepper,
  useToast,
} from '../../../components/ui'
import { useSession } from '../../../lib/session'
import { usePageTitle } from '../../../lib/usePageTitle'
import {
  createCampaign,
  generateCampaignDraft,
  getAiDraftUsage,
  getCampaignPreflight,
  previewCampaign,
  readAiDraftSettings,
  writeAiDraftSettings,
} from '../../../lib/campaigns'
import {
  accountStatusMeta,
  listEmailAccounts,
  providerLabel,
  testEmailAccount,
} from '../../../lib/emailAccounts'
import { clearPendingAudience } from '../../../lib/audience'
import {
  RECENT_CONTACT_DAYS,
  computeExclusions,
  loadAudienceContacts,
  loadAudienceOptions,
  loadEnrolledContactIds,
  loadSuppressionEmails,
  splitMailboxes,
  summarizeEstimate,
} from '../../../lib/wizard'
import { detectTimezone, groupedTimezones } from '../../../lib/timezones'
import './wizard.css'

const WIZARD_STEPS = [
  { label: 'Audience', description: 'Who receives the sequence' },
  { label: 'Mailboxes', description: 'Where sends come from' },
  { label: 'Sequence', description: 'Built with the sequence editor' },
  { label: 'Schedule', description: 'Sending window and days' },
  { label: 'Review', description: 'Preflight and approval' },
]

const EXCLUSION_LABELS = {
  suppressed: `Suppressed`,
  noEmail: 'No email address',
  alreadyEnrolled: 'Already enrolled',
  recentlyContacted: `Contacted in the last ${RECENT_CONTACT_DAYS} days`,
}

const SEED_STEP = {
  subject: 'A quick note for {{first_name}}',
  body:
    '<p>Hi {{first_name}},</p><p>(This is a placeholder first step — rewrite it in the sequence editor before this campaign is approved.)</p>',
}

const MERGE_FIELDS = [
  'first_name',
  'last_name',
  'company',
  'job_title',
  'email',
  'phone',
  'city',
  'state',
  'country',
  'website',
]

const WEEKDAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat']
const DEFAULT_SCHEDULE = {
  timezone: detectTimezone(),
  sendDays: ['mon', 'tue', 'wed', 'thu', 'fri'],
  localWindowStart: 9,
  localWindowEnd: 17,
  timezoneStrategy: 'workspace',
  skipHolidays: true,
}

function workspaceSchedule(tenant) {
  const defaults = tenant?.settings?.default_sending_window ?? {}
  const localWindow = defaults.local_window ?? {}
  const sendDays = Array.isArray(defaults.send_days) ? defaults.send_days : null

  return {
    ...DEFAULT_SCHEDULE,
    timezone: tenant?.timezone || DEFAULT_SCHEDULE.timezone,
    localWindowStart: Number(localWindow.start ?? DEFAULT_SCHEDULE.localWindowStart),
    localWindowEnd: Number(localWindow.end ?? DEFAULT_SCHEDULE.localWindowEnd),
    sendDays: sendDays?.length ? sendDays : DEFAULT_SCHEDULE.sendDays,
  }
}

function toTimeZoneParts(date, timeZone) {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  })

  const values = Object.fromEntries(
    formatter.formatToParts(date).filter((part) => part.type !== 'literal').map((part) => [part.type, part.value]),
  )

  return {
    year: Number(values.year),
    month: Number(values.month),
    day: Number(values.day),
    hour: Number(values.hour),
    minute: Number(values.minute),
    second: Number(values.second),
  }
}

function getTimeZoneOffsetMs(date, timeZone) {
  const utcMs = new Date(date.toLocaleString('en-US', { timeZone: 'UTC' })).getTime()
  const zonedMs = new Date(date.toLocaleString('en-US', { timeZone })).getTime()
  return zonedMs - utcMs
}

function zonedTimeToUtc({ year, month, day, hour, minute }, timeZone) {
  const guess = new Date(Date.UTC(year, month - 1, day, hour, minute, 0))
  const offsetMs = getTimeZoneOffsetMs(guess, timeZone)
  return new Date(guess.getTime() - offsetMs)
}

function formatZonedDate(date, timeZone) {
  return new Intl.DateTimeFormat('en-US', {
    timeZone,
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(date)
}

function getNextSendPreview(schedule) {
  if (!schedule?.timezone || !schedule.sendDays?.length) return 'Select a timezone and at least one send day.'

  const zone = schedule.timezone
  const activeDays = new Set(schedule.sendDays)
  const today = new Date()
  const searchStart = new Date(today)
  searchStart.setHours(0, 0, 0, 0)

  for (let offset = 0; offset < 21; offset += 1) {
    const candidateDate = new Date(searchStart)
    candidateDate.setDate(searchStart.getDate() + offset)
    const zoned = toTimeZoneParts(candidateDate, zone)
    const weekday = new Date(Date.UTC(zoned.year, zoned.month - 1, zoned.day)).getUTCDay()
    const key = WEEKDAY_KEYS[weekday]
    if (!activeDays.has(key)) continue

    const scheduled = zonedTimeToUtc({
      year: zoned.year,
      month: zoned.month,
      day: zoned.day,
      hour: Number(schedule.localWindowStart ?? 9),
      minute: 0,
    }, zone)

    if (scheduled.getTime() > Date.now()) {
      return `${formatZonedDate(scheduled, zone)} (${zone})`
    }
  }

  const firstAvailable = [...activeDays].sort((a, b) => WEEKDAY_KEYS.indexOf(a) - WEEKDAY_KEYS.indexOf(b))[0]
  const fallbackDate = new Date(searchStart)
  fallbackDate.setDate(searchStart.getDate() + ((WEEKDAY_KEYS.indexOf(firstAvailable) - searchStart.getUTCDay()) + 7) % 7 + 7)
  const zoned = toTimeZoneParts(fallbackDate, zone)
  const scheduled = zonedTimeToUtc({
    year: zoned.year,
    month: zoned.month,
    day: zoned.day,
    hour: Number(schedule.localWindowStart ?? 9),
    minute: 0,
  }, zone)

  return `${formatZonedDate(scheduled, zone)} (${zone})`
}

function buildSequenceSteps() {
  return [
    {
      id: 'step-1',
      delayBusinessDays: 0,
      subject: SEED_STEP.subject,
      body: SEED_STEP.body,
    },
  ]
}

function stripHtml(value = '') {
  return String(value)
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<\/?p>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/\s+/g, ' ')
    .trim()
}

function listMergeTokens(value = '') {
  const matches = [...String(value).matchAll(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g)]
  return matches.map((match) => match[1])
}

function validateSequenceSteps(steps) {
  const issues = []
  const unknown = []

  steps.forEach((step, index) => {
    const localSubject = String(step.subject ?? '').trim()
    const localBody = stripHtml(step.body ?? '')
    const tokens = [...new Set(listMergeTokens(`${step.subject ?? ''} ${step.body ?? ''}`))]

    tokens.forEach((token) => {
      if (!MERGE_FIELDS.includes(token)) {
        unknown.push({ step: index + 1, token })
      }
    })

    if (!localSubject) {
      issues.push(`Step ${index + 1} needs a subject line.`)
    }
    if (!localBody) {
      issues.push(`Step ${index + 1} needs body copy.`)
    }
  })

  if (unknown.length > 0) {
    const names = unknown.map(({ token }) => `{{${token}}}`).join(', ')
    issues.push(`Unknown merge field${unknown.length > 1 ? 's' : ''}: ${names}.`)
  }

  return {
    ok: issues.length === 0,
    issues,
  }
}

function renderMergeTemplate(template, contact) {
  const base = contact ?? {}
  const values = {
    first_name: base.firstName ?? base.first_name ?? 'there',
    last_name: base.lastName ?? base.last_name ?? '',
    company: base.company ?? 'your company',
    job_title: base.jobTitle ?? base.job_title ?? 'team lead',
    email: base.email ?? 'person@example.com',
    phone: base.phone ?? '',
    city: base.city ?? '',
    state: base.state ?? '',
    country: base.country ?? '',
    website: base.website ?? '',
  }

  return String(template ?? '').replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_, key) => {
    const value = values[key]
    return value == null || value === '' ? '' : String(value)
  })
}

function buildLocalPreflight({ name, selectedOption, audience, exclusions, selectedMailboxes, sequenceSteps, schedule }) {
  const errors = []
  const warnings = []
  const validSequence = validateSequenceSteps(sequenceSteps)

  if (!String(name ?? '').trim()) {
    errors.push('Give the campaign a name.')
  }
  if (!selectedOption) {
    errors.push('Choose an audience.')
  }
  if (!selectedMailboxes?.length) {
    errors.push('Select at least one healthy inbox.')
  }
  if (audience && (audience.total ?? 0) === 0) {
    errors.push('This audience matches no contacts.')
  }
  if (!validSequence.ok) {
    validSequence.issues.forEach((issue) => errors.push(issue))
  }
  if (!schedule?.timezone || !schedule.sendDays?.length) {
    errors.push('Set a timezone and at least one sending day.')
  }
  if (exclusions && (exclusions.excludedCount ?? 0) > 0) {
    warnings.push(`${(exclusions.excludedCount ?? 0).toLocaleString()} contacts are excluded from this send plan.`)
  }

  return {
    ok: errors.length === 0,
    errors,
    warnings,
    audience_size: audience?.total ?? 0,
    sendable: Math.max((audience?.total ?? 0) - (exclusions?.excludedCount ?? 0), 0),
    sending_accounts: selectedMailboxes?.length ?? 0,
  }
}

/**
 * Campaign wizard, steps 1–2 (T21).
 *
 * The audience step reuses the lists/segments contract from the Lists page and
 * composes included/excluded/estimated-send counts in the browser (the API has
 * no audience-exclusion endpoint). The mailbox step picks healthy inboxes and
 * the estimate reacts to their combined daily caps. The sequence, schedule, and
 * review steps arrive with the next tasks, so they render locked. Finishing
 * here seeds the draft with a placeholder first step that the sequence editor
 * replaces.
 */
export function CampaignWizardPage() {
  usePageTitle('New campaign')
  const { toast } = useToast()
  const navigate = useNavigate()
  const { role, profileStatus, tenantDetails, tenantStatus } = useSession()

  const roleKnown = profileStatus === 'ready'
  const canWrite = roleKnown && (role === 'owner' || role === 'admin')

  const [step, setStep] = useState(0)
  const [name, setName] = useState('')
  const [nameError, setNameError] = useState(null)

  const [options, setOptions] = useState(null)
  const [optionsError, setOptionsError] = useState(null)
  const [selectedKey, setSelectedKey] = useState(null)

  const [audience, setAudience] = useState(null) // { contacts, total, truncated, source }
  const [audienceError, setAudienceError] = useState(null)
  const [audienceLoading, setAudienceLoading] = useState(false)

  const [exclusions, setExclusions] = useState(null)
  const [exclusionNote, setExclusionNote] = useState(null)

  const [mailboxes, setMailboxes] = useState(null)
  const [mailboxError, setMailboxError] = useState(null)
  const [selectedMailboxes, setSelectedMailboxes] = useState([])
  const [sequenceSteps, setSequenceSteps] = useState(() => buildSequenceSteps())
  const [schedule, setSchedule] = useState(DEFAULT_SCHEDULE)
  const [dailyCap, setDailyCap] = useState('200')
  const [sequenceError, setSequenceError] = useState(null)

  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState(null)
  const [draftCampaignId, setDraftCampaignId] = useState(null)
  const [reviewStepIndex, setReviewStepIndex] = useState(0)
  const [preflight, setPreflight] = useState({
    ok: false,
    errors: [],
    warnings: [],
    audience_size: 0,
    sendable: 0,
    sending_accounts: 0,
  })
  const [preflightLoading, setPreflightLoading] = useState(false)
  const [preview, setPreview] = useState(null)
  const [previewLoading, setPreviewLoading] = useState(false)
  const [previewError, setPreviewError] = useState(null)
  const [testResult, setTestResult] = useState('')
  const [testError, setTestError] = useState('')
  const [testSending, setTestSending] = useState(false)

  const optionsAbort = useRef(null)
  const audienceAbort = useRef(null)
  const suppressAbort = useRef(null)
  const scheduleTouched = useRef(false)
  const dailyCapTouched = useRef(false)

  useEffect(() => {
    if (tenantStatus !== 'ready' || !tenantDetails) return
    if (!scheduleTouched.current) setSchedule(workspaceSchedule(tenantDetails))
    if (!dailyCapTouched.current) {
      setDailyCap(String(tenantDetails.settings?.default_daily_cap ?? 200))
    }
  }, [tenantDetails, tenantStatus])

  function updateSchedule(update) {
    scheduleTouched.current = true
    setSchedule(update)
  }

  // Audience options + the pending pick from the Lists page.
  useEffect(() => {
    if (!canWrite) return
    const controller = new AbortController()
    optionsAbort.current = controller
    setOptionsError(null)

    loadAudienceOptions(controller.signal)
      .then((data) => {
        setOptions(data)
        const pendingKey = data.pending ? `${data.pending.type}:${data.pending.id}` : null
        const pendingExists =
          data.pending &&
          [...data.lists, ...data.segments].some((option) => option.key === pendingKey)
        setSelectedKey(pendingExists ? pendingKey : null)
      })
      .catch((caught) => {
        if (caught?.name === 'AbortError') return
        setOptionsError(caught)
      })

    return () => controller.abort()
  }, [canWrite])

  // Audience materialization whenever the selection changes.
  useEffect(() => {
    if (!canWrite || !selectedKey || !options) {
      setAudience(null)
      setAudienceError(null)
      return undefined
    }
    const option = [...options.lists, ...options.segments].find((entry) => entry.key === selectedKey)
    if (!option) {
      setAudience(null)
      return undefined
    }

    audienceAbort.current?.abort()
    const controller = new AbortController()
    audienceAbort.current = controller
    setAudienceLoading(true)
    setAudienceError(null)

    loadAudienceContacts(option, controller.signal)
      .then((data) => {
        setAudience(data)
        setAudienceLoading(false)
      })
      .catch((caught) => {
        if (caught?.name === 'AbortError') return
        setAudienceError(caught)
        setAudienceLoading(false)
      })

    return () => controller.abort()
  }, [selectedKey, options, canWrite])

  // Resolved before the preflight effects below, which read it in their
  // dependency arrays during render.
  const selectedOption = options
    ? ([...options.lists, ...options.segments].find((entry) => entry.key === selectedKey) ?? null)
    : null

  // Exclusion inputs (suppressions + cross-campaign enrollments) are
  // audience-independent, so they load once and are reused for every pick.
  useEffect(() => {
    if (!canWrite || !audience?.contacts) return undefined
    const controller = new AbortController()
    suppressAbort.current = controller
    setExclusions(null)
    setExclusionNote(null)

    Promise.all([
      loadSuppressionEmails(controller.signal).catch((caught) => {
        if (caught?.name === 'AbortError') throw caught
        return { error: caught }
      }),
      loadEnrolledContactIds(controller.signal).catch((caught) => {
        if (caught?.name === 'AbortError') throw caught
        return { error: caught }
      }),
    ])
      .then(([suppressions, enrollments]) => {
        if (controller.signal.aborted) return
        const suppressionEmails =
          suppressions instanceof Set ? suppressions : new Set()
        const enrolled = enrollments instanceof Object && enrollments.enrolled instanceof Set
          ? enrollments.enrolled
          : new Set()
        const notes = []
        if (suppressions?.error) notes.push('suppressions could not be loaded')
        if (enrollments?.error) notes.push('enrollments could not be loaded')
        const { breakdown, excludedIds } = computeExclusions(audience.contacts, {
          suppressionEmails,
          enrolledIds: enrolled,
        })
        setExclusions({ breakdown, excludedCount: excludedIds.size })
        setExclusionNote(notes.length ? `Estimate is partial: ${notes.join(' and ')}.` : null)
      })
      .catch((caught) => {
        if (caught?.name === 'AbortError') return
        setExclusions({ breakdown: {}, excludedCount: 0 })
        setExclusionNote('Estimate is partial: exclusions could not be loaded.')
      })

    return () => controller.abort()
  }, [audience?.contacts, canWrite])

  // Mailboxes load with the options; a single cheap GET.
  useEffect(() => {
    if (!canWrite) return
    const controller = new AbortController()
    listEmailAccounts(controller.signal)
      .then((accounts) => setMailboxes(accounts))
      .catch((caught) => {
        if (caught?.name === 'AbortError') return
        setMailboxError(caught)
      })
    return () => controller.abort()
  }, [canWrite])

  useEffect(() => {
    if (!draftCampaignId || step !== 4) return undefined
    const controller = new AbortController()
    setPreflightLoading(true)
    setPreviewError(null)

    getCampaignPreflight(draftCampaignId, controller.signal)
      .then((data) => {
        if (controller.signal.aborted) return
        setPreflight({
          ok: Boolean(data?.ok),
          errors: Array.isArray(data?.errors) ? data.errors : [],
          warnings: Array.isArray(data?.warnings) ? data.warnings : [],
          audience_size: Number(data?.audience_size ?? audience?.total ?? 0),
          sendable: Number(data?.sendable ?? Math.max((audience?.total ?? 0) - (exclusions?.excludedCount ?? 0), 0)),
          sending_accounts: Number(data?.sending_accounts ?? selectedMailboxes.length ?? 0),
        })
      })
      .catch((caught) => {
        if (caught?.name === 'AbortError') return
        setPreflight(buildLocalPreflight({
          name,
          selectedOption,
          audience,
          exclusions,
          selectedMailboxes,
          sequenceSteps,
          schedule,
        }))
      })
      .finally(() => {
        if (!controller.signal.aborted) setPreflightLoading(false)
      })

    return () => controller.abort()
  }, [draftCampaignId, step, name, selectedOption, audience, exclusions, selectedMailboxes, sequenceSteps, schedule])

  useEffect(() => {
    if (!draftCampaignId || step !== 4) return undefined
    const controller = new AbortController()
    const sampleContact = audience?.contacts?.[0] ?? {
      id: 'sample-contact',
      first_name: 'Taylor',
      last_name: 'Reed',
      email: 'taylor@example.com',
      company: 'Northstar Labs',
      job_title: 'VP of Growth',
    }
    const currentStep = sequenceSteps[reviewStepIndex] ?? sequenceSteps[0]

    setPreviewLoading(true)
    setPreviewError(null)
    previewCampaign(
      draftCampaignId,
      {
        contact_id: sampleContact.id,
        step_order: Number((reviewStepIndex || 0) + 1),
      },
      controller.signal,
    )
      .then((item) => {
        if (controller.signal.aborted) return
        setPreview(item)
      })
      .catch((caught) => {
        if (caught?.name === 'AbortError') return
        const rendered = {
          subject: renderMergeTemplate(currentStep?.subject ?? '', sampleContact),
          body_html: renderMergeTemplate(currentStep?.body ?? '', sampleContact),
          body_text: stripHtml(renderMergeTemplate(currentStep?.body ?? '', sampleContact)),
        }
        setPreview(rendered)
        setPreviewError(caught)
      })
      .finally(() => {
        if (!controller.signal.aborted) setPreviewLoading(false)
      })

    return () => controller.abort()
  }, [draftCampaignId, step, reviewStepIndex, sequenceSteps, audience])

  const mailboxSplit = useMemo(
    () => (mailboxes ? splitMailboxes(mailboxes) : { usable: [], blocked: [] }),
    [mailboxes],
  )

  const capacity = useMemo(
    () =>
      selectedMailboxes.reduce((sum, id) => {
        const found = mailboxes?.find((account) => account.id === id)
        return sum + (found ? found.dailyCap : 0)
      }, 0),
    [selectedMailboxes, mailboxes],
  )

  const included = audienceLoading ? 0 : audience?.total ?? 0
  const estimate = useMemo(
    () =>
      summarizeEstimate({
        included,
        excluded: exclusions?.excludedCount ?? 0,
        capacity,
      }),
    [included, exclusions?.excludedCount, capacity],
  )

  function clearPendingBanner() {
    clearPendingAudience()
    setOptions((current) => (current ? { ...current, pending: null } : current))
  }

  function updateSequenceStep(stepId, updater) {
    setSequenceSteps((current) =>
      current.map((step) => (step.id === stepId ? { ...step, ...updater(step) } : step)),
    )
  }

  function addSequenceStep() {
    setSequenceSteps((current) => {
      if (current.length >= 8) return current
      const order = current.length + 1
      return [
        ...current,
        {
          id: `step-${Date.now()}`,
          delayBusinessDays: 0,
          subject: `Follow up about {{company}}`,
          body: `<p>Hi {{first_name}},</p><p>We wanted to follow up on the conversation and share the next step.</p>`,
          insertOrder: order,
        },
      ]
    })
  }

  function removeSequenceStep(stepId) {
    setSequenceSteps((current) => {
      if (current.length <= 1) return current
      return current.filter((step) => step.id !== stepId)
    })
  }

  function insertMergeField(stepId, field, token) {
    const textarea = document.getElementById(`${stepId}-${field}`)
    const snippet = `{{${token}}}`

    updateSequenceStep(stepId, (step) => {
      const currentValue = String(step[field] ?? '')
      const valueToInsert = textarea && textarea.selectionStart != null
        ? `${currentValue.slice(0, textarea.selectionStart)}${snippet}${currentValue.slice(textarea.selectionEnd ?? textarea.selectionStart)}`
        : `${currentValue}${currentValue && !currentValue.endsWith(' ') ? ' ' : ''}${snippet}`

      return {
        ...step,
        [field]: valueToInsert,
      }
    })

    requestAnimationFrame(() => {
      const nextTextarea = document.getElementById(`${stepId}-${field}`)
      if (nextTextarea) {
        const end = nextTextarea.value.length
        nextTextarea.focus()
        nextTextarea.setSelectionRange(end, end)
      }
    })
  }

  function goToMailboxes() {
    const trimmed = name.trim()
    if (trimmed.length < 2 || trimmed.length > 255) {
      setNameError('Give the campaign a name of 2–255 characters.')
      return
    }
    setNameError(null)
    if (!selectedKey) {
      toast.error('Choose a list or a saved segment first.')
      return
    }
    if (!audienceLoading && included === 0) {
      toast.error('This audience matches no contacts, so there is nothing to send to.')
      return
    }
    setStep(1)
  }

  async function handleCreate() {
    if (selectedMailboxes.length === 0) {
      toast.error('Select at least one healthy inbox.')
      return
    }
    if (!selectedOption) return

    const validation = validateSequenceSteps(sequenceSteps)
    if (!validation.ok) {
      setSequenceError(validation.issues.join(' '))
      setStep(2)
      toast.error(validation.issues[0])
      return
    }

    if (!schedule.timezone || !schedule.sendDays.length) {
      toast.error('Choose a timezone and at least one send day.')
      setStep(3)
      return
    }
    if (Number(schedule.localWindowStart) >= Number(schedule.localWindowEnd)) {
      toast.error('The sending window end must be after its start.')
      setStep(3)
      return
    }

    const cap = Number(dailyCap)
    if (!Number.isInteger(cap) || cap < 1 || cap > 2_000) {
      toast.error('Choose a campaign daily cap between 1 and 2,000.')
      setStep(3)
      return
    }

    setCreating(true)
    setCreateError(null)
    setSequenceError(null)
    try {
      const created = await createCampaign({
        name: name.trim(),
        audienceType: selectedOption.type,
        audienceId: selectedOption.type === 'list' ? selectedOption.id : undefined,
        contactIds:
          selectedOption.type === 'segment'
            ? audience?.contacts.map((contact) => contact.id) ?? []
            : [],
        emailAccountIds: selectedMailboxes,
        timezone: schedule.timezone,
        dailyCap: cap,
        sendingWindow: {
          timezone: schedule.timezone,
          timezone_strategy: schedule.timezoneStrategy,
          local_window: {
            start: Number(schedule.localWindowStart ?? 9),
            end: Number(schedule.localWindowEnd ?? 17),
          },
          send_days: [...schedule.sendDays],
          skip_holidays: Boolean(schedule.skipHolidays),
        },
        steps: sequenceSteps.map((step, index) => ({
          step_order: index + 1,
          delay_business_days: Number(step.delayBusinessDays ?? 0),
          subject_template: step.subject,
          body_html_template: step.body,
          ai_generated: Boolean(step.aiGenerated),
        })),
      })
      setDraftCampaignId(created?.id ?? null)
      clearPendingAudience()
      toast.success(`${name.trim()} was created as a draft. Review the preflight checks before launch.`)
      setStep(4)
    } catch (caught) {
      setCreateError(caught?.message || 'The campaign could not be created.')
      setCreating(false)
    } finally {
      setCreating(false)
    }
  }

  if (roleKnown && !canWrite) {
    return (
      <div className="app-page">
        <PageHeader
          eyebrow="Growth · Campaigns"
          title="New campaign"
          description="Only owners and admins build campaigns."
        />
        <EmptyState
          icon={Send}
          title="Ask an owner or admin"
          description="Your role can view campaigns but not create them. Ask an owner or admin to set up this campaign, or review existing ones on the campaign list."
          actions={
            <Link className="btn btn--ghost btn--sm" to="/app/campaigns">
              Back to campaigns
            </Link>
          }
        />
      </div>
    )
  }

  const estimateReady = !audienceLoading && Boolean(exclusions) && Boolean(audience)

  return (
    <div className="app-page wizard-page">
      <PageHeader
        eyebrow="Growth · Campaigns"
        title="New campaign"
        description="Pick who the sequence reaches and which inboxes send it. The sequence editor, schedule, and review steps come next."
        meta={
          <Badge tone="outline">
            Step {step + 1} of {WIZARD_STEPS.length}
          </Badge>
        }
      />

      <Stepper
        steps={WIZARD_STEPS}
        current={step}
        onStepChange={(next) => {
          if (next <= 4) setStep(next)
        }}
        label="Campaign wizard progress"
      />

      {step === 0 ? (
        <AudienceStep
          options={options}
          optionsError={optionsError}
          selectedKey={selectedKey}
          onSelect={(key) => setSelectedKey(key)}
          onClearPending={clearPendingBanner}
          audience={audience}
          audienceLoading={audienceLoading}
          audienceError={audienceError}
          exclusions={exclusions}
          exclusionNote={exclusionNote}
          estimate={estimate}
          estimateReady={estimateReady}
          name={name}
          nameError={nameError}
          onNameChange={(value) => {
            setName(value)
            if (nameError) setNameError(null)
          }}
          onNext={goToMailboxes}
        />
      ) : step === 1 ? (
        <MailboxStep
          split={mailboxSplit}
          mailboxes={mailboxes}
          mailboxError={mailboxError}
          selected={selectedMailboxes}
          onToggle={(id) =>
            setSelectedMailboxes((current) =>
              current.includes(id)
                ? current.filter((entry) => entry !== id)
                : [...current, id],
            )
          }
          capacity={capacity}
          estimate={estimate}
          estimateReady={estimateReady}
          included={included}
          excluded={exclusions?.excludedCount ?? 0}
          audienceSource={audience?.source}
          audienceTruncated={audience?.truncated}
          selectedOption={selectedOption}
          name={name}
          onBack={() => setStep(0)}
          onNext={() => {
            if (selectedMailboxes.length === 0) {
              toast.error('Select at least one healthy inbox.')
              return
            }
            setStep(2)
          }}
          creating={creating}
          createError={createError}
        />
      ) : step === 2 ? (
        <SequenceStep
          steps={sequenceSteps}
          onChange={setSequenceSteps}
          onAdd={addSequenceStep}
          onRemove={removeSequenceStep}
          onInsert={insertMergeField}
          onBack={() => setStep(1)}
          onNext={() => {
            const validation = validateSequenceSteps(sequenceSteps)
            if (!validation.ok) {
              setSequenceError(validation.issues.join(' '))
              toast.error(validation.issues[0])
              return
            }
            setSequenceError(null)
            setStep(3)
          }}
          creating={creating}
          createError={createError}
          sequenceError={sequenceError}
          workspaceAiEnabled={tenantDetails?.settings?.ai_drafting_enabled !== false}
          workspaceAiReady={tenantStatus === 'ready'}
        />
      ) : step === 3 ? (
        <ScheduleStep
          schedule={schedule}
          onChange={updateSchedule}
          dailyCap={dailyCap}
          onDailyCapChange={(value) => {
            dailyCapTouched.current = true
            setDailyCap(value)
          }}
          onBack={() => setStep(2)}
          onCreate={handleCreate}
          creating={creating}
          createError={createError}
        />
      ) : (
        <ReviewStep
          name={name}
          audience={audience}
          selectedMailboxes={selectedMailboxes}
          mailboxes={mailboxes}
          sequenceSteps={sequenceSteps}
          schedule={schedule}
          preflight={preflight}
          preflightLoading={preflightLoading}
          preview={preview}
          previewLoading={previewLoading}
          previewError={previewError}
          onBack={() => setStep(3)}
          onFinish={() => {
            if (!preflight.ok) {
              toast.error(preflight.errors[0] || 'Fix the blocking preflight items before launch.')
              return
            }
            toast.success(`${name.trim() || 'Campaign'} passed preflight and is ready to launch.`)
            navigate('/app/campaigns')
          }}
          onTestSend={async () => {
            const mailboxId = selectedMailboxes[0]
            const sampleContact = audience?.contacts?.[0] ?? {
              first_name: 'Taylor',
              last_name: 'Reed',
              email: 'taylor@example.com',
            }
            const selectedStep = sequenceSteps[reviewStepIndex] ?? sequenceSteps[0]
            if (!mailboxId) {
              setTestError('Select at least one healthy inbox before sending a test.')
              return
            }
            setTestSending(true)
            setTestError('')
            setTestResult('')
            try {
              const subject = renderMergeTemplate(selectedStep.subject ?? '', sampleContact)
              const message = stripHtml(renderMergeTemplate(selectedStep.body ?? '', sampleContact))
              const result = await testEmailAccount(mailboxId, {
                to_email: sampleContact.email || 'taylor@example.com',
                subject,
                message,
              })
              setTestResult(result?.message || 'The test email was accepted.')
            } catch (caught) {
              setTestError(caught?.message || 'The test email could not be sent.')
            } finally {
              setTestSending(false)
            }
          }}
          testSending={testSending}
          testResult={testResult}
          testError={testError}
          reviewStepIndex={reviewStepIndex}
          onStepChange={setReviewStepIndex}
          createError={createError}
        />
      )}
    </div>
  )
}

/* ------------------------------------------------------------------------- */
/* Step 1 — audience                                                          */
/* ------------------------------------------------------------------------- */

function AudienceStep({
  options,
  optionsError,
  selectedKey,
  onSelect,
  onClearPending,
  audience,
  audienceLoading,
  audienceError,
  exclusions,
  exclusionNote,
  estimate,
  estimateReady,
  name,
  nameError,
  onNameChange,
  onNext,
}) {
  return (
    <>
      <div className="app-card wizard__panel">
        <h2 className="wizard__panel-title">Campaign name</h2>
        <TextField
          id="wizard-name"
          label="Name"
          value={name}
          maxLength={255}
          error={nameError}
          hint="Shown across lists, stats, and the audit log. You can rename it later."
          onChange={(event) => onNameChange(event.target.value)}
        />
      </div>

      <div className="app-card wizard__panel">
        <h2 className="wizard__panel-title">Audience</h2>
        <p className="wizard__panel-copy">
          Choose one static list or one saved segment. Lists and segments are managed on{' '}
          <Link to="/app/lists" className="wizard__link">
            Lists &amp; segments
          </Link>
          .
        </p>

        {options?.pending ? (
          <div className="wizard__pending" role="status">
            <div>
              <strong>{options.pending.name}</strong>
              <span className="wizard__pending-meta">
                {options.pending.typeLabel} · handed over from Lists &amp; segments
                {Number(options.pending.count) > 0
                  ? ` · ${Number(options.pending.count).toLocaleString()} contacts`
                  : ''}
              </span>
            </div>
            <div className="wizard__pending-actions">
              <Button
                size="sm"
                variant={selectedKey === `${options.pending.type}:${options.pending.id}` ? 'primary' : 'secondary'}
                onClick={() =>
                  onSelect(`${options.pending.type}:${options.pending.id}`)
                }
              >
                {selectedKey === `${options.pending.type}:${options.pending.id}`
                  ? 'Selected'
                  : 'Use this audience'}
              </Button>
              <Button size="sm" variant="ghost" onClick={onClearPending}>
                Dismiss
              </Button>
            </div>
          </div>
        ) : null}

        {optionsError ? (
          <ErrorPanel
            title="Couldn’t load the audiences"
            description={optionsError?.message || undefined}
            requestId={optionsError?.requestId}
          />
        ) : !options ? (
          <div className="wizard__options">
            <Skeleton lines={3} />
            <Skeleton lines={3} />
          </div>
        ) : (
          <>
            <AudienceGroup
              label="Static lists"
              items={options.lists}
              selectedKey={selectedKey}
              onSelect={onSelect}
              emptyText="No lists yet. Create one on Lists & segments and come back."
            />
            <AudienceGroup
              label="Saved segments"
              items={options.segments}
              selectedKey={selectedKey}
              onSelect={onSelect}
              emptyText="No saved segments yet. Save one from the segment builder first."
            />
          </>
        )}
      </div>

      <EstimatePanel
        audience={audience}
        audienceLoading={audienceLoading}
        audienceError={audienceError}
        selected={Boolean(selectedKey)}
        exclusions={exclusions}
        exclusionNote={exclusionNote}
        estimate={estimate}
        estimateReady={estimateReady}
      />

      <div className="wizard__footer">
        <span className="wizard__footer-note">
          The sequence editor, schedule, and review steps follow after the audience and mailboxes.
        </span>
        <Button variant="primary" onClick={onNext}>
          Continue to mailboxes
        </Button>
      </div>
    </>
  )
}

function AudienceGroup({ label, items, selectedKey, onSelect, emptyText }) {
  return (
    <div className="wizard__group">
      <h3 className="wizard__group-label">{label}</h3>
      {items.length === 0 ? (
        <p className="wizard__group-empty">{emptyText}</p>
      ) : (
        <div className="wizard__options" role="radiogroup" aria-label={label}>
          {items.map((option) => {
            const active = selectedKey === option.key
            return (
              <button
                key={option.key}
                type="button"
                role="radio"
                aria-checked={active}
                className={`wizard__option${active ? ' is-active' : ''}`}
                onClick={() => onSelect(option.key)}
              >
                <span className="wizard__option-copy">
                  <strong>{option.name}</strong>
                  {option.description ? <span>{option.description}</span> : null}
                </span>
                <span className="wizard__option-meta">
                  {option.type === 'segment' ? 'Saved segment' : 'Static list'}
                  {option.type === 'list' && Number(option.count) >= 0
                    ? ` · ${Number(option.count).toLocaleString()} contacts`
                    : ''}
                </span>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

/* ------------------------------------------------------------------------- */
/* Estimate panel                                                             */
/* ------------------------------------------------------------------------- */

function EstimatePanel({
  audience,
  audienceLoading,
  audienceError,
  selected,
  exclusions,
  exclusionNote,
  estimate,
  estimateReady,
}) {
  if (!selected) {
    return (
      <div className="app-card wizard__estimate" data-state="idle">
        <h2 className="wizard__panel-title">Estimated sends</h2>
        <p className="wizard__panel-copy">
          Pick an audience to see included contacts, exclusions, and the estimated send count.
        </p>
      </div>
    )
  }

  if (audienceLoading) {
    return (
      <div className="app-card wizard__estimate" data-state="loading">
        <h2 className="wizard__panel-title">Estimated sends</h2>
        <Skeleton lines={4} />
      </div>
    )
  }

  if (audienceError) {
    return (
      <div className="app-card wizard__estimate" data-state="error">
        <h2 className="wizard__panel-title">Estimated sends</h2>
        <ErrorPanel
          compact
          title="Couldn’t build the estimate"
          description={audienceError?.message || undefined}
        />
      </div>
    )
  }

  const breakdown = exclusions?.breakdown ?? {}
  const rows = Object.entries(EXCLUSION_LABELS).filter(([key]) => breakdown[key] > 0)

  return (
    <div className="app-card wizard__estimate" data-state={estimateReady ? 'ready' : 'loading'}>
      <div className="wizard__estimate-head">
        <h2 className="wizard__panel-title">Estimated sends</h2>
        <span className="wizard__estimate-total">
          {estimateReady ? estimate.estimatedSends.toLocaleString() : '···'}
        </span>
      </div>
      <dl className="wizard__stats">
        <div>
          <dt>Included</dt>
          <dd>
            {(audience?.total ?? 0).toLocaleString()}
            {audience?.truncated ? <span className="wizard__stat-note"> (estimate)</span> : null}
          </dd>
        </div>
        <div>
          <dt>Excluded</dt>
          <dd>{(exclusions?.excludedCount ?? 0).toLocaleString()}</dd>
        </div>
        <div>
          <dt>Estimated sends</dt>
          <dd>{estimateReady ? estimate.estimatedSends.toLocaleString() : '···'}</dd>
        </div>
      </dl>

      {rows.length > 0 ? (
        <ul className="wizard__exclusions">
          {rows.map(([key, label]) => (
            <li key={key}>
              <span>{label}</span>
              <strong>{breakdown[key].toLocaleString()}</strong>
            </li>
          ))}
        </ul>
      ) : (
        <p className="wizard__exclusions-empty">
          {estimateReady
            ? 'No exclusions in this audience right now.'
            : 'Counting exclusions…'}
        </p>
      )}
      {exclusionNote ? <p className="wizard__stat-note">{exclusionNote}</p> : null}
    </div>
  )
}

/* ------------------------------------------------------------------------- */
/* Step 2 — mailboxes                                                         */
/* ------------------------------------------------------------------------- */

function MailboxStep({
  split,
  mailboxes,
  mailboxError,
  selected,
  onToggle,
  capacity,
  estimate,
  estimateReady,
  included,
  excluded,
  audienceSource,
  audienceTruncated,
  selectedOption,
  name,
  onBack,
  onNext,
  creating,
  createError,
}) {
  return (
    <>
      <div className="app-card wizard__panel">
        <h2 className="wizard__panel-title">Sending mailboxes</h2>
        <p className="wizard__panel-copy">
          Pick one or more healthy inboxes. Sends spread across them; the campaign pauses if every
          selected inbox loses access.
        </p>

        {mailboxError ? (
          <ErrorPanel
            title="Couldn’t load the mailboxes"
            description={mailboxError?.message || undefined}
            requestId={mailboxError?.requestId}
          />
        ) : !mailboxes ? (
          <Skeleton lines={4} />
        ) : (
          <>
            {split.usable.length === 0 ? (
              <EmptyState
                compact
                icon={MailIcon}
                title="No usable inboxes yet"
                description="Connect a healthy mailbox first — the wizard can only send from inboxes whose latest health check passed."
                actions={
                  <Link className="btn btn--ghost btn--sm" to="/app/mailboxes">
                    Go to mailboxes
                  </Link>
                }
              />
            ) : (
              <div className="wizard__mailboxes" role="group" aria-label="Healthy inboxes">
                {split.usable.map(({ account, warning }) => {
                  const active = selected.includes(account.id)
                  const statusMeta = accountStatusMeta(account.status)
                  return (
                    <button
                      key={account.id}
                      type="button"
                      role="checkbox"
                      aria-checked={active}
                      className={`wizard__mailbox${active ? ' is-active' : ''}`}
                      onClick={() => onToggle(account.id)}
                    >
                      <div className="wizard__mailbox-head">
                        <strong>{account.email}</strong>
                        <StatusBadge status={account.status} />
                      </div>
                      <span className="wizard__mailbox-meta">
                        {providerLabel(account.provider)} · {account.dailyCap.toLocaleString()}/day ·{' '}
                        {account.hourlyCap.toLocaleString()}/hour · warm-up stage{' '}
                        {account.rampStage}
                      </span>
                      {warning ? (
                        <span className="wizard__mailbox-warning">{statusMeta.description}</span>
                      ) : null}
                    </button>
                  )
                })}
              </div>
            )}

            {split.blocked.length > 0 ? (
              <div className="wizard__blocked">
                <h3 className="wizard__group-label">Not usable right now</h3>
                <ul>
                  {split.blocked.map((account) => (
                    <li key={account.id}>
                      <strong>{account.email}</strong>
                      <span>
                        {accountStatusMeta(account.status).label} —{' '}
                        {accountStatusMeta(account.status).description}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </>
        )}
      </div>

      <div className="app-card wizard__estimate" data-state={estimateReady ? 'ready' : 'loading'}>
        <div className="wizard__estimate-head">
          <h2 className="wizard__panel-title">Send plan</h2>
          <span className="wizard__estimate-total">
            {estimateReady ? `${estimate.estimatedSends.toLocaleString()} sends` : '···'}
          </span>
        </div>
        <dl className="wizard__stats">
          <div>
            <dt>Audience</dt>
            <dd>{included.toLocaleString()}{audienceTruncated ? <span className="wizard__stat-note"> (estimate)</span> : null}</dd>
          </div>
          <div>
            <dt>Excluded</dt>
            <dd>{excluded.toLocaleString()}</dd>
          </div>
          <div>
            <dt>Daily capacity</dt>
            <dd>{capacity > 0 ? `${capacity.toLocaleString()}/day` : '—'}</dd>
          </div>
          <div>
            <dt>First-day sends</dt>
            <dd>
              {estimateReady && capacity > 0
                ? estimate.firstDaySends.toLocaleString()
                : '—'}
            </dd>
          </div>
          <div>
            <dt>First pass takes</dt>
            <dd>{estimateReady && estimate.daysToComplete ? `≈ ${estimate.daysToComplete} day${estimate.daysToComplete === 1 ? '' : 's'}` : '—'}</dd>
          </div>
        </dl>
        {capacity === 0 ? (
          <p className="wizard__stat-note">
            Select at least one inbox to see the per-day plan.
          </p>
        ) : (
          <p className="wizard__stat-note">
            The first pass sends about {estimate.firstDaySends.toLocaleString()} messages on day one
            and finishes the audience in about {estimate.daysToComplete} business day
            {estimate.daysToComplete === 1 ? '' : 's'} at the selected inboxes’ combined caps.
          </p>
        )}
      </div>

      <div className="app-card wizard__summary">
        <h2 className="wizard__panel-title">Draft summary</h2>
        <dl className="wizard__stats">
          <div>
            <dt>Campaign</dt>
            <dd>{name || 'Untitled draft'}</dd>
          </div>
          <div>
            <dt>Audience</dt>
            <dd>
              {selectedOption
                ? `${selectedOption.name} (${selectedOption.type === 'list' ? 'static list' : 'saved segment'})`
                : '—'}
            </dd>
          </div>
          <div>
            <dt>Mailboxes</dt>
            <dd>
              {selected.length > 0
                ? `${selected.length} selected · ${capacity.toLocaleString()}/day combined`
                : '—'}
            </dd>
          </div>
          <div>
            <dt>First step</dt>
            <dd>Placeholder — rewritten by the sequence editor before approval</dd>
          </div>
        </dl>
        {audienceSource === 'segment' && audienceTruncated ? (
          <p className="wizard__stat-note">
            The segment count was evaluated against a capped contact snapshot, so the enrollment
            audience may differ slightly at launch.
          </p>
        ) : null}
        {createError ? (
          <p className="wizard__error" role="alert">
            {createError}
          </p>
        ) : null}
        <div className="wizard__footer wizard__footer--inpanel">
          <Button variant="ghost" onClick={onBack} disabled={creating}>
            Back to audience
          </Button>
          <Button
            variant="primary"
            leadingIcon={Send}
            onClick={onNext}
            disabled={mailboxes ? split.usable.length === 0 : true}
          >
            Continue to sequence
          </Button>
        </div>
      </div>
    </>
  )
}

function SequenceStep({
  steps,
  onChange,
  onAdd,
  onRemove,
  onInsert,
  onBack,
  onNext,
  creating,
  createError,
  sequenceError,
  workspaceAiEnabled,
  workspaceAiReady,
}) {
  const validation = validateSequenceSteps(steps)
  const [aiSettings, setAiSettings] = useState(() => readAiDraftSettings())
  const [aiInstructions, setAiInstructions] = useState({})
  const [aiDrafts, setAiDrafts] = useState({})
  const [aiBusy, setAiBusy] = useState({})
  const [aiRejectReason, setAiRejectReason] = useState({})

  function updateStep(stepId, field, value) {
    onChange((current) =>
      current.map((step) =>
        step.id === stepId
          ? { ...step, [field]: value }
          : step,
      ),
    )
  }

  const aiEnabled = workspaceAiReady && workspaceAiEnabled && aiSettings.enabled

  async function handleGenerate(step) {
    if (!aiEnabled) {
      setAiDrafts((current) => ({
        ...current,
        [step.id]: {
          status: 'disabled',
          message: 'AI drafting is off for this workspace. Turn it back on to generate copy.',
          bannedClaims: [],
          subject: step.subject ?? '',
          body: step.body ?? '',
          usedFields: [],
          assumptions: [],
          warnings: [],
        },
      }))
      return
    }

    const usage = getAiDraftUsage()
    if (usage.used >= usage.quota) {
      setAiDrafts((current) => ({
        ...current,
        [step.id]: {
          status: 'error',
          message: 'AI quota reached for this workspace. Increase the limit or wait for the next cycle.',
          bannedClaims: [],
          subject: step.subject ?? '',
          body: step.body ?? '',
          usedFields: [],
          assumptions: [],
          warnings: [],
        },
      }))
      return
    }

    const instruction = String(aiInstructions[step.id] ?? '').trim()
    setAiBusy((current) => ({ ...current, [step.id]: true }))
    try {
      const result = await generateCampaignDraft({
        instruction,
        subject: step.subject ?? '',
        body: step.body ?? '',
      })

      setAiDrafts((current) => ({ ...current, [step.id]: result }))
    } catch (error) {
      setAiDrafts((current) => ({
        ...current,
        [step.id]: {
          status: 'error',
          message: error?.message || 'The draft could not be generated. Please try again.',
          bannedClaims: [],
          subject: step.subject ?? '',
          body: step.body ?? '',
          usedFields: [],
          assumptions: [],
          warnings: [],
        },
      }))
    } finally {
      setAiBusy((current) => ({ ...current, [step.id]: false }))
    }
  }

  function toggleAi(enabled) {
    const nextValue = { ...aiSettings, enabled }
    setAiSettings(nextValue)
    writeAiDraftSettings(nextValue)
  }

  function changeApprovalMode(mode) {
    const nextValue = { ...aiSettings, approvalMode: mode }
    setAiSettings(nextValue)
    writeAiDraftSettings(nextValue)
  }

  function applyDraft(stepId, draft) {
    if (!draft || !draft.subject || !draft.body) return

    onChange((current) =>
      current.map((step) =>
        step.id === stepId
          ? { ...step, subject: draft.subject, body: draft.body, aiGenerated: true }
          : step,
      ),
    )

    setAiDrafts((current) => ({
      ...current,
      [stepId]: {
        ...draft,
        status: 'success',
      },
    }))
  }

  function rejectDraft(stepId, reasonOverride) {
    const reason = String(reasonOverride ?? aiRejectReason[stepId] ?? '').trim()
    setAiDrafts((current) => ({
      ...current,
      [stepId]: {
        ...(current[stepId] ?? {}),
        status: 'rejected',
        rejectionReason: reason || 'Not approved for this step.',
      },
    }))
    setAiRejectReason((current) => ({ ...current, [stepId]: '' }))
  }

  const aiUsage = getAiDraftUsage()

  return (
    <>
      <div className="app-card wizard__panel">
        <h2 className="wizard__panel-title">Sequence</h2>
        <p className="wizard__panel-copy">
          Add one to eight steps. Set a business-day delay, write the subject and HTML body, and
          use merge fields from the contact profile. Unknown fields stop the draft from being created.
        </p>

        <div className="wizard__ai-panel wizard__ai-panel--top">
          <div className="wizard__ai-header">
            <span className="wizard__group-label">AI drafting</span>
            <CheckboxField
              id="tenant-ai-toggle"
              checked={aiEnabled}
              disabled={!workspaceAiReady || !workspaceAiEnabled}
              onChange={(event) => toggleAi(event.target.checked)}
            >
              Enabled for my editor
            </CheckboxField>
          </div>
          {!workspaceAiReady || !workspaceAiEnabled ? (
            <p className="wizard__ai-note wizard__ai-note--warning">
              {!workspaceAiReady
                ? 'Workspace AI settings are still loading; drafting is disabled until they are verified.'
                : 'An owner or admin has disabled AI drafting for this workspace.'}
            </p>
          ) : null}

          <div className="wizard__ai-quota">
            <div className="wizard__ai-meter-head">
              <span>Quota</span>
              <strong>
                {aiUsage.used}/{aiUsage.quota} generations
              </strong>
            </div>
            <div className="wizard__ai-meter-track" aria-hidden="true">
              <span style={{ width: `${aiUsage.percent}%` }} />
            </div>
            <SelectField
              id="tenant-ai-approval-mode"
              label="Approval mode"
              value={aiSettings.approvalMode ?? 'edit_then_approve'}
              onChange={(event) => changeApprovalMode(event.target.value)}
            >
              <option value="edit_then_approve">Edit then approve</option>
              <option value="auto_approve">Auto-approve</option>
            </SelectField>
            {aiUsage.nearLimit ? (
              <p className="wizard__ai-note wizard__ai-note--warning">
                You are close to the workspace AI allowance. Review copy before sending.
              </p>
            ) : (
              <p className="wizard__ai-note">AI drafts are kept in review mode until you approve them.</p>
            )}
          </div>
        </div>

        {steps.map((step, index) => {
          const stepValidation = validateSequenceSteps([step])
          const unknownStepFields = stepValidation.issues.filter((issue) => issue.startsWith('Unknown merge field'))

          return (
            <div key={step.id} className="wizard__sequence-step">
              <div className="wizard__sequence-head">
                <h3>Step {index + 1}</h3>
                {steps.length > 1 ? (
                  <Button size="sm" variant="ghost" onClick={() => onRemove(step.id)}>
                    Remove
                  </Button>
                ) : null}
              </div>

              <div className="wizard__sequence-fields">
                <TextField
                  id={`${step.id}-delay`}
                  label="Business-day delay"
                  type="number"
                  min={0}
                  max={30}
                  value={Number(step.delayBusinessDays ?? 0)}
                  onChange={(event) =>
                    updateStep(step.id, 'delayBusinessDays', Number(event.target.value || 0))
                  }
                  hint="Wait this many business days before sending this step."
                />

                <TextField
                  id={`${step.id}-subject`}
                  label="Subject line"
                  value={step.subject ?? ''}
                  onChange={(event) => updateStep(step.id, 'subject', event.target.value)}
                  placeholder="{{first_name}}, quick follow-up"
                />

                <div className="wizard__sequence-fields wizard__sequence-fields--tight">
                  <span className="wizard__group-label">Merge fields</span>
                  <div className="wizard__merge-toolbar">
                    {MERGE_FIELDS.map((token) => (
                      <Button
                        key={`${step.id}-${token}`}
                        size="sm"
                        variant="secondary"
                        onClick={() => onInsert(step.id, 'subject', token)}
                      >
                        {{
                          first_name: 'First name',
                          last_name: 'Last name',
                          company: 'Company',
                          job_title: 'Job title',
                          email: 'Email',
                          phone: 'Phone',
                          city: 'City',
                          state: 'State',
                          country: 'Country',
                          website: 'Website',
                        }[token]}
                      </Button>
                    ))}
                  </div>
                </div>

                <div className="wizard__sequence-editor">
                  <div className="wizard__merge-toolbar">
                    {MERGE_FIELDS.map((token) => (
                      <Button
                        key={`${step.id}-body-${token}`}
                        size="sm"
                        variant="secondary"
                        onClick={() => onInsert(step.id, 'body', token)}
                      >
                        {{
                          first_name: 'First name',
                          last_name: 'Last name',
                          company: 'Company',
                          job_title: 'Job title',
                          email: 'Email',
                          phone: 'Phone',
                          city: 'City',
                          state: 'State',
                          country: 'Country',
                          website: 'Website',
                        }[token]}
                      </Button>
                    ))}
                  </div>
                  <TextareaField
                    id={`${step.id}-body`}
                    label="Body (HTML)"
                    rows={8}
                    value={step.body ?? ''}
                    onChange={(event) => updateStep(step.id, 'body', event.target.value)}
                    hint="Use HTML for rich text. The plain text preview is shown below."
                  />
                </div>
              </div>

              <div className="wizard__ai-panel">
                <div className="wizard__ai-header">
                  <span className="wizard__group-label">AI drafting</span>
                  <Badge tone="outline" size="sm">
                    Draft helper
                  </Badge>
                </div>

                <TextareaField
                  id={`${step.id}-ai-instruction`}
                  label="Draft brief"
                  rows={3}
                  value={aiInstructions[step.id] ?? ''}
                  onChange={(event) =>
                    setAiInstructions((current) => ({
                      ...current,
                      [step.id]: event.target.value,
                    }))
                  }
                  placeholder="Write a warm follow-up for {{first_name}} at {{company}}. Keep it concise and professional."
                />

                <div className="wizard__ai-actions">
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => handleGenerate(step)}
                    loading={aiBusy[step.id]}
                    disabled={aiBusy[step.id] || !aiEnabled}
                    >
                    {aiBusy[step.id] ? 'Generating…' : 'Generate draft'}
                    </Button>
                  {aiDrafts[step.id] && aiDrafts[step.id].status === 'success' ? (
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => applyDraft(step.id, aiDrafts[step.id])}
                    >
                      Approve & apply
                    </Button>
                  ) : null}
                  {aiDrafts[step.id] ? (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => handleGenerate(step)}
                    >
                      Regenerate
                    </Button>
                  ) : null}
                </div>

                {aiDrafts[step.id] ? (
                  <div className="wizard__ai-result">
                    {aiDrafts[step.id].status === 'disabled' || aiDrafts[step.id].status === 'refused' || aiDrafts[step.id].status === 'error' ? (
                      <p className="wizard__error" role="alert">
                        {aiDrafts[step.id].message}
                      </p>
                    ) : (
                      <>
                          <div className="wizard__ai-meta">
                          <span>Used fields</span>
                          <strong>
                            {aiDrafts[step.id].usedFields?.length > 0
                              ? aiDrafts[step.id].usedFields.join(', ')
                              : 'None'}
                          </strong>
                          </div>

                        {aiDrafts[step.id].assumptions?.length ? (
                          <div className="wizard__ai-meta">
                            <span>Assumptions</span>
                            <ul className="wizard__ai-list">
                              {aiDrafts[step.id].assumptions.map((item) => (
                                <li key={item}>{item}</li>
                              ))}
                            </ul>
                          </div>
                        ) : null}

                        {aiDrafts[step.id].warnings?.length ? (
                          <div className="wizard__ai-meta">
                            <span>Warnings</span>
                            <ul className="wizard__ai-list wizard__ai-list--warning">
                              {aiDrafts[step.id].warnings.map((item) => (
                                <li key={item}>{item}</li>
                              ))}
                            </ul>
                          </div>
                        ) : null}

                        {aiDrafts[step.id].bannedClaims?.length ? (
                          <div className="wizard__ai-meta">
                            <span>Banned claims</span>
                            <ul className="wizard__ai-list wizard__ai-list--error">
                              {aiDrafts[step.id].bannedClaims.map((item) => (
                                <li key={item}>{item}</li>
                              ))}
                            </ul>
                          </div>
                        ) : null}

                        {aiDrafts[step.id].status === 'rejected' ? (
                          <p className="wizard__ai-note wizard__ai-note--warning">
                            Rejected: {aiDrafts[step.id].rejectionReason || 'No reason provided.'}
                          </p>
                        ) : null}

                        <div className="wizard__ai-preview">
                          <div>
                            <span className="wizard__group-label">Suggested subject</span>
                            <p>{aiDrafts[step.id].subject || 'No subject generated.'}</p>
                          </div>
                          <div>
                            <span className="wizard__group-label">Suggested body</span>
                            <div
                              className="wizard__preview-html"
                              dangerouslySetInnerHTML={{
                                __html:
                                  aiDrafts[step.id].body && aiDrafts[step.id].body.trim()
                                    ? aiDrafts[step.id].body
                                    : '<p>Suggested body preview appears here.</p>',
                              }}
                            />
                          </div>
                          </div>

                        <div className="wizard__ai-actions">
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={() => applyDraft(step.id, aiDrafts[step.id])}
                          >
                            Approve & use
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => rejectDraft(step.id)}
                          >
                            Reject
                          </Button>
                          </div>

                        <TextareaField
                          id={`${step.id}-ai-reject-reason`}
                          label="Reason for rejection"
                          rows={2}
                          value={aiRejectReason[step.id] ?? ''}
                          onChange={(event) =>
                            setAiRejectReason((current) => ({
                              ...current,
                              [step.id]: event.target.value,
                            }))
                          }
                          placeholder="Example: too promotional for this audience."
                        />
                      </>
                    )}
                  </div>
                ) : null}
              </div>

              <div className="wizard__preview">
                <h4 className="wizard__group-label">Preview</h4>
                <div
                  className="wizard__preview-html"
                  dangerouslySetInnerHTML={{
                    __html: step.body && step.body.trim() ? step.body : '<p>Body preview appears here.</p>',
                  }}
                />
                <pre className="wizard__preview-text">{stripHtml(step.body ?? '') || 'Plain-text fallback preview appears here.'}</pre>
              </div>

              {unknownStepFields.length > 0 || stepValidation.issues.length > 0 ? (
                <p className="wizard__error" role="alert">
                  {stepValidation.issues.join(' ')}
                </p>
              ) : null}
            </div>
          )
        })}

        <div className="wizard__sequence-actions">
          <Button size="sm" variant="secondary" onClick={onAdd} disabled={steps.length >= 8}>
            Add step
          </Button>
        </div>

        {sequenceError ? (
          <p className="wizard__error" role="alert">
            {sequenceError}
          </p>
        ) : null}
      </div>

      <div className="wizard__footer">
        <Button variant="ghost" onClick={onBack} disabled={creating}>
          Back to mailboxes
        </Button>
        <Button
          variant="primary"
          leadingIcon={Send}
          onClick={onNext}
          disabled={creating || !validation.ok}
          loading={creating}
        >
          Continue to schedule
        </Button>
      </div>

      {createError ? (
        <p className="wizard__error" role="alert">
          {createError}
        </p>
      ) : null}
    </>
  )
}

function ReviewStep({
  name,
  audience,
  selectedMailboxes,
  mailboxes,
  sequenceSteps,
  schedule,
  preflight,
  preflightLoading,
  preview,
  previewLoading,
  previewError,
  onBack,
  onFinish,
  onTestSend,
  testSending,
  testResult,
  testError,
  reviewStepIndex,
  onStepChange,
}) {
  const selectedCount = selectedMailboxes.length
  const selectedStep = sequenceSteps[reviewStepIndex] ?? sequenceSteps[0]
  const sampleSubject = selectedStep ? renderMergeTemplate(selectedStep.subject ?? '', audience?.contacts?.[0] ?? {}) : ''
  const sampleBody = selectedStep ? renderMergeTemplate(selectedStep.body ?? '', audience?.contacts?.[0] ?? {}) : ''

  return (
    <>
      <div className="app-card wizard__panel">
        <h2 className="wizard__panel-title">Review</h2>
        <p className="wizard__panel-copy">
          Verify the final draft, check the preflight reason, and preview the rendered copy before the
          schedule is approved for launch.
        </p>

        <div className="wizard__review-grid">
          <div className="wizard__review-card">
            <h3 className="wizard__group-label">Preflight</h3>
            {preflightLoading ? (
              <Skeleton lines={3} />
            ) : (
              <>
                {preflight.errors.length > 0 ? (
                  <ul className="wizard__preflight-list">
                    {preflight.errors.map((issue) => (
                      <li key={issue}>{issue}</li>
                    ))}
                  </ul>
                ) : (
                  <p className="wizard__preflight-ok">Everything is ready for the next launch gate.</p>
                )}

                {preflight.warnings.length > 0 ? (
                  <ul className="wizard__warning-list">
                    {preflight.warnings.map((issue) => (
                      <li key={issue}>{issue}</li>
                    ))}
                  </ul>
                ) : null}
              </>
            )}
          </div>

          <div className="wizard__review-card">
            <h3 className="wizard__group-label">Draft summary</h3>
            <dl className="wizard__stats">
              <div>
                <dt>Campaign</dt>
                <dd>{name || 'Untitled draft'}</dd>
              </div>
              <div>
                <dt>Audience</dt>
                <dd>{(audience?.total ?? 0).toLocaleString()} contacts</dd>
              </div>
              <div>
                <dt>Selected mailboxes</dt>
                <dd>{selectedCount.toLocaleString()}</dd>
              </div>
              <div>
                <dt>Schedule</dt>
                <dd>{schedule.sendDays.length} days · {schedule.timezone}</dd>
              </div>
            </dl>
          </div>
        </div>

        <div className="wizard__review-preview">
          <div className="wizard__review-header">
            <h3 className="wizard__group-label">Sample preview</h3>
            <div className="wizard__review-tools">
              <SelectField
                id="review-step-select"
                label="Step"
                value={String(reviewStepIndex)}
                onChange={(event) => onStepChange(Number(event.target.value))}
              >
                {sequenceSteps.map((step, index) => (
                  <option key={step.id || `review-step-${index}`} value={index}>
                    Step {index + 1}
                  </option>
                ))}
              </SelectField>
              <Button size="sm" variant="secondary" onClick={onTestSend} loading={testSending} disabled={testSending}>
                Send test email
              </Button>
            </div>
          </div>

          {previewLoading ? (
            <Skeleton lines={4} />
          ) : preview ? (
            <>
              <div className="wizard__preview-header">
                <strong>{preview.subject || sampleSubject || 'Subject preview'}</strong>
              </div>
              <div
                className="wizard__preview-html"
                dangerouslySetInnerHTML={{
                  __html: preview.body_html || sampleBody || '<p>Preview appears here.</p>',
                }}
              />
              <pre className="wizard__preview-text">{preview.body_text || stripHtml(sampleBody) || 'Plain-text preview appears here.'}</pre>
            </>
          ) : (
            <p className="wizard__stat-note">No sample contact preview is available yet.</p>
          )}

          {previewError ? (
            <p className="wizard__error" role="alert">
              {previewError.message || 'Preview could not be generated.'}
            </p>
          ) : null}
          {testResult ? <p className="wizard__success" role="status">{testResult}</p> : null}
          {testError ? <p className="wizard__error" role="alert">{testError}</p> : null}
        </div>
      </div>

      <div className="wizard__footer">
        <Button variant="ghost" onClick={onBack}>
          Back to schedule
        </Button>
        <Button
          variant="primary"
          onClick={onFinish}
          disabled={preflightLoading || !preflight.ok || !mailboxes || mailboxes.length === 0}
        >
          Ready to launch
        </Button>
      </div>
    </>
  )
}

function ScheduleStep({
  schedule,
  onChange,
  dailyCap,
  onDailyCapChange,
  onBack,
  onCreate,
  creating,
  createError,
}) {
  const nextSend = getNextSendPreview(schedule)
  const timezones = groupedTimezones()

  const toggleDay = (dayKey) => {
    onChange((current) => ({
      ...current,
      sendDays: current.sendDays.includes(dayKey)
        ? current.sendDays.filter((value) => value !== dayKey)
        : [...current.sendDays, dayKey],
    }))
  }

  return (
    <>
      <div className="app-card wizard__panel">
        <h2 className="wizard__panel-title">Schedule</h2>
        <p className="wizard__panel-copy">
          Set the local sending window, the timezone strategy, and the days you want this cadence to run.
        </p>

        <div className="wizard__schedule-grid">
          <SelectField
            id="campaign-timezone"
            label="Timezone"
            value={schedule.timezone}
            onChange={(event) => onChange((current) => ({ ...current, timezone: event.target.value }))}
            hint="The next-send preview is calculated in this timezone."
          >
            {timezones.map((group) => (
              <optgroup key={group.label} label={group.label}>
                {group.zones.map((zone) => (
                  <option key={zone} value={zone}>
                    {zone.replaceAll('_', ' ')}
                  </option>
                ))}
              </optgroup>
            ))}
          </SelectField>

          <SelectField
            id="campaign-window-strategy"
            label="Timezone strategy"
            value={schedule.timezoneStrategy}
            onChange={(event) => onChange((current) => ({ ...current, timezoneStrategy: event.target.value }))}
          >
            <option value="workspace">Use workspace timezone</option>
            <option value="inbox">Use selected inbox timezone</option>
            <option value="contact">Use contact timezone</option>
          </SelectField>

          <div className="wizard__schedule-inline">
            <SelectField
              id="campaign-window-start"
              label="Local window starts"
              value={schedule.localWindowStart}
              onChange={(event) => onChange((current) => ({ ...current, localWindowStart: Number(event.target.value) }))}
            >
              {Array.from({ length: 24 }, (_, hour) => (
                <option key={hour} value={hour}>{String(hour).padStart(2, '0')}:00</option>
              ))}
            </SelectField>

            <SelectField
              id="campaign-window-end"
              label="Local window ends"
              value={schedule.localWindowEnd}
              onChange={(event) => onChange((current) => ({ ...current, localWindowEnd: Number(event.target.value) }))}
            >
              {Array.from({ length: 24 }, (_, hour) => (
                <option key={hour} value={hour}>{String(hour).padStart(2, '0')}:00</option>
              ))}
              <option value="24">24:00</option>
            </SelectField>
          </div>

          <TextField
            id="campaign-daily-cap"
            label="Campaign daily cap"
            type="number"
            min="1"
            max="2000"
            value={dailyCap}
            onChange={(event) => onDailyCapChange(event.target.value)}
            hint="This campaign cap is also limited by each selected mailbox's daily cap."
          />

          <div className="wizard__schedule-days">
            <span className="wizard__group-label">Sending days</span>
            <div className="wizard__day-grid">
              {[
                { key: 'mon', label: 'Mon' },
                { key: 'tue', label: 'Tue' },
                { key: 'wed', label: 'Wed' },
                { key: 'thu', label: 'Thu' },
                { key: 'fri', label: 'Fri' },
                { key: 'sat', label: 'Sat' },
                { key: 'sun', label: 'Sun' },
              ].map((day) => (
                <label key={day.key} className={`wizard__day-toggle${schedule.sendDays.includes(day.key) ? ' is-selected' : ''}`}>
                  <input
                    type="checkbox"
                    checked={schedule.sendDays.includes(day.key)}
                    onChange={() => toggleDay(day.key)}
                  />
                  <span>{day.label}</span>
                </label>
              ))}
            </div>
          </div>

          <label className="wizard__holiday-toggle">
            <input
              type="checkbox"
              checked={Boolean(schedule.skipHolidays)}
              onChange={(event) => onChange((current) => ({ ...current, skipHolidays: event.target.checked }))}
            />
            Skip federal holidays and weekends in the selected timezone.
          </label>
        </div>
      </div>

      <div className="app-card wizard__estimate" data-state="ready">
        <div className="wizard__estimate-head">
          <h2 className="wizard__panel-title">Next send preview</h2>
          <span className="wizard__estimate-total">{nextSend}</span>
        </div>
        <dl className="wizard__stats">
          <div>
            <dt>Window</dt>
            <dd>
              {String(schedule.localWindowStart).padStart(2, '0')}:00–
              {String(schedule.localWindowEnd).padStart(2, '0')}:00
            </dd>
          </div>
          <div>
            <dt>Days</dt>
            <dd>{schedule.sendDays.length} selected</dd>
          </div>
          <div>
            <dt>Daily cap</dt>
            <dd>{dailyCap} messages</dd>
          </div>
          <div>
            <dt>Strategy</dt>
            <dd>{schedule.timezoneStrategy === 'workspace' ? 'Workspace' : schedule.timezoneStrategy === 'inbox' ? 'Inbox' : 'Contact'}</dd>
          </div>
        </dl>
        <p className="wizard__stat-note">
          This preview is calculated in {schedule.timezone} and respects the selected local window for a DST-safe IANA timezone.
        </p>
      </div>

      <div className="wizard__footer">
        <Button variant="ghost" onClick={onBack} disabled={creating}>
          Back to sequence
        </Button>
        <Button
          variant="primary"
          leadingIcon={Send}
          onClick={onCreate}
          loading={creating}
          disabled={creating || !schedule.timezone || schedule.sendDays.length === 0}
        >
          Create draft campaign
        </Button>
      </div>

      {createError ? (
        <p className="wizard__error" role="alert">
          {createError}
        </p>
      ) : null}
    </>
  )
}
