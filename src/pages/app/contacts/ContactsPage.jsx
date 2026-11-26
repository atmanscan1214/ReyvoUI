import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import {
  Badge,
  Button,
  ConfirmDialog,
  DataTable,
  EmptyState,
  FilterBar,
  FilterSelect,
  PageHeader,
  Pagination,
  StatusBadge,
  useToast,
} from '../../../components/ui'
import {
  Archive,
  Building,
  Download,
  Lock,
  Merge,
  Plus,
  Refresh,
  Search,
  Users,
} from '../../../components/icons'
import { useSession } from '../../../lib/session'
import { usePageTitle } from '../../../lib/usePageTitle'
import {
  CONTACTS_PAGE_SIZE,
  CONTACT_STATUSES,
  listContacts,
  loadContactCompanies,
} from '../../../lib/contacts'
import {
  CONTACT_EXPORT_MAX,
  bulkPatchContacts,
  downloadCsv,
  exportContactsView,
} from '../../../lib/contactBulk'
import { ContactFormModal } from './ContactFormModal'
import { BulkUpdateModal } from './BulkUpdateModal'
import { MergeDuplicatesModal } from './MergeDuplicatesModal'
import './contacts.css'

function formatDate(value) {
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

function plural(count, singular, pluralForm = `${singular}s`) {
  return `${count.toLocaleString()} ${count === 1 ? singular : pluralForm}`
}

export function ContactsPage() {
  usePageTitle('Contacts')

  const navigate = useNavigate()
  const { role, profileStatus } = useSession()
  const [params, setParams] = useSearchParams()

  const search = params.get('search') ?? ''
  const statusFilter = params.get('status') ?? ''
  const companyId = params.get('company_id') ?? ''
  const page = Math.max(1, Number(params.get('page') ?? 1) || 1)

  const [searchInput, setSearchInput] = useState(search)
  const [canWrite, setCanWrite] = useState(false)
  const [roleKnown, setRoleKnown] = useState(false)
  const [companies, setCompanies] = useState([])
  const [rows, setRows] = useState([])
  const [total, setTotal] = useState(0)
  const [loadState, setLoadState] = useState('loading')
  const [error, setError] = useState(null)
  const [refreshKey, setRefreshKey] = useState(0)

  const [formOpen, setFormOpen] = useState(false)
  const [selectedKeys, setSelectedKeys] = useState(() => new Set())
  const [bulkOpen, setBulkOpen] = useState(false)
  const [bulkRunning, setBulkRunning] = useState(false)
  const [bulkProgress, setBulkProgress] = useState(null)
  const [bulkError, setBulkError] = useState(null)
  const [archiveOpen, setArchiveOpen] = useState(false)
  const [archiving, setArchiving] = useState(false)
  const [mergeOpen, setMergeOpen] = useState(false)
  const [exporting, setExporting] = useState(false)

  const { toast } = useToast()

  const companyMap = useMemo(
    () => new Map(companies.map((company) => [company.id, company])),
    [companies],
  )

  useEffect(() => {
    setRoleKnown(profileStatus === 'ready')
    setCanWrite(profileStatus === 'ready' && (role === 'owner' || role === 'admin'))
  }, [profileStatus, role])

  useEffect(() => {
    setSearchInput(search)
  }, [search])

  // Debounce the search box into the URL so every keystroke is not a request.
  useEffect(() => {
    const next = searchInput.trim()
    if (next === search) return undefined
    const timer = setTimeout(() => {
      patchParams({ search: next, page: null }, { replace: true })
    }, 300)
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchInput, search])

  useEffect(() => {
    const controller = new AbortController()
    setLoadState('loading')
    setError(null)

    listContacts(
      {
        search: search || undefined,
        status: statusFilter || undefined,
        companyId: companyId || undefined,
        limit: CONTACTS_PAGE_SIZE,
        offset: (page - 1) * CONTACTS_PAGE_SIZE,
      },
      controller.signal,
    )
      .then((data) => {
        setRows(data.items)
        setTotal(data.total)
        setLoadState('ready')
      })
      .catch((caught) => {
        if (caught?.name === 'AbortError') return
        setError(caught)
        setLoadState(caught?.status === 403 ? 'denied' : 'error')
      })

    return () => controller.abort()
  }, [search, statusFilter, companyId, page, refreshKey])

  // Company names are not embedded in `ContactRead`, so the filter and rows
  // share one sampled `/companies` read.
  useEffect(() => {
    const controller = new AbortController()
    loadContactCompanies(controller.signal)
      .then((items) => setCompanies(items))
      .catch((caught) => {
        if (caught?.name !== 'AbortError') setCompanies([])
      })
    return () => controller.abort()
  }, [refreshKey])

  function patchParams(patch, options = {}) {
    const next = new URLSearchParams(params)
    for (const [key, value] of Object.entries(patch)) {
      if (value === undefined || value === null || value === '') next.delete(key)
      else next.set(key, String(value))
    }
    setParams(next, options)
  }

  function resetFilters() {
    setSearchInput('')
    setParams(new URLSearchParams(), { replace: true })
  }

  function clearSelection() {
    setSelectedKeys(new Set())
  }

  function companyName(id) {
    if (!id) return '—'
    return companyMap.get(id)?.name ?? '—'
  }

  const hasFilters = Boolean(search || statusFilter || companyId)

  async function handleExport() {
    if (exporting) return
    setExporting(true)
    try {
      const result = await exportContactsView({
        search: search || undefined,
        status: statusFilter || undefined,
        companyId: companyId || undefined,
        max: CONTACT_EXPORT_MAX,
      })

      if (result.count === 0) {
        toast.info('There are no contacts in this view to export.')
        return
      }

      downloadCsv(result.csv, result.filename)
      toast.success(
        `Exported ${plural(result.count, 'contact')}${result.hasFilters ? ' from the filtered view' : ''}.`,
      )
      if (result.truncated) {
        toast.info(
          `Only the first ${CONTACT_EXPORT_MAX.toLocaleString()} contacts were exported. Narrow the filters to capture the rest.`,
        )
      }
    } catch (caught) {
      if (caught?.name === 'AbortError') return
      toast.error(caught?.message || 'The export could not be created.')
    } finally {
      setExporting(false)
    }
  }

  async function applyBulkPatch(patch) {
    const ids = [...selectedKeys]
    if (ids.length === 0 || bulkRunning) return

    setBulkRunning(true)
    setBulkError(null)
    setBulkProgress({ done: 0, total: ids.length })

    try {
      const result = await bulkPatchContacts(ids, patch, {
        onProgress: (done, count) => setBulkProgress({ done, total: count }),
      })

      setRefreshKey((key) => key + 1)

      if (result.failed.length > 0) {
        setBulkError(
          `${result.failed.length} of ${result.total} contacts could not be updated. The rest were saved — try again for the failures.`,
        )
        return
      }

      setBulkOpen(false)
      clearSelection()
      toast.success(`Updated ${plural(result.updated.length, 'contact')}.`)
    } catch (caught) {
      if (caught?.name === 'AbortError') return
      setBulkError(caught?.message || 'The bulk update could not be completed.')
    } finally {
      setBulkRunning(false)
      setBulkProgress(null)
    }
  }

  async function handleArchive() {
    const ids = [...selectedKeys]
    if (ids.length === 0 || archiving) return

    setArchiving(true)
    try {
      const result = await bulkPatchContacts(ids, { status: 'archived' })
      setRefreshKey((key) => key + 1)

      if (result.failed.length > 0) {
        toast.error(
          `${result.failed.length} of ${result.total} contacts could not be archived. Try again for the failures.`,
        )
        return
      }

      setArchiveOpen(false)
      clearSelection()
      toast.success(`Archived ${plural(result.updated.length, 'contact')}.`)
    } catch (caught) {
      if (caught?.name === 'AbortError') return
      toast.error(caught?.message || 'The contacts could not be archived.')
    } finally {
      setArchiving(false)
    }
  }

  const columns = [
    {
      key: 'name',
      header: 'Contact',
      render: (row) => (
        <div className="contacts__person">
          <span className="contacts__person-name">{row.fullName}</span>
          <span className="contacts__person-email">{row.email}</span>
        </div>
      ),
    },
    {
      key: 'company',
      header: 'Company',
      render: (row) =>
        row.companyId ? (
          companyName(row.companyId)
        ) : (
          <span className="contacts__muted">—</span>
        ),
    },
    {
      key: 'title',
      header: 'Job title',
      render: (row) => row.title || <span className="contacts__muted">—</span>,
    },
    {
      key: 'status',
      header: 'Status',
      render: (row) => <StatusBadge status={row.status} size="sm" />,
    },
    {
      key: 'emailStatus',
      header: 'Email health',
      render: (row) => <StatusBadge status={row.emailStatus} size="sm" dot={false} />,
    },
    {
      key: 'lastContacted',
      header: 'Last contacted',
      render: (row) => (
        <span className="contacts__muted">{formatDate(row.lastContactedAt)}</span>
      ),
    },
  ]

  const emptyState = hasFilters ? (
    <EmptyState
      compact
      icon={Search}
      title="No contacts match these filters"
      description="Try a different name or email, or clear the filters."
      actions={
        <Button variant="ghost" size="sm" onClick={resetFilters}>
          Clear filters
        </Button>
      }
    />
  ) : (
    <EmptyState
      compact
      icon={Users}
      title="No contacts yet"
      description="Add the people you are reaching out to. Email is required; company, title, and context can come later."
      actions={
        canWrite ? (
          <Button
            variant="primary"
            size="sm"
            leadingIcon={Plus}
            onClick={() => setFormOpen(true)}
          >
            Add your first contact
          </Button>
        ) : undefined
      }
    />
  )

  return (
    <div className="app-page contacts-page">
      <PageHeader
        eyebrow="Leads · Contacts"
        title="Contacts"
        description="The people behind each company, with deliverability, status, and the context your team needs before reaching out."
        meta={
          <>
            <Badge tone="neutral" dot>
              {total === 1 ? '1 contact' : `${total} contacts`}
            </Badge>
            {roleKnown && !canWrite ? (
              <Badge tone="warning" dot>
                Read-only
              </Badge>
            ) : null}
          </>
        }
        actions={
          loadState !== 'denied' ? (
            <>
              <Button
                variant="ghost"
                leadingIcon={Download}
                onClick={handleExport}
                loading={exporting}
                disabled={exporting || loadState === 'loading' || total === 0}
                title="Download the current filtered view as CSV"
              >
                Export view
              </Button>
              {canWrite ? (
                <Button variant="ghost" leadingIcon={Merge} onClick={() => setMergeOpen(true)}>
                  Merge duplicates
                </Button>
              ) : null}
              {canWrite ? (
                <Button variant="primary" leadingIcon={Plus} onClick={() => setFormOpen(true)}>
                  New contact
                </Button>
              ) : null}
            </>
          ) : null
        }
      />

      {roleKnown && !canWrite ? (
        <div className="contacts__notice" role="status">
          <span className="contacts__notice-icon" aria-hidden="true">
            <Lock size={17} />
          </span>
          <p>
            Your role can view contacts but not create or change them. Ask an owner or admin when
            a record needs an update.
          </p>
        </div>
      ) : null}

      {loadState === 'denied' ? (
        <section className="app-card contacts__denied">
          <span className="contacts__denied-icon" aria-hidden="true">
            <Lock size={22} />
          </span>
          <h2>Contacts are restricted</h2>
          <p>
            {error?.message ||
              'Your role does not allow access to contact records. Ask an owner or admin for access.'}
          </p>
          <div className="contacts__denied-actions">
            <Button
              variant="ghost"
              leadingIcon={Refresh}
              onClick={() => setRefreshKey((key) => key + 1)}
            >
              Try again
            </Button>
            <Button variant="quiet" onClick={() => navigate('/app')}>
              Back to dashboard
            </Button>
          </div>
        </section>
      ) : (
        <>
          <FilterBar
            search={searchInput}
            onSearchChange={setSearchInput}
            searchPlaceholder="Search by name or email…"
            searchLabel="Search contacts"
            activeCount={(search ? 1 : 0) + (statusFilter ? 1 : 0) + (companyId ? 1 : 0)}
            onReset={hasFilters ? resetFilters : undefined}
          >
            <FilterSelect
              label="Status"
              value={statusFilter}
              onChange={(value) => patchParams({ status: value, page: null })}
              options={CONTACT_STATUSES}
              placeholder="All statuses"
            />
            <FilterSelect
              label="Company"
              value={companyId}
              onChange={(value) => patchParams({ company_id: value, page: null })}
              options={companies.map((company) => ({
                value: company.id,
                label: company.name,
              }))}
              placeholder="All companies"
            />
          </FilterBar>

          {companyId ? (
            <div className="contacts__scope">
              <Building size={15} aria-hidden="true" />
              <span>
                Showing contacts at <strong>{companyName(companyId)}</strong>
              </span>
              <button
                type="button"
                className="contacts__scope-clear"
                onClick={() => patchParams({ company_id: null, page: null })}
              >
                Show all contacts
              </button>
            </div>
          ) : null}

          {canWrite && selectedKeys.size > 0 ? (
            <div className="contacts__bulk" role="region" aria-label="Bulk actions">
              <span className="contacts__bulk-count">
                <strong>{selectedKeys.size.toLocaleString()}</strong>{' '}
                {selectedKeys.size === 1 ? 'contact selected' : 'contacts selected'}
              </span>
              <div className="contacts__bulk-actions">
                <Button
                  variant="ghost"
                  size="sm"
                  leadingIcon={Archive}
                  onClick={() => setArchiveOpen(true)}
                  disabled={archiving}
                >
                  Archive
                </Button>
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => {
                    setBulkError(null)
                    setBulkOpen(true)
                  }}
                  disabled={archiving}
                >
                  Update fields
                </Button>
                <Button variant="quiet" size="sm" onClick={clearSelection} disabled={archiving}>
                  Clear
                </Button>
              </div>
            </div>
          ) : null}

          <DataTable
            caption="Contacts"
            columns={columns}
            rows={rows}
            getRowKey={(row) => row.id}
            loading={loadState === 'loading'}
            skeletonRows={6}
            error={loadState === 'error' ? error : null}
            onRetry={() => setRefreshKey((key) => key + 1)}
            empty={emptyState}
            selectable={canWrite}
            selectedKeys={selectedKeys}
            onSelectionChange={setSelectedKeys}
            onRowClick={(row) => navigate(`/app/contacts/${row.id}`)}
            rowLabel={(row) => `Open ${row.fullName}`}
          />

          {loadState === 'ready' && total > 0 ? (
            <Pagination
              page={page}
              pageSize={CONTACTS_PAGE_SIZE}
              total={total}
              onPageChange={(nextPage) => patchParams({ page: nextPage > 1 ? nextPage : null })}
              itemLabel="contacts"
              showPageSize={false}
            />
          ) : null}
        </>
      )}

      <ContactFormModal
        open={formOpen}
        contact={null}
        defaultCompany={companyId || null}
        onClose={() => setFormOpen(false)}
        onSaved={(saved) => {
          setFormOpen(false)
          setRefreshKey((key) => key + 1)
          if (saved?.id) navigate(`/app/contacts/${saved.id}`)
        }}
      />

      <BulkUpdateModal
        open={bulkOpen}
        count={selectedKeys.size}
        companies={companies}
        running={bulkRunning}
        progress={bulkProgress}
        error={bulkError}
        onClose={() => {
          if (bulkRunning) return
          setBulkOpen(false)
        }}
        onApply={applyBulkPatch}
      />

      <ConfirmDialog
        open={archiveOpen}
        title={`Archive ${plural(selectedKeys.size, 'contact')}?`}
        description="Archived contacts stay in the workspace with their details intact. Change the status back at any time."
        confirmLabel="Archive contacts"
        loading={archiving}
        onConfirm={handleArchive}
        onCancel={() => {
          if (archiving) return
          setArchiveOpen(false)
        }}
      />

      <MergeDuplicatesModal
        open={mergeOpen}
        companies={companies}
        onClose={() => setMergeOpen(false)}
        onMerged={() => {
          setRefreshKey((key) => key + 1)
          clearSelection()
        }}
      />
    </div>
  )
}
