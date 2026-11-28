import { api } from './api'

/**
 * T46/T47 platform-staff adapters.
 *
 * Every endpoint here is gated by `require_platform_admin` in the API and
 * answers 403 for ordinary tenant roles, so callers must also render inside a
 * `platformAdmin` area. The tenant-visible support-access read is the one
 * exception: every member of a workspace can see who currently has access.
 */

export const PLATFORM_PAGE_SIZE = 25

export const TENANT_STATUSES = [
  { value: 'trial', label: 'Trial' },
  { value: 'active', label: 'Active' },
  { value: 'suspended', label: 'Suspended' },
  { value: 'past_due', label: 'Past due' },
  { value: 'canceled', label: 'Canceled' },
  { value: 'deleted', label: 'Deleted' },
]

export const PLAN_OPTIONS = [
  { value: 'trial', label: 'Trial — free' },
  { value: 'starter', label: 'Starter — $299/mo' },
  { value: 'growth', label: 'Growth — $499/mo' },
  { value: 'scale', label: 'Scale — $999/mo' },
]

const PLAN_LABELS = {
  trial: 'Trial',
  starter: 'Starter',
  growth: 'Growth',
  scale: 'Scale',
}

const TENANT_STATUS_META = {
  trial: { label: 'Trial', tone: 'neutral' },
  active: { label: 'Active', tone: 'success' },
  suspended: { label: 'Suspended', tone: 'danger' },
  past_due: { label: 'Past due', tone: 'warning' },
  canceled: { label: 'Canceled', tone: 'outline' },
  deleted: { label: 'Deleted', tone: 'danger' },
}

const RISK_META = {
  low: { label: 'Low risk', tone: 'success' },
  medium: { label: 'Medium risk', tone: 'warning' },
  high: { label: 'High risk', tone: 'danger' },
}

export function planLabel(planCode) {
  return PLAN_LABELS[planCode] ?? (planCode ? planCode.replaceAll('_', ' ') : 'Unknown plan')
}

export function tenantStatusMeta(status) {
  return TENANT_STATUS_META[status] ?? { label: status || 'Unknown', tone: 'neutral' }
}

export function riskMeta(risk) {
  return RISK_META[risk] ?? { label: risk || 'Unknown', tone: 'neutral' }
}

export function formatMoney(cents) {
  return new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(Number(cents ?? 0) / 100)
}

export function formatNumber(value) {
  return Number(value ?? 0).toLocaleString()
}

export function formatDate(value) {
  if (!value) return '—'
  try {
    return new Intl.DateTimeFormat(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    }).format(new Date(value))
  } catch {
    return '—'
  }
}

export function formatDateTime(value) {
  if (!value) return '—'
  try {
    return new Intl.DateTimeFormat(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    }).format(new Date(value))
  } catch {
    return '—'
  }
}

/** Whole days from now until an ISO timestamp; negative values are overdue. */
export function daysUntil(value) {
  if (!value) return null
  const target = new Date(value)
  if (Number.isNaN(target.getTime())) return null
  return Math.ceil((target.getTime() - Date.now()) / 86_400_000)
}

export function listTenants({ search, status, page = 1, pageSize = PLATFORM_PAGE_SIZE } = {}, signal) {
  return api.list('/admin/tenants', {
    page,
    pageSize,
    params: {
      search: search || undefined,
      status: status || undefined,
    },
    signal,
  })
}

export function getTenantProfile(tenantId, signal) {
  return api.get(`/admin/tenants/${encodeURIComponent(tenantId)}`, { signal })
}

export function getPlatformOverview(signal) {
  return api.get('/admin/overview', { signal })
}

export function suspendTenant(tenantId, { suspend, reason } = {}) {
  return api.patch(`/admin/tenants/${encodeURIComponent(tenantId)}/suspend`, {
    suspend: Boolean(suspend),
    suspension_reason: reason?.trim() || null,
  })
}

export function extendTrial(tenantId) {
  return api.patch(`/admin/tenants/${encodeURIComponent(tenantId)}/trial-extend`, {})
}

export function changePlan(tenantId, planCode) {
  return api.patch(`/admin/tenants/${encodeURIComponent(tenantId)}/plan-change`, {
    plan_code: planCode,
  })
}

export function applyCredit(tenantId, amountCents, reason) {
  return api.patch(`/admin/tenants/${encodeURIComponent(tenantId)}/apply-credit`, {
    amount_cents: Math.round(Number(amountCents)),
    reason: reason.trim(),
  })
}

export function resetTenantMfa(tenantId) {
  return api.post(`/admin/tenants/${encodeURIComponent(tenantId)}/reset-mfa`, {})
}

export function forceTenantLogout(tenantId) {
  return api.post(`/admin/tenants/${encodeURIComponent(tenantId)}/force-logout`, {})
}

export function deleteTenant(tenantId) {
  return api.delete(`/admin/tenants/${encodeURIComponent(tenantId)}`)
}

export function listPlatformAuditLogs(
  { search, action, actorType, tenantId, page = 1, pageSize = PLATFORM_PAGE_SIZE } = {},
  signal,
) {
  return api.list('/admin/audit-logs', {
    page,
    pageSize,
    params: {
      search: search || undefined,
      action: action || undefined,
      actor_type: actorType || undefined,
      tenant_id: tenantId || undefined,
    },
    signal,
  })
}

export function listSupportAccess(
  { activeOnly = false, tenantId, page = 1, pageSize = PLATFORM_PAGE_SIZE } = {},
  signal,
) {
  return api.list('/admin/support-access', {
    page,
    pageSize,
    params: {
      active_only: activeOnly ? 'true' : undefined,
      tenant_id: tenantId || undefined,
    },
    signal,
  })
}

export function grantSupportAccess(tenantId, { reason, hours = 24 }) {
  return api.post(`/admin/tenants/${encodeURIComponent(tenantId)}/support-access`, {
    reason: reason.trim(),
    hours: Number(hours),
  })
}

export function revokeSupportAccess(grantId) {
  return api.delete(`/admin/support-access/${encodeURIComponent(grantId)}`)
}

/** Tenant-visible read: active platform support grants for this workspace. */
export function getWorkspaceSupportAccess(signal) {
  return api.get('/tenants/current/support-access', { signal })
}
