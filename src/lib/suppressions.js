import { api } from './api'

/**
 * Suppression adapter for T17.
 *
 * The live API exposes the whole suppression route under `/suppressions`:
 * a paged read with an optional `reason` filter, a manual add, and a remove.
 * Everything the task needs is server-side, so this module is thin:
 *
 * - `GET /suppressions?reason=&limit=&offset=` pages tenant suppressions. The
 *   same query also returns platform (global) rows, because the service
 *   matches `tenant_id = current OR tenant_id IS NULL`.
 * - `POST /suppressions` adds a block with a reason and optional note, marks a
 *   matching contact `unsubscribed`, and audits `suppression.created`.
 *   A duplicate address returns 409.
 * - `DELETE /suppressions/{id}` removes the block and audits
 *   `suppression.removed`.
 *
 * `SuppressionRead` does not distinguish tenant rows from platform rows, so
 * the UI applies the design's override rules by reason instead: `complaint`
 * and `legal` blocks cannot be removed, everything else can be removed by an
 * owner or admin with the removal recorded in the audit log. The API does not
 * enforce this itself, so it is a UI policy backed by graceful error handling.
 */

export const SUPPRESSIONS_PAGE_SIZE = 25

export const SUPPRESSION_REASONS = [
  {
    value: 'unsubscribe',
    label: 'Unsubscribed',
    tone: 'warning',
    removable: true,
    description:
      'The recipient opted out of this workspace. An owner or admin can remove it, and the override is audited.',
  },
  {
    value: 'hard_bounce',
    label: 'Hard bounce',
    tone: 'warning',
    removable: true,
    description:
      'The address permanently failed delivery. Removing it is possible, but sends will likely bounce again.',
  },
  {
    value: 'manual',
    label: 'Manual block',
    tone: 'neutral',
    removable: true,
    description: 'Someone in the workspace blocked this address by hand.',
  },
  {
    value: 'complaint',
    label: 'Complaint',
    tone: 'danger',
    removable: false,
    description:
      'The recipient reported a message as spam. Complaint blocks cannot be overridden.',
  },
  {
    value: 'legal',
    label: 'Platform block',
    tone: 'danger',
    removable: false,
    description:
      'The platform or a legal requirement blocks this address. Tenant workspaces cannot remove it.',
  },
]

export function suppressionReasonMeta(reason) {
  return (
    SUPPRESSION_REASONS.find((entry) => entry.value === reason) ?? {
      value: reason ?? '',
      label: reason ? String(reason).replace(/_/g, ' ') : 'Unknown',
      tone: 'outline',
      removable: false,
      description: null,
    }
  )
}

export function normalizeSuppression(raw) {
  return {
    id: String(raw?.id ?? ''),
    email: raw?.email_normalized ?? '',
    reason: raw?.reason ?? 'manual',
    source: raw?.source ?? null,
    note: raw?.note ?? null,
    createdAt: raw?.created_at ?? null,
  }
}

export async function listSuppressions(
  { reason = null, limit = SUPPRESSIONS_PAGE_SIZE, offset = 0 } = {},
  signal,
) {
  const query = new URLSearchParams({
    limit: String(limit),
    offset: String(offset),
  })
  if (reason) query.set('reason', reason)

  const data = await api.get(`/suppressions?${query.toString()}`, { signal })
  const items = Array.isArray(data?.items) ? data.items.map(normalizeSuppression) : []

  return {
    items,
    total: Number(data?.total ?? items.length),
    limit: Number(data?.limit ?? limit),
    offset: Number(data?.offset ?? offset),
  }
}

export async function addSuppression({ email, note } = {}, signal) {
  const data = await api.post(
    '/suppressions',
    {
      email: String(email ?? '').trim(),
      reason: 'manual',
      note: String(note ?? '').trim() || null,
    },
    { signal },
  )
  return normalizeSuppression(data)
}

export async function removeSuppression(suppressionId, signal) {
  await api.delete(`/suppressions/${encodeURIComponent(suppressionId)}`, { signal })
}
