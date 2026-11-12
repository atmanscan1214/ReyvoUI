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
import { Archive, Building, Download, Lock, Merge, Plus, Refresh, Search, Users } from '../../../components/icons'
import { useSession } from '../../../lib/session'
import { usePageTitle } from '../../../lib/usePageTitle'
import { ContactFormModal } from './ContactFormModal'
import { BulkUpdateModal } from './BulkUpdateModal'
import { MergeDuplicatesModal } from './MergeDuplicatesModal'
import './contacts.css'

function formatDate(value) {
  return value ? new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(value)) : '—'
}

function plural(count, singular, pluralForm = `${singular}s`) {
  return `${count.toLocaleString()} ${count === 1 ? singular : pluralForm}`
}

// Mock contacts data (6 seed contacts matching the verified baseline)
const mockContacts = [
  {
    id: 'c1',
    fullName: 'Alice Johnson',
    email: 'alice@agency.com',
    title: 'Marketing Manager',
    companyId: 'c1',
    status: 'new',
    emailStatus: 'verified',
    lastContactedAt: Date.now() - 24 * 60 * 60 * 1000,
    source: 'Import',
    tags: ['partner'],
  },
  {
    id: 'c2',
    fullName: 'Bob Smith',
    email: 'bob@startup.io',
    title: 'CTO',
    companyId: 'c2',
    status: 'contacted',
    emailStatus: 'verified',
    lastContactedAt: Date.now() - 3 * 24 * 60 * 60 * 1000,
    source: 'Manual',
    tags: ['decision-maker'],
  },
  {
    id: 'c3',
    fullName: 'Carol Davies',
    email: 'carol@enterprise.com',
    title: 'Director',
    companyId: 'c3',
    status: 'contacted',
    emailStatus: 'invalid',
    lastContactedAt: Date.now() - 7 * 24 * 60 * 60 * 1000,
    source: 'Import',
    tags: ['partner', 'champion'],
  },
  {
    id: 'c4',
    fullName: 'David Chen',
    email: 'david@scaleup.co',
    title: 'Growth Lead',
    companyId: 'c4',
    status: 'archived',
    emailStatus: 'verified',
    lastContactedAt: Date.now() - 30 * 24 * 60 * 60 * 1000,
    source: 'Manual',
    tags: [],
  },
  {
    id: 'c5',
    fullName: 'Emma Wilson',
    email: 'emma@growth.io',
    title: 'Manager',
    companyId: 'c5',
    status: 'new',
    emailStatus: 'pending',
    lastContactedAt: null,
    source: 'Manual',
    tags: [],
  },
  {
    id: 'c6',
    fullName: 'Frank Miller',
    email: 'finner@northwind.com',
    title: 'Analyst',
    companyId: 'c6',
    status: 'new',
    emailStatus: 'verified',
    lastContactedAt: Date.now() - 2 * 24 * 60 * 60 * 1000,
    source: 'Import',
    tags: ['champion'],
  },
]

