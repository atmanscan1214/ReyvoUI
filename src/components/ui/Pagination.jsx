import { useId } from 'react'
import { ArrowLeft, ArrowRight } from '../icons'

function pageItems(page, totalPages) {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, index) => index + 1)
  }

  if (page <= 3) return [1, 2, 3, 4, 'end', totalPages]
  if (page >= totalPages - 2) {
    return [1, 'start', totalPages - 3, totalPages - 2, totalPages - 1, totalPages]
  }
  return [1, 'start', page - 1, page, page + 1, 'end', totalPages]
}

/**
 * List footer with a result count, page navigation, and page-size control.
 * Controlled: the parent owns `page` and `pageSize`.
 */
export function Pagination({
  page = 1,
  pageSize = 25,
  total = 0,
  onPageChange,
  onPageSizeChange,
  pageSizeOptions = [10, 25, 50, 100],
  itemLabel = 'items',
  showPageSize = true,
  className = '',
}) {
  const sizeId = useId()
  const totalPages = Math.max(1, Math.ceil(total / Math.max(1, pageSize)))
  const current = Math.min(Math.max(1, page), totalPages)
  const start = total === 0 ? 0 : (current - 1) * pageSize + 1
  const end = Math.min(current * pageSize, total)
  const items = pageItems(current, totalPages)

  return (
    <div className={`ui-pagination ${className}`.trim()}>
      <p className="ui-pagination__meta" aria-live="polite">
        {total === 0
          ? `No ${itemLabel}`
          : `Showing ${start}–${end} of ${total} ${itemLabel}`}
      </p>

      <div className="ui-pagination__tail">
        {showPageSize && onPageSizeChange ? (
          <div className="ui-pagination__size">
            <label htmlFor={sizeId}>Rows per page</label>
            <select
              id={sizeId}
              className="ui-select ui-select--sm"
              value={pageSize}
              onChange={(event) => onPageSizeChange(Number(event.target.value))}
            >
              {pageSizeOptions.map((size) => (
                <option key={size} value={size}>
                  {size}
                </option>
              ))}
            </select>
          </div>
        ) : null}

        {totalPages > 1 ? (
          <nav className="ui-pagination__controls" aria-label="Pagination">
            <button
              type="button"
              className="ui-pagination__btn"
              aria-label="Previous page"
              onClick={() => onPageChange?.(current - 1)}
              disabled={current <= 1}
            >
              <ArrowLeft size={15} />
            </button>

            {items.map((item) =>
              typeof item === 'number' ? (
                <button
                  key={item}
                  type="button"
                  className={`ui-pagination__btn${item === current ? ' is-current' : ''}`}
                  aria-label={`Page ${item}`}
                  aria-current={item === current ? 'page' : undefined}
                  onClick={() => onPageChange?.(item)}
                >
                  {item}
                </button>
              ) : (
                <span key={item} className="ui-pagination__ellipsis" aria-hidden="true">
                  …
                </span>
              ),
            )}

            <button
              type="button"
              className="ui-pagination__btn"
              aria-label="Next page"
              onClick={() => onPageChange?.(current + 1)}
              disabled={current >= totalPages}
            >
              <ArrowRight size={15} />
            </button>
          </nav>
        ) : null}
      </div>
    </div>
  )
}
