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
} from '../../../components/ui'
import { Building, Lock, Plus, Refresh, Search } from '../../../components/icons'
import {
  COMPANIES_PAGE_SIZE,
  companyLocation,
  listCompanies,
  listIndustryOptions,
} from '../../../lib/companies'
import { useSession } from '../../../lib/session'
import { usePageTitle } from '../../../lib/usePageTitle'
import { CompanyFormModal } from './CompanyFormModal'
import './companies.css'

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

export function CompaniesPage() {
  usePageTitle('Companies')

  const navigate = useNavigate()
  const { role, profileStatus } = useSession()
  const [params, setParams] = useSearchParams()

  const search = params.get('search') ?? ''
  const industry = params.get('industry') ?? ''
  const page = Math.max(1, Number(params.get('page') ?? 1) || 1)
  const pageSize = COMPANIES_PAGE_SIZE

  const [searchInput, setSearchInput] = useState(search)
  const [industries, setIndustries] = useState([])
  const [rows, setRows] = useState([])
  const [total, setTotal] = useState(0)
  const [status, setStatus] = useState('loading')
  const [error, setError] = useState(null)
  const [refreshKey, setRefreshKey] = useState(0)
  const [formOpen, setFormOpen] = useState(false)

  // Wait for the profile before calling the role read-only, otherwise owners
  // see a "Read-only" flash while /auth/me is in flight.
  const roleKnown = profileStatus === 'ready'
  const canWrite = roleKnown && (role === 'owner' || role === 'admin')
  const hasFilters = Boolean(search || industry)

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

    listIndustryOptions(controller.signal)
      .then(setIndustries)
      .catch(() => {})

    return () => controller.abort()
  }, [])

  useEffect(() => {
    const controller = new AbortController()
    setStatus('loading')
    setError(null)

    listCompanies(
      { search, industry, limit: pageSize, offset: (page - 1) * pageSize },
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
  }, [search, industry, page, pageSize, refreshKey])

  function resetFilters() {
    setSearchInput('')
    setParams(new URLSearchParams(), { replace: true })
  }

  const columns = [
    {
      key: 'name',
      header: 'Company',
      render: (row) => (
        <div className="companies__company">
          <span className="companies__company-name">{row.name}</span>
          {row.domain ? <span className="companies__company-domain">{row.domain}</span> : null}
        </div>
      ),
    },
    {
      key: 'industry',
      header: 'Industry',
      render: (row) => row.industry || <span className="companies__muted">—</span>,
    },
    {
      key: 'location',
      header: 'Location',
      render: (row) => companyLocation(row) || <span className="companies__muted">—</span>,
    },
    {
      key: 'employees',
      header: 'Employees',
      align: 'right',
      render: (row) =>
        row.employeeCount == null ? (
          <span className="companies__muted">—</span>
        ) : (
          row.employeeCount.toLocaleString()
        ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (row) => <StatusBadge status={row.status} size="sm" />,
    },
    {
      key: 'updated',
      header: 'Updated',
      render: (row) => (
        <span className="companies__muted">{formatDate(row.updatedAt)}</span>
      ),
    },
  ]

  const emptyState = hasFilters ? (
    <EmptyState
      compact
      icon={Search}
      title="No companies match these filters"
      description="Try a different name or domain, or clear the industry filter."
      actions={
        <Button variant="ghost" size="sm" onClick={resetFilters}>
          Clear filters
        </Button>
      }
    />
  ) : (
    <EmptyState
      compact
      icon={Building}
      title="No companies yet"
      description="Add the employers you are targeting. Contacts, notes, and custom fields stay attached to each record."
      actions={
        canWrite ? (
          <Button
            variant="primary"
            size="sm"
            leadingIcon={Plus}
            onClick={() => setFormOpen(true)}
          >
            Add your first company
          </Button>
        ) : undefined
      }
    />
  )

  return (
    <div className="app-page companies-page">
      <PageHeader
        eyebrow="Leads · Companies"
        title="Companies"
        description="The employer accounts you are targeting, with the contacts, notes, and custom fields attached to each one."
        meta={
          <>
            <Badge tone="neutral" dot>
              {total === 1 ? '1 company' : `${total} companies`}
            </Badge>
            {roleKnown && !canWrite ? (
              <Badge tone="warning" dot>
                Read-only
              </Badge>
            ) : null}
          </>
        }
        actions={
          canWrite && status !== 'denied' ? (
            <Button variant="primary" leadingIcon={Plus} onClick={() => setFormOpen(true)}>
              New company
            </Button>
          ) : null
        }
      />

      {roleKnown && !canWrite ? (
        <div className="companies__notice" role="status">
          <span className="companies__notice-icon" aria-hidden="true">
            <Lock size={17} />
          </span>
          <p>
            Your role can view companies but not create or change them. Ask an owner or admin when
            a record needs an update.
          </p>
        </div>
      ) : null}

      {status === 'denied' ? (
        <section className="app-card companies__denied">
          <span className="companies__denied-icon" aria-hidden="true">
            <Lock size={22} />
          </span>
          <h2>Companies are restricted</h2>
          <p>
            {error?.message ||
              'Your role does not allow access to company records. Ask an owner or admin for access.'}
          </p>
          <div className="companies__denied-actions">
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
            searchPlaceholder="Search by company name or domain…"
            searchLabel="Search companies"
            activeCount={(search ? 1 : 0) + (industry ? 1 : 0)}
            onReset={hasFilters ? resetFilters : undefined}
          >
            <FilterSelect
              label="Industry"
              value={industry}
              onChange={(value) => patchParams({ industry: value, page: null })}
              options={industries}
              placeholder="All industries"
            />
          </FilterBar>

          <DataTable
            caption="Companies"
            columns={columns}
            rows={rows}
            getRowKey={(row) => row.id}
            loading={status === 'loading'}
            skeletonRows={6}
            error={status === 'error' ? error : null}
            onRetry={() => setRefreshKey((key) => key + 1)}
            empty={emptyState}
            onRowClick={(row) => navigate(`/app/companies/${row.id}`)}
            rowLabel={(row) => `Open ${row.name}`}
          />

          {status === 'ready' && total > 0 ? (
            <Pagination
              page={page}
              pageSize={pageSize}
              total={total}
              onPageChange={(nextPage) => patchParams({ page: nextPage > 1 ? nextPage : null })}
              itemLabel="companies"
              showPageSize={false}
            />
          ) : null}
        </>
      )}

      <CompanyFormModal
        open={formOpen}
        company={null}
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
