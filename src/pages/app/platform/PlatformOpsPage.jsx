import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  Badge,
  Button,
  DataTable,
  FilterBar,
  FilterSelect,
  PageHeader,
  Pagination,
  Skeleton,
  Tabs,
  useToast,
} from '../../../components/ui'
import {
  AlertTriangle,
  CheckCircle,
  Refresh,
  Shield,
} from '../../../components/icons'
import { api } from '../../../lib/api'
import { getSendingControls } from '../../../lib/adminControls'
import {
  PLATFORM_PAGE_SIZE,
  formatDateTime,
  formatMoney,
  formatNumber,
  getPlatformOverview,
  listPlatformAuditLogs,
  listSupportAccess,
  planLabel,
  revokeSupportAccess,
  riskMeta,
  tenantStatusMeta,
} from '../../../lib/platformAdmin'
import { usePageTitle } from '../../../lib/usePageTitle'
import './platform.css'

function healthBase() {
  if (typeof window === 'undefined') return ''
  try {
    return new URL(api.API_BASE, window.location.origin).origin
  } catch {
    return ''
  }
}

async function probe(path, signal) {
  const response = await fetch(`${healthBase()}${path}`, {
    signal,
    headers: { Accept: 'application/json' },
  })
  if (!response.ok) throw new Error(`The service answered with ${response.status}.`)
  return response.json().catch(() => ({}))
}

function Stat({ label, value, hint, tone = 'neutral' }) {
  return (
    <div className={`app-card platform-stat platform-stat--${tone}`}>
      <span>{label}</span>
      <strong>{value}</strong>
      {hint ? <small>{hint}</small> : null}
    </div>
  )
}

function TenantName({ id, tenants }) {
  const tenant = tenants.find((item) => item.id === id)
  return tenant ? (
    <Link to={`/app/platform/${id}`} className="platform-link">
      {tenant.name}
    </Link>
  ) : (
    <span className="platform-muted">{id ? `${id.slice(0, 8)}…` : 'Platform'}</span>
  )
}

