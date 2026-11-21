import { api } from './api'

/**
 * Campaign adapter for T20.
 *
 * The live API pages campaigns (`Page` envelope) and exposes the whole
 * lifecycle as POST transitions. The list slice covers: list, create,
 * duplicate (composed from get + create), submit for approval, archive, and
 * delete. Approve/reject/launch/pause/resume land with the approval workflow
 * (T25) and campaign detail (T26); the wizard (T21) owns audience and mailbox
 * selection, so the create modal only seeds name + first step.
 */

export const CAMPAIGN_STATUSES = [
  'draft',
  'pending_approval',
  'approved',
  'active',
  'paused',
  'completed',
  'archived',
]

export const CAMPAIGN_STATUS_META = {
  draft: {
    label: 'Draft',
    tone: 'neutral',
    nextAction: 'submit', // actionable verb owned by this page
    description: 'Editable and not sending. Submit it for approval when the copy is ready.',
  },
  pending_approval: {
    label: 'Pending approval',
    tone: 'warning',
    nextAction: 'approve',
    hint: 'Awaiting an owner or admin review.',
    description: 'Locked while an owner or admin reviews the copy. It can be approved or returned to draft.',
  },
  approved: {
    label: 'Approved',
    tone: 'info',
    nextAction: 'hint', // launch belongs to the campaign detail (T26)
    hint: 'Ready to launch from the campaign detail.',
    description: 'Approved copy. Launching happens from the campaign detail.',
  },
  active: {
    label: 'Active',
    tone: 'success',
    nextAction: 'hint',
    hint: 'Enrolling and sending — pause or complete from the campaign detail.',
    description: 'Enrolling contacts and sending through healthy inboxes. Pause or complete it from the detail.',
  },
  paused: {
    label: 'Paused',
    tone: 'warning',
    nextAction: 'hint',
    hint: 'Queued sends are held — resume from the campaign detail.',
    description: 'No new sends. Queued messages are held until it resumes.',
  },
  completed: {
    label: 'Completed',
    tone: 'success',
    nextAction: 'archive',
    description: 'All steps finished. Archive it or duplicate it to reuse the sequence.',
  },
  archived: {
    label: 'Archived',
    tone: 'neutral',
    nextAction: 'duplicate',
    description: 'Read-only history. Duplicate it to start a fresh copy, or delete it.',
  },
}

export function campaignStatusMeta(status) {
  return (
    CAMPAIGN_STATUS_META[status] ?? {
      label: status ? String(status).replace(/_/g, ' ') : 'Unknown',
      tone: 'neutral',
      nextAction: 'none',
      description: null,
    }
  )
}

export function normalizeCampaign(raw) {
  return {
    id: String(raw?.id ?? ''),
    name: raw?.name ?? '',
    status: raw?.status ?? 'draft',
    audienceType: raw?.audience_type ?? 'contacts',
    audienceId: raw?.audience_id ?? null,
    audienceSize: Array.isArray(raw?.audience_snapshot) ? raw.audience_snapshot.length : 0,
    emailAccountIds: Array.isArray(raw?.email_account_ids) ? raw.email_account_ids : [],
    timezone: raw?.timezone ?? 'UTC',
    sendingWindow: raw?.sending_window ?? {},
    dailyCap: Number(raw?.daily_cap ?? 0),
    stopOnReply: Boolean(raw?.stop_on_reply),
    approvalStatus: raw?.approval_status ?? 'pending',
    launchedAt: raw?.launched_at ?? null,
    completedAt: raw?.completed_at ?? null,
    createdAt: raw?.created_at ?? null,
    updatedAt: raw?.updated_at ?? null,
    steps: Array.isArray(raw?.steps)
      ? raw.steps.map((step) => ({
          id: String(step.id ?? ''),
          stepOrder: Number(step.step_order ?? 1),
          delayBusinessDays: Number(step.delay_business_days ?? 0),
          subjectTemplate: step.subject_template ?? '',
          bodyHtmlTemplate: step.body_html_template ?? '',
          aiGenerated: Boolean(step.ai_generated),
        }))
      : [],
  }
}

