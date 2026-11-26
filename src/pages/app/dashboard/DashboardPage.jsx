import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Badge, Button, ErrorPanel, PageHeader, Skeleton } from '../../../components/ui'
import { api } from '../../../lib/api'
import { explainMailboxHealth, listEmailAccounts } from '../../../lib/emailAccounts'
import { listSuppressions } from '../../../lib/suppressions'
import { OPPORTUNITY_STAGES } from '../../../lib/opportunities'
import './dashboard.css'

function money(cents) {
  return new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format((cents ?? 0) / 100)
}

function num(value) {
  return Number(value ?? 0).toLocaleString()
}

/**
 * Dashboard overview (T38, §5.8.3). Reads the live `GET /dashboard/summary`
 * plus `/email-accounts` (inbox health) and `/suppressions` (opt-outs total).
 * The endpoint has no date-range or timezone parameter — the all-time, 7-day,
 * and today windows are computed server-side — so the page presents those
 * windows explicitly instead of a fake selectable range, and keeps the
 * "delivered is not observable" honesty note.
 *
 * Only metrics the endpoint actually returns are shown. Delivery confirmation,
 * complaint, bounce and platform-wide health signals are not exposed to tenant
 * callers, so this page never fabricates them (that reporting belongs to the
 * platform admin console, T47).
 */
