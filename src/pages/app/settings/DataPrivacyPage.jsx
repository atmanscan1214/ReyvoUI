import { useState } from 'react'
import { AlertTriangle, Database, Download, Info, Trash } from '../../../components/icons'
import { TextField } from '../../../components/Field'
import {
  Button,
  ConfirmDialog,
  ErrorPanel,
  PageHeader,
  Skeleton,
  useToast,
} from '../../../components/ui'
import { api } from '../../../lib/api'
import { downloadBlob } from '../../../lib/download'
import { createZip } from '../../../lib/zip'
import { useSession } from '../../../lib/session'
import { usePageTitle } from '../../../lib/usePageTitle'
import './settings.css'

const EXPORT_SECTIONS = [
  { key: 'contacts', file: 'contacts.csv', label: 'Contacts' },
  { key: 'companies', file: 'companies.csv', label: 'Companies' },
  { key: 'campaigns', file: 'campaigns.csv', label: 'Campaigns' },
  { key: 'imports', file: 'imports.csv', label: 'Import history' },
  { key: 'suppressions', file: 'suppressions.csv', label: 'Suppressions' },
  { key: 'audit_logs', file: 'audit-logs.csv', label: 'Audit log' },
]

function archiveDate() {
  return new Date().toISOString().slice(0, 10)
}

/**
 * T45 — data export and workspace deletion.
 *
 * The API returns the workspace export as JSON (`{ contacts, companies, ... }`
 * of CSV strings), so the browser packages the documents into one ZIP. Both
 * actions are owner-only and the API enforces the same role.
 */
export function DataPrivacyPage() {
  usePageTitle('Data & privacy')
  const { tenantDetails, tenantStatus, retryTenant, signOut } = useSession()
  const { toast } = useToast()
  const [exporting, setExporting] = useState(false)
  const [exportError, setExportError] = useState(null)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [confirmation, setConfirmation] = useState('')
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState(null)

  const workspaceName = tenantDetails?.name?.trim() || 'this workspace'
  const confirmed = confirmation.trim() === workspaceName

  if (tenantStatus === 'error') {
    return (
      <div className="app-page settings-page">
        <PageHeader eyebrow="Workspace" title="Data & privacy" />
        <ErrorPanel title="Couldn't load workspace details" onRetry={retryTenant} />
      </div>
    )
  }

  if (tenantStatus === 'loading' || !tenantDetails) {
    return (
      <div className="app-page settings-page">
        <PageHeader eyebrow="Workspace" title="Data & privacy" />
        <div className="app-card"><Skeleton lines={6} /></div>
      </div>
    )
  }

  async function handleExport() {
    setExporting(true)
    setExportError(null)
    try {
      const payload = await api.get('/tenants/current/export')
      const date = archiveDate()
      const files = EXPORT_SECTIONS.flatMap(({ key, file }) =>
        typeof payload?.[key] === 'string'
          ? [{ name: `reyvo-workspace-${date}/${file}`, content: payload[key] }]
          : [],
      )
      if (!files.length) {
        throw new Error('The server did not return any CSV documents.')
      }
      downloadBlob(createZip(files), `reyvo-workspace-${date}.zip`)
      toast.success('Workspace archive downloaded.')
    } catch (error) {
      setExportError(error?.message || 'The workspace archive could not be downloaded.')
    } finally {
      setExporting(false)
    }
  }

  function openDelete() {
    setConfirmation('')
    setDeleteError(null)
    setDeleteOpen(true)
  }

  function closeDelete() {
    if (deleting) return
    setDeleteOpen(false)
    setDeleteError(null)
  }

  async function handleDelete() {
    if (!confirmed || deleting) return
    setDeleting(true)
    setDeleteError(null)
    try {
      await api.delete('/tenants/current')
      setDeleteOpen(false)
      signOut()
    } catch (error) {
      setDeleteError(error?.message || 'The workspace could not be deleted.')
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div className="app-page settings-page data-page">
      <PageHeader
        eyebrow="Workspace"
        title="Data & privacy"
        description="Download a copy of your workspace data or schedule the workspace for permanent deletion."
      />

      <section className="app-card settings-page__section" aria-labelledby="export-section">
        <div className="settings-page__section-head">
          <p className="eyebrow">Export</p>
          <h2 id="export-section">Download your workspace</h2>
          <p>
            Export every CSV section in one ZIP archive. The archive is assembled in your browser
            from the API response, and each section is capped at 10,000 rows.
          </p>
        </div>

        <ul className="data-page__files">
          {EXPORT_SECTIONS.map(({ key, file, label }) => (
            <li key={key} className="data-page__file">
              <Database size={16} aria-hidden="true" />
              <span>
                {label}
                <code>{file}</code>
              </span>
            </li>
          ))}
        </ul>

        <div className="data-page__actions">
          <Button leadingIcon={Download} onClick={handleExport} loading={exporting}>
            Download workspace archive
          </Button>
          <span className="data-page__hint">ZIP · six CSV files · owner only</span>
        </div>

        {exportError ? (
          <p className="settings-page__error" role="alert">{exportError}</p>
        ) : null}
      </section>

      <section
        className="app-card settings-page__section data-page__danger"
        aria-labelledby="delete-section"
      >
        <div className="settings-page__section-head">
          <p className="eyebrow">Danger zone</p>
          <h2 id="delete-section">Delete this workspace</h2>
          <p>
            Deletion is scheduled with a 30-day grace period. Sending and sign-in stop immediately,
            and every contact, company, campaign, reply, import, suppression, and audit record is
            permanently purged when the window closes.
          </p>
        </div>

        <div className="data-page__notice" role="note">
          <AlertTriangle size={16} aria-hidden="true" />
          <span>Download an archive first — deletion cannot be undone after the 30-day window.</span>
        </div>

        <div className="data-page__actions">
          <Button variant="danger" leadingIcon={Trash} onClick={openDelete}>
            Delete workspace
          </Button>
          <Button variant="ghost" leadingIcon={Download} onClick={handleExport} loading={exporting}>
            Download a copy first
          </Button>
        </div>

        {deleteError && !deleteOpen ? (
          <p className="settings-page__error" role="alert">{deleteError}</p>
        ) : null}
      </section>

      <p className="data-page__footnote">
        <Info size={15} aria-hidden="true" />
        <span>Only workspace owners can export or delete a workspace. Every export request is scoped to this workspace.</span>
      </p>

      <ConfirmDialog
        open={deleteOpen}
        title="Delete this workspace?"
        description="This schedules permanent deletion in 30 days."
        confirmLabel="Delete workspace"
        loading={deleting}
        confirmDisabled={!confirmed}
        onConfirm={handleDelete}
        onCancel={closeDelete}
      >
        <div className="data-page__dialog">
          <p>
            <strong>{workspaceName}</strong> will stop sending and members will be signed out.
            All workspace data is purged after 30 days.
          </p>
          <Button
            variant="ghost"
            size="sm"
            leadingIcon={Download}
            onClick={handleExport}
            loading={exporting}
            disabled={deleting}
          >
            Download a copy first
          </Button>
          <TextField
            id="confirm-workspace-name"
            label={`Type “${workspaceName}” to confirm`}
            value={confirmation}
            onChange={(event) => setConfirmation(event.target.value)}
            autoComplete="off"
            spellCheck={false}
            hint="The name must match exactly."
          />
          {deleteError ? (
            <p className="settings-page__error" role="alert">{deleteError}</p>
          ) : null}
        </div>
      </ConfirmDialog>
    </div>
  )
}
