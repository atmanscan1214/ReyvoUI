import { useEffect, useMemo, useRef } from 'react'
import { ChevronDown } from '../icons'
import { EmptyState } from './EmptyState'
import { ErrorPanel } from './ErrorPanel'
import { Skeleton } from './Skeleton'

/**
 * Accessible data table for list screens.
 *
 * Handles loading skeletons, empty/error states, sortable headers, row
 * selection for bulk actions, and optional row activation. The caller owns
 * sorting, selection, and pagination state so URL/search state stays in sync.
 *
 * columns: [{ key, header, render?, sortable?, align?, width?, className? }]
 */
export function DataTable({
  columns,
  rows,
  getRowKey,
  caption,
  loading = false,
  skeletonRows = 5,
  error = null,
  onRetry,
  empty,
  sort = null,
  onSortChange,
  selectable = false,
  selectedKeys,
  onSelectionChange,
  onRowClick,
  dense = false,
  className = '',
  tableClassName = '',
  rowLabel,
}) {
  const selectAllRef = useRef(null)
  const selected = useMemo(() => {
    if (selectedKeys instanceof Set) return selectedKeys
    return new Set(selectedKeys || [])
  }, [selectedKeys])

  const keyFor = (row, index) =>
    String(getRowKey ? getRowKey(row, index) : row?.id ?? index)

  const visibleKeys = rows.map((row, index) => keyFor(row, index))
  const allSelected = visibleKeys.length > 0 && visibleKeys.every((key) => selected.has(key))
  const someSelected = visibleKeys.some((key) => selected.has(key)) && !allSelected

  useEffect(() => {
    if (selectAllRef.current) {
      selectAllRef.current.indeterminate = someSelected
    }
  }, [someSelected])

  const colSpan = columns.length + (selectable ? 1 : 0)
  const wrapperClasses = ['ui-table-wrap', className].filter(Boolean).join(' ')
  const tableClasses = ['ui-table', dense ? 'ui-table--dense' : '', tableClassName]
    .filter(Boolean)
    .join(' ')

  function handleSort(column) {
    if (!column.sortable || !onSortChange) return
    const direction =
      sort?.key === column.key && sort.direction === 'asc' ? 'desc' : 'asc'
    onSortChange({ key: column.key, direction })
  }

  function toggleAll() {
    if (!onSelectionChange) return
    const next = new Set(selected)
    if (allSelected) {
      visibleKeys.forEach((key) => next.delete(key))
    } else {
      visibleKeys.forEach((key) => next.add(key))
    }
    onSelectionChange(next)
  }

  function toggleRow(key) {
    if (!onSelectionChange) return
    const next = new Set(selected)
    if (next.has(key)) next.delete(key)
    else next.add(key)
    onSelectionChange(next)
  }

  function handleRowKeyDown(event, row) {
    if (!onRowClick || event.target !== event.currentTarget) return
    if (event.key !== 'Enter' && event.key !== ' ') return
    event.preventDefault()
    onRowClick(row)
  }

  const errorMessage = typeof error === 'string' ? error : error?.message
  const errorRequestId = typeof error === 'object' ? error?.requestId : null

  return (
    <div
      className={wrapperClasses}
      role="region"
      aria-label={caption ? `${caption} table` : 'Data table'}
      tabIndex={0}
    >
      <table className={tableClasses} aria-busy={loading || undefined}>
        {caption ? <caption className="visually-hidden">{caption}</caption> : null}

        <thead>
          <tr>
            {selectable ? (
              <th scope="col" className="ui-table__check">
                <input
                  ref={selectAllRef}
                  type="checkbox"
                  checked={allSelected}
                  onChange={toggleAll}
                  aria-label="Select all rows on this page"
                  disabled={loading || rows.length === 0}
                />
              </th>
            ) : null}

            {columns.map((column) => {
              const active = sort?.key === column.key
              return (
                <th
                  key={column.key}
                  scope="col"
                  style={column.width ? { width: column.width } : undefined}
                  className={[
                    column.align ? `ui-table__cell--${column.align}` : '',
                    column.className || '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                  aria-sort={
                    column.sortable
                      ? active
                        ? sort.direction === 'asc'
                          ? 'ascending'
                          : 'descending'
                        : 'none'
                      : undefined
                  }
                >
                  {column.sortable ? (
                    <button
                      type="button"
                      className="ui-table__sort"
                      onClick={() => handleSort(column)}
                    >
                      {column.header}
                      <span
                        className="ui-table__sort-icon"
                        data-direction={active ? sort.direction : 'none'}
                        aria-hidden="true"
                      >
                        <ChevronDown size={12} />
                      </span>
                    </button>
                  ) : (
                    column.header
                  )}
                </th>
              )
            })}
          </tr>
        </thead>

        <tbody>
          {loading
            ? Array.from({ length: skeletonRows }).map((_, rowIndex) => (
                <tr key={`skeleton-${rowIndex}`}>
                  {selectable ? (
                    <td className="ui-table__check">
                      <Skeleton variant="rect" width={15} height={15} />
                    </td>
                  ) : null}
                  {columns.map((column, columnIndex) => (
                    <td key={column.key}>
                      <Skeleton
                        variant="text"
                        width={`${48 + ((rowIndex + columnIndex) % 4) * 12}%`}
                      />
                    </td>
                  ))}
                </tr>
              ))
            : null}

          {!loading && error ? (
            <tr>
              <td colSpan={colSpan} className="ui-table__state">
                <ErrorPanel
                  compact
                  title="Couldn’t load this list"
                  description={errorMessage || undefined}
                  requestId={errorRequestId}
                  onRetry={onRetry}
                />
              </td>
            </tr>
          ) : null}

          {!loading && !error && rows.length === 0 ? (
            <tr>
              <td colSpan={colSpan} className="ui-table__state">
                {empty || (
                  <EmptyState
                    compact
                    title="Nothing here yet"
                    description="New records will appear here as they are added."
                  />
                )}
              </td>
            </tr>
          ) : null}

          {!loading && !error
            ? rows.map((row, index) => {
                const key = keyFor(row, index)
                const isSelected = selected.has(key)
                return (
                  <tr
                    key={key}
                    className={[
                      onRowClick ? 'is-clickable' : '',
                      isSelected ? 'is-selected' : '',
                    ]
                      .filter(Boolean)
                      .join(' ')}
                    tabIndex={onRowClick ? 0 : undefined}
                    onClick={onRowClick ? () => onRowClick(row) : undefined}
                    onKeyDown={onRowClick ? (event) => handleRowKeyDown(event, row) : undefined}
                  >
                    {selectable ? (
                      <td className="ui-table__check">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleRow(key)}
                          onClick={(event) => event.stopPropagation()}
                          aria-label={
                            typeof rowLabel === 'function'
                              ? rowLabel(row)
                              : rowLabel
                                ? `${rowLabel} ${index + 1}`
                                : `Select row ${index + 1}`
                          }
                        />
                      </td>
                    ) : null}

                    {columns.map((column) => (
                      <td
                        key={column.key}
                        className={[
                          column.align ? `ui-table__cell--${column.align}` : '',
                          column.className || '',
                        ]
                          .filter(Boolean)
                          .join(' ')}
                      >
                        {column.render
                          ? column.render(row, index)
                          : row[column.key]}
                      </td>
                    ))}
                  </tr>
                )
              })
            : null}
        </tbody>
      </table>
    </div>
  )
}
