import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  Ban,
  Copy,
  Info,
  Plus,
  Search,
  Send,
} from '../../../components/icons'
import { TextField, TextareaField } from '../../../components/Field'
import {
  Badge,
  Button,
  ConfirmDialog,
  DataTable,
  EmptyState,
  ErrorPanel,
  FilterBar,
  FilterSelect,
  Modal,
  PageHeader,
  Pagination,
  StatusBadge,
  useToast,
} from '../../../components/ui'
import { useSession } from '../../../lib/session'
import { usePageTitle } from '../../../lib/usePageTitle'
import {
  CAMPAIGN_STATUSES,
  archiveCampaign,
  campaignStatusMeta,
  createCampaign,
  deleteCampaign,
  duplicateCampaign,
  listCampaigns,
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

  const [createOpen, setCreateOpen] = useState(false)
  const [busyId, setBusyId] = useState(null)
  const [confirmTarget, setConfirmTarget] = useState(null) // { campaign, verb }

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

  async function runAction(campaign, verb) {
    setBusyId(campaign.id)
    try {
      if (verb === 'submit') {
        await submitCampaign(campaign.id)
        toast.success(`${campaign.name} was submitted for approval.`)
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
          <span className="camp__name-text" title={row.name}>
            {row.name}
          </span>
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
            <Button variant="primary" size="sm" leadingIcon={Plus} onClick={() => setCreateOpen(true)}>
              New campaign
            </Button>
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
            <Button variant="primary" leadingIcon={Plus} onClick={() => setCreateOpen(true)}>
              New campaign
            </Button>
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

      {canWrite ? (
        <CreateCampaignModal
          open={createOpen}
          onClose={() => setCreateOpen(false)}
          onCreated={(campaign) => {
            setCreateOpen(false)
            toast.success(`${campaign.name} was created as a draft.`)
            setRefreshKey((key) => key + 1)
          }}
        />
      ) : null}

      {confirmTarget ? (
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

function CreateCampaignModal({ open, onClose, onCreated }) {
  const [form, setForm] = useState({
    name: '',
    subject: '',
    body: '',
  })
  const [errors, setErrors] = useState({})
  const [creating, setCreating] = useState(false)
  const [serverError, setServerError] = useState(null)

  useEffect(() => {
    if (!open) return
    setForm({ name: '', subject: '', body: '' })
    setErrors({})
    setServerError(null)
  }, [open])

  async function submit(event) {
    event.preventDefault()
    const validation = {}
    if ((form.name ?? '').trim().length < 2) {
      validation.name = 'Give the campaign a name of at least 2 characters.'
    }
    if (!(form.subject ?? '').trim()) {
      validation.subject = 'The first step needs a subject line.'
    }
    if (!(form.body ?? '').trim()) {
      validation.body = 'The first step needs a body.'
    }
    setErrors(validation)
    if (Object.keys(validation).length > 0) return

    setCreating(true)
    setServerError(null)
    try {
      const campaign = await createCampaign({
        name: form.name.trim(),
        subject: form.subject.trim(),
        body: form.body.trim(),
      })
      onCreated(campaign)
    } catch (caught) {
      setServerError(caught?.message || 'The campaign could not be created.')
      setCreating(false)
    }
  }

  return (
    <Modal
      open={open}
      title="New campaign"
      description="Seeds a draft with a first step. Audience, mailboxes, more steps, and scheduling are added by the campaign wizard."
      size="lg"
      onClose={creating ? undefined : onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={creating}>
            Cancel
          </Button>
          <Button variant="primary" leadingIcon={Plus} onClick={submit} loading={creating}>
            Create draft
          </Button>
        </>
      }
    >
      <form className="camp-create" onSubmit={submit} noValidate>
        <TextField
          id="camp-name"
          label="Campaign name"
          value={form.name}
          maxLength={255}
          error={errors.name}
          hint="Shown across lists, stats, and the audit log."
          onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
        />
        <TextField
          id="camp-subject"
          label="First step subject"
          value={form.subject}
          maxLength={500}
          error={errors.subject}
          hint="Merge fields like {{first_name}} and {{company_name}} are supported."
          onChange={(event) => setForm((current) => ({ ...current, subject: event.target.value }))}
        />
        <TextareaField
          id="camp-body"
          label="First step body (plain text for now)"
          rows={6}
          value={form.body}
          error={errors.body}
          hint="You can rewrite this in the sequence editor with the rich-text editor and merge-field picker."
          onChange={(event) => setForm((current) => ({ ...current, body: event.target.value }))}
        />

        {serverError ? (
          <p className="camp__error" role="alert">
            {serverError}
          </p>
        ) : null}
      </form>
    </Modal>
  )
}