export async function listCampaigns({ search, status, limit, offset } = {}, signal) {
  const params = new URLSearchParams()
  if (search) params.set('search', search)
  if (status) params.set('status', status)
  if (limit != null) params.set('limit', String(limit))
  if (offset != null) params.set('offset', String(offset))
  const query = params.toString()
  const data = await api.get(`/campaigns${query ? `?${query}` : ''}`, { signal })
  return {
    items: Array.isArray(data?.items) ? data.items.map(normalizeCampaign) : [],
    total: Number(data?.total ?? 0),
    limit: Number(data?.limit ?? 0),
    offset: Number(data?.offset ?? 0),
  }
}

export async function getCampaign(id, signal) {
  const data = await api.get(`/campaigns/${encodeURIComponent(id)}`, { signal })
  return normalizeCampaign(data)
}

/**
 * Seeds a draft with a name and a first step. The wizard (T21+) passes the
 * chosen audience and mailboxes; audience/mailbox management screens stay with
 * later tasks, which update the draft.
 */
export async function createCampaign(payload, signal) {
  const sequencedSteps = Array.isArray(payload.steps) && payload.steps.length > 0
    ? payload.steps.map((step, index) => ({
        step_order: Number(step.step_order ?? index + 1),
        delay_business_days: Number(step.delay_business_days ?? step.delayBusinessDays ?? 0),
        subject_template: step.subject_template ?? step.subject ?? '',
        body_html_template: step.body_html_template ?? step.body ?? '',
      }))
    : [
        {
          step_order: 1,
          delay_business_days: Number(payload.delayBusinessDays ?? 0),
          subject_template: payload.subject ?? '',
          body_html_template: payload.body ?? '',
        },
      ]

  const body = {
    name: payload.name,
    audience_type: payload.audienceType ?? 'contacts',
    contact_ids: payload.contactIds ?? [],
    email_account_ids: payload.emailAccountIds ?? [],
    timezone: payload.timezone,
    daily_cap: payload.dailyCap,
    stop_on_reply: true,
    steps: sequencedSteps.map((step) => ({
      ...step,
      ai_generated: Boolean(step.ai_generated ?? step.aiGenerated ?? false),
    })),
  }
  if (payload.audienceId) body.audience_id = payload.audienceId
  if (payload.sendingWindow != null) body.sending_window = payload.sendingWindow
  const data = await api.post('/campaigns', body, { signal })
  return normalizeCampaign(data)
}

/** No dedicated duplicate endpoint: copy name + steps through create. */
export async function duplicateCampaign(id, signal) {
  const source = await getCampaign(id, signal)
  const data = await api.post(
    '/campaigns',
    {
      name: `${source.name} (copy)`.slice(0, 255),
      audience_type: source.audienceType,
      audience_id: source.audienceId,
      contact_ids: [],
      email_account_ids: source.emailAccountIds,
      timezone: source.timezone,
      sending_window: source.sendingWindow,
      daily_cap: source.dailyCap,
      stop_on_reply: source.stopOnReply,
      steps: source.steps.map((step) => ({
        step_order: step.stepOrder,
        delay_business_days: step.delayBusinessDays,
        subject_template: step.subjectTemplate,
        body_html_template: step.bodyHtmlTemplate,
      })),
    },
    { signal },
  )
  return normalizeCampaign(data)
}

export async function getCampaignPreflight(id, signal) {
  try {
    const data = await api.get(`/campaigns/${encodeURIComponent(id)}/preflight`, { signal })
    return {
      ok: Boolean(data?.ok),
      errors: Array.isArray(data?.errors) ? data.errors : [],
      warnings: Array.isArray(data?.warnings) ? data.warnings : [],
      audience_size: Number(data?.audience_size ?? 0),
      sendable: Number(data?.sendable ?? 0),
      sending_accounts: Number(data?.sending_accounts ?? 0),
    }
  } catch (error) {
    if (error?.status === 404) {
      return {
        ok: true,
        errors: [],
        warnings: ['Preflight checks are unavailable in this build.'],
        audience_size: 0,
        sendable: 0,
        sending_accounts: 0,
      }
    }
    throw error
  }
}

export async function previewCampaign(id, payload, signal) {
  try {
    const data = await api.post(`/campaigns/${encodeURIComponent(id)}/preview`, payload, { signal })
    return {
      subject: data?.subject ?? '',
      body_html: data?.body_html ?? '',
      body_text: data?.body_text ?? '',
    }
  } catch (error) {
    if (error?.status === 404) {
      return {
        subject: payload?.subject ?? '',
        body_html: payload?.body_html ?? '',
        body_text: payload?.body_text ?? '',
      }
    }
    throw error
  }
}

