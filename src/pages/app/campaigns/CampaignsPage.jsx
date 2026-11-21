import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import {
  Ban,
  Copy,
  Info,
  Plus,
  Search,
  Send,
} from '../../../components/icons'
import {
  Badge,
  Button,
  ConfirmDialog,
  DataTable,
  EmptyState,
  ErrorPanel,
  FilterBar,
  FilterSelect,
  PageHeader,
  Pagination,
  StatusBadge,
  useToast,
} from '../../../components/ui'
import { useSession } from '../../../lib/session'
import { usePageTitle } from '../../../lib/usePageTitle'
import {
  CAMPAIGN_STATUSES,
  approveCampaign,
  archiveCampaign,
  campaignStatusMeta,
  deleteCampaign,
  duplicateCampaign,
  listCampaigns,
  rejectCampaign,
  submitCampaign,
} from '../../../lib/campaigns'
import './campaigns.css'

const PAGE_SIZE = 20

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

function audienceLabel(campaign) {
  if (campaign.audienceType === 'list') return 'List'
  if (campaign.audienceType === 'segment') return 'Segment'
  if (campaign.audienceSize > 0) return `${campaign.audienceSize.toLocaleString()} contacts`
  return 'No audience yet'
}

/**
 * Campaign list (T20).
 *
 * Built on the live paged `/campaigns` API with search + lifecycle filters
 * synced to the URL. Actions on this page are the list-level lifecycle verbs:
 * create/duplicate drafts, submit for approval, archive, and delete. Approve,
 * reject, launch, pause, and resume belong to the approval workflow and the
 * campaign detail, so those states show a muted next-step hint instead.
 */