function TenantRiskTable({ tenants, compact = false }) {
  const columns = [
    {
      key: 'name',
      header: 'Tenant',
      render: (row) => (
        <div className="platform-tenant">
          <Link to={`/app/platform/${row.id}`} className="platform-tenant__name platform-link">
            {row.name}
          </Link>
          <span className="platform-tenant__slug">{row.slug}</span>
        </div>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (row) => {
        const meta = tenantStatusMeta(row.status)
        return (
          <Badge tone={meta.tone} size="sm" dot>
            {meta.label}
          </Badge>
        )
      },
    },
    { key: 'plan', header: 'Plan', render: (row) => planLabel(row.plan_code) },
    {
      key: 'owner',
      header: 'Owner',
      render: (row) => row.owner_email || <span className="platform-muted">—</span>,
    },
    { key: 'contacts', header: 'Contacts', align: 'right', render: (row) => formatNumber(row.contacts) },
    {
      key: 'mrr',
      header: 'MRR',
      align: 'right',
      render: (row) => formatMoney(row.mrr_cents),
    },
    {
      key: 'risk',
      header: 'Abuse risk',
      render: (row) => {
        const meta = riskMeta(row.abuse_risk)
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
        row.support_access ? (
          <Badge tone="warning" size="sm">
            Active
          </Badge>
        ) : (
          <span className="platform-muted">—</span>
        ),
    },
  ]

  const rows = compact ? tenants.slice(0, 10) : tenants
  return (
    <DataTable
      caption="Tenants by risk"
      columns={columns}
      rows={rows}
      getRowKey={(row) => row.id}
      dense={compact}
      empty="No tenants yet."
    />
  )
}

function OverviewPanel({ overview, state, error, onRetry }) {
  if (state === 'loading' && !overview) {
    return (
      <div className="platform-panel-stack">
        <div className="platform-stats">
          {Array.from({ length: 4 }).map((_, index) => (
            <div key={index} className="app-card platform-stat">
              <Skeleton width="60%" height={12} />
              <Skeleton width="45%" height={30} />
            </div>
          ))}
        </div>
        <div className="app-card platform-panel">
          <Skeleton width="40%" height={20} />
          <Skeleton width="100%" height={14} />
          <Skeleton width="85%" height={14} />
        </div>
      </div>
    )
  }

  if (state === 'error') {
    return (
      <div className="app-card platform-panel platform-denied">
        <AlertTriangle size={22} aria-hidden="true" />
        <h2>Could not load platform usage</h2>
        <p>{error?.message || 'The overview endpoint did not respond.'}</p>
        <Button variant="ghost" leadingIcon={Refresh} onClick={onRetry}>
          Try again
        </Button>
      </div>
    )
  }

  return (
    <div className="platform-panel-stack">
      <div className="platform-stats">
        <Stat
          label="Tenants"
          value={formatNumber(overview?.tenants_total)}
          hint={`${formatNumber(overview?.tenants_by_status?.active)} active · ${formatNumber(overview?.tenants_by_status?.trial)} trial`}
        />
        <Stat label="MRR" value={formatMoney(overview?.mrr_cents)} hint="plan list price" tone="success" />
        <Stat
          label="Contacts"
          value={formatNumber(overview?.contacts)}
          hint={`${formatNumber(overview?.companies)} companies`}
        />
        <Stat
          label="Messages sent"
          value={formatNumber(overview?.messages_sent)}
          hint={`${formatNumber(overview?.replies)} replies`}
        />
        <Stat
          label="Campaigns"
          value={formatNumber(overview?.campaigns)}
          hint={`${formatNumber(overview?.active_campaigns)} active`}
        />
        <Stat
          label="Inboxes"
          value={formatNumber(overview?.inboxes)}
          hint={`${formatNumber(overview?.connected_inboxes)} connected · ${formatNumber(overview?.paused_inboxes)} paused`}
        />
        <Stat
          label="Abuse risk"
          value={`${formatNumber(overview?.abuse_risk_counts?.high)} high`}
          hint={`${formatNumber(overview?.abuse_risk_counts?.medium)} medium · ${formatNumber(overview?.abuse_risk_counts?.low)} low`}
          tone={overview?.abuse_risk_counts?.high ? 'warning' : 'neutral'}
        />
        <Stat
          label="Support grants"
          value={formatNumber(overview?.active_support_grants)}
          hint="active and unexpired"
          tone={overview?.active_support_grants ? 'warning' : 'neutral'}
        />
      </div>

      <section className="app-card platform-panel" aria-labelledby="platform-tenants-risk">
        <header className="platform-panel__head">
          <div>
            <p className="eyebrow">Attention</p>
            <h2 id="platform-tenants-risk">Tenants by risk and size</h2>
          </div>
          <Link to="/app/platform" className="platform-link">
            All tenants
          </Link>
        </header>
        <TenantRiskTable tenants={overview?.tenants ?? []} compact />
      </section>
    </div>
  )
}

function HealthPanel({ overview }) {
  const [health, setHealth] = useState({ api: 'loading', ready: 'loading' })
  const [checkedAt, setCheckedAt] = useState(null)
  const [refreshKey, setRefreshKey] = useState(0)
  const [controls, setControls] = useState(null)
  const [controlsState, setControlsState] = useState('loading')

  useEffect(() => {
    const controller = new AbortController()
    let cancelled = false
    setHealth({ api: 'loading', ready: 'loading' })

    Promise.all(
      [
        ['api', '/health'],
        ['ready', '/health/ready'],
      ].map(async ([key, path]) => {
        try {
          await probe(path, controller.signal)
          return [key, 'up']
        } catch (error) {
          if (error?.name === 'AbortError') return null
          return [key, 'down']
        }
      }),
    ).then((results) => {
      if (cancelled) return
      const next = {}
      for (const result of results) {
        if (result) next[result[0]] = result[1]
      }
      setHealth((current) => ({ ...current, ...next }))
      setCheckedAt(new Date())
    })

    getSendingControls(controller.signal)
      .then((data) => {
        setControls(data)
        setControlsState('ready')
      })
      .catch((error) => {
        if (error?.name === 'AbortError') return
        setControlsState('error')
      })

    return () => {
      cancelled = true
      controller.abort()
    }
  }, [refreshKey])

  const loading = health.api === 'loading' && health.ready === 'loading'

  return (
    <div className="platform-panel-stack">
      <section className="app-card platform-panel" aria-labelledby="platform-health">
        <header className="platform-panel__head">
          <div>
            <p className="eyebrow">Health</p>
            <h2 id="platform-health">API and dependencies</h2>
          </div>
          <Button
            variant="ghost"
            size="sm"
            leadingIcon={Refresh}
            onClick={() => setRefreshKey((key) => key + 1)}
            disabled={loading}
          >
            Re-check
          </Button>
        </header>

        <div className="platform-health">
          <div className="platform-health__check">
            <div>
              <strong>API</strong>
              <span>Requests are being accepted and processed.</span>
            </div>
            {health.api === 'loading' ? (
              <Skeleton width={92} height={22} />
            ) : (
              <Badge tone={health.api === 'up' ? 'success' : 'danger'} dot>
                {health.api === 'up' ? 'Operational' : 'Unavailable'}
              </Badge>
            )}
          </div>
          <div className="platform-health__check">
            <div>
              <strong>Database and cache</strong>
              <span>Dependencies used by sign-in, imports, and sending.</span>
            </div>
            {health.ready === 'loading' ? (
              <Skeleton width={92} height={22} />
            ) : (
              <Badge tone={health.ready === 'up' ? 'success' : 'danger'} dot>
                {health.ready === 'up' ? 'Operational' : 'Unavailable'}
              </Badge>
            )}
          </div>
        </div>
        <p className="platform-panel__lead">
          Last checked: {formatDateTime(checkedAt)}. Queue depth and mailbox-provider status are not
          exposed by this API build; inbox health and the platform kill switch are shown below.
        </p>
      </section>

      <div className="platform-stats">
        <Stat
          label="Connected inboxes"
          value={formatNumber(overview?.connected_inboxes)}
          hint={`${formatNumber(overview?.inboxes)} total`}
          tone="success"
        />
        <Stat
          label="Paused inboxes"
          value={formatNumber(overview?.paused_inboxes)}
          hint="tenant or platform pause"
          tone={overview?.paused_inboxes ? 'warning' : 'neutral'}
        />
        <Stat
          label="High-risk tenants"
          value={formatNumber(overview?.abuse_risk_counts?.high)}
          hint="crossed an abuse threshold"
          tone={overview?.abuse_risk_counts?.high ? 'warning' : 'neutral'}
        />
      </div>

      <section className="app-card platform-panel" aria-labelledby="platform-killswitch">
        <header className="platform-panel__head">
          <div>
            <p className="eyebrow">Sending</p>
            <h2 id="platform-killswitch">Platform kill switch</h2>
          </div>
          {controlsState === 'ready' ? (
            <Badge tone={controls?.kill_switch_enabled ? 'danger' : 'success'} dot>
              {controls?.kill_switch_enabled ? 'Engaged' : 'Released'}
            </Badge>
          ) : null}
        </header>

        {controlsState === 'loading' ? (
          <Skeleton width="70%" height={16} />
        ) : controlsState === 'error' ? (
          <p className="platform-error" role="alert">
            The sending-controls endpoint did not respond.
          </p>
        ) : (
          <div className="platform-killswitch">
            <div>
              <strong>
                {controls?.kill_switch_enabled
                  ? 'Sending is stopped platform-wide'
                  : 'Platform sending is enabled'}
              </strong>
              <span>
                {controls?.kill_switch_enabled
                  ? `Engaged${controls.kill_switch_reason ? ` — ${controls.kill_switch_reason}` : ''}`
                  : 'Engage or release the switch from Sending controls. Every change is audited.'}
              </span>
            </div>
            <Link to="/app/admin" className="btn btn--ghost btn--sm">
              Sending controls
            </Link>
          </div>
        )}
      </section>
    </div>
  )
}

function AuditPanel({ tenants }) {
  const [draft, setDraft] = useState({ search: '', action: '', actorType: '', tenantId: '' })
  const [filters, setFilters] = useState(draft)
  const [page, setPage] = useState(1)
  const [data, setData] = useState({ items: [], total: 0 })
  const [state, setState] = useState('loading')
  const [error, setError] = useState(null)
  const [refreshKey, setRefreshKey] = useState(0)

  useEffect(() => {
    const controller = new AbortController()
    setState('loading')
    setError(null)
    listPlatformAuditLogs({ ...filters, page, pageSize: PLATFORM_PAGE_SIZE }, controller.signal)
      .then((result) => {
        setData({ items: result.items ?? [], total: result.total ?? 0 })
        setState('ready')
      })
      .catch((caught) => {
        if (caught?.name === 'AbortError') return
        setError(caught)
        setState('error')
      })
    return () => controller.abort()
  }, [filters, page, refreshKey])

  function applyFilters(event) {
    event?.preventDefault()
    setPage(1)
    setFilters({
      search: draft.search.trim(),
      action: draft.action.trim(),
      actorType: draft.actorType,
      tenantId: draft.tenantId,
    })
  }

  function resetFilters() {
    const empty = { search: '', action: '', actorType: '', tenantId: '' }
    setDraft(empty)
    setFilters(empty)
    setPage(1)
  }

  const activeCount = Object.values(filters).filter(Boolean).length

  const columns = [
    {
      key: 'created_at',
      header: 'When',
      render: (row) => <span className="platform-nowrap">{formatDateTime(row.created_at)}</span>,
    },
    {
      key: 'action',
      header: 'Action',
      render: (row) => <code className="platform-code">{row.action}</code>,
    },
    {
      key: 'actor',
      header: 'Actor',
      render: (row) => (
        <div className="platform-actor">
          <Badge
            tone={row.actor_type === 'platform_admin' ? 'warning' : 'neutral'}
            size="sm"
          >
            {String(row.actor_type || 'unknown').replaceAll('_', ' ')}
          </Badge>
          {row.actor_id ? (
            <span className="platform-muted">{String(row.actor_id).slice(0, 8)}…</span>
          ) : null}
        </div>
      ),
    },
    {
      key: 'tenant',
      header: 'Tenant',
      render: (row) => <TenantName id={row.tenant_id} tenants={tenants} />,
    },
    {
      key: 'entity',
      header: 'Entity',
      render: (row) =>
        row.entity_type ? (
          <span>
            {row.entity_type}
            {row.entity_id ? (
              <span className="platform-muted"> · {String(row.entity_id).slice(0, 8)}…</span>
            ) : null}
          </span>
        ) : (
          <span className="platform-muted">—</span>
        ),
    },
    {
      key: 'source',
      header: 'Source',
      render: (row) => row.ip_address || <span className="platform-muted">—</span>,
    },
  ]

  return (
    <div className="platform-panel-stack">
      <form onSubmit={applyFilters}>
        <FilterBar
          search={draft.search}
          onSearchChange={(value) => setDraft((current) => ({ ...current, search: value }))}
          searchPlaceholder="Search action, entity, IP, or user agent…"
          searchLabel="Search platform audit log"
          activeCount={activeCount}
          onReset={activeCount ? resetFilters : undefined}
          actions={
            <Button type="submit" variant="primary" size="sm">
              Apply filters
            </Button>
          }
        >
          <FilterSelect
            label="Actor"
            value={draft.actorType}
            onChange={(value) => setDraft((current) => ({ ...current, actorType: value }))}
            options={[
              { value: 'user', label: 'User' },
              { value: 'platform_admin', label: 'Platform admin' },
              { value: 'system', label: 'System' },
            ]}
            placeholder="All actors"
          />
          <FilterSelect
            label="Tenant"
            value={draft.tenantId}
            onChange={(value) => setDraft((current) => ({ ...current, tenantId: value }))}
            options={tenants.map((tenant) => ({ value: tenant.id, label: tenant.name }))}
            placeholder="All tenants"
          />
          <label className="platform-inline-field">
            <span>Action</span>
            <input
              type="text"
              className="ui-input"
              value={draft.action}
              onChange={(event) => setDraft((current) => ({ ...current, action: event.target.value }))}
              placeholder="admin.tenant_suspended"
              maxLength={120}
            />
          </label>
        </FilterBar>
      </form>

      <DataTable
        caption="Platform audit log"
        columns={columns}
        rows={data.items}
        getRowKey={(row) => row.id}
        loading={state === 'loading'}
        skeletonRows={8}
        error={state === 'error' ? error : null}
        onRetry={() => setRefreshKey((key) => key + 1)}
        empty="No audit events match these filters."
      />

      {state === 'ready' && data.total > 0 ? (
        <Pagination
          page={page}
          pageSize={PLATFORM_PAGE_SIZE}
          total={data.total}
          onPageChange={setPage}
          itemLabel="events"
          showPageSize={false}
        />
      ) : null}
    </div>
  )
}

function SupportPanel({ tenants }) {
  const { toast } = useToast()
  const [activeOnly, setActiveOnly] = useState(true)
  const [page, setPage] = useState(1)
  const [data, setData] = useState({ items: [], total: 0 })
  const [state, setState] = useState('loading')
  const [error, setError] = useState(null)
  const [refreshKey, setRefreshKey] = useState(0)
  const [revokingId, setRevokingId] = useState(null)

  useEffect(() => {
    const controller = new AbortController()
    setState('loading')
    setError(null)
    listSupportAccess({ activeOnly, page, pageSize: PLATFORM_PAGE_SIZE }, controller.signal)
      .then((result) => {
        setData({ items: result.items ?? [], total: result.total ?? 0 })
        setState('ready')
      })
      .catch((caught) => {
        if (caught?.name === 'AbortError') return
        setError(caught)
        setState('error')
      })
    return () => controller.abort()
  }, [activeOnly, page, refreshKey])

  async function handleRevoke(grantId) {
    setRevokingId(grantId)
    try {
      await revokeSupportAccess(grantId)
      setRefreshKey((key) => key + 1)
      toast.success('Support access revoked.')
    } catch (caught) {
      toast.error(caught?.message || 'The support grant could not be revoked.')
    } finally {
      setRevokingId(null)
    }
  }

  const columns = [
    {
      key: 'tenant',
      header: 'Tenant',
      render: (row) => <TenantName id={row.tenant_id} tenants={tenants} />,
    },
    {
      key: 'reason',
      header: 'Reason',
      render: (row) => <span className="platform-reason">{row.reason}</span>,
    },
    {
      key: 'granted_at',
      header: 'Granted',
      render: (row) => formatDateTime(row.granted_at),
    },
    {
      key: 'expires_at',
      header: 'Expires',
      render: (row) => formatDateTime(row.expires_at),
    },
    {
      key: 'status',
      header: 'Status',
      render: (row) => {
        const active = !row.revoked_at && new Date(row.expires_at).getTime() > Date.now()
        return (
          <Badge tone={active ? 'warning' : 'outline'} size="sm" dot={active}>
            {row.revoked_at ? 'Revoked' : active ? 'Active' : 'Expired'}
          </Badge>
        )
      },
    },
    {
      key: 'action',
      header: '',
      align: 'right',
      render: (row) => {
        const active = !row.revoked_at && new Date(row.expires_at).getTime() > Date.now()
        return active ? (
          <Button
            variant="ghost"
            size="sm"
            loading={revokingId === row.id}
            disabled={revokingId === row.id}
            onClick={() => handleRevoke(row.id)}
          >
            Revoke
          </Button>
        ) : null
      },
    },
  ]

  return (
    <div className="platform-panel-stack">
      <div className="app-card platform-panel">
        <div className="platform-panel__head">
          <div>
            <p className="eyebrow">Support</p>
            <h2>Time-boxed support access</h2>
          </div>
          <label className="platform-check">
            <input
              type="checkbox"
              checked={activeOnly}
              onChange={(event) => {
                setActiveOnly(event.target.checked)
                setPage(1)
              }}
            />
            Active only
          </label>
        </div>
        <p className="platform-panel__lead">
          Every grant requires a reason, expires automatically, and is visible to the tenant.
          Grant new access from a tenant profile.
        </p>
      </div>

      <DataTable
        caption="Support access grants"
        columns={columns}
        rows={data.items}
        getRowKey={(row) => row.id}
        loading={state === 'loading'}
        skeletonRows={6}
        error={state === 'error' ? error : null}
        onRetry={() => setRefreshKey((key) => key + 1)}
        empty={activeOnly ? 'No active support grants.' : 'No support grants have been issued.'}
      />

      {state === 'ready' && data.total > 0 ? (
        <Pagination
          page={page}
          pageSize={PLATFORM_PAGE_SIZE}
          total={data.total}
          onPageChange={setPage}
          itemLabel="grants"
          showPageSize={false}
        />
      ) : null}
    </div>
  )
}

function AbusePanel({ overview }) {
  const tenants = overview?.tenants ?? []
  const high = tenants.filter((tenant) => tenant.abuse_risk === 'high')
  const medium = tenants.filter((tenant) => tenant.abuse_risk === 'medium')

  return (
    <div className="platform-panel-stack">
      <div className="platform-stats">
        <Stat
          label="High risk"
          value={formatNumber(high.length)}
          hint="complaints ≥ 3 or bounce rate ≥ 5%"
          tone={high.length ? 'warning' : 'neutral'}
        />
        <Stat
          label="Medium risk"
          value={formatNumber(medium.length)}
          hint="any complaint or bounce rate ≥ 2%"
          tone={medium.length ? 'warning' : 'neutral'}
        />
        <Stat
          label="Low risk"
          value={formatNumber(overview?.abuse_risk_counts?.low)}
          hint="within platform thresholds"
          tone="success"
        />
        <Stat
          label="Kill switch"
          value={overview?.paused_inboxes ? 'Review' : 'Normal'}
          hint="open Health for live state"
        />
      </div>

      {high.length ? (
        <div className="platform-note platform-note--warning" role="status">
          <AlertTriangle size={17} aria-hidden="true" />
          <span>
            {high.length} tenant{high.length === 1 ? '' : 's'} crossed an abuse threshold. Review
            bounce and complaint counts, pause sending, or suspend the workspace before the next
            campaign.
          </span>
        </div>
      ) : (
        <div className="platform-note" role="status">
          <CheckCircle size={17} aria-hidden="true" />
          <span>No tenant is above the high-risk abuse thresholds.</span>
        </div>
      )}

      <section className="app-card platform-panel" aria-labelledby="platform-abuse-table">
        <header className="platform-panel__head">
          <div>
            <p className="eyebrow">Abuse signals</p>
            <h2 id="platform-abuse-table">Tenants sorted by risk</h2>
          </div>
          <Badge tone="neutral">{formatNumber(tenants.length)} tenants</Badge>
        </header>
        <TenantRiskTable tenants={tenants} />
      </section>
    </div>
  )
}

export function PlatformOpsPage() {
  usePageTitle('Platform operations')

  const [overview, setOverview] = useState(null)
  const [state, setState] = useState('loading')
  const [error, setError] = useState(null)
  const [refreshKey, setRefreshKey] = useState(0)

  useEffect(() => {
    const controller = new AbortController()
    setState('loading')
    setError(null)
    getPlatformOverview(controller.signal)
      .then((data) => {
        setOverview(data)
        setState('ready')
      })
      .catch((caught) => {
        if (caught?.name === 'AbortError') return
        setError(caught)
        setState(caught?.status === 403 ? 'denied' : 'error')
      })
    return () => controller.abort()
  }, [refreshKey])

  const tenants = useMemo(() => overview?.tenants ?? [], [overview])

  if (state === 'denied') {
    return (
      <div className="app-page platform-page">
        <PageHeader eyebrow="Platform · Operations" title="Platform operations" backTo="/app/platform" backLabel="All tenants" />
        <section className="app-card platform-denied">
          <Shield size={24} aria-hidden="true" />
          <h2>Platform staff only</h2>
          <p>{error?.message || 'Your account is not a Reyvo platform administrator.'}</p>
          <Link to="/app" className="btn btn--ghost btn--sm">
            Back to dashboard
          </Link>
        </section>
      </div>
    )
  }

  return (
    <div className="app-page platform-page">
      <PageHeader
        eyebrow="Platform · Operations"
        title="Usage, health, audit, and support"
        description="One console for platform-wide usage, API health, audit search, time-boxed support access, and abuse signals. Every action is audited."
        backTo="/app/platform"
        backLabel="All tenants"
        meta={
          <>
            <Badge tone="neutral" dot>
              {formatNumber(overview?.tenants_total)} tenants
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
          <Button
            variant="ghost"
            leadingIcon={Refresh}
            onClick={() => setRefreshKey((key) => key + 1)}
            loading={state === 'loading'}
          >
            Refresh
          </Button>
        }
      />

      <Tabs
        label="Platform operations sections"
        items={[
          {
            id: 'overview',
            label: 'Overview',
            content: (
              <OverviewPanel
                overview={overview}
                state={state}
                error={error}
                onRetry={() => setRefreshKey((key) => key + 1)}
              />
            ),
          },
          {
            id: 'health',
            label: 'Health',
            content: <HealthPanel overview={overview} />,
          },
          {
            id: 'audit',
            label: 'Audit log',
            content: <AuditPanel tenants={tenants} />,
          },
          {
            id: 'support',
            label: 'Support access',
            content: <SupportPanel tenants={tenants} />,
          },
          {
            id: 'abuse',
            label: 'Abuse',
            content: <AbusePanel overview={overview} />,
          },
        ]}
      />
    </div>
  )
}
