import { useId, useRef, useState } from 'react'

/**
 * Accessible tab list with optional counts. Works controlled (`value` +
 * `onChange`) or uncontrolled (`defaultValue`), and supports arrow keys,
 * Home, and End. Each item supplies its own panel content.
 *
 * items: [{ id, label, count?, disabled?, content }]
 */
export function Tabs({
  items,
  value,
  defaultValue,
  onChange,
  label = 'Sections',
  className = '',
  panelClassName = '',
}) {
  const baseId = useId().replace(/[^a-zA-Z0-9_-]/g, '')
  const refs = useRef(new Map())
  const [internal, setInternal] = useState(
    () => defaultValue ?? items.find((item) => !item.disabled)?.id,
  )

  const active = value !== undefined ? value : internal
  const activeItem = items.find((item) => item.id === active)

  function select(nextId, item) {
    if (value === undefined) setInternal(nextId)
    onChange?.(nextId, item)
  }

  function handleKeyDown(event, item) {
    const enabled = items.filter((candidate) => !candidate.disabled)
    const index = enabled.findIndex((candidate) => candidate.id === item.id)
    let next

    if (event.key === 'ArrowRight') next = enabled[(index + 1) % enabled.length]
    else if (event.key === 'ArrowLeft') next = enabled[(index - 1 + enabled.length) % enabled.length]
    else if (event.key === 'Home') next = enabled[0]
    else if (event.key === 'End') next = enabled[enabled.length - 1]
    else return

    event.preventDefault()
    select(next.id, next)
    refs.current.get(next.id)?.focus()
  }

  return (
    <div className={`ui-tabs ${className}`.trim()}>
      <div className="ui-tabs__list" role="tablist" aria-label={label}>
        {items.map((item) => {
          const selected = item.id === active
          return (
            <button
              key={item.id}
              ref={(node) => {
                if (node) refs.current.set(item.id, node)
                else refs.current.delete(item.id)
              }}
              type="button"
              role="tab"
              id={`${baseId}-tab-${item.id}`}
              aria-selected={selected}
              aria-controls={`${baseId}-panel-${item.id}`}
              tabIndex={selected ? 0 : -1}
              disabled={item.disabled}
              className="ui-tabs__tab"
              onClick={() => select(item.id, item)}
              onKeyDown={(event) => handleKeyDown(event, item)}
            >
              {item.label}
              {item.count !== undefined && item.count !== null ? (
                <span className="ui-tabs__count">{item.count}</span>
              ) : null}
            </button>
          )
        })}
      </div>

      {items.map((item) => (
        <div
          key={item.id}
          role="tabpanel"
          id={`${baseId}-panel-${item.id}`}
          aria-labelledby={`${baseId}-tab-${item.id}`}
          tabIndex={0}
          hidden={item.id !== active}
          className={`ui-tabs__panel ${panelClassName}`.trim()}
        >
          {item.id === active ? item.content : null}
        </div>
      ))}

      {!activeItem ? (
        <div className="ui-tabs__panel" role="tabpanel">
          No content selected.
        </div>
      ) : null}
    </div>
  )
}