export function CampaignsPage() {
  usePageTitle('Campaigns')
  const { toast } = useToast()
  const { role, profileStatus } = useSession()

  const roleKnown = profileStatus === 'ready'
  const canWrite = roleKnown && (role === 'owner' || role === 'admin')

  const [searchParams, setSearchParams] = useSearchParams()
  const searchFilter = searchParams.get('search') ?? ''
  const statusFilter = searchParams.get('status') ?? ''
  const page = Math.max(1, Number(searchParams.get('page') ?? '1') || 1)

  const [searchInput, setSearchInput] = useState(searchFilter)
  const [rows, setRows] = useState([])
  const [total, setTotal] = useState(0)
  const [status, setStatus] = useState('loading')
  const [error, setError] = useState(null)
  const [refreshKey, setRefreshKey] = useState(0)
  const [busyId, setBusyId] = useState(null)
  const [confirmTarget, setConfirmTarget] = useState(null) // { campaign, verb }
  const [rejectNote, setRejectNote] = useState('')

  function updateParams(next) {
    const params = new URLSearchParams(searchParams)
    if (next.search !== undefined) {
      if (next.search) params.set('search', next.search)
      else params.delete('search')
    }
    if (next.status !== undefined) {
      if (next.status) params.set('status', next.status)
      else params.delete('status')
    }
    if (next.page !== undefined) {
      if (next.page > 1) params.set('page', String(next.page))
      else params.delete('page')
    }
    setSearchParams(params, { replace: true })
  }

  // Debounce the search input into the URL.
  useEffect(() => {
    const handle = setTimeout(() => {
      if ((searchInput ?? '').trim() !== searchFilter) {
        updateParams({ search: (searchInput ?? '').trim(), page: 1 })
      }
    }, 350)
    return () => clearTimeout(handle)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchInput])

  useEffect(() => {
    const controller = new AbortController()
    setStatus('loading')
    setError(null)

    listCampaigns(
      {
        search: searchFilter || null,
        status: statusFilter || null,
        limit: PAGE_SIZE,
        offset: (page - 1) * PAGE_SIZE,
      },
      controller.signal,
    )
      .then((data) => {
        setRows(data.items)
        setTotal(data.total)
        setStatus('ready')
      })
      .catch((caught) => {
        if (caught?.name === 'AbortError') return
        setError(caught)
        setStatus('error')
      })

    return () => controller.abort()
  }, [searchFilter, statusFilter, page, refreshKey])

  async function runAction(campaign, verb, note = '') {
    setBusyId(campaign.id)
    try {
      if (verb === 'submit') {
        await submitCampaign(campaign.id)
        toast.success(`${campaign.name} was submitted for approval.`)
      } else if (verb === 'approve') {
        await approveCampaign(campaign.id)
        toast.success(`${campaign.name} was approved.`)
      } else if (verb === 'reject') {
        await rejectCampaign(campaign.id, { note: note.trim() })
        toast.success(`${campaign.name} was returned to draft.`)
      } else if (verb === 'archive') {
        await archiveCampaign(campaign.id)
        toast.success(`${campaign.name} is now archived.`)
      } else if (verb === 'duplicate') {
        const copy = await duplicateCampaign(campaign.id)
        toast.success(`A copy of ${campaign.name} was created as "${copy.name}".`)
      } else if (verb === 'delete') {
        await deleteCampaign(campaign.id)
        toast.success(`${campaign.name} was deleted.`)
      }
      setRefreshKey((key) => key + 1)
    } catch (caught) {
      toast.error(caught?.message || 'The action could not be completed.')
    } finally {
      setBusyId(null)
      setConfirmTarget(null)
      setRejectNote('')
    }
  }

  const statusOptions = useMemo(
    () => CAMPAIGN_STATUSES.map((value) => ({ value, label: campaignStatusMeta(value).label })),
    [],
  )

  const columns = [
    {
      key: 'name',
      header: 'Campaign',
      render: (row) => (
        <div className="camp__name">
          <Link className="camp__name-link" to={`/app/campaigns/${row.id}`} title={row.name}>
            {row.name}
          </Link>
          <span className="camp__name-meta">
            {row.steps.length} step{row.steps.length === 1 ? '' : 's'} · {row.timezone}
          </span>
        </div>
      ),
    },
    {
      key: 'status',
      header: 'Lifecycle',
      render: (row) => <StatusBadge status={row.status} />,
    },
    {
      key: 'audience',
      header: 'Audience',
      render: (row) => <span className="camp__muted">{audienceLabel(row)}</span>,
    },
    {
      key: 'daily_cap',
      header: 'Daily cap',
      render: (row) => <span className="camp__muted">{row.dailyCap.toLocaleString()}/day</span>,
    },
    {
      key: 'updated_at',
      header: 'Updated',
      render: (row) => <span className="camp__muted">{formatDate(row.updatedAt)}</span>,
    },
    {
      key: 'actions',
      header: 'Next step',
      align: 'right',
      width: 230,
      render: (row) => <CampaignActions row={row} canWrite={canWrite} onAction={runAction} busyId={busyId} onConfirm={setConfirmTarget} />,
    },
  ]

  const filtered = Boolean(searchFilter || statusFilter)
  const empty =
    status === 'ready' && total === 0 ? (
      <EmptyState
        compact
        icon={Send}
        title={filtered ? 'No campaigns match these filters' : 'No campaigns yet'}
        description={
          filtered
            ? 'Try a different search term or lifecycle filter.'
            : 'Create a draft to start a sequence; the full wizard for audience, mailboxes, and steps is coming next.'
        }
        actions={
          canWrite && !filtered ? (
            <Link className="btn btn--primary btn--sm" to="/app/campaigns/new">
              <Plus size={15} aria-hidden="true" />
              New campaign
            </Link>
          ) : undefined
        }
      />
    ) : undefined

  return (
    <div className="app-page camp-page">
      <PageHeader
        eyebrow="Growth · Campaigns"
        title="Campaigns"
        description="Multi-step sequences from draft through approval, sending, and archive. Launch and pause controls live on the campaign detail."
        meta={
          <>
            <Badge tone="neutral" dot>
              {`${total.toLocaleString()} campaign${total === 1 ? '' : 's'}${filtered ? ' (filtered)' : ''}`}
            </Badge>
            {roleKnown && !canWrite ? <Badge tone="outline">Read-only</Badge> : null}
          </>
        }
        actions={
          canWrite ? (
            <Link className="btn btn--primary" to="/app/campaigns/new">
              <Plus size={17} aria-hidden="true" />
              New campaign
            </Link>
          ) : null
        }
      />

      <p className="camp__policy app-card">
        <Info size={16} aria-hidden="true" />
        <span>
          Lifecycle: <strong>draft</strong> is editable and submits for approval,{' '}
          <strong>pending approval</strong> waits for an owner or admin review,{' '}
          <strong>approved</strong> launches from the detail page, <strong>active</strong> enrolls
          and sends, <strong>paused</strong> holds queued sends, and{' '}
          <strong>completed/archived</strong> can be duplicated for a fresh copy or deleted.
        </span>
      </p>

      {roleKnown && !canWrite ? (
        <p className="camp__read-only">Your role can view campaigns but not create or change them.</p>
      ) : null}

      <FilterBar
        activeCount={(searchFilter ? 1 : 0) + (statusFilter ? 1 : 0)}
        onReset={() => {
          setSearchInput('')
          updateParams({ search: '', status: '' })
        }}
        resetLabel="Clear filters"
      >
        <div className="camp__search">
          <Search size={15} aria-hidden="true" />
          <input
            type="search"
            value={searchInput}
            placeholder="Search campaign names"
            aria-label="Search campaign names"
            onChange={(event) => setSearchInput(event.target.value)}
          />
        </div>
        <FilterSelect
          label="Lifecycle"
          value={statusFilter}
          onChange={(value) => updateParams({ status: value, page: 1 })}
          options={statusOptions}
          placeholder="All states"
        />
      </FilterBar>

      {status === 'error' ? (
        <ErrorPanel
          title="Couldn’t load the campaigns"
          description={error?.message || undefined}
          requestId={error?.requestId}
          onRetry={() => setRefreshKey((key) => key + 1)}
        />
      ) : (
        <>
          <DataTable
            caption="Campaigns"
            columns={columns}
            rows={rows}
            getRowKey={(row) => row.id}
            loading={status === 'loading'}
            skeletonRows={5}
            empty={empty}
          />

          {total > PAGE_SIZE ? (
            <Pagination
              page={page}
              pageSize={PAGE_SIZE}
              total={total}
              onPageChange={(nextPage) => updateParams({ page: nextPage })}
            />
          ) : null}
        </>
      )}

      {confirmTarget ? (
        confirmTarget.verb === 'reject' ? (
          <ConfirmDialog
            open
            title={`Reject "${confirmTarget.campaign.name}"?`}
            description="Return it to draft with a note that explains why it needs revision."
            confirmLabel="Reject and return to draft"
            loading={busyId === confirmTarget.campaign.id}
            onConfirm={() => runAction(confirmTarget.campaign, confirmTarget.verb, rejectNote)}
            onCancel={() => {
              setConfirmTarget(null)
              setRejectNote('')
            }}
          >
            <label className="camp__reject-label" htmlFor="campaign-reject-note">
              Reason for revision
            </label>
            <textarea
              id="campaign-reject-note"
              className="camp__reject-note"
              rows={4}
              value={rejectNote}
              onChange={(event) => setRejectNote(event.target.value)}
              placeholder="Example: missing legal review for the final sequence."
            />
          </ConfirmDialog>
        ) : (
          <ConfirmDialog
            open
            title={
              confirmTarget.verb === 'delete'
                ? `Delete "${confirmTarget.campaign.name}"?`
                : `Archive "${confirmTarget.campaign.name}"?`
            }
            description={
              confirmTarget.verb === 'delete'
                ? 'The campaign, its steps, and its enrollments are removed permanently.'
                : 'The campaign becomes read-only history. Duplicating it later still works.'
            }
            confirmLabel={confirmTarget.verb === 'delete' ? 'Delete campaign' : 'Archive campaign'}
            loading={busyId === confirmTarget.campaign.id}
            onConfirm={() => runAction(confirmTarget.campaign, confirmTarget.verb)}
            onCancel={() => setConfirmTarget(null)}
          />
        )
      ) : null}
    </div>
  )
}

