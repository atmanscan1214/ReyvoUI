/**
 * Loading placeholder. Text mode supports multiple lines; the final line is
 * shorter so paragraphs read like real copy while loading.
 */
export function Skeleton({
  variant = 'text',
  width,
  height,
  lines = 1,
  className = '',
  style,
}) {
  const classes = ['ui-skeleton', `ui-skeleton--${variant}`, className]
    .filter(Boolean)
    .join(' ')

  if (variant === 'text' && lines > 1) {
    return (
      <span className="ui-skeleton__group" aria-hidden="true">
        {Array.from({ length: lines }).map((_, index) => (
          <span
            key={index}
            className={classes}
            style={{
              width: width && index === 0 ? width : index === lines - 1 ? '62%' : '100%',
              ...style,
            }}
          />
        ))}
      </span>
    )
  }

  return (
    <span
      className={classes}
      aria-hidden="true"
      style={{ width, height, ...style }}
    />
  )
}
