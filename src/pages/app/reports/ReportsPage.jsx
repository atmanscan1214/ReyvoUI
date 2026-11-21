import { useCallback, useEffect, useMemo, useState } from 'react'
import { Badge, Button, ErrorPanel, PageHeader, Skeleton } from '../../../components/ui'
import { listCampaigns, campaignStatusMeta, getCampaignStats } from '../../../lib/campaigns'
import { listEmailAccounts, explainMailboxHealth } from '../../../lib/emailAccounts'
import { listOpportunities, OPPORTUNITY_STAGES } from '../../../lib/opportunities'
import { listSuppressions } from '../../../lib/suppressions'
import { api } from '../../../lib/api'
import './reports.css'

const CSV_HEADERS = [
  'report_type',
  'name',
  'status',
  'enrolled',
  'active',
  'completed',
  'sent',
  'replies',
  'positive_replies',
  'mailbox',
  'health',
  'daily_cap',
  'hourly_cap',
  'warmup_stage',
  'last_health_check',
  'stage',
  'deals',
  'value_usd',
  'avg_age_days',
  'owners',
]

function sanitizeCsvValue(value) {
  const text = String(value ?? '')
  if (/^[=+\-@\t\r]/.test(text)) return `'${text}`
  return text
}

function csvCell(value) {
  const text = sanitizeCsvValue(value)
  if (/[",\r\n]/.test(text) || /^\s|\s$/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`
  }
  return text
}

function downloadCsv(rows, filename) {
  const lines = [CSV_HEADERS.join(',')]
  for (const row of rows) {
    lines.push(CSV_HEADERS.map((header) => csvCell(row[header] ?? '')).join(','))
  }

  const csv = `\uFEFF${lines.join('\r\n')}\r\n`
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
  const url = window.URL.createObjectURL(blob)
  const link = window.document.createElement('a')
  link.href = url
  link.download = filename
  link.rel = 'noopener'
  window.document.body.appendChild(link)
  link.click()
  link.remove()
  window.setTimeout(() => window.URL.revokeObjectURL(url), 1000)
}

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

function ageDays(createdAt) {
  const created = new Date(createdAt)
  if (Number.isNaN(created.getTime())) return null
  return Math.max(0, Math.floor((Date.now() - created.getTime()) / 86_400_000))
}

/**
 * Campaign, inbox, and pipeline reporting (T39, §5.8.3/§5.8.4). Live sources:
 * per-campaign `GET /campaigns/{id}/stats`, the replies list (counted by
 * campaign/category client-side, capped pages), the live `/email-accounts`
 * list, `/opportunities/pipeline` plus a client-side opportunity page for
 * age/owner splits, and the `/suppressions` total. This API build has no
 * per-step send counters, no error-rate or per-campaign opt-out data, and no
 * aggregate reports endpoint — the page names those gaps instead of faking
 * columns, and the CSV export runs on the same live rows with the same
 * injection protection.
 */
export function ReportsPage() {
  const [status, setStatus] = useState('loading')
  const [error, setError] = useState(null)
  const [refreshing, setRefreshing] = useState(false)
  const [campaigns, setCampaigns] = useState([])
  const [statsById, setStatsById] = useState(new Map())
  const [replyCounts, setReplyCounts] = useState({ byCampaign: new Map(), positive: 0, total: 0, capped: false })
  const [accounts, setAccounts] = useState([])
  const [opportunityRows, setOpportunityRows] = useState([])
  const [pipelineSummary, setPipelineSummary] = useState([])
  const [optOuts, setOptOuts] = useState(null)
  const [members, setMembers] = useState(new Map())

  const load = useCallback(async (signal) => {
    setRefreshing(true)
    setError(null)
    try {
      const [campaignsPage, accountsData, oppPage, suppressionsPage, membersRaw, repliesA, repliesB, pipelineData] =
        await Promise.all([
          listCampaigns({ limit: 100 }, signal),
          listEmailAccounts(signal).catch(() => []),
          listOpportunities({ limit: 100 }, signal),
          listSuppressions({ limit: 1 }, signal).catch(() => null),
          api.get('/tenants/current/members', { signal }).catch(() => []),
          api.get('/replies?limit=100', { signal }).catch(() => null),
          api.get('/replies?limit=100&offset=100', { signal }).catch(() => null),
          api.get('/opportunities/pipeline', { signal }).catch(() => []),
        ])

      const campaignItems = campaignsPage?.items ?? []
      const statEntries = await Promise.all(
        campaignItems.slice(0, 25).map(async (campaign) => {
          try {
            return [campaign.id, await getCampaignStats(campaign.id, signal)]
          } catch {
            return [campaign.id, null]
          }
        }),
      )
      setStatsById(new Map(statEntries))

      const replyItems = [
        ...((Array.isArray(repliesA?.items) && repliesA.items) || []),
        ...((Array.isArray(repliesB?.items) && repliesB.items) || []),
      ]
      const byCampaign = new Map()
      let positive = 0
      for (const reply of replyItems) {
        const key = reply.campaign_id ?? 'unmatched'
        const entry = byCampaign.get(key) ?? { total: 0, positive: 0 }
        entry.total += 1
        if (reply.category === 'positive') entry.positive += 1
        if (reply.category === 'positive') positive += 1
        byCampaign.set(key, entry)
      }
      setReplyCounts({
        byCampaign,
        positive,
        total: replyItems.length,
        capped: Number(repliesA?.total ?? replyItems.length) > replyItems.length,
      })

      const memberMap = new Map()
      for (const raw of Array.isArray(membersRaw) ? membersRaw : []) {
        if (raw?.user_id) memberMap.set(String(raw.user_id), raw?.full_name || raw?.email || String(raw.user_id))
      }

      setCampaigns(campaignItems)
      setAccounts(Array.isArray(accountsData) ? accountsData : accountsData?.items ?? [])
      setOpportunityRows(Array.isArray(oppPage?.items) ? oppPage.items : [])
      setPipelineSummary(Array.isArray(pipelineData) ? pipelineData : Array.isArray(pipelineData?.items) ? pipelineData.items : [])
      setOptOuts(suppressionsPage ? Number(suppressionsPage.total ?? suppressionsPage.items?.length ?? 0) : null)
      setMembers(memberMap)
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

  const campaignRows = useMemo(
    () =>
      campaigns.map((campaign) => {
        const stats = statsById.get(campaign.id)
        const counted = replyCounts.byCampaign.get(campaign.id) ?? { total: 0, positive: 0 }
        const enrolled = Number(stats?.enrolled ?? 0)
        const completed = Number(stats?.completed ?? 0)
        return {
          campaign,
          stats,
          positive: counted.positive,
          progress: enrolled > 0 ? Math.round((completed / enrolled) * 100) : null,
        }
      }),
    [campaigns, replyCounts.byCampaign, statsById],
  )

  const pipelineRows = useMemo(() => {
    const map = new Map(
      pipelineSummary.map((entry) => [
        entry.stage,
        { count: Number(entry.count ?? 0), valueCents: Number(entry.value_cents ?? 0) },
      ]),
    )
    return Object.keys(OPPORTUNITY_STAGES).map((stage) => {
      const entries = opportunityRows.filter((item) => item.stage === stage)
      const ages = entries.map((item) => ageDays(item.createdAt)).filter((age) => age != null)
      const owners = [...new Set(entries.map((item) => (item.ownerId ? members.get(item.ownerId) ?? 'Unknown' : 'Unassigned')))]
      return {
        stage,
        label: OPPORTUNITY_STAGES[stage].label,
        count: map.get(stage)?.count ?? 0,
        valueCents: map.get(stage)?.valueCents ?? 0,
        avgAge: ages.length ? `${Math.round(ages.reduce((sum, age) => sum + age, 0) / ages.length)}d` : '—',
        owners: owners.length ? owners.join(', ') : '—',
      }
    })
  }, [members, opportunityRows, pipelineSummary])

  const mailboxRows = useMemo(
    () =>
      accounts.map((account) => {
        const health = explainMailboxHealth(account)
        return {
          account,
          label: health.status.replace(/_/g, ' '),
          tone: health.status === 'connected' ? 'success' : health.status === 'degraded' ? 'warning' : 'danger',
        }
      }),
    [accounts],
  )

  const reportRows = useMemo(
    () => [
      ...campaignRows.map(({ campaign, stats, positive }) => ({
        report_type: 'campaign',
        name: campaign.name,
        status: campaignStatusMeta(campaign.status)?.label ?? campaign.status,
        enrolled: stats?.enrolled ?? '',
        active: stats?.active ?? '',
        completed: stats?.completed ?? '',
        sent: stats?.sent ?? '',
        replies: stats?.replies ?? '',
        positive_replies: positive,
        mailbox: '',
        health: '',
        daily_cap: '',
        hourly_cap: '',
        warmup_stage: '',
        last_health_check: '',
        stage: '',
        deals: '',
        value_usd: '',
        avg_age_days: '',
        owners: '',
      })),
      ...mailboxRows.map(({ account, label }) => ({
        report_type: 'mailbox',
        name: '',
        status: '',
        enrolled: '',
        active: '',
        completed: '',
        sent: '',
        replies: '',
        positive_replies: '',
        mailbox: account.email,
        health: label,
        daily_cap: account.dailyCap ?? '',
        hourly_cap: account.hourlyCap ?? '',
        warmup_stage: account.rampStage ?? '',
        last_health_check: account.lastHealthCheckAt ?? '',
        stage: '',
        deals: '',
        value_usd: '',
        avg_age_days: '',
        owners: '',
      })),
      ...pipelineRows.map((row) => ({
        report_type: 'pipeline',
        name: '',
        status: '',
        enrolled: '',
        active: '',
        completed: '',
        sent: '',
        replies: '',
        positive_replies: '',
        mailbox: '',
        health: '',
        daily_cap: '',
        hourly_cap: '',
        warmup_stage: '',
        last_health_check: '',
        stage: row.label,
        deals: row.count,
        value_usd: row.valueCents / 100,
        avg_age_days: row.avgAge === '—' ? '' : row.avgAge,
        owners: row.owners === '—' ? '' : row.owners,
      })),
    ],
    [campaignRows, mailboxRows, pipelineRows],
  )

  if (status === 'loading') {
    return (
      <div className="app-page reports-page">
        <PageHeader eyebrow="Workspace · Reports" title="Reporting" description="Loading live report data…" />
        <div className="app-card">
          <Skeleton lines={7} />
        </div>
      </div>
    )
  }

  if (status === 'error') {
    return (
      <div className="app-page reports-page">
        <PageHeader eyebrow="Workspace · Reports" title="Reporting" description="The reports could not be loaded." />
        <ErrorPanel
          title="Couldn't load the reports"
          description={error?.message || undefined}
          requestId={error?.requestId}
          onRetry={() => load()}
        />
      </div>
    )
  }

  const totalSent = campaignRows.reduce((sum, row) => sum + Number(row.stats?.sent ?? 0), 0)
  const totalReplies = campaignRows.reduce((sum, row) => sum + Number(row.stats?.replies ?? 0), 0)
  const activeCampaigns = campaigns.filter((campaign) => campaign.status === 'sending' || campaign.status === 'active').length
  const meetings = opportunityRows.filter((item) => item.stage === 'meeting').length

  const summary = [
    { key: 'sends', label: 'Sends', value: num(totalSent), note: `Sum of per-campaign stats (${campaignRows.length} campaigns).` },
    {
      key: 'replies',
      label: 'Replies',
      value: num(replyCounts.total),
      note: `Inbound replies loaded (${replyCounts.capped ? 'first 200 of more' : 'complete set'}); per-campaign stats say ${num(totalReplies)}.`,
    },
    {
      key: 'positive',
      label: 'Positive replies',
      value: num(replyCounts.positive),
      note: 'Classifier/user category on the loaded replies.',
    },
    { key: 'meetings', label: 'Meetings', value: num(meetings), note: 'Opportunities at the Meeting stage (loaded page).' },
    {
      key: 'optouts',
      label: 'Opt-outs',
      value: optOuts == null ? '—' : num(optOuts),
      note: 'Live suppression count (all reasons).',
    },
    {
      key: 'campaigns',
      label: 'Active campaigns',
      value: num(activeCampaigns),
      note: `${campaigns.length} campaigns total in this workspace.`,
    },
  ]

  return (
    <div className="app-page reports-page">
      <PageHeader
        eyebrow="Workspace · Reports"
        title="Campaign, inbox, and pipeline reporting"
        description="Live report data — all windows are all-time because no reports endpoint or date-range parameter exists in this API build. Delivered counts are not observable and are excluded; per-step, error-rate, and per-campaign opt-out breakdowns have no source here and are named instead of faked."
        actions={
          <>
            <Button variant="ghost" loading={refreshing} onClick={() => load()}>
              Refresh
            </Button>
            <Button onClick={() => downloadCsv(reportRows, `reyvo-reports-${new Date().toISOString().slice(0, 10)}.csv`)}>
              Export CSV
            </Button>
          </>
        }
      />

      <section className="reports-page__summary" aria-label="Report summary cards">
        {summary.map((item) => (
          <article key={item.key} className="app-card reports-page__stat">
            <div className="reports-page__stat-head">
              <span>{item.label}</span>
            </div>
            <strong>{item.value}</strong>
            <small>{item.note}</small>
          </article>
        ))}
      </section>

      <section className="app-card reports-page__panel">
        <div className="reports-page__section-head">
          <div>
            <p className="eyebrow">Campaign reporting</p>
            <h2>Per-campaign performance (live stats)</h2>
          </div>
        </div>

        <p className="reports-page__gapnote">
          Progress is completed vs enrolled. Per-step send counters, error rates, and per-campaign opt-outs have no
          endpoint in this build, so those columns are omitted.
        </p>

        <div className="reports-page__table-wrap">
          <table className="reports-page__table">
            <thead>
              <tr>
                <th>Campaign</th>
                <th>Status</th>
                <th>Enrolled</th>
                <th>Active</th>
                <th>Completed</th>
                <th>Sent</th>
                <th>Replies</th>
                <th>Positive replies</th>
                <th>Progress</th>
              </tr>
            </thead>
            <tbody>
              {campaignRows.length === 0 ? (
                <tr>
                  <td colSpan={9} className="reports-page__empty">
                    No campaigns yet — launch one to populate this report.
                  </td>
                </tr>
              ) : (
                campaignRows.map(({ campaign, stats, positive, progress }) => {
                  const meta = campaignStatusMeta(campaign.status)
                  return (
                    <tr key={campaign.id}>
                      <td>{campaign.name}</td>
                      <td>
                        <Badge tone={meta?.tone ?? 'neutral'}>{meta?.label ?? campaign.status}</Badge>
                      </td>
                      <td>{num(stats?.enrolled)}</td>
                      <td>{num(stats?.active)}</td>
                      <td>{num(stats?.completed)}</td>
                      <td>{num(stats?.sent)}</td>
                      <td>{num(stats?.replies)}</td>
                      <td>{num(positive)}</td>
                      <td>{progress == null ? '—' : `${progress}%`}</td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </section>

      <div className="reports-page__grid">
        <section className="app-card reports-page__panel">
          <div className="reports-page__section-head">
            <div>
              <p className="eyebrow">Inbox health</p>
              <h2>Mailbox reporting (live accounts)</h2>
            </div>
          </div>

          <p className="reports-page__gapnote">
            The API exposes no send counters, bounce rates, or last-send timestamps per mailbox (see the mailboxes
            page), so this report shows connection health, caps, warm-up stage, and the last health check only.
          </p>

          <div className="reports-page__table-wrap">
            <table className="reports-page__table">
              <thead>
                <tr>
                  <th>Mailbox</th>
                  <th>Health</th>
                  <th>Daily cap</th>
                  <th>Hourly cap</th>
                  <th>Warm-up stage</th>
                  <th>Last health check</th>
                </tr>
              </thead>
              <tbody>
                {mailboxRows.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="reports-page__empty">
                      No mailboxes connected yet.
                    </td>
                  </tr>
                ) : (
                  mailboxRows.map(({ account, label, tone }) => (
                    <tr key={account.id}>
                      <td>{account.email}</td>
                      <td>
                        <Badge tone={tone}>{label}</Badge>
                      </td>
                      <td>{account.dailyCap == null ? '—' : num(account.dailyCap)}</td>
                      <td>{account.hourlyCap == null ? '—' : num(account.hourlyCap)}</td>
                      <td>{account.rampStage == null ? '—' : `Stage ${account.rampStage}`}</td>
                      <td>
                        {account.lastHealthCheckAt
                          ? new Date(account.lastHealthCheckAt).toLocaleString(undefined, {
                              month: 'short',
                              day: 'numeric',
                              hour: 'numeric',
                              minute: '2-digit',
                            })
                          : '—'}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>

        <section className="app-card reports-page__panel">
          <div className="reports-page__section-head">
            <div>
              <p className="eyebrow">Pipeline reporting</p>
              <h2>By stage (server summary + loaded page)</h2>
            </div>
          </div>

          <p className="reports-page__gapnote">
            Counts and values come from the server pipeline summary; average age and owner names are derived from the
            loaded opportunities page (first 100). There is no owner parameter on the pipeline endpoint.
          </p>

          <div className="reports-page__table-wrap">
            <table className="reports-page__table">
              <thead>
                <tr>
                  <th>Stage</th>
                  <th>Deals</th>
                  <th>Value</th>
                  <th>Avg age</th>
                  <th>Owners</th>
                </tr>
              </thead>
              <tbody>
                {pipelineRows.map((row) => (
                  <tr key={row.stage}>
                    <td>{row.label}</td>
                    <td>{num(row.count)}</td>
                    <td>{money(row.valueCents)}</td>
                    <td>{row.avgAge}</td>
                    <td>{row.owners}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </div>
  )
}
