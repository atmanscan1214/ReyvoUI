import { useEffect, useMemo, useState } from 'react'
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
} from '../../../components/ui'
import { AlertTriangle, Building, Search, Shield } from '../../../components/icons'
import { usePageTitle } from '../../../lib/usePageTitle'
import {
  PLATFORM_PAGE_SIZE,
  TENANT_STATUSES,
  formatMoney,
  formatNumber,
  getPlatformOverview,
  listTenants,
  planLabel,
  riskMeta,
  tenantStatusMeta,
} from '../../../lib/platformAdmin'
import './platform.css'

export function PlatformTenantsPage() {
  usePageTitle('Tenant management')

  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()

  const search = params.get('search') ?? ''
  const status = params.get('status') ?? ''
  const page = Math.max(1, Number(params.get('page') ?? 1) || 1)

  const [searchInput, setSearchInput] = useState(search)
  const [rows, setRows] = useState([])
  const [total, setTotal] = useState(0)
  const [overview, setOverview] = useState(null)
  const [loadState, setLoadState] = useState('loading')
  const [error, setError] = useState(null)
  const [refreshKey, setRefreshKey] = useState(0)

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

    Promise.all([
      listTenants({ search, status, page, pageSize: PLATFORM_PAGE_SIZE }, controller.signal),
      getPlatformOverview(controller.signal),
    ])
      .then(([tenantPage, summary]) => {
        setRows(tenantPage.items)
        setTotal(tenantPage.total)
        setOverview(summary)
        setLoadState('ready')
      })
      .catch((caught) => {
        if (caught?.name === 'AbortError') return
        setError(caught)
        setLoadState(caught?.status === 403 ? 'denied' : 'error')
      })

    return () => controller.abort()
  }, [search, status, page, refreshKey])

  const overviewById = useMemo(() => {
    const map = new Map()
    for (const item of overview?.tenants ?? []) map.set(item.id, item)
    return map
  }, [overview])

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

  const hasFilters = Boolean(search || status)

  const columns = [
    {
      key: 'tenant',
      header: 'Tenant',
      render: (row) => {
        const meta = tenantStatusMeta(row.status)
        return (
          <div className="platform-tenant">
            <span className="platform-tenant__name">{row.name}</span>
            <span className="platform-tenant__slug">{row.slug}</span>
            <span className="platform-tenant__badges">
              <Badge tone={meta.tone} size="sm" dot>
                {meta.label}
              </Badge>
              {row.suspended_at ? (
                <Badge tone="danger" size="sm">
                  Suspended
                </Badge>
              ) : null}
            </span>
          </div>
        )
      },
    },
    {
      key: 'owner',
      header: 'Owner',
      render: (row) => {
        const owner = overviewById.get(row.id)?.owner_email
        return owner ? (
          <span className="platform-owner">{owner}</span>
        ) : (
          <span className="platform-muted">No active owner</span>
        )
      },
    },
    {
      key: 'plan',
      header: 'Plan',
      render: (row) => (
        <div className="platform-plan">
          <span>{planLabel(row.plan_code)}</span>
          <small>{formatMoney(overviewById.get(row.id)?.mrr_cents)}/mo</small>
        </div>
      ),
    },
    {
      key: 'contacts',
      header: 'Contacts',
      align: 'right',
      render: (row) => formatNumber(overviewById.get(row.id)?.contacts),
    },
    {
      key: 'campaigns',
      header: 'Campaigns',
      align: 'right',
      render: (row) => formatNumber(overviewById.get(row.id)?.campaigns),
    },
    {
      key: 'risk',
      header: 'Abuse risk',
      render: (row) => {
        const meta = riskMeta(overviewById.get(row.id)?.abuse_risk)
        return (
          <Badge tone={meta.tone} size="sm" dot>
            {meta.label}
          </Badge>
        )
      },
    },
    {
      key: 'support',
      header: 'Support',
      render: (row) =>
        overviewById.get(row.id)?.support_access ? (
          <Badge tone="warning" size="sm">
            Active grant
          </Badge>
        ) : (
          <span className="platform-muted">—</span>
        ),
    },
  ]

  const emptyState = hasFilters ? (
    <EmptyState
      compact
      icon={Search}
      title="No tenants match these filters"
      description="Try a different name, slug, owner, or plan, or clear the filters."
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
      title="No tenants yet"
      description="Workspaces appear here as soon as an account is created."
    />
  )

  return (
    <div className="app-page platform-page">
      <PageHeader
        eyebrow="Platform · Tenants"
        title="Tenant management"
        description="Search every workspace, inspect usage and abuse signals, and apply platform-level account actions. Every change is written to the audit log."
        meta={
          <>
            <Badge tone="neutral" dot>
              {formatNumber(overview?.tenants_total ?? total)} tenants
            </Badge>
            <Badge tone="success" dot>
              {formatMoney(overview?.mrr_cents)} MRR
            </Badge>
            {overview?.active_support_grants ? (
              <Badge tone="warning" dot>
                {overview.active_support_grants} active support grants
              </Badge>
            ) : null}
          </>
        }
        actions={
          <Button variant="ghost" leadingIcon={Shield} onClick={() => navigate('/app/platform/ops')}>
            Platform ops
          </Button>
        }
      />

      {loadState === 'denied' ? (
        <section className="app-card platform-denied">
          <Shield size={24} aria-hidden="true" />
          <h2>Platform staff only</h2>
          <p>{error?.message || 'Your account is not a Reyvo platform administrator.'}</p>
          <Button variant="ghost" onClick={() => navigate('/app')}>
            Back to dashboard
          </Button>
        </section>
      ) : (
        <>
          <div className="platform-stats">
            <div className="app-card platform-stat">
              <span>Tenants</span>
              <strong>{formatNumber(overview?.tenants_total ?? total)}</strong>
              <small>
                {formatNumber(overview?.tenants_by_status?.active)} active ·{' '}
                {formatNumber(overview?.tenants_by_status?.trial)} trial
              </small>
            </div>
            <div className="app-card platform-stat">
              <span>Monthly recurring revenue</span>
              <strong>{formatMoney(overview?.mrr_cents)}</strong>
              <small>List price of active plans</small>
            </div>
            <div className="app-card platform-stat">
              <span>Contacts</span>
              <strong>{formatNumber(overview?.contacts)}</strong>
              <small>{formatNumber(overview?.companies)} companies</small>
            </div>
            <div className="app-card platform-stat platform-stat--warning">
              <span>Abuse risk</span>
              <strong>{formatNumber(overview?.abuse_risk_counts?.high)} high</strong>
              <small>
                {formatNumber(overview?.abuse_risk_counts?.medium)} medium ·{' '}
                {formatNumber(overview?.abuse_risk_counts?.low)} low
              </small>
            </div>
          </div>

          <FilterBar
            search={searchInput}
            onSearchChange={setSearchInput}
            searchPlaceholder="Search name, slug, owner, or plan…"
            searchLabel="Search tenants"
            activeCount={(search ? 1 : 0) + (status ? 1 : 0)}
            onReset={hasFilters ? resetFilters : undefined}
          >
            <FilterSelect
              label="Status"
              value={status}
              onChange={(value) => patchParams({ status: value, page: null })}
              options={TENANT_STATUSES}
              placeholder="All statuses"
            />
          </FilterBar>

          <DataTable
            caption="Tenants"
            columns={columns}
            rows={rows}
            getRowKey={(row) => row.id}
            loading={loadState === 'loading'}
            skeletonRows={6}
            error={loadState === 'error' ? error : null}
            onRetry={() => setRefreshKey((key) => key + 1)}
            empty={emptyState}
            onRowClick={(row) => navigate(`/app/platform/${row.id}`)}
            rowLabel={(row) => `Open ${row.name}`}
          />

          {loadState === 'ready' && total > 0 ? (
            <Pagination
              page={page}
              pageSize={PLATFORM_PAGE_SIZE}
              total={total}
              onPageChange={(nextPage) => patchParams({ page: nextPage > 1 ? nextPage : null })}
              itemLabel="tenants"
              showPageSize={false}
            />
          ) : null}

          {overview?.abuse_risk_counts?.high ? (
            <div className="platform-note platform-note--warning" role="status">
              <AlertTriangle size={17} aria-hidden="true" />
              <span>
                {overview.abuse_risk_counts.high} tenant
                {overview.abuse_risk_counts.high === 1 ? '' : 's'} at high abuse risk. Open the
                tenant profile to review bounce and complaint rates before they affect deliverability.
              </span>
            </div>
          ) : null}
        </>
      )}
    </div>
  )
}
