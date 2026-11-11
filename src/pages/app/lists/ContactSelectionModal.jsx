import { useEffect, useMemo, useState } from 'react'
import {
  Button,
  DataTable,
  EmptyState,
  ErrorPanel,
  Modal,
  Pagination,
  StatusBadge,
} from '../../../components/ui'
import { Search, Users } from '../../../components/icons'
import { listContacts } from '../../../lib/contacts'

const PAGE_SIZE = 25

/**
 * Search-and-select contact dialog shared by "Add to list" and "Apply tag".
 * Selection is kept across pages; the caller receives the full id set.
 */
export function ContactSelectionModal({
  open,
  title,
  description,
  confirmLabel = 'Add selected',
  running = false,
  error = null,
  extraValid = true,
  children,
  onClose,
  onConfirm,
}) {
  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [rows, setRows] = useState([])
  const [total, setTotal] = useState(0)
  const [status, setStatus] = useState('loading')
  const [loadError, setLoadError] = useState(null)
  const [refreshKey, setRefreshKey] = useState(0)
  const [selected, setSelected] = useState(() => new Set())

  useEffect(() => {
    if (!open) return
    setSearchInput('')
    setSearch('')
    setPage(1)
    setSelected(new Set())
    setLoadError(null)
  }, [open])

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setSearch(searchInput)
      setPage(1)
    }, 300)
    return () => window.clearTimeout(timer)
  }, [searchInput])

  useEffect(() => {
    if (!open) return undefined
    const controller = new AbortController()
    setStatus('loading')
    setLoadError(null)

    listContacts(
      { search, limit: PAGE_SIZE, offset: (page - 1) * PAGE_SIZE },
      controller.signal,
    )
      .then((data) => {
        setRows(data.items)
        setTotal(data.total)
        setStatus('ready')
      })
      .catch((caught) => {
        if (caught?.name === 'AbortError') return
        setLoadError(caught)
        setStatus('error')
      })

    return () => controller.abort()
  }, [open, search, page, refreshKey])

  const columns = useMemo(
    () => [
      {
        key: 'contact',
        header: 'Contact',
        render: (row) => (
          <div className="lists__picker-person">
            <span className="lists__picker-name">{row.fullName}</span>
            <span className="lists__picker-email">{row.email}</span>
          </div>
        ),
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
    ],
    [],
  )

  const serverMessage = typeof error === 'string' ? error : error?.message
  const selectedCount = selected.size

  return (
    <Modal
      open={open}
      title={title}
      description={description}
      size="lg"
      onClose={running ? undefined : onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={running}>
            Cancel
          </Button>
          <Button
            variant="primary"
            onClick={() => onConfirm([...selected])}
            loading={running}
            disabled={selectedCount === 0 || !extraValid}
          >
            {selectedCount > 0 ? `${confirmLabel} (${selectedCount})` : confirmLabel}
          </Button>
        </>
      }
    >
      <div className="lists__picker">
        {children ? <div className="lists__picker-extra">{children}</div> : null}

        <div className="lists__picker-search">
          <Search size={16} aria-hidden="true" />
          <label className="visually-hidden" htmlFor="list-contact-search">
            Search contacts
          </label>
          <input
            id="list-contact-search"
            type="search"
            className="ui-input ui-input--search"
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
            placeholder="Search by name or email…"
            disabled={running}
          />
        </div>

        {status === 'error' ? (
          <ErrorPanel
            compact
            title="Couldn’t load contacts"
            description={loadError?.message || undefined}
            requestId={loadError?.requestId}
            onRetry={() => setRefreshKey((key) => key + 1)}
          />
        ) : (
          <>
            <DataTable
              caption="Select contacts"
              columns={columns}
              rows={rows}
              getRowKey={(row) => row.id}
              loading={status === 'loading'}
              skeletonRows={5}
              dense
              selectable
              selectedKeys={selected}
              onSelectionChange={setSelected}
              rowLabel={(row) => `Select ${row.fullName}`}
              empty={
                <EmptyState
                  compact
                  icon={Users}
                  title="No contacts match this search"
                  description="Try a different name or email, or clear the search."
                />
              }
            />

            <div className="lists__picker-footer">
              <p className="lists__picker-count" aria-live="polite">
                {selectedCount === 0
                  ? 'No contacts selected'
                  : `${selectedCount.toLocaleString()} selected`}
                {' · '}
                Contacts already in the list are skipped.
              </p>
              {total > PAGE_SIZE ? (
                <Pagination
                  page={page}
                  pageSize={PAGE_SIZE}
                  total={total}
                  onPageChange={setPage}
                  showPageSize={false}
                  itemLabel="contacts"
                  className="lists__picker-pagination"
                />
              ) : null}
            </div>
          </>
        )}

        {serverMessage ? (
          <p className="lists__error-banner" role="alert">
            {serverMessage}
          </p>
        ) : null}
      </div>
    </Modal>
  )
}
