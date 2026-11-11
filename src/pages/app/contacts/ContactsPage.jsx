import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import {
  Badge,
  Button,
  DataTable,
  EmptyState,
  FilterBar,
  FilterSelect,
  PageHeader,
  Pagination,
  StatusBadge,
  formatStatus,
} from '../../../components/ui'
import { Lock, Plus, Refresh, Search, UserCircle } from '../../../components/icons'
import { getCompany } from '../../../lib/companies'
import {
  CONTACTS_PAGE_SIZE,
  CONTACT_STATUSES,
  contactDisplayName,
  listCompanyDirectory,
  listContacts,
} from '../../../lib/contacts'
import { useSession } from '../../../lib/session'
import { usePageTitle } from '../../../lib/usePageTitle'
import { ContactFormModal } from './ContactFormModal'
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

export function ContactsPage() {
  usePageTitle('Contacts')

  const navigate = useNavigate()
  const { role, profileStatus } = useSession()
  const [params, setParams] = useSearchParams()

  const search = params.get('search') ?? ''
  const status = params.get('status') ?? ''
  // Company detail links here as /app/contacts?company_id=… so the People
  // card and this filter agree on the parameter name.
  const companyId = params.get('company_id') ?? ''
  const page = Math.max(1, Number(params.get('page') ?? 1) || 1)
  const pageSize = CONTACTS_PAGE_SIZE

  const [searchInput, setSearchInput] = useState(search)
  const [rows, setRows] = useState([])
  const [total, setTotal] = useState(0)
  const [listStatus, setListStatus] = useState('loading')
  const [error, setError] = useState(null)
  const [refreshKey, setRefreshKey] = useState(0)
  const [formOpen, setFormOpen] = useState(false)

  // Contacts carry only company_id; names come from a sampled company
  // directory (first 100 records), with an exact fetch for a company that
  // the active filter points at but the sample missed.
  const [directory, setDirectory] = useState({ options: [], nameById: new Map() })
  const [filterCompany, setFilterCompany] = useState(null)

  // Wait for the profile before calling the role read-only, otherwise owners
  // see a "Read-only" flash while /auth/me is in flight.
  const roleKnown = profileStatus === 'ready'
  const canWrite = roleKnown && (role === 'owner' || role === 'admin')
  const hasFilters = Boolean(search || status || companyId)

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

    listCompanyDirectory(controller.signal)
      .then(setDirectory)
      .catch(() => {})

    return () => controller.abort()
  }, [])

  // Resolve the filtered company exactly when the sample does not include it,
  // so the select shows a name instead of a blank option.
  useEffect(() => {
    if (!companyId) {
      setFilterCompany(null)
      return undefined
    }
    if (directory.nameById.has(companyId)) {
      setFilterCompany(null)
      return undefined
    }

    const controller = new AbortController()
    getCompany(companyId, controller.signal)
      .then((found) => setFilterCompany({ id: found.id, name: found.name }))
      .catch(() => setFilterCompany(null))

    return () => controller.abort()
  }, [companyId, directory])

  useEffect(() => {
    const controller = new AbortController()
    setListStatus('loading')
    setError(null)

    listContacts(
      { search, status, companyId, limit: pageSize, offset: (page - 1) * pageSize },
      controller.signal,
    )
      .then((data) => {
        setRows(data.items)
        setTotal(data.total)
        setListStatus('ready')

        const lastPage = Math.max(1, Math.ceil(data.total / pageSize))
        if (page > lastPage) patchParams({ page: lastPage > 1 ? lastPage : null }, { replace: true })
      })
      .catch((caught) => {
        if (caught?.name === 'AbortError') return
        setError(caught)
        setListStatus(caught?.status === 403 ? 'denied' : 'error')
      })

    return () => controller.abort()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, status, companyId, page, pageSize, refreshKey])

  function resetFilters() {
    setSearchInput('')
    setParams(new URLSearchParams(), { replace: true })
  }

  const companyOptions = filterCompany
    ? [
        ...directory.options.filter((option) => option.value !== filterCompany.id),
        { value: filterCompany.id, label: filterCompany.name },
      ]
    : directory.options

  const companyName = (id) =>
    directory.nameById.get(id) ??
    (filterCompany?.id === id ? filterCompany.name : null)

  const columns = [
    {
      key: 'contact',
      header: 'Contact',
      render: (row) => (
        <div className="contacts__contact">
          <span className="contacts__contact-name">{contactDisplayName(row)}</span>
          <span className="contacts__contact-email">{row.email}</span>
        </div>
      ),
    },
    {
      key: 'company',
      header: 'Company',
      render: (row) => companyName(row.companyId) || <span className="contacts__muted">—</span>,
    },
    {
      key: 'title',
      header: 'Title',
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
      render: (row) => <span className="contacts__muted">{formatDate(row.lastContactedAt)}</span>,
    },
  ]

  const emptyState = hasFilters ? (
    <EmptyState
      compact
      icon={Search}
      title="No contacts match these filters"
      description="Try a different name or email, or clear the status and company filters."
      actions={
        <Button variant="ghost" size="sm" onClick={resetFilters}>
          Clear filters
        </Button>
      }
    />
  ) : (
    <EmptyState
      compact
      icon={UserCircle}
      title="No contacts yet"
      description="Add the people you want to reach. Company context, consent state, and reply history stay attached to each record."
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
        description="The people behind each company, with consent and suppression history kept in one place."
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
          canWrite && listStatus !== 'denied' ? (
            <Button variant="primary" leadingIcon={Plus} onClick={() => setFormOpen(true)}>
              New contact
            </Button>
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

      {listStatus === 'denied' ? (
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
            searchPlaceholder="Search by contact name or email…"
            searchLabel="Search contacts"
            activeCount={(search ? 1 : 0) + (status ? 1 : 0) + (companyId ? 1 : 0)}
            onReset={hasFilters ? resetFilters : undefined}
          >
            <FilterSelect
              label="Status"
              value={status}
              onChange={(value) => patchParams({ status: value, page: null })}
              options={CONTACT_STATUSES.map((value) => ({
                value,
                label: formatStatus(value),
              }))}
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

          <DataTable
            caption="Contacts"
            columns={columns}
            rows={rows}
            getRowKey={(row) => row.id}
            loading={listStatus === 'loading'}
            skeletonRows={6}
            error={listStatus === 'error' ? error : null}
            onRetry={() => setRefreshKey((key) => key + 1)}
            empty={emptyState}
            onRowClick={(row) => navigate(`/app/contacts/${row.id}`)}
            rowLabel={(row) => `Open ${contactDisplayName(row)}`}
          />

          {listStatus === 'ready' && total > 0 ? (
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
        defaultCompanyId={companyId}
        onClose={() => setFormOpen(false)}
        onSaved={() => {
          setFormOpen(false)
          setRefreshKey((key) => key + 1)
          if (page !== 1) patchParams({ page: null }, { replace: true })
        }}
      />
    </div>
  )
}
