import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
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
import {
  CONTACTS_PAGE_SIZE,
  CONTACT_STATUSES,
  TAG_STORAGE_AVAILABLE,
  formatContactDate,
  getAllContactTags,
  listContacts,
  loadContactCompanies,
} from '../../../lib/contacts'
import {
  bulkPatchContacts,
  downloadCsv,
  exportContactsView,
} from '../../../lib/contactBulk'
import { useSession } from '../../../lib/session'
import { usePageTitle } from '../../../lib/usePageTitle'
import { BulkUpdateModal } from './BulkUpdateModal'
import { ContactFormModal } from './ContactFormModal'
import { MergeDuplicatesModal } from './MergeDuplicatesModal'
import './contacts.css'

function formatDate(value) {
  return formatContactDate(value) ?? '—'
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
  const pageSize = CONTACTS_PAGE_SIZE

  const [searchInput, setSearchInput] = useState(search)
  const [companies, setCompanies] = useState([])
  const [rows, setRows] = useState([])
  const [total, setTotal] = useState(0)
  const [status, setStatus] = useState('loading')
  const [error, setError] = useState(null)
  const [refreshKey, setRefreshKey] = useState(0)
  const [formOpen, setFormOpen] = useState(false)

  const [selectedKeys, setSelectedKeys] = useState(() => new Set())
  const [bulkOpen, setBulkOpen] = useState(false)
  const [bulkRun, setBulkRun] = useState(null)
  const [bulkError, setBulkError] = useState(null)
  const [archiveOpen, setArchiveOpen] = useState(false)
  const [archiveRun, setArchiveRun] = useState(null)
  const [archiveError, setArchiveError] = useState(null)
  const [mergeOpen, setMergeOpen] = useState(false)
  const [exporting, setExporting] = useState(false)

  const { toast } = useToast()

  // Wait for the profile before calling the role read-only, otherwise owners
  // see a "Read-only" flash while /auth/me is in flight.
  const roleKnown = profileStatus === 'ready'
  const canWrite = roleKnown && (role === 'owner' || role === 'admin')
  const hasFilters = Boolean(search || statusFilter || companyId)

  const companyMap = useMemo(
    () => new Map(companies.map((company) => [company.id, company])),
    [companies],
  )
  const activeCompany = companyId ? companyMap.get(companyId) ?? null : null
  const tagsByContact = TAG_STORAGE_AVAILABLE ? getAllContactTags() : {}

  function patchParams(patch, options = {}) {
    const next = new URLSearchParams(params)
    for (const [key, value] of Object.entries(patch)) {
      if (value === undefined || value === null || value === '') next.delete(key)
      else next.set(key, String(value))
    }
    setParams(next, options)
  }

  useEffect(() => {
    setSearchInput(search)
  }, [search])

  // Debounce typing into the URL so the list request is not fired per keystroke.
  useEffect(() => {
    if (searchInput === search) return undefined
    const timer = setTimeout(() => {
      patchParams({ search: searchInput.trim(), page: null }, { replace: true })
    }, 300)
    return () => clearTimeout(timer)
    // patchParams is intentionally not a dependency; params is read at fire time.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchInput, search])

  useEffect(() => {
    const controller = new AbortController()

    loadContactCompanies(controller.signal)
      .then(setCompanies)
      .catch(() => {})

    return () => controller.abort()
  }, [refreshKey])

  // Row selection is scoped to what is on screen; changing the view clears it
  // so a bulk action never touches a record the user can no longer see.
  useEffect(() => {
    setSelectedKeys(new Set())
  }, [search, statusFilter, companyId, page])

  useEffect(() => {
    const controller = new AbortController()
    setStatus('loading')
    setError(null)

    listContacts(
      {
        search,
        status: statusFilter,
        companyId,
        limit: pageSize,
        offset: (page - 1) * pageSize,
      },
      controller.signal,
    )
      .then((data) => {
        setRows(data.items)
        setTotal(data.total)
        setStatus('ready')

        const lastPage = Math.max(1, Math.ceil(data.total / pageSize))
        if (page > lastPage) patchParams({ page: lastPage }, { replace: true })
      })
      .catch((caught) => {
        if (caught?.name === 'AbortError') return
        setError(caught)
        setStatus(caught?.status === 403 ? 'denied' : 'error')
      })

    return () => controller.abort()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, statusFilter, companyId, page, pageSize, refreshKey])

  function resetFilters() {
    setSearchInput('')
    setParams(new URLSearchParams(), { replace: true })
  }

  function clearSelection() {
    setSelectedKeys(new Set())
  }

  async function handleExport() {
    setExporting(true)
    try {
      const result = await exportContactsView({
        search,
        status: statusFilter,
        companyId,
      })

      if (result.count === 0) {
        toast.info('No contacts match this view, so there is nothing to export.')
        return
      }

      downloadCsv(result.csv, result.filename)

      if (result.truncated) {
        toast.warning(
          `Exported the first ${plural(result.count, 'contact')}; this view has ${result.total.toLocaleString()}.`,
        )
      } else {
        toast.success(
          `Exported ${plural(result.count, 'contact')} with CSV-injection protection.`,
        )
      }
    } catch (caught) {
      toast.error(caught?.message || 'The export could not be prepared.')
    } finally {
      setExporting(false)
    }
  }

  async function handleBulkUpdate(patch) {
    const ids = [...selectedKeys]
    if (ids.length === 0) return

    setBulkError(null)
    setBulkRun({ done: 0, total: ids.length })

    try {
      const result = await bulkPatchContacts(ids, patch, {
        onProgress: (done, total) => setBulkRun({ done, total }),
      })

      setRefreshKey((key) => key + 1)

      if (result.failed.length > 0) {
        const reason =
          result.failed[0]?.error?.message || 'One contact could not be updated.'
        setBulkError({
          message: `${result.failed.length} of ${result.total} contacts could not be updated. ${reason}`,
        })
        toast.warning(
          `${result.updated.length} updated, ${result.failed.length} failed.`,
        )
      } else {
        toast.success(`${plural(result.updated.length, 'contact')} updated.`)
        setBulkOpen(false)
        clearSelection()
      }
    } catch (caught) {
      setBulkError(caught)
      toast.error(caught?.message || 'The bulk update could not be completed.')
    } finally {
      setBulkRun(null)
    }
  }

  async function handleArchive() {
    const ids = [...selectedKeys]
    if (ids.length === 0) return

    setArchiveError(null)
    setArchiveRun({ done: 0, total: ids.length })

    try {
      const result = await bulkPatchContacts(ids, { status: 'archived' }, {
        onProgress: (done, total) => setArchiveRun({ done, total }),
      })

      setRefreshKey((key) => key + 1)

      if (result.failed.length > 0) {
        const reason =
          result.failed[0]?.error?.message || 'One contact could not be archived.'
        setArchiveError({
          message: `${result.failed.length} of ${result.total} contacts could not be archived. ${reason}`,
        })
        toast.warning(
          `${result.updated.length} archived, ${result.failed.length} failed.`,
        )
      } else {
        toast.success(`${plural(result.updated.length, 'contact')} archived.`)
        setArchiveOpen(false)
        clearSelection()
      }
    } catch (caught) {
      setArchiveError(caught)
      toast.error(caught?.message || 'The archive could not be completed.')
    } finally {
      setArchiveRun(null)
    }
  }

  const companyOptions = companies.map((company) => ({
    value: company.id,
    label: company.name,
  }))

  if (companyId && !companyMap.has(companyId)) {
    companyOptions.push({ value: companyId, label: 'Selected company' })
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
      render: (row) => {
        const company = row.companyId ? companyMap.get(row.companyId) : null
        if (!row.companyId) return <span className="contacts__muted">—</span>
        if (!company) return <span className="contacts__muted">Attached company</span>

        return (
          <Link
            to={`/app/companies/${company.id}`}
            className="contacts__company-link"
            onClick={(event) => event.stopPropagation()}
          >
            {company.name}
          </Link>
        )
      },
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
      render: (row) => (
        <StatusBadge status={row.emailStatus} size="sm" dot={false} />
      ),
    },
    {
      key: 'lastContacted',
      header: 'Last contacted',
      render: (row) => (
        <span className="contacts__muted">{formatDate(row.lastContactedAt)}</span>
      ),
    },
  ]

  if (TAG_STORAGE_AVAILABLE) {
    columns.push({
      key: 'tags',
      header: 'Tags',
      render: (row) => {
        const tags = tagsByContact[row.id] ?? []
        if (tags.length === 0) return <span className="contacts__muted">—</span>

        return (
          <span className="contacts__tag-list">
            {tags.slice(0, 3).map((tag) => (
              <Badge key={tag} tone="outline" size="sm">
                {tag}
              </Badge>
            ))}
            {tags.length > 3 ? (
              <span className="contacts__muted">+{tags.length - 3}</span>
            ) : null}
          </span>
        )
      },
    })
  }

  const emptyState = hasFilters ? (
    <EmptyState
      compact
      icon={Search}
      title="No contacts match these filters"
      description={
        companyId
          ? 'Try clearing the company filter, or add a contact to this company.'
          : 'Try a different name or email, or clear the status filter.'
      }
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
          status !== 'denied' ? (
            <>
              <Button
                variant="ghost"
                leadingIcon={Download}
                onClick={handleExport}
                loading={exporting}
                disabled={status !== 'ready' || total === 0}
                title="Download all pages of the current filtered view as CSV"
              >
                Export view
              </Button>
              {canWrite ? (
                <Button
                  variant="ghost"
                  leadingIcon={Merge}
                  onClick={() => setMergeOpen(true)}
                >
                  Merge duplicates
                </Button>
              ) : null}
              {canWrite ? (
                <Button
                  variant="primary"
                  leadingIcon={Plus}
                  onClick={() => setFormOpen(true)}
                >
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

      {status === 'denied' ? (
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
            activeCount={
              (search ? 1 : 0) + (statusFilter ? 1 : 0) + (companyId ? 1 : 0)
            }
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
              options={companyOptions}
              placeholder="All companies"
            />
          </FilterBar>

          {companyId ? (
            <div className="contacts__scope">
              <Building size={15} aria-hidden="true" />
              <span>
                Showing contacts at{' '}
                <strong>{activeCompany?.name ?? 'the selected company'}</strong>
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
                  onClick={() => {
                    setArchiveError(null)
                    setArchiveOpen(true)
                  }}
                  disabled={Boolean(bulkRun || archiveRun)}
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
                  disabled={Boolean(bulkRun || archiveRun)}
                >
                  Update fields
                </Button>
                <Button
                  variant="quiet"
                  size="sm"
                  onClick={clearSelection}
                  disabled={Boolean(bulkRun || archiveRun)}
                >
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
            loading={status === 'loading'}
            skeletonRows={6}
            error={status === 'error' ? error : null}
            onRetry={() => setRefreshKey((key) => key + 1)}
            empty={emptyState}
            selectable={canWrite}
            selectedKeys={selectedKeys}
            onSelectionChange={setSelectedKeys}
            onRowClick={(row) => navigate(`/app/contacts/${row.id}`)}
            rowLabel={(row) => `Select ${row.fullName}`}
          />

          {status === 'ready' && total > 0 ? (
            <Pagination
              page={page}
              pageSize={pageSize}
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
        defaultCompany={activeCompany}
        onClose={() => setFormOpen(false)}
        onSaved={(saved) => {
          setFormOpen(false)
          if (page !== 1) patchParams({ page: null }, { replace: true })
          setRefreshKey((key) => key + 1)
          navigate(`/app/contacts/${saved.id}`)
        }}
      />

      <BulkUpdateModal
        open={bulkOpen}
        count={selectedKeys.size}
        companies={companies}
        running={Boolean(bulkRun)}
        progress={bulkRun}
        error={bulkError}
        onClose={() => {
          if (bulkRun) return
          setBulkOpen(false)
          setBulkError(null)
        }}
        onApply={handleBulkUpdate}
      />

      <ConfirmDialog
        open={archiveOpen}
        title={`Archive ${plural(selectedKeys.size, 'contact')}?`}
        description="Archived contacts stay in the workspace with their details intact. Change the status back at any time."
        confirmLabel={archiveError ? 'Try again' : 'Archive contacts'}
        loading={Boolean(archiveRun)}
        onConfirm={handleArchive}
        onCancel={() => {
          if (archiveRun) return
          setArchiveOpen(false)
          setArchiveError(null)
        }}
      >
        {archiveRun ? (
          <div className="contacts__bulk-progress">
            <p role="status">
              Archiving {archiveRun.done.toLocaleString()} of{' '}
              {archiveRun.total.toLocaleString()}…
            </p>
            <div className="contacts__progress" aria-hidden="true">
              <span
                style={{
                  width: `${Math.round(
                    (archiveRun.done / Math.max(1, archiveRun.total)) * 100,
                  )}%`,
                }}
              />
            </div>
          </div>
        ) : (
          <ul className="contacts__archive-list">
            <li>Each selected contact moves to the archived status.</li>
            <li>No contact details are deleted.</li>
            <li>Every change writes a contact.updated entry to the audit log.</li>
          </ul>
        )}

        {archiveError ? (
          <p className="contacts__bulk-error" role="alert">
            {archiveError.message || 'The archive could not be completed.'}
          </p>
        ) : null}
      </ConfirmDialog>

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
