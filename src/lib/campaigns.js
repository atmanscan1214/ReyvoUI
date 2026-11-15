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
    nextAction: 'hint', // approve/reject belong to the approval workflow (T25)
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
 * Seeds a draft with a name and a first step. Audience and mailbox selection,
 * additional steps, and scheduling are added by the wizard (T21+) by updating
 * the draft.
 */
export async function createCampaign(payload, signal) {
  const data = await api.post(
    '/campaigns',
    {
      name: payload.name,
      audience_type: 'contacts',
      contact_ids: [],
      email_account_ids: [],
      timezone: payload.timezone,
      daily_cap: payload.dailyCap,
      stop_on_reply: true,
      steps: [
        {
          step_order: 1,
          delay_business_days: 0,
          subject_template: payload.subject,
          body_html_template: payload.body,
        },
      ],
    },
    { signal },
  )
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

export async function submitCampaign(id, signal) {
  const data = await api.post(`/campaigns/${encodeURIComponent(id)}/submit`, undefined, { signal })
  return normalizeCampaign(data)
}

export async function archiveCampaign(id, signal) {
  const data = await api.post(`/campaigns/${encodeURIComponent(id)}/archive`, undefined, { signal })
  return normalizeCampaign(data)
}

export async function deleteCampaign(id, signal) {
  await api.delete(`/campaigns/${encodeURIComponent(id)}`, { signal })
  return true
}
