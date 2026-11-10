/**
 * Shared empty state for tables, inbox buckets, and first-run screens.
 * `compact` is for a table body; full size is for a whole page section.
 */
export function EmptyState({
  icon: Icon,
  title,
  description,
  actions,
  compact = false,
  className = '',
  children,
}) {
  const classes = ['ui-empty', compact ? 'ui-empty--compact' : '', className]
    .filter(Boolean)
    .join(' ')

  return (
    <div className={classes}>
      {Icon ? (
        <span className="ui-empty__icon" aria-hidden="true">
          <Icon size={compact ? 20 : 24} />
        </span>
      ) : null}
      {title ? <p className="ui-empty__title">{title}</p> : null}
      {description ? <p className="ui-empty__description">{description}</p> : null}
      {children}
      {actions ? <div className="ui-empty__actions">{actions}</div> : null}
    </div>
  )
}
