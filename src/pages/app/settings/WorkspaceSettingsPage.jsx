import { useEffect, useState } from 'react'
import { Info } from '../../../components/icons'
import {
  CheckboxField,
  SelectField,
  TextareaField,
  TextField,
} from '../../../components/Field'
import {
  Button,
  ErrorPanel,
  PageHeader,
  Skeleton,
  useToast,
} from '../../../components/ui'
import { api } from '../../../lib/api'
import { addressToValues, hasPhysicalAddress, normalizeAddress } from '../../../lib/onboarding'
import { useSession } from '../../../lib/session'
import { groupedTimezones } from '../../../lib/timezones'
import { usePageTitle } from '../../../lib/usePageTitle'
import './settings.css'

const DAYS = [
  { key: 'mon', label: 'Monday' },
  { key: 'tue', label: 'Tuesday' },
  { key: 'wed', label: 'Wednesday' },
  { key: 'thu', label: 'Thursday' },
  { key: 'fri', label: 'Friday' },
  { key: 'sat', label: 'Saturday' },
  { key: 'sun', label: 'Sunday' },
]

function formFromTenant(tenant) {
  const settings = tenant?.settings ?? {}
  const window = settings.default_sending_window ?? {}
  const localWindow = window.local_window ?? {}

  return {
    name: tenant?.name ?? '',
    address: addressToValues(tenant?.physical_address),
    timezone: tenant?.timezone ?? 'UTC',
    windowStart: String(localWindow.start ?? 9),
    windowEnd: String(localWindow.end ?? 17),
    sendDays: Array.isArray(window.send_days) ? window.send_days : ['mon', 'tue', 'wed', 'thu', 'fri'],
    defaultDailyCap: String(settings.default_daily_cap ?? 200),
    defaultSignature: String(settings.default_signature ?? ''),
    chatRetentionDays: String(settings.chat_retention_days ?? 90),
    aiDraftingEnabled: settings.ai_drafting_enabled !== false,
  }
}