export function DashboardPage() {
  const [status, setStatus] = useState('loading')
  const [error, setError] = useState(null)
  const [refreshing, setRefreshing] = useState(false)
  const [summary, setSummary] = useState(null)
  const [accounts, setAccounts] = useState([])
  const [optOuts, setOptOuts] = useState(null)

  const load = useCallback(async (signal) => {
    setRefreshing(true)
    setError(null)
    try {
      const [summaryData, accountsData, suppressionsPage] = await Promise.all([
        api.get('/dashboard/summary', { signal }),
        listEmailAccounts(signal).catch(() => []),
        listSuppressions({ limit: 1 }, signal).catch(() => null),
      ])
      setSummary(summaryData)
      setAccounts(Array.isArray(accountsData) ? accountsData : accountsData?.items ?? [])
      setOptOuts(suppressionsPage ? Number(suppressionsPage.total ?? suppressionsPage.items?.length ?? 0) : null)
      setStatus('ready')
    } catch (caught) {
      if (caught?.name === 'AbortError') return
      setError(caught)
      setStatus('error')
    } finally {
      setRefreshing(false)
    }
  }, [])

  useEffect(() => {
    const controller = new AbortController()
    load(controller.signal)
    return () => controller.abort()
  }, [load])

  const pipeline = useMemo(() => summary?.pipeline ?? [], [summary])
  const pipelineTotalValue = pipeline.reduce((sum, entry) => sum + Number(entry?.value_cents ?? 0), 0)

  const mailboxRows = useMemo(
    () =>
      accounts.slice(0, 5).map((account) => {
        const health = explainMailboxHealth(account)
        return {
          id: account.id,
          email: account.email ?? 'Unknown mailbox',
          status: health.status,
          tone: health.status === 'connected' ? 'success' : health.status === 'degraded' ? 'warning' : 'danger',
          label: health.status.replace(/_/g, ' '),
        }
      }),
    [accounts],
  )
  const mailboxesHealthy = accounts.filter((account) => explainMailboxHealth(account).status === 'connected').length

  const sentToday = Number(summary?.sent_today ?? 0)
  const dailyCap = Number(summary?.daily_send_cap ?? 0)

  if (status === 'loading') {
    return (
      <div className="app-page dashboard-page">
        <PageHeader eyebrow="Workspace · Dashboard" title="Overview" description="Loading live summary…" />
        <div className="app-card">
          <Skeleton lines={7} />
        </div>
      </div>
    )
  }

  if (status === 'error') {
    return (
      <div className="app-page dashboard-page">
        <PageHeader eyebrow="Workspace · Dashboard" title="Overview" description="The summary could not be loaded." />
        <ErrorPanel
          title="Couldn't load the dashboard"
          description={error?.message || undefined}
          requestId={error?.requestId}
          onRetry={() => load()}
        />
      </div>
    )
  }

  const capPercent = dailyCap > 0 ? Math.min(100, Math.round((sentToday / dailyCap) * 100)) : 0
  const topCampaigns = Array.isArray(summary.top_campaigns) ? summary.top_campaigns : []
  const maxStageCount = Math.max(1, ...pipeline.map((entry) => Number(entry?.count ?? 0)))

  const metrics = [
    {
      key: 'sends',
      label: 'Sends',
      value: num(summary.messages_sent_total),
      tone: 'neutral',
      note: `Provider-accepted sends. 7-day: ${num(summary.messages_sent_7d)}. Today: ${num(sentToday)} of ${
        dailyCap > 0 ? `${num(dailyCap)} cap` : 'no cap set'
      }.${dailyCap > 0 && sentToday >= dailyCap * 0.8 ? ' Approaching the daily cap.' : ''}`,
    },
    {
      key: 'replies',
      label: 'Replies',
      value: num(summary.replies_total),
      tone: 'info',
      note: `7-day: ${num(summary.replies_7d)} • positive 7-day: ${num(summary.positive_replies_7d)}.`,
    },
    {
      key: 'meetings',
      label: 'Meetings',
      value: num(summary.meetings),
      tone: 'success',
      note: 'Opportunities that reached the Meeting stage.',
    },
    {
      key: 'optouts',
      label: 'Opt-outs',
      value: optOuts == null ? '—' : num(optOuts),
      tone: 'danger',
      note: 'Live suppression count (all reasons). The summary endpoint has no opt-out field.',
    },
    {
      key: 'contacts',
      label: 'Contacts',
      value: num(summary.contacts_total),
      tone: 'neutral',
      note: `${num(summary.contacts_new)} still in the New status.`,
    },
    {
      key: 'campaigns',
      label: 'Campaigns',
      value: num(summary.campaigns_total),
      tone: 'warning',
      note: `${num(summary.campaigns_active)} active.`,
    },
    {
      key: 'pipeline',
      label: 'Open opportunities',
      value: num(summary.opportunities_open),
      tone: 'success',
      note: `${money(summary.pipeline_value_cents)} across open stages (${money(pipelineTotalValue)} by stage rows).`,
    },
    {
      key: 'tasks',
      label: 'Open tasks',
      value: num(summary.tasks_open),
      tone: 'info',
      note: 'Tasks in the open or in-progress statuses.',
    },
  ]

  return (
    <div className="app-page dashboard-page">
      <PageHeader
        eyebrow="Workspace · Dashboard"
        title="Overview"
        description="Live summary from GET /dashboard/summary. The endpoint has no date-range or timezone parameter — the all-time, 7-day, and today windows are computed server-side, so this page shows those windows as-is."
        actions={
          <Button variant="ghost" loading={refreshing} onClick={() => load()}>
            Refresh
          </Button>
        }
        meta={
          <>
            <Badge tone="neutral" dot>
              As of {summary?.as_of ?? '—'}
            </Badge>
            <Badge tone={accounts.length === 0 ? 'neutral' : mailboxesHealthy === accounts.length ? 'success' : 'warning'} dot>
              {accounts.length === 0
                ? 'No mailboxes connected'
                : `${mailboxesHealthy}/${accounts.length} mailboxes healthy`}
            </Badge>
          </>
        }
      />

      <section className="dashboard-page__metrics" aria-label="Summary metrics">
        {metrics.map((metric) => (
          <article key={metric.key} className="app-card dashboard-page__metric">
            <div className="dashboard-page__metric-top">
              <span>{metric.label}</span>
              <strong>{metric.value}</strong>
            </div>
            <p>{metric.note}</p>
          </article>
        ))}
      </section>

      <div className="dashboard-page__grid">
        <section className="app-card dashboard-page__panel">
          <div className="dashboard-page__panel-head">
            <div>
              <p className="eyebrow">Pipeline pulse</p>
              <h2>Open pipeline by stage</h2>
            </div>
            <Link to="/app/pipeline">Open pipeline</Link>
          </div>

          <div className="dashboard-page__bars" aria-label="Pipeline by stage">
            {pipeline.length === 0 ? (
              <p className="dashboard-page__empty-note">No pipeline rows returned yet.</p>
            ) : (
              pipeline.map((entry) => {
                const stageMeta = OPPORTUNITY_STAGES[entry.stage] ?? OPPORTUNITY_STAGES.new
                const count = Number(entry?.count ?? 0)
                return (
                  <div key={entry.stage} className="dashboard-page__bar-row">
                    <div className="dashboard-page__bar-row-label">
                      <span>{stageMeta.label}</span>
                      <strong>
                        {count} • {money(entry?.value_cents)}
                      </strong>
                    </div>
                    <div className="dashboard-page__bar-track">
                      <span style={{ width: `${Math.round((count / maxStageCount) * 100)}%` }} />
                    </div>
                  </div>
                )
              })
            )}
          </div>
        </section>

        <section className="app-card dashboard-page__panel">
          <div className="dashboard-page__panel-head">
            <div>
              <p className="eyebrow">Campaign pulse</p>
              <h2>Top campaigns (server-computed)</h2>
            </div>
            <Link to="/app/campaigns">Open campaigns</Link>
          </div>

          <ul className="dashboard-page__list">
            {topCampaigns.length === 0 ? (
              <li className="dashboard-page__empty-note">
                No campaign performance yet — launch a campaign to populate this panel.
              </li>
            ) : (
              topCampaigns.map((campaign) => {
                return (
                  <li key={campaign.campaign_id}>
                    <div className="dashboard-page__list-copy">
                      <strong>{campaign.name ?? 'Unnamed campaign'}</strong>
                      <span>{num(campaign.sent)} sent</span>
                    </div>
                    <div className="dashboard-page__list-meta">
                      <Badge tone={CAMPAIGN_TONES[campaign.status] ?? 'neutral'}>{campaign.status ?? 'unknown'}</Badge>
                      <small>{num(campaign.replies)} replies</small>
                    </div>
                  </li>
                )
              })
            )}
          </ul>
        </section>

        <section className="app-card dashboard-page__panel">
          <div className="dashboard-page__panel-head">
            <div>
              <p className="eyebrow">Inbox health</p>
              <h2>Sending readiness (live mailboxes)</h2>
            </div>
            <Link to="/app/mailboxes/health">View health</Link>
          </div>

          <div className="dashboard-page__meter dashboard-page__meter--cap" aria-label="Daily send cap usage">
            <span
              style={{ width: `${capPercent}%` }}
              className={dailyCap > 0 && sentToday >= dailyCap ? 'is-at-cap' : ''}
            />
          </div>
          <p className="dashboard-page__empty-note">
            {dailyCap > 0
              ? `${num(sentToday)} sent today of a ${num(dailyCap)} workspace cap (${capPercent}%).`
              : `${num(sentToday)} sent today; no workspace daily cap is set.`}
          </p>

          <ul className="dashboard-page__mailbox-list">
            {mailboxRows.length === 0 ? (
              <li className="dashboard-page__empty-note">No mailboxes connected yet.</li>
            ) : (
              mailboxRows.map((mailbox) => (
                <li key={mailbox.id}>
                  <span>{mailbox.email}</span>
                  <Badge tone={mailbox.tone}>{mailbox.label}</Badge>
                </li>
              ))
            )}
          </ul>
        </section>

        <section className="app-card dashboard-page__panel dashboard-page__notes-panel">
          <div className="dashboard-page__panel-head">
            <div>
              <p className="eyebrow">Definition clarity</p>
              <h2>What we know</h2>
            </div>
          </div>

          <div className="dashboard-page__legend">
            <div className="dashboard-page__legend-item dashboard-page__legend-item--observed">
              <span className="dashboard-page__legend-dot" />
              <strong>Observed</strong>
              <small>sends (provider-accepted), replies, positive replies, meetings, contacts, campaigns, tasks, and pipeline counts</small>
            </div>
            <div className="dashboard-page__legend-item dashboard-page__legend-item--not-observed">
              <span className="dashboard-page__legend-dot" />
              <strong>Not observable</strong>
              <small>delivered (no provider confirmation), unique opens (no open tracking), and downstream platform counts</small>
            </div>
          </div>

          <div className="dashboard-page__note">
            <strong>Windows</strong>
            <span>
              All-time totals plus 7-day and today windows come from the server (as of {summary?.as_of}); the endpoint
              accepts no date-range or timezone parameter, so no selectable range is offered here.
            </span>
          </div>
        </section>
      </div>
    </div>
  )
}

/* Campaign tone constants */
const CAMPAIGN_TONES = {
  sending: 'success',
  active: 'success',
  paused: 'warning',
  draft: 'neutral',
  completed: 'info',
  failed: 'danger',
}