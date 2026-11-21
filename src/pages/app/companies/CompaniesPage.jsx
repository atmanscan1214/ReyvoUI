import { useEffect, useState } from 'react'
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
import { Building, Lock, Plus, Refresh, Search } from '../../../components/icons'
import { useSession } from '../../../lib/session'
import { usePageTitle } from '../../../lib/usePageTitle'
import { CompanyFormModal } from './CompanyFormModal'
import { BulkUpdateModal } from './BulkUpdateModal'
import { MergeDuplicatesModal } from './MergeDuplicatesModal'
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

function companyLocation(row) {
  if (!row) return ''
  if (row.city && row.country) return `${row.city}, ${row.country}`
  if (row.city) return row.city
  return ''
}

function mapCompany(id, companies) {
  const match = companies.find(c => c.id === id)
  return match ? match.name : '—'
}

// Fallback companies for when the API is unreachable (dev-first pattern, T02).
// Kept so the page renders immediately even without a running backend.
const mockCompanies = [
  { id: 'c1', name: 'Acme Corp', domain: 'acme.com', industry: 'Technology', location: 'San Francisco, US', employeeCount: 50, status: 'active', updatedAt: Date.now() - 2 * 24 * 60 * 60 * 1000 },
  { id: 'c2', name: 'Northwind Inc', domain: 'northwind.com', industry: 'Manufacturing', location: 'Chicago, US', employeeCount: 120, status: 'active', updatedAt: Date.now() - 1 * 24 * 60 * 60 * 1000 },
  { id: 'c3', name: 'Stark Industries', domain: 'stark.com', industry: 'Technology', location: 'New York, US', employeeCount: 300, status: 'active', updatedAt: Date.now() - 3 * 24 * 60 * 60 * 1000 },
  { id: 'c4', name: 'Hawkins Lab', domain: 'hawkins.com', industry: 'Science', location: 'Hawkins, IN', employeeCount: 15, status: 'active', updatedAt: Date.now() - 5 * 60 * 60 * 1000 },
  { id: 'c5', name: 'Pied Piper', domain: 'piedpiper.com', industry: 'Software', location: 'Palo Alto, US', employeeCount: 8, status: 'active', updatedAt: Date.now() - 12 * 60 * 60 * 1000 },
  { id: 'c6', name: 'Wayne Enterprises', domain: 'wayne.com', industry: 'Financial Services', location: 'Gotham, US', employeeCount: 2500, status: 'active', updatedAt: Date.now() - 24 * 60 * 60 * 1000 },
]

export function CompaniesPage() {
  usePageTitle('Companies')

  const navigate = useNavigate()
  const { role, profileStatus } = useSession()
  const [params, setParams] = useSearchParams()

  const search = params.get('search') ?? ''
  const industry = params.get('industry') ?? ''
  const page = Math.max(1, Number(params.get('page') ?? 1) || 1)
  const pageSize = 25

  const [searchInput, setSearchInput] = useState(search)
  const [roleKnown, setRoleKnown] = useState(false)
  const [canWrite, setCanWrite] = useState(false)
  const [industries, setIndustries] = useState(['Technology', 'Manufacturing', 'Science', 'Software', 'Financial Services'])
  const [companies, setCompanies] = useState([])
  const [rows, setRows] = useState([])
  const [total, setTotal] = useState(0)
  const [status, setStatus] = useState('loading')
  const [error, setError] = useState(null)
  const [refreshKey, setRefreshKey] = useState(0)
  const [formOpen, setFormOpen] = useState(false)
  const [selectedKeys, setSelectedKeys] = useState(() => new Set())
  const [bulkOpen, setBulkOpen] = useState(false)
  const [archiveOpen, setArchiveOpen] = useState(false)
  const [mergeOpen, setMergeOpen] = useState(false)

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
      patchParams({ search: searchInput.trim(), industry: industry, page: null }, { replace: true })
    }, 300)
    return () => clearTimeout(timer)
  }, [searchInput, search])

  // Fetch companies from live API. Fall back to mock data on error.
  useEffect(() => {
    let cancelled = false
    setStatus('loading')
    api.list('/companies', {
      params: { search: searchInput.trim(), industry, limit: pageSize, offset: (page - 1) * pageSize },
    }).then((data) => {
      if (!cancelled) {
        setRows(data.items)
        setTotal(data.total)
        setStatus('ready')
        // Populate industry filter from live data
        api.listIndustryOptions({ signal: new AbortController().signal }).then((opts) => {
          if (!cancelled) setIndustries(opts)
        })
      }
    }).catch((err) => {
      if (!cancelled && err?.status !== 401) {
        setStatus('error')
        setError(err?.message || 'Could not load companies')
        // Fallback to mock data so the page renders even without a running backend
        setRows(mockCompanies)
        setTotal(mockCompanies.length)
        setIndustries(['Technology', 'Manufacturing', 'Science', 'Software', 'Financial Services'])
      }
    })
    return () => {
      cancelled = true
    }
  }, [searchInput, industry, page])

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
      header: 'Company',
      render: (row) => (
        <div className="companies__company">
          <span className="companies__company-name">{row.name}</span>
          {row.domain ? <span className="companies__company-domain">www.{row.domain}</span> : null}
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

  const emptyState = search || industry ? (
    <EmptyState
      compact
      icon={Search}
      title="No companies match these filters"
      description="Try a different name or industry, or clear the filters."
      actions={
        <Button variant="ghost" size="sm" onClick={resetFilters}>
          Clear filters
        </Button>
      } />
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
      } />
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
            {error?.message || 'Your role does not allow access to company records. Ask an owner or admin for access.'}
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

          {canWrite && selectedKeys.size > 0 ? (
            <div className="companies__bulk" role="region" aria-label="Bulk actions">
              <span className="companies__bulk-count">
                <strong>{selectedKeys.size.toLocaleString()}</strong>{' '}
                {selectedKeys.size === 1 ? 'company selected' : 'companies selected'}
              </span>
              <div className="companies__bulk-actions">
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
                {canWrite && selectedKeys.size > 0 ? (
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
            caption="Companies"
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
      )

      <CompanyFormModal
        open={formOpen}
        company={null}
        onClose={() => setFormOpen(false)}
        onSaved={() => {
          setFormOpen(false)
          setRefreshKey((key) => key + 1)
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

      <MergeDuplicatesModal
        open={mergeOpen}
        companies={companies}
        onClose={() => setMergeOpen(false)}
        onMerged={() => {
          setRefreshKey((key) => key + 1)
          clearSelection()
        }}
      />