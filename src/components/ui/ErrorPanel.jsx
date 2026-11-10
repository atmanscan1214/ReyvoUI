import { AlertTriangle, Refresh } from '../icons'
import { Button } from './Button'

/**
 * Inline or full-section failure state. Keeps the request id out of the main
 * copy but available for support, and always offers a single retry action.
 */
export function ErrorPanel({
  title = 'Something went wrong',
  description = 'We could not load this just now. Your data is safe — please try again.',
  onRetry,
  retryLabel = 'Try again',
  requestId,
  compact = false,
  className = '',
  children,
}) {
  const classes = ['ui-error', compact ? 'ui-error--compact' : '', className]
    .filter(Boolean)
    .join(' ')

  return (
    <div className={classes} role="alert">
      <span className="ui-error__icon" aria-hidden="true">
        <AlertTriangle size={compact ? 18 : 20} />
      </span>
      <div className="ui-error__copy">
        <p className="ui-error__title">{title}</p>
        <p className="ui-error__description">{description}</p>
        {requestId ? (
          <p className="ui-error__request">
            Request ID <code>{requestId}</code>
          </p>
        ) : null}
        {children}
        {onRetry ? (
          <div className="ui-error__actions">
            <Button
              variant="ghost"
              size="sm"
              leadingIcon={Refresh}
              onClick={onRetry}
            >
              {retryLabel}
            </Button>
          </div>
        ) : null}
      </div>
    </div>
  )
}