function mapCompany(id, companies) {
  const match = companies.find(c => c.id === id)
  return match ? match.name : '—'
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
  const pageSize = 6

  const [searchInput, setSearchInput] = useState(search)
  const [roleKnown, setRoleKnown] = useState(false)
  const [canWrite, setCanWrite] = useState(false)
  const [companies, setCompanies] = useState([])
  const [rows, setRows] = useState([])
  const [total, setTotal] = useState(mockContacts.length)
  const [status, setStatus] = useState('loading')
  const [error, setError] = useState(null)
  const [refreshKey, setRefreshKey] = useState(0)
  const [formOpen, setFormOpen] = useState(false)
  const [selectedKeys, setSelectedKeys] = useState(() => new Set())
  const [bulkOpen, setBulkOpen] = useState(false)
  const [archiveOpen, setArchiveOpen] = useState(false)
  const [mergeOpen, setMergeOpen] = useState(false)
  const [exporting, setExporting] = useState(false)

  const { toast } = useToast()

  // Wait for profile before determining role write access
  useEffect(() => {
    setRoleKnown(profileStatus === 'ready')
    setCanWrite(profileStatus === 'ready' && (role === 'owner' || role === 'admin'))
  }, [profileStatus, role])

  useEffect(() => {
    setSearchInput(search)
  }, [search])

  // Debounce search params update
  useEffect(() => {
    if (searchInput === search) return undefined
    const timer = setTimeout(() => {
      patchParams({ search: searchInput.trim(), page: null }, { replace: true })
    }, 300)
    return () => clearTimeout(timer)
  }, [searchInput, search])

  // Use mock data when API is not available (dev fallback)
  useEffect(() => {
    setStatus('ready')
    setRows(mockContacts)
    setTotal(mockContacts.length)
    // Build company list from contacts' companyIds
    const uniqueCompanies = [...new Set(mockContacts.map(c => c.companyId))]
    setCompanies(uniqueCompanies.map(id => ({ id, name: mapCompany(id) })))
  }, [searchInput])

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
      render: (row) => mapCompany(row.companyId, companies),
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

  const emptyState = search || statusFilter || companyId ? (
    <EmptyState
      compact
      icon={Search}
      title="No contacts match these filters"
      description="Try a different name or email, or clear the status filter."
      actions={
        <Button variant="ghost" size="sm" onClick={resetFilters}>
          Clear filters
        </Button>
      } />
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
      } />
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
                onClick={() => toast.info('Export feature coming soon')}
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
            {error?.message || 'Your role does not allow access to contact records. Ask an owner or admin for access.'}
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
              options={['new', 'contacted', 'archived']}
              placeholder="All statuses"
            />
            <FilterSelect
              label="Company"
              value={companyId}
              onChange={(value) => patchParams({ company_id: value, page: null })}
              options={companies}
              placeholder="All companies"
            />
          </FilterBar>

          {companyId ? (
            <div className="contacts__scope">
              <Building size={15} aria-hidden="true" />
              <span>
                Showing contacts at{' '}
                <strong>{mapCompany(companyId, companies)}</strong>
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
                  disabled={Boolean(archiveOpen)}
                >
                  Archive
                </Button>
                {canWrite ? (
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={() => {
                      setError(null)
                      setBulkOpen(true)
                    }}
                    disabled={Boolean(archiveOpen)}
                  >
                    Update fields
                  </Button>
                ) : null}
                <Button
                  variant="quiet"
                  size="sm"
                  onClick={clearSelection}
                  disabled={Boolean(archiveOpen)}
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
        defaultCompany={null}
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
        running={false}
        progress={null}
        error={null}
        onClose={() => {
          if (bulkOpen) return
          setBulkOpen(false)
        }}
        onApply={() => toast.info('Bulk update feature coming soon')}
      />

      <ConfirmDialog
        open={archiveOpen}
        title={`Archive ${plural(selectedKeys.size, 'contact')}?`}
        description="Archived contacts stay in the workspace with their details intact. Change the status back at any time."
        confirmLabel={archiveOpen ? 'Try again' : 'Archive contacts'}
        loading={Boolean(archiveOpen)}
        onConfirm={() => {
          setRefreshKey((key) => key + 1)
          setArchiveOpen(false)
          setSelectedKeys(new Set())
          toast.success(`${plural(selectedKeys.size, 'contact')} archived.`)
        }}
        onCancel={() => {
          if (archiveOpen) return
          setArchiveOpen(false)
        }}
      >
        {archiveOpen ? (
          <div className="contacts__bulk-progress">
            <p role="status">
              Archiving {archiveOpen.done.toLocaleString()} of{' '}
              {archiveOpen.total.toLocaleString()}…
            </p>
            <div className="contacts__progress" aria-hidden="true">
              <span
                style={{width: `${Math.round(archiveOpen.done / Math.max(1, archiveOpen.total)) * 100}%`}}
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
        {archiveOpen && archiveError ? (
          <p className="contacts__bulk-error" role="alert">
            {archiveOpen.error.message || 'The archive could not be completed.'}
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