import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { createPortal } from 'react-dom'
import {
  AlertCircle,
  AlertTriangle,
  CheckCircle,
  Close,
  Info,
} from '../icons'

const ToastContext = createContext(null)

const ICONS = {
  success: CheckCircle,
  error: AlertCircle,
  warning: AlertTriangle,
  info: Info,
}

const TITLES = {
  success: 'Success',
  error: 'Something went wrong',
  warning: 'Heads up',
  info: 'Note',
}

let nextToastId = 0

/**
 * App-wide toast queue. Toasts stack bottom-right, announce through status or
 * alert roles, auto-dismiss, and can be closed by hand. Wrap the routed app
 * once and call `useToast()` anywhere below it.
 */
export function ToastProvider({ children, max = 3 }) {
  const [toasts, setToasts] = useState([])
  const timers = useRef(new Map())

  const dismiss = useCallback((id) => {
    const timer = timers.current.get(id)
    if (timer) {
      window.clearTimeout(timer)
      timers.current.delete(id)
    }
    setToasts((current) => current.filter((item) => item.id !== id))
  }, [])

  const show = useCallback(
    (message, options = {}) => {
      const tone = options.tone || 'info'
      const id = `toast-${(nextToastId += 1)}`
      const duration = options.duration ?? (tone === 'error' ? 8000 : 5000)

      setToasts((current) => [
        ...current.slice(-(Math.max(1, max) - 1)),
        { id, message, tone, title: options.title },
      ])

      if (duration > 0) {
        timers.current.set(
          id,
          window.setTimeout(() => dismiss(id), duration),
        )
      }

      return id
    },
    [dismiss, max],
  )

  const toast = useMemo(() => {
    const api = (message, options) => show(message, options)
    api.success = (message, options) => show(message, { ...options, tone: 'success' })
    api.error = (message, options) => show(message, { ...options, tone: 'error' })
    api.warning = (message, options) => show(message, { ...options, tone: 'warning' })
    api.info = (message, options) => show(message, { ...options, tone: 'info' })
    return api
  }, [show])

  useEffect(
    () => () => {
      for (const timer of timers.current.values()) window.clearTimeout(timer)
      timers.current.clear()
    },
    [],
  )

  const value = useMemo(() => ({ toast, dismiss }), [toast, dismiss])

  return (
    <ToastContext.Provider value={value}>
      {children}
      {createPortal(
        <div className="ui-toasts" role="region" aria-label="Notifications">
          {toasts.map((item) => {
            const Icon = ICONS[item.tone] || Info
            return (
              <div
                key={item.id}
                className={`ui-toast ui-toast--${item.tone}`}
                role={item.tone === 'error' ? 'alert' : 'status'}
              >
                <span className="ui-toast__icon" aria-hidden="true">
                  <Icon size={18} />
                </span>
                <div className="ui-toast__copy">
                  <p className="ui-toast__title">{item.title || TITLES[item.tone]}</p>
                  {item.message ? <p className="ui-toast__message">{item.message}</p> : null}
                </div>
                <button
                  type="button"
                  className="ui-toast__close"
                  onClick={() => dismiss(item.id)}
                  aria-label="Dismiss notification"
                >
                  <Close size={14} />
                </button>
              </div>
            )
          })}
        </div>,
        document.body,
      )}
    </ToastContext.Provider>
  )
}

export function useToast() {
  const context = useContext(ToastContext)
  if (!context) throw new Error('useToast must be used inside a ToastProvider')
  return context
}
