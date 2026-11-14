import { useCallback, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { AlertTriangle, Ban, Info, Shield } from '../../../components/icons'
import { TextareaField, TextField } from '../../../components/Field'
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
  useToast,
} from '../../../components/ui'
import { formatContactDate } from '../../../lib/contacts'
import { useSession } from '../../../lib/session'
import {
  SUPPRESSION_REASONS,
  SUPPRESSIONS_PAGE_SIZE,
  addSuppression,
  listSuppressions,
  removeSuppression,
  suppressionReasonMeta,
} from '../../../lib/suppressions'
import './suppressions.css'

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function describeSource(source) {
  if (!source) return '—'
  return source.replace(/[-_]/g, ' ').replace(/^\w/, (char) => char.toUpperCase())
}

/**
 * Tenant suppression list (T17).
 *
 * The API pages blocks with a reason filter, adds manual blocks, and removes
 * them. Per the design, `complaint` and platform/legal blocks cannot be
 * overridden, so those rows never show a remove control. Members can view
 * everything but get no write controls, because the API itself has no RBAC on
 * this route.
 */
export function SuppressionsPage() {
  const { role, profileStatus } = useSession()
  const { toast } = useToast()
  const [searchParams, setSearchParams] = useSearchParams()

  const roleKnown = profileStatus === 'ready'
  const canWrite = roleKnown && (role === 'owner' || role === 'admin')

  const reasonFilter = searchParams.get('reason') ?? ''
  const page = Number(searchParams.get('page') ?? '1') || 1

  const [rows, setRows] = useState([])
  const [total, setTotal] = useState(0)
  const [status, setStatus] = useState('loading')
  const [error, setError] = useState(null)
  const [refreshKey, setRefreshKey] = useState(0)

  const [blockOpen, setBlockOpen] = useState(false)
  const [blockRunning, setBlockRunning] = useState(false)
  const [blockError, setBlockError] = useState(null)

  const [removingId, setRemovingId] = useState(null)
  const [confirmTarget, setConfirmTarget] = useState(null)

  const reasonOptions = useMemo(
    () => SUPPRESSION_REASONS.map((entry) => ({ value: entry.value, label: entry.label })),
    [],
  )

  const updateParams = useCallback(
    (next) => {
      const params = new URLSearchParams(searchParams)
      if (next.reason !== undefined) {
        if (next.reason) params.set('reason', next.reason)
        else params.delete('reason')
        params.delete('page')
      }
      if (next.page !== undefined) {
        if (next.page > 1) params.set('page', String(next.page))
        else params.delete('page')
      }
      setSearchParams(params, { replace: true })
    },
    [searchParams, setSearchParams],
  )

  useEffect(() => {
    const controller = new AbortController()
    setStatus('loading')
    setError(null)

    listSuppressions(
      {
        reason: reasonFilter || null,
        limit: SUPPRESSIONS_PAGE_SIZE,
        offset: (page - 1) * SUPPRESSIONS_PAGE_SIZE,
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
  }, [reasonFilter, page, refreshKey])

  async function handleBlock(values) {
    setBlockError(null)
    setBlockRunning(true)

    try {
      const blocked = await addSuppression(values)
      toast.success(`${blocked.email} is blocked from future sends.`)
      setBlockOpen(false)
      updateParams({ reason: '', page: 1 })
      setRefreshKey((key) => key + 1)
    } catch (caught) {
      setBlockError(caught)
    } finally {
      setBlockRunning(false)
    }
  }

  async function handleRemove() {
    if (!confirmTarget) return
    setRemovingId(confirmTarget.id)

    try {
      await removeSuppression(confirmTarget.id)
      toast.success(`${confirmTarget.email} can be contacted again.`)
      setConfirmTarget(null)
      setRefreshKey((key) => key + 1)
    } catch (caught) {
      toast.error(caught?.message || 'The block could not be removed.')
    } finally {
      setRemovingId(null)
    }
  }

  const columns = [
    {
      key: 'email',
      header: 'Email address',
      render: (row) => <span className="sup__email">{row.email}</span>,
    },
    {
      key: 'reason',
      header: 'Reason',
      render: (row) => {
        const meta = suppressionReasonMeta(row.reason)
        return (
          <Badge tone={meta.tone} size="sm" title={meta.description ?? undefined}>
            {meta.label}
          </Badge>
        )
      },
    },
    {
      key: 'source',
      header: 'Source',
      render: (row) => <span className="sup__muted">{describeSource(row.source)}</span>,
    },
    {
      key: 'note',
      header: 'Note',
      render: (row) =>
        row.note ? (
          <span className="sup__note" title={row.note}>
            {row.note}
          </span>
        ) : (
          <span className="sup__muted">—</span>
        ),
    },
    {
      key: 'created_at',
      header: 'Blocked',
      render: (row) => formatContactDate(row.createdAt) ?? '—',
    },
    {
      key: 'actions',
      header: '',
      align: 'right',
      width: 120,
      render: (row) => {
        const meta = suppressionReasonMeta(row.reason)

        if (!meta.removable) {
          return (
            <span
              className="sup__locked"
              title={meta.description ?? 'This block cannot be overridden.'}
            >
              <Shield size={13} aria-hidden="true" />
              Locked
            </span>
          )
        }

        if (!canWrite) return null

        return (
          <button
            type="button"
            className="sup__row-action"
            onClick={(event) => {
              event.stopPropagation()
              setConfirmTarget(row)
            }}
            disabled={Boolean(removingId)}
          >
            {removingId === row.id ? 'Removing…' : 'Remove'}
          </button>
        )
      },
    },
  ]

  const empty =
    status === 'ready' && total === 0 ? (
      <EmptyState
        compact
        icon={Ban}
        title={reasonFilter ? 'No blocks with this reason' : 'No suppressed addresses yet'}
        description={
          reasonFilter
            ? 'Nothing on the suppression list carries this reason right now.'
            : 'Blocks appear here from unsubscribes, hard bounces, complaints, and imports, or you can add one by hand.'
        }
        actions={
          canWrite && !reasonFilter ? (
            <Button
              variant="primary"
              size="sm"
              leadingIcon={Ban}
              onClick={() => {
                setBlockError(null)
                setBlockOpen(true)
              }}
            >
              Block an address
            </Button>
          ) : undefined
        }
      />
    ) : undefined

  return (
    <div className="app-page sup-page">
      <PageHeader
        eyebrow="Audience · Suppressions"
        title="Suppressions"
        description="Addresses this workspace will never contact: unsubscribes, hard bounces, complaints, manual blocks, and platform blocks."
        meta={
          <>
            <Badge tone="neutral" dot>
              {`${total.toLocaleString()} blocked${reasonFilter ? ' with this reason' : ''}`}
            </Badge>
            {roleKnown && !canWrite ? <Badge tone="outline">Read-only</Badge> : null}
          </>
        }
        actions={
          canWrite ? (
            <Button
              variant="primary"
              leadingIcon={Ban}
              onClick={() => {
                setBlockError(null)
                setBlockOpen(true)
              }}
            >
              Block address
            </Button>
          ) : null
        }
      />

      <p className="sup__policy app-card">
        <Info size={16} aria-hidden="true" />
        <span>
          A send is blocked when the address appears on this workspace list <em>or</em> the
          platform-wide list. Complaint and platform blocks cannot be removed; other blocks can be
          lifted by an owner or admin, and every removal is written to the audit log.
        </span>
      </p>

      <FilterBar
        activeCount={reasonFilter ? 1 : 0}
        onReset={() => updateParams({ reason: '' })}
        resetLabel="Clear reason filter"
      >
        <FilterSelect
          label="Reason"
          value={reasonFilter}
          onChange={(value) => updateParams({ reason: value })}
          options={reasonOptions}
          placeholder="All reasons"
        />
      </FilterBar>

      {status === 'error' ? (
        <ErrorPanel
          title="Couldn’t load the suppression list"
          description={error?.message || undefined}
          requestId={error?.requestId}
          onRetry={() => setRefreshKey((key) => key + 1)}
        />
      ) : (
        <>
          <DataTable
            caption="Suppressed email addresses"
            columns={columns}
            rows={rows}
            getRowKey={(row) => row.id}
            loading={status === 'loading'}
            skeletonRows={5}
            empty={empty}
          />

          {total > SUPPRESSIONS_PAGE_SIZE ? (
            <Pagination
              page={page}
              pageSize={SUPPRESSIONS_PAGE_SIZE}
              total={total}
              onPageChange={(next) => updateParams({ page: next })}
              itemLabel="addresses"
            />
          ) : null}
        </>
      )}

      {roleKnown && !canWrite ? (
        <p className="sup__read-only">
          <Shield size={15} aria-hidden="true" />
          Your role can view suppressions but not add or remove them. Ask an owner or admin.
        </p>
      ) : null}

      {canWrite ? (
        <BlockAddressModal
          open={blockOpen}
          running={blockRunning}
          error={blockError}
          onClose={() => {
            if (blockRunning) return
            setBlockOpen(false)
            setBlockError(null)
          }}
          onConfirm={handleBlock}
        />
      ) : null}

      <ConfirmDialog
        open={Boolean(confirmTarget)}
        title={`Remove the block on ${confirmTarget?.email ?? 'this address'}?`}
        description="Campaigns and imports will be able to contact this address again. The removal is recorded in the audit log."
        confirmLabel="Remove block"
        loading={Boolean(removingId)}
        onConfirm={handleRemove}
        onCancel={() => {
          if (removingId) return
          setConfirmTarget(null)
        }}
      />
    </div>
  )
}

/**
 * Manual block dialog. The reason is always `manual`: unsubscribes, bounces,
 * and complaints arrive automatically from sends, replies, and imports, so a
 * hand-entered complaint or bounce would be a false compliance record.
 */
function BlockAddressModal({ open, running, error, onClose, onConfirm }) {
  const [email, setEmail] = useState('')
  const [note, setNote] = useState('')
  const [errors, setErrors] = useState({})

  useEffect(() => {
    if (!open) return
    setEmail('')
    setNote('')
    setErrors({})
  }, [open])

  const serverMessage = error
    ? error.status === 409
      ? 'This address is already on the suppression list.'
      : error.message || 'The address could not be blocked.'
    : null

  function handleSubmit(event) {
    event.preventDefault()
    const next = {}

    if (!email.trim()) next.email = 'Enter an email address.'
    else if (!EMAIL_PATTERN.test(email.trim())) next.email = 'Enter a valid email address.'

    setErrors(next)
    if (Object.keys(next).length > 0) return
    onConfirm({ email: email.trim(), note: note.trim() })
  }

  return (
    <Modal
      open={open}
      title="Block an address"
      description="A manual block stops all future sends and imports to this address, and marks a matching contact as unsubscribed."
      size="md"
      onClose={running ? undefined : onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={running}>
            Cancel
          </Button>
          <Button
            type="submit"
            form="suppression-block-form"
            variant="primary"
            loading={running}
          >
            Block address
          </Button>
        </>
      }
    >
      <form className="sup__form" id="suppression-block-form" onSubmit={handleSubmit} noValidate>
        <TextField
          id="sup-email"
          label="Email address"
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          placeholder="name@company.com"
          autoComplete="off"
          error={errors.email}
          disabled={running}
          autoFocus
        />

        <TextareaField
          id="sup-note"
          label="Note"
          optional
          value={note}
          onChange={(event) => setNote(event.target.value)}
          placeholder="Why is this address blocked?"
          rows={3}
          disabled={running}
        />

        {serverMessage ? (
          <p className="sup__error-banner" role="alert">
            <AlertTriangle size={15} aria-hidden="true" />
            {serverMessage}
          </p>
        ) : null}

        <p className="sup__form-hint">
          The block is recorded with reason <strong>manual</strong>. Unsubscribes, bounces, and
          complaints are added automatically when sends and replies produce them.
        </p>
      </form>
    </Modal>
  )
}
