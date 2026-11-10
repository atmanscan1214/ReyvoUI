import { useId } from 'react'
import { Close, Search } from '../icons'

/**
 * Search + filter controls for list screens. Children are usually
 * `FilterSelect`s; `actions` is for the primary button or export menu.
 * `onReset` appears only while at least one filter is active.
 */
export function FilterBar({
  search,
  onSearchChange,
  searchPlaceholder = 'Search…',
  searchLabel = 'Search',
  children,
  actions,
  onReset,
  activeCount = 0,
  resetLabel = 'Clear filters',
  className = '',
}) {
  const searchId = useId()
  const showSearch = onSearchChange !== undefined || search !== undefined

  return (
    <div className={`ui-filterbar ${className}`.trim()} role="search">
      {showSearch ? (
        <div className="ui-filterbar__search">
          <Search size={16} aria-hidden="true" />
          <label className="visually-hidden" htmlFor={searchId}>
            {searchLabel}
          </label>
          <input
            id={searchId}
            type="search"
            className="ui-input ui-input--search"
            value={search ?? ''}
            placeholder={searchPlaceholder}
            onChange={(event) => onSearchChange?.(event.target.value)}
          />
        </div>
      ) : null}

      {children ? <div className="ui-filterbar__fields">{children}</div> : null}

      <div className="ui-filterbar__tail">
        {onReset && activeCount > 0 ? (
          <button type="button" className="ui-filterbar__reset" onClick={onReset}>
            <Close size={13} aria-hidden="true" />
            {resetLabel}
            <span className="ui-filterbar__count">{activeCount}</span>
          </button>
        ) : null}
        {actions ? <div className="ui-filterbar__actions">{actions}</div> : null}
      </div>
    </div>
  )
}

export function FilterSelect({
  label,
  value,
  onChange,
  options = [],
  placeholder = 'All',
  id,
  name,
  disabled = false,
  className = '',
}) {
  const generatedId = useId()
  const selectId = id || generatedId

  return (
    <div className={`ui-filterbar__field ${className}`.trim()}>
      <label className="ui-filterbar__label" htmlFor={selectId}>
        {label}
      </label>
      <select
        id={selectId}
        name={name}
        className="ui-select"
        value={value}
        disabled={disabled}
        onChange={(event) => onChange?.(event.target.value)}
      >
        {placeholder !== null ? <option value="">{placeholder}</option> : null}
        {options.map((option) => {
          const optionValue = typeof option === 'string' ? option : option.value
          const optionLabel =
            typeof option === 'string' ? option : option.label ?? option.value
          return (
            <option key={optionValue} value={optionValue}>
              {optionLabel}
            </option>
          )
        })}
      </select>
    </div>
  )
}