export function WorkspaceSettingsPage() {
  usePageTitle('Workspace settings')
  const { tenantDetails, tenantStatus, retryTenant, updateTenant } = useSession()
  const { toast } = useToast()
  const [form, setForm] = useState(null)
  const [errors, setErrors] = useState({})
  const [saveError, setSaveError] = useState(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (tenantDetails) setForm(formFromTenant(tenantDetails))
  }, [tenantDetails])

  if (tenantStatus === 'loading' || !form) {
    if (tenantStatus === 'error') {
      return (
        <div className="app-page settings-page">
          <PageHeader eyebrow="Workspace" title="Workspace settings" />
          <ErrorPanel
            title="Couldn't load workspace settings"
            onRetry={retryTenant}
          />
        </div>
      )
    }

    return (
      <div className="app-page settings-page">
        <PageHeader eyebrow="Workspace" title="Workspace settings" />
        <div className="app-card"><Skeleton lines={8} /></div>
      </div>
    )
  }

  const addressComplete = hasPhysicalAddress(form.address)
  const timezones = groupedTimezones()

  function updateField(field, value) {
    setForm((current) => ({ ...current, [field]: value }))
  }

  function updateAddress(field, value) {
    setForm((current) => ({
      ...current,
      address: { ...current.address, [field]: value },
    }))
  }

  function toggleDay(day) {
    setForm((current) => ({
      ...current,
      sendDays: current.sendDays.includes(day)
        ? current.sendDays.filter((value) => value !== day)
        : [...current.sendDays, day],
    }))
  }

  async function handleSave(event) {
    event.preventDefault()
    const nextErrors = {}
    const start = Number(form.windowStart)
    const end = Number(form.windowEnd)
    const cap = Number(form.defaultDailyCap)

    if (form.name.trim().length < 2) nextErrors.name = 'Use at least 2 characters.'
    if (!form.timezone) nextErrors.timezone = 'Choose a timezone.'
    if (!form.sendDays.length) nextErrors.sendDays = 'Choose at least one sending day.'
    if (!Number.isInteger(start) || start < 0 || start > 23) {
      nextErrors.windowStart = 'Choose a start hour from 00:00 to 23:00.'
    }
    if (!Number.isInteger(end) || end < 1 || end > 24 || end <= start) {
      nextErrors.windowEnd = 'End time must be after the start time.'
    }
    if (!Number.isInteger(cap) || cap < 1 || cap > 2_000) {
      nextErrors.defaultDailyCap = 'Choose a cap from 1 to 2,000 messages per day.'
    }
    if (form.defaultSignature.length > 5_000) {
      nextErrors.defaultSignature = 'Use 5,000 characters or fewer.'
    }

    setErrors(nextErrors)
    setSaveError(null)
    if (Object.keys(nextErrors).length) return

    setSaving(true)
    try {
      const updated = await api.patch('/tenants/current', {
        name: form.name.trim(),
        timezone: form.timezone,
        physical_address: normalizeAddress(form.address),
        settings: {
          ...(tenantDetails.settings ?? {}),
          default_sending_window: {
            local_window: { start, end },
            send_days: form.sendDays,
          },
          default_daily_cap: cap,
          default_signature: form.defaultSignature,
          chat_retention_days: Number(form.chatRetentionDays),
          ai_drafting_enabled: form.aiDraftingEnabled,
        },
      })
      updateTenant(updated)
      toast.success('Workspace settings saved.')
    } catch (caught) {
      setSaveError(caught?.message || 'Workspace settings could not be saved.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="app-page settings-page">
      <PageHeader
        eyebrow="Workspace"
        title="Workspace settings"
        description="Set your agency identity and the defaults new campaigns inherit."
        actions={
          <Button type="submit" form="workspace-settings-form" loading={saving}>
            Save changes
          </Button>
        }
      />

      {!addressComplete ? (
        <div className="settings-page__notice" role="status">
          <Info size={16} aria-hidden="true" />
          <span>
            Add a complete physical address before launching campaigns. Required: street,
            city, postal code, and country.
          </span>
        </div>
      ) : null}

      {saveError ? (
        <p className="settings-page__error" role="alert">{saveError}</p>
      ) : null}

      <form id="workspace-settings-form" onSubmit={handleSave}>
        <section className="app-card settings-page__section" aria-labelledby="agency-section">
          <div className="settings-page__section-head">
            <p className="eyebrow">Identity</p>
            <h2 id="agency-section">Agency and mailing address</h2>
            <p>These details identify your workspace and appear in campaign footers.</p>
          </div>
          <div className="settings-page__grid">
            <TextField
              id="agency-name"
              label="Agency name"
              value={form.name}
              onChange={(event) => updateField('name', event.target.value)}
              error={errors.name}
              autoComplete="organization"
              maxLength={255}
              required
            />
            <TextField
              id="agency-address-line1"
              label="Street address"
              value={form.address.line1}
              onChange={(event) => updateAddress('line1', event.target.value)}
              autoComplete="address-line1"
              maxLength={255}
            />
            <TextField
              id="agency-address-line2"
              label="Address line 2"
              value={form.address.line2}
              onChange={(event) => updateAddress('line2', event.target.value)}
              autoComplete="address-line2"
              maxLength={255}
              optional
            />
            <TextField
              id="agency-city"
              label="City"
              value={form.address.city}
              onChange={(event) => updateAddress('city', event.target.value)}
              autoComplete="address-level2"
              maxLength={120}
            />
            <TextField
              id="agency-state"
              label="State / region"
              value={form.address.state}
              onChange={(event) => updateAddress('state', event.target.value)}
              autoComplete="address-level1"
              maxLength={120}
              optional
            />
            <TextField
              id="agency-postal"
              label="Postal code"
              value={form.address.postal}
              onChange={(event) => updateAddress('postal', event.target.value)}
              autoComplete="postal-code"
              maxLength={40}
            />
            <TextField
              id="agency-country"
              label="Country"
              value={form.address.country}
              onChange={(event) => updateAddress('country', event.target.value)}
              autoComplete="country-name"
              maxLength={120}
            />
          </div>
        </section>

        <section className="app-card settings-page__section" aria-labelledby="sending-section">
          <div className="settings-page__section-head">
            <p className="eyebrow">Sending defaults</p>
            <h2 id="sending-section">Timezone, schedule, and cap</h2>
            <p>New campaigns inherit these values; you can adjust them in the campaign wizard.</p>
          </div>
          <div className="settings-page__grid">
            <SelectField
              id="workspace-timezone"
              label="Workspace timezone"
              value={form.timezone}
              onChange={(event) => updateField('timezone', event.target.value)}
              error={errors.timezone}
            >
              {timezones.map((group) => (
                <optgroup key={group.label} label={group.label}>
                  {group.zones.map((zone) => (
                    <option key={zone} value={zone}>{zone.replaceAll('_', ' ')}</option>
                  ))}
                </optgroup>
              ))}
            </SelectField>

            <div className="settings-page__time-grid">
              <TextField
                id="default-window-start"
                label="Window starts (hour)"
                type="number"
                min="0"
                max="23"
                value={form.windowStart}
                onChange={(event) => updateField('windowStart', event.target.value)}
                error={errors.windowStart}
              />
              <TextField
                id="default-window-end"
                label="Window ends (hour)"
                type="number"
                min="1"
                max="24"
                value={form.windowEnd}
                onChange={(event) => updateField('windowEnd', event.target.value)}
                error={errors.windowEnd}
              />
            </div>

            <TextField
              id="default-daily-cap"
              label="Default campaign daily cap"
              type="number"
              min="1"
              max="2000"
              value={form.defaultDailyCap}
              onChange={(event) => updateField('defaultDailyCap', event.target.value)}
              error={errors.defaultDailyCap}
              hint="Maximum messages per campaign per day; mailbox caps still apply."
            />
          </div>
          <fieldset className="settings-page__days">
            <legend>Default sending days</legend>
            <div className="settings-page__day-grid">
              {DAYS.map(({ key, label }) => (
                <CheckboxField
                  key={key}
                  id={`default-day-${key}`}
                  checked={form.sendDays.includes(key)}
                  onChange={() => toggleDay(key)}
                >
                  {label}
                </CheckboxField>
              ))}
            </div>
            {errors.sendDays ? <p className="settings-page__error">{errors.sendDays}</p> : null}
          </fieldset>
        </section>

        <section className="app-card settings-page__section" aria-labelledby="signature-section">
          <div className="settings-page__section-head">
            <p className="eyebrow">Message defaults</p>
            <h2 id="signature-section">Signature and retention</h2>
            <p>The workspace signature is used when a sending inbox has no signature of its own.</p>
          </div>
          <div className="settings-page__grid">
            <TextareaField
              id="default-signature"
              label="Default signature"
              value={form.defaultSignature}
              onChange={(event) => updateField('defaultSignature', event.target.value)}
              error={errors.defaultSignature}
              rows={5}
              maxLength={5000}
              optional
              hint="Plain text; line breaks are preserved in sent messages."
            />
            <SelectField
              id="chat-retention-days"
              label="Assistant conversation retention"
              value={form.chatRetentionDays}
              onChange={(event) => updateField('chatRetentionDays', event.target.value)}
              hint="Older assistant conversations and their messages are deleted by the background cleanup job."
            >
              <option value="30">30 days</option>
              <option value="90">90 days</option>
              <option value="180">180 days</option>
              <option value="365">365 days</option>
            </SelectField>
          </div>
        </section>

        <section className="app-card settings-page__section" aria-labelledby="ai-section">
          <div className="settings-page__section-head">
            <p className="eyebrow">AI</p>
            <h2 id="ai-section">Workspace AI drafting</h2>
            <p>When disabled, campaign editors cannot generate AI drafts for this workspace.</p>
          </div>
          <CheckboxField
            id="workspace-ai-enabled"
            checked={form.aiDraftingEnabled}
            onChange={(event) => updateField('aiDraftingEnabled', event.target.checked)}
          >
            Allow AI drafting in campaigns
          </CheckboxField>
        </section>
      </form>
    </div>
  )
}
