import { api } from './api'

/**
 * T30 pause and kill-switch controls that reach the API:
 *
 * - Tenant pause `POST /tenants/current/sending-pause` — owner/admin, sets a
 *   send-only flag the sender skips; audited as `tenant.sending_paused` /
 *   `tenant.sending_resumed`. Sign-in and data access stay available.
 * - Platform kill switch `GET/POST /admin/sending-controls` — platform staff
 *   only (403 otherwise); audited as `admin.kill_switch_changed`.
 *
 * Campaign pause lives in `lib/campaigns` (`pauseCampaign`/`resumeCampaign`)
 * and inbox pause in `lib/emailAccounts` (`setEmailAccountPaused`); both are
 * audited by the API itself.
 */

export async function getSendingControls(signal) {
  return api.get('/admin/sending-controls', { signal })
}

export async function setKillSwitch(enabled, reason, signal) {
  return api.post(
    '/admin/sending-controls/kill-switch',
    { enabled: Boolean(enabled), reason: reason || null },
    { signal },
  )
}

export async function setTenantSendingPause(paused, reason, signal) {
  return api.post(
    '/tenants/current/sending-pause',
    { paused: Boolean(paused), reason: reason || null },
    { signal },
  )
}
