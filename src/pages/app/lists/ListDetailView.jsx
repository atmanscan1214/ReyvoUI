import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, List as ListIcon, Plus, Send, Trash, Users } from '../../../components/icons'
import {
  Badge,
  Button,
  DataTable,
  EmptyState,
  ErrorPanel,
  Pagination,
  StatusBadge,
  useToast,
} from '../../../components/ui'
import { formatContactDate } from '../../../lib/contacts'
import {
  LISTS_PAGE_SIZE,
  addContactsToList,
  listListContacts,
  removeContactFromList,
} from '../../../lib/lists'
import { ContactSelectionModal } from './ContactSelectionModal'

/**
 * One static list: members, add/remove, and the campaign-audience handoff.
 * The API has no list rename or description edit, so the header is read-only.
 */
export function ListDetailView({
  list,
  companies = [],
  canWrite = false,
  onBack,
  onChanged,
  onRequestDelete,
  onUseInCampaign,
}) {
  const navigate = useNavigate()
  const { toast } = useToast()

  const [page, setPage] = useState(1)
  const [rows, setRows] = useState([])
  const [total, setTotal] = useState(0)
  const [status, setStatus] = useState('loading')
  const [error, setError] = useState(null)
  const [refreshKey, setRefreshKey] = useState(0)
  const [addOpen, setAddOpen] = useState(false)
  const [addRunning, setAddRunning] = useState(false)
  const [addError, setAddError] = useState(null)
  const [removingId, setRemovingId] = useState(null)

  const companyMap = useMemo(
    () => new Map(companies.map((company) => [company.id, company])),
    [companies],
  )

  useEffect(() => {
    setPage(1)
    setRows([])
    setTotal(0)
    setStatus('loading')
  }, [list.id])

  useEffect(() => {
    const controller = new AbortController()
    setStatus('loading')
    setError(null)

    listListContacts(
      list.id,
      { limit: LISTS_PAGE_SIZE, offset: (page - 1) * LISTS_PAGE_SIZE },
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
  }, [list.id, page, refreshKey])

  const columns = [
    {
      key: 'contact',
      header: 'Contact',
      render: (row) => (
        <div className="lists__person">
          <span className="lists__person-name">{row.fullName}</span>
          <span className="lists__person-email">{row.email}</span>
        </div>
      ),
    },
    {
      key: 'company',
      header: 'Company',
      render: (row) =>
        row.companyId ? companyMap.get(row.companyId)?.name ?? '—' : '—',
    },
    {
      key: 'title',
      header: 'Title',
      render: (row) => row.title || '—',
    },
    {
      key: 'status',
      header: 'Status',
      render: (row) => <StatusBadge status={row.status} size="sm" dot={false} />,
    },
    {
      key: 'actions',
      header: '',
      align: 'right',
      width: 96,
      render: (row) =>
        canWrite ? (
          <button
            type="button"
            className="lists__row-action"
            onClick={(event) => {
              event.stopPropagation()
              handleRemove(row)
            }}
            disabled={Boolean(removingId)}
          >
            {removingId === row.id ? 'Removing…' : 'Remove'}
          </button>
        ) : null,
    },
  ]

  async function handleAdd(contactIds) {
    setAddError(null)
    setAddRunning(true)

    try {
      const message = await addContactsToList(list.id, contactIds)
      toast.success(
        message ||
          `Added ${contactIds.length === 1 ? '1 contact' : `${contactIds.length} contacts`} to ${list.name}.`,
      )
      setAddOpen(false)
      setPage(1)
      setRefreshKey((key) => key + 1)
      onChanged?.()
    } catch (caught) {
      setAddError(caught)
    } finally {
      setAddRunning(false)
    }
  }

  async function handleRemove(contact) {
    setRemovingId(contact.id)
    try {
      await removeContactFromList(list.id, contact.id)
      toast.success(`${contact.fullName} removed from ${list.name}.`)
      if (rows.length === 1 && page > 1) setPage((current) => current - 1)
      setRefreshKey((key) => key + 1)
      onChanged?.()
    } catch (caught) {
      toast.error(caught?.message || 'The contact could not be removed from this list.')
    } finally {
      setRemovingId(null)
    }
  }

  const empty =
    status === 'ready' && total === 0 ? (
      <EmptyState
        compact
        icon={ListIcon}
        title="This list is empty"
        description="Add contacts to make this list usable as an audience."
        actions={
          canWrite ? (
            <Button
              variant="primary"
              size="sm"
              leadingIcon={Plus}
              onClick={() => {
                setAddError(null)
                setAddOpen(true)
              }}
            >
              Add contacts
            </Button>
          ) : undefined
        }
      />
    ) : undefined

  return (
    <section className="lists__detail" aria-labelledby="list-detail-title">
      <button type="button" className="lists__back" onClick={onBack}>
        <ArrowLeft size={14} aria-hidden="true" />
        All lists
      </button>

      <header className="lists__detail-head">
        <div className="lists__detail-copy">
          <p className="eyebrow">Static list</p>
          <h2 id="list-detail-title">{list.name}</h2>
          {list.description ? (
            <p className="lists__detail-description">{list.description}</p>
          ) : null}
          <div className="lists__detail-meta">
            <Badge tone="neutral" dot>
              {total === 1 ? '1 contact' : `${total.toLocaleString()} contacts`}
            </Badge>
            <span>Created {formatContactDate(list.createdAt) ?? 'on an unknown date'}</span>
          </div>
        </div>

        <div className="lists__detail-actions">
          <Button
            variant="ghost"
            leadingIcon={Send}
            onClick={() => onUseInCampaign({ ...list, contactCount: total })}
            disabled={total === 0}
            title="Select this list as the next campaign audience"
          >
            Use in campaign
          </Button>
          {canWrite ? (
            <>
              <Button
                variant="primary"
                leadingIcon={Plus}
                onClick={() => {
                  setAddError(null)
                  setAddOpen(true)
                }}
              >
                Add contacts
              </Button>
              <Button
                variant="quiet"
                leadingIcon={Trash}
                onClick={() => onRequestDelete(list)}
              >
                Delete list
              </Button>
            </>
          ) : null}
        </div>
      </header>

      {status === 'error' ? (
        <ErrorPanel
          title="Couldn’t load this list"
          description={error?.message || undefined}
          requestId={error?.requestId}
          onRetry={() => setRefreshKey((key) => key + 1)}
        />
      ) : (
        <>
          <DataTable
            caption={`${list.name} contacts`}
            columns={columns}
            rows={rows}
            getRowKey={(row) => row.id}
            loading={status === 'loading'}
            skeletonRows={5}
            empty={empty}
            onRowClick={(row) => navigate(`/app/contacts/${row.id}`)}
            rowLabel={(row) => `Open ${row.fullName}`}
          />

          {total > 0 ? (
            <Pagination
              page={page}
              pageSize={LISTS_PAGE_SIZE}
              total={total}
              onPageChange={setPage}
              itemLabel="contacts"
            />
          ) : null}
        </>
      )}

      {!canWrite ? (
        <p className="lists__read-only">
          <Users size={15} aria-hidden="true" />
          Your role can view lists but not add or remove contacts.
        </p>
      ) : null}

      <ContactSelectionModal
        open={addOpen}
        title={`Add contacts to ${list.name}`}
        description="Choose contacts to add. Contacts already in this list are skipped by the API."
        confirmLabel="Add to list"
        running={addRunning}
        error={addError}
        onClose={() => {
          if (addRunning) return
          setAddOpen(false)
          setAddError(null)
        }}
        onConfirm={handleAdd}
      />
    </section>
  )
}
