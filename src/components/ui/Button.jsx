import { forwardRef } from 'react'

const ICON_SIZE = { sm: 15, md: 17, lg: 18 }

/**
 * Shared button. Wraps the global `.btn` classes so product screens get the
 * same sizing, loading state, and icon spacing without local variants.
 */
export const Button = forwardRef(function Button(
  {
    variant = 'primary',
    size = 'md',
    loading = false,
    leadingIcon: LeadingIcon,
    trailingIcon: TrailingIcon,
    className = '',
    children,
    disabled = false,
    type = 'button',
    ...rest
  },
  ref,
) {
  const iconSize = ICON_SIZE[size] ?? ICON_SIZE.md
  const classes = ['btn', `btn--${variant}`, `btn--${size}`, className]
    .filter(Boolean)
    .join(' ')

  return (
    <button
      ref={ref}
      type={type}
      className={classes}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...rest}
    >
      {loading ? (
        <span className="btn__spinner" aria-hidden="true" />
      ) : LeadingIcon ? (
        <LeadingIcon size={iconSize} aria-hidden="true" />
      ) : null}
      {children ? <span>{children}</span> : null}
      {!loading && TrailingIcon ? <TrailingIcon size={iconSize} aria-hidden="true" /> : null}
    </button>
  )
})
