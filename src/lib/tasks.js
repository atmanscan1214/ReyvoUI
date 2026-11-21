import { api } from './api'

/**
 * Tasks adapter for T33 reply actions (and T34's task board later).
 *
 * Live API reality:
 * - `GET /tasks` accepts `status`, `assignee_id`, `limit`, `offset`.
 * - `TaskCreate` requires only `title`; `due_at`, `priority` (free string,
 *   default `normal`), `contact_id`, `opportunity_id`, and `assignee_id` are
 *   optional links.
 * - `TaskStatus`: open / in_progress / completed / canceled; status is writable
 *   only through `PATCH /tasks/{id}` (`TaskUpdate` has no `contact_id`).
 */

export const TASK_STATUSES = {
  open: { label: 'Open', tone: 'info' },
  in_progress: { label: 'In progress', tone: 'warning' },
  completed: { label: 'Completed', tone: 'success' },
  canceled: { label: 'Canceled', tone: 'neutral' },
}

/** Priorities are free-form strings capped at 20 chars; these are the app's set. */
export const TASK_PRIORITIES = {
  high: 'High',
  normal: 'Normal',
  low: 'Low',
}

export function normalizeTask(raw) {
  return {
    id: String(raw?.id ?? ''),
    contactId: raw?.contact_id ? String(raw.contact_id) : null,
    opportunityId: raw?.opportunity_id ? String(raw.opportunity_id) : null,
    assigneeId: raw?.assignee_id ? String(raw.assignee_id) : null,
    title: raw?.title ?? '',
    dueAt: raw?.due_at ?? null,
    status: raw?.status ?? 'open',
    priority: raw?.priority ?? 'normal',
    completedAt: raw?.completed_at ?? null,
    createdAt: raw?.created_at ?? null,
    updatedAt: raw?.updated_at ?? null,
  }
}

export async function listTasks({ status, assigneeId, limit = 100, offset = 0 } = {}, signal) {
  const params = new URLSearchParams()
  if (status) params.set('status', status)
  if (assigneeId) params.set('assignee_id', assigneeId)
  if (limit != null) params.set('limit', String(limit))
  if (offset != null) params.set('offset', String(offset))
  const query = params.toString()
  const data = await api.get(`/tasks${query ? `?${query}` : ''}`, { signal })
  const items = Array.isArray(data?.items) ? data.items.map(normalizeTask) : []
  return {
    items,
    total: Number(data?.total ?? items.length),
    limit: Number(data?.limit ?? limit),
    offset: Number(data?.offset ?? offset),
  }
}

export async function createTask(
  { title, dueAt, priority, contactId, opportunityId, assigneeId } = {},
  signal,
) {
  const payload = { title: String(title ?? '').trim() }
  if (dueAt) payload.due_at = dueAt
  if (priority) payload.priority = String(priority)
  if (contactId) payload.contact_id = contactId
  if (opportunityId) payload.opportunity_id = opportunityId
  if (assigneeId) payload.assignee_id = assigneeId
  const data = await api.post('/tasks', payload, { signal })
  return normalizeTask(data)
}

export async function updateTask(taskId, { title, dueAt, priority, status, assigneeId } = {}) {
  const payload = {}
  if (title !== undefined) payload.title = String(title).trim()
  if (dueAt !== undefined) payload.due_at = dueAt
  if (priority !== undefined) payload.priority = priority
  if (status !== undefined) payload.status = status
  if (assigneeId !== undefined) payload.assignee_id = assigneeId
  const data = await api.patch(`/tasks/${encodeURIComponent(taskId)}`, payload)
  return normalizeTask(data)
}
