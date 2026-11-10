/**
 * Compact status/label chip. Tones map to the product's semantic colours;
 * `dot` adds a small leading marker for status columns.
 */
export function Badge({
  tone = 'neutral',
  size = 'md',
  dot = false,
  icon: Icon,
  className = '',
  children,
  ...rest
}) {
  const classes = ['ui-badge', `ui-badge--${tone}`, `ui-badge--${size}`, className]
    .filter(Boolean)
    .join(' ')

  return (
    <span className={classes} {...rest}>
      {dot ? <span className="ui-badge__dot" aria-hidden="true" /> : null}
      {Icon ? <Icon size={size === 'sm' ? 12 : 14} aria-hidden="true" /> : null}
      {children}
    </span>
  )
}
