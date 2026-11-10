import { useId } from 'react'
import { createPortal } from 'react-dom'
import { Close } from '../icons'
import { useDialogFocus } from './useDialog'

/**
 * Centered dialog with focus trap, scroll lock, Escape/backdrop dismissal, and
 * an optional footer. Render it conditionally when open, or pass `open`.
 */
export function Modal({
  open = true,
  title,
  description,
  label,
  children,
  footer,
  onClose,
  size = 'md',
  closeOnBackdrop = true,
  initialFocusRef,
  className = '',
}) {
  const titleId = useId()
  const descriptionId = useId()
  const panelRef = useDialogFocus(open, { onClose, initialFocusRef })

  if (!open) return null

  const classes = ['ui-modal', `ui-modal--${size}`, className].filter(Boolean).join(' ')

  return createPortal(
    <div
      className="ui-overlay"
      onMouseDown={(event) => {
        if (closeOnBackdrop && event.target === event.currentTarget) onClose?.()
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? titleId : undefined}
        aria-describedby={description ? descriptionId : undefined}
        aria-label={!title ? label || 'Dialog' : undefined}
        className={classes}
        tabIndex={-1}
      >
        <header className="ui-dialog__head">
          <div className="ui-dialog__heading">
            {title ? <h2 id={titleId}>{title}</h2> : null}
            {description ? <p id={descriptionId}>{description}</p> : null}
          </div>
          <button
            type="button"
            className="ui-dialog__close"
            onClick={onClose}
            aria-label="Close dialog"
          >
            <Close size={18} />
          </button>
        </header>

        <div className="ui-dialog__body">{children}</div>

        {footer ? <footer className="ui-dialog__footer">{footer}</footer> : null}
      </div>
    </div>,
    document.body,
  )
}