function CampaignActions({ row, canWrite, onAction, busyId, onConfirm }) {
  const meta = campaignStatusMeta(row.status)
  const busy = busyId === row.id

  if (!canWrite) {
    return <span className="camp__hint">{meta.hint ?? meta.description ?? '—'}</span>
  }

  const buttons = []

  if (meta.nextAction === 'submit') {
    buttons.push(
      <button
        key="submit"
        type="button"
        className="camp__row-action"
        disabled={busy}
        onClick={(event) => {
          event.stopPropagation()
          onAction(row, 'submit')
        }}
      >
        {busy ? 'Submitting…' : 'Submit for approval'}
      </button>,
    )
  }

  if (meta.nextAction === 'approve') {
    buttons.push(
      <button
        key="approve"
        type="button"
        className="camp__row-action"
        disabled={busy}
        onClick={(event) => {
          event.stopPropagation()
          onAction(row, 'approve')
        }}
      >
        {busy ? 'Approving…' : 'Approve'}
      </button>,
    )
    buttons.push(
      <button
        key="reject"
        type="button"
        className="camp__row-action camp__row-action--danger"
        disabled={busy}
        onClick={(event) => {
          event.stopPropagation()
          onConfirm({ campaign: row, verb: 'reject' })
        }}
      >
        Reject
      </button>,
    )
  }

  if (meta.nextAction === 'archive') {
    buttons.push(
      <button
        key="archive"
        type="button"
        className="camp__row-action"
        disabled={busy}
        onClick={(event) => {
          event.stopPropagation()
          onConfirm({ campaign: row, verb: 'archive' })
        }}
      >
        Archive
      </button>,
    )
    // Completed sequences keep their value: a fresh copy reuses the steps.
    if (row.status === 'completed') {
      buttons.push(
        <button
          key="duplicate"
          type="button"
          className="camp__row-action"
          disabled={busy}
          onClick={(event) => {
            event.stopPropagation()
            onAction(row, 'duplicate')
          }}
        >
          <Copy size={13} aria-hidden="true" />
          {busy ? 'Duplicating…' : 'Duplicate'}
        </button>,
      )
    }
  }

  if (meta.nextAction === 'duplicate') {
    buttons.push(
      <button
        key="duplicate"
        type="button"
        className="camp__row-action"
        disabled={busy}
        onClick={(event) => {
          event.stopPropagation()
          onAction(row, 'duplicate')
        }}
      >
        <Copy size={13} aria-hidden="true" />
        {busy ? 'Duplicating…' : 'Duplicate'}
      </button>,
    )
  }

  if (row.status === 'draft') {
    buttons.push(
      <button
        key="delete"
        type="button"
        className="camp__row-action camp__row-action--danger"
        disabled={busy}
        onClick={(event) => {
          event.stopPropagation()
          onConfirm({ campaign: row, verb: 'delete' })
        }}
      >
        <Ban size={13} aria-hidden="true" />
        Delete
      </button>,
    )
  }

  return (
    <div className="camp__actions">
      {buttons.length > 0 ? buttons : <span className="camp__hint">{meta.hint ?? '—'}</span>}
    </div>
  )
}