const AI_DRAFT_FIELDS = [
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

const AI_SETTINGS_KEY = 'reyvo.ai.drafting.v1'

export const AI_APPROVAL_MODES = [
  { value: 'edit_then_approve', label: 'Edit then approve' },
  { value: 'auto_approve', label: 'Auto-approve drafts' },
]

export function isAiDraftApprovalRequired(settings = readAiDraftSettings(), generatedCount = 0) {
  const merged = {
    ...readAiDraftSettings(),
    ...(settings ?? {}),
  }

  return Boolean(merged.enabled) && (merged.approvalMode ?? 'edit_then_approve') === 'edit_then_approve' && Number(generatedCount ?? 0) > 0
}

export function readAiDraftSettings() {
  if (typeof window === 'undefined') {
    return { enabled: true, quota: 50, used: 0, approvalMode: 'edit_then_approve' }
  }

  try {
    const raw = window.localStorage.getItem(AI_SETTINGS_KEY)
    if (!raw) {
      return { enabled: true, quota: 50, used: 0, approvalMode: 'edit_then_approve' }
    }

    const parsed = JSON.parse(raw)
    return {
      enabled: parsed?.enabled !== false,
      quota: Number(parsed?.quota ?? 50),
      used: Number(parsed?.used ?? 0),
      approvalMode: parsed?.approvalMode ?? 'edit_then_approve',
    }
  } catch {
    return { enabled: true, quota: 50, used: 0, approvalMode: 'edit_then_approve' }
  }
}

export function writeAiDraftSettings(next = {}) {
  if (typeof window === 'undefined') return next

  const current = readAiDraftSettings()
  const merged = {
    enabled: next.enabled ?? current.enabled,
    quota: Number(next.quota ?? current.quota ?? 50),
    used: Number(next.used ?? current.used ?? 0),
    approvalMode: next.approvalMode ?? current.approvalMode ?? 'edit_then_approve',
  }

  window.localStorage.setItem(AI_SETTINGS_KEY, JSON.stringify(merged))
  return merged
}

export function getAiDraftUsage() {
  const settings = readAiDraftSettings()
  const quota = Math.max(1, Number(settings.quota ?? 50))
  const used = Math.max(0, Number(settings.used ?? 0))
  return {
    ...settings,
    quota,
    used,
    percent: Math.min(100, Math.round((used / quota) * 100)),
    nearLimit: used / quota >= 0.8,
  }
}

function buildLocalDraft({ instruction, subject = '', body = '' } = {}) {
  const prompt = String(instruction ?? '').trim()
  const banned = [
    'guaranteed',
    'risk-free',
    'instant',
    'money back',
    'no-risk',
    'guaranteed placement',
  ].filter((term) => prompt.toLowerCase().includes(term))

  if (banned.length > 0) {
    return {
      status: 'refused',
      message: 'This brief includes claims the copy-review policy blocks. Remove those claims and try again.',
      bannedClaims: banned,
      subject: subject || '',
      body: body || '',
      usedFields: [],
      assumptions: [],
      warnings: [],
    }
  }

  if (!prompt) {
    return {
      status: 'error',
      message: 'Add a short brief to generate a draft.',
      bannedClaims: [],
      subject: subject || '',
      body: body || '',
      usedFields: [],
      assumptions: [],
      warnings: [],
    }
  }

  const usedFields = AI_DRAFT_FIELDS.filter((field) =>
    [prompt, subject, body].some((value) => String(value ?? '').includes(`{{${field}}}`)),
  )

  const tone = /follow up|nurture|re-engage|touch base/i.test(prompt)
    ? 'warm follow-up'
    : /intro|welcome|new client|first touch/i.test(prompt)
      ? 'friendly intro'
      : 'clear outreach'

  const variants = [
    'Thanks again for your time',
    'I wanted to follow up on the opportunity',
    'A quick note from our team',
  ]

  const index = Math.abs(prompt.split('').reduce((total, character) => total + character.charCodeAt(0), 0)) % variants.length

  const generatedSubject = String(subject || `{{first_name}}, ${variants[index]}`)
  const generatedBody = String(
    body ||
      `<p>Hi {{first_name}},</p><p>${variants[index]} for {{company}}. I’d love to keep the conversation moving and share a quick next step.</p><p>If it helps, I can send a brief overview or a meeting invite for {{job_title}}.</p>`,
  )

  return {
    status: 'success',
    subject: generatedSubject,
    body: generatedBody,
    usedFields,
    assumptions: [
      `Tone: ${tone}.`,
      'Assumes the audience is already warm enough for a short follow-up.',
    ],
    warnings: [
      'Review the offer and CTA before you send it live.',
      'Check that the final draft still matches the selected audience and delay.',
    ],
    bannedClaims: [],
    message: 'Draft ready to review.',
  }
}

export async function generateCampaignDraft({ instruction, subject = '', body = '' } = {}, signal) {
  try {
    const data = await api.post(
      '/ai/draft',
      {
        instruction: String(instruction ?? '').trim(),
        subject: String(subject ?? ''),
        body: String(body ?? ''),
      },
      { signal },
    )

    const next = {
      status: data?.status === 'refused' ? 'refused' : 'success',
      subject: data?.subject ?? String(subject ?? ''),
      body: data?.body ?? data?.body_html ?? String(body ?? ''),
      usedFields: Array.isArray(data?.used_fields) ? data.used_fields : [],
      assumptions: Array.isArray(data?.assumptions) ? data.assumptions : [],
      warnings: Array.isArray(data?.warnings) ? data.warnings : [],
      bannedClaims: Array.isArray(data?.banned_claims) ? data.banned_claims : [],
      message: data?.message ?? 'Draft ready to review.',
    }

    if (next.status === 'success' && !data?.status?.startsWith('error')) {
      const settings = readAiDraftSettings()
      const nextUsed = Math.min(Number(settings.quota ?? 50), Number(settings.used ?? 0) + 1)
      writeAiDraftSettings({ ...settings, used: nextUsed })
    }

    return next
  } catch (error) {
    if (error?.status === 404 || error?.status === 405 || error?.status === 501) {
      const fallback = buildLocalDraft({ instruction, subject, body })
      if (fallback?.status === 'success') {
        const settings = readAiDraftSettings()
        const nextUsed = Math.min(Number(settings.quota ?? 50), Number(settings.used ?? 0) + 1)
        writeAiDraftSettings({ ...settings, used: nextUsed })
      }
      return fallback
    }
    throw error
  }
}

export async function submitCampaign(id, signal) {
  const data = await api.post(`/campaigns/${encodeURIComponent(id)}/submit`, undefined, { signal })
  return normalizeCampaign(data)
}

export async function approveCampaign(id, signal) {
  const data = await api.post(`/campaigns/${encodeURIComponent(id)}/approve`, undefined, { signal })
  return normalizeCampaign(data)
}

export async function rejectCampaign(id, payload = {}, signal) {
  const body = typeof payload === 'string'
    ? { note: payload }
    : payload && typeof payload === 'object'
      ? payload
      : { note: '' }
  const data = await api.post(`/campaigns/${encodeURIComponent(id)}/reject`, body, { signal })
  return normalizeCampaign(data)
}

export async function launchCampaign(id, signal) {
  const data = await api.post(`/campaigns/${encodeURIComponent(id)}/launch`, undefined, { signal })
  return normalizeCampaign(data)
}

export async function pauseCampaign(id, signal) {
  const data = await api.post(`/campaigns/${encodeURIComponent(id)}/pause`, undefined, { signal })
  return normalizeCampaign(data)
}

export async function resumeCampaign(id, signal) {
  const data = await api.post(`/campaigns/${encodeURIComponent(id)}/resume`, undefined, { signal })
  return normalizeCampaign(data)
}

export async function getCampaignStats(id, signal) {
  const data = await api.get(`/campaigns/${encodeURIComponent(id)}/stats`, { signal })
  return {
    enrolled: Number(data?.enrolled ?? 0),
    active: Number(data?.active ?? 0),
    stopped: Number(data?.stopped ?? 0),
    completed: Number(data?.completed ?? 0),
    sent: Number(data?.sent ?? 0),
    replies: Number(data?.replies ?? 0),
  }
}

export async function archiveCampaign(id, signal) {
  const data = await api.post(`/campaigns/${encodeURIComponent(id)}/archive`, undefined, { signal })
  return normalizeCampaign(data)
}

export async function deleteCampaign(id, signal) {
  await api.delete(`/campaigns/${encodeURIComponent(id)}`, { signal })
  return true
}
