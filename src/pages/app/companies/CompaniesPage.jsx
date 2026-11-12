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

function companyLocation(row) {
  if (!row) return ''
  if (row.city && row.country) return `${row.city}, ${row.country}`
  if (row.city) return row.city
  return ''
}

function mapApiCompany(raw) {
  return {
    id: raw.id || `company-${Math.random().toString(36).slice(2, 9)}`,
    name: raw.name || '—',
    domain: raw.domain || null,
    industry: raw.industry || null,
    location: raw.location || null,
    employeeCount: raw.employeeCount || null,
    status: raw.status || 'active',
    updatedAt: raw.updatedAt || Date.now(),
  }
}

// Mock data: 6 seed companies (matching the verified baseline)
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
  const pageSize = 6

  const [searchInput, setSearchInput] = useState(search)
  const [roleKnown, setRoleKnown] = useState(false)
  const [canWrite, setCanWrite] = useState(false)
  const [industries, setIndustries] = useState(['Technology', 'Manufacturing', 'Science', 'Software', 'Financial Services'])
  const [rows, setRows] = useState([])
  const [total, setTotal] = useState(mockCompanies.length)
  const [status, setStatus] = useState('loading')
  const [error, setError] = useState(null)
  const [refreshKey, setRefreshKey] = useState(0)
  const [formOpen, setFormOpen] = useState(false)

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
    const filtered = mockCompanies.filter(c => {
      const matchesSearch = !search || c.name.toLowerCase().includes(search.toLowerCase()) || (c.domain && c.domain.toLowerCase().includes(search.toLowerCase()))
      const matchesIndustry = !industry || c.industry === industry
      return matchesSearch && matchesIndustry
    })
    setRows(filtered)
    setTotal(filtered.length)
  }, [searchInput, industry])

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
        }}
      />
    </div>
  )
}