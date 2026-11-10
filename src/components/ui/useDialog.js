import { useEffect, useRef } from 'react'

const FOCUSABLE = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',')

/**
 * Shared focus and scroll behaviour for dialogs and drawers.
 *
 * Locks the page behind the panel, moves focus into it, traps Tab, closes on
 * Escape, and restores the trigger's focus on unmount. `onClose` is kept in a
 * ref so an inline callback does not re-run the effect on every render.
 */
export function useDialogFocus(open, { onClose, initialFocusRef } = {}) {
  const panelRef = useRef(null)
  const onCloseRef = useRef(onClose)

  onCloseRef.current = onClose

  useEffect(() => {
    if (!open) return undefined

    const panel = panelRef.current
    if (!panel) return undefined

    const previousFocus = document.activeElement
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    const focusTarget =
      initialFocusRef?.current || panel.querySelector(FOCUSABLE) || panel
    focusTarget?.focus()

    function handleKeyDown(event) {
      if (event.key === 'Escape') {
        event.stopPropagation()
        onCloseRef.current?.()
        return
      }

      if (event.key !== 'Tab') return

      const focusable = [...panel.querySelectorAll(FOCUSABLE)]
      if (focusable.length === 0) {
        event.preventDefault()
        panel.focus()
        return
      }

      const first = focusable[0]
      const last = focusable[focusable.length - 1]

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', handleKeyDown)

    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      document.body.style.overflow = previousOverflow
      if (previousFocus instanceof HTMLElement && document.contains(previousFocus)) {
        previousFocus.focus()
      }
    }
  }, [open, initialFocusRef])

  return panelRef
}
