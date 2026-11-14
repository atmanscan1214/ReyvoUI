import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  AlertTriangle,
  CheckCircle,
  Clock,
  Mail,
  MailCheck,
  Refresh,
  Shield,
} from '../../../components/icons'
import { TextareaField, TextField } from '../../../components/Field'
import {
  Badge,
  Button,
  EmptyState,
  ErrorPanel,
  Modal,
  PageHeader,
  useToast,
} from '../../../components/ui'
import { useSession } from '../../../lib/session'
import {
  OAUTH_PROVIDERS,
  accountStatusMeta,
  listEmailAccounts,
  startOAuth,
} from '../../../lib/emailAccounts'
import './mailboxes.css'

const POLL_INTERVAL_MS = 2500
const POLL_MAX_MS = 180000

function relativeFromNow(value) {
  if (!value) return null
  const then = new Date(value).getTime()
  if (Number.isNaN(then)) return null
  const minutes = Math.round((Date.now() - then) / 60000)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes} min ago`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours} h ago`
  const days = Math.round(hours / 24)
  if (days < 30) return `${days} d ago`
  return null
}

/**
 * Sending-inbox connections (T18).
 *
 * The API lists mailboxes and drives the OAuth handshake; health states are
 * maintained by the backend worker. This page renders every state with its
 * reconnect prompt, handles the popup-based consent flow (the callback is a
 * backend URL the UI cannot intercept, so completion is detected by polling
 * the list), and maps an unconfigured provider (503) to a clear state. Inbox
 * configuration, test send, and disconnect land with T19.
 */
export function MailboxesPage() {
  const { role, profileStatus } = useSession()
  const { toast } = useToast()

  const roleKnown = profileStatus === 'ready'
  const canWrite = roleKnown && (role === 'owner' || role === 'admin')

  const [accounts, setAccounts] = useState([])
  const [status, setStatus] = useState('loading')
  const [error, setError] = useState(null)
  const [refreshKey, setRefreshKey] = useState(0)

  const [connectOpen, setConnectOpen] = useState(false)
  const [presetProvider, setPresetProvider] = useState(null)

  const refresh = useCallback(() => setRefreshKey((key) => key + 1), [])

  function openConnect(provider = null) {
    setPresetProvider(provider)
    setConnectOpen(true)
  }

  useEffect(() => {
    const controller = new AbortController()
    setStatus('loading')
    setError(null)

    listEmailAccounts(controller.signal)
      .then((items) => {
        setAccounts(items)
        setStatus('ready')
      })
      .catch((caught) => {
        if (caught?.name === 'AbortError') return
        setError(caught)
        setStatus('error')
      })

    return () => controller.abort()
  }, [refreshKey])

  const { connectedCount, attentionCount } = useMemo(() => {
    let connected = 0
    let attention = 0
    for (const account of accounts) {
      if (account.status === 'connected') connected += 1
      else if (account.status !== 'disconnected') attention += 1
    }
    return { connectedCount: connected, attentionCount: attention }
  }, [accounts])

  return (
    <div className="app-page mail-page">
      <PageHeader
        eyebrow="Sending · Mailboxes"
        title="Mailboxes"
        description="Connect the agency’s own Google or Microsoft inboxes. Reyvo sends campaigns only from mailboxes you own and monitors their health every 15 minutes."
        meta={
          <>
            <Badge tone="success" dot>
              {`${connectedCount} connected`}
            </Badge>
            {attentionCount > 0 ? (
              <Badge tone="danger" dot>
                {`${attentionCount} need${attentionCount === 1 ? 's' : ''} attention`}
              </Badge>
            ) : null}
            {roleKnown && !canWrite ? <Badge tone="outline">Read-only</Badge> : null}
          </>
        }
        actions={
          canWrite ? (
            <Button
              variant="primary"
              leadingIcon={Mail}
              onClick={() => openConnect(null)}
            >
              Connect mailbox
            </Button>
          ) : null
        }
      />

      <p className="mail__policy app-card">
        <Shield size={16} aria-hidden="true" />
        <span>
          Health states: <strong>connected</strong> is ready to send, <strong>degraded</strong> passed
          with warnings, <strong>needs reauth</strong> and <strong>error</strong> pause campaigns that
          use the inbox until an owner reconnects it, and <strong>disconnected</strong> has no active
          token. Tokens are encrypted at rest and never leave the server.
        </span>
      </p>

      {roleKnown && !canWrite ? (
        <p className="mail__read-only">
          <Shield size={15} aria-hidden="true" />
          Your role can view mailbox health but not connect or reconnect mailboxes. Ask an owner or
          admin.
        </p>
      ) : null}

      {status === 'error' ? (
        <ErrorPanel
          title="Couldn’t load the connected mailboxes"
          description={error?.message || undefined}
          requestId={error?.requestId}
          onRetry={refresh}
        />
      ) : accounts.length === 0 && status === 'ready' ? (
        <EmptyState
          icon={MailCheck}
          title="No mailboxes connected yet"
          description="Connect a Google or Microsoft inbox to start sending. Reyvo uses OAuth, so no mailbox passwords are ever collected."
          actions={
            canWrite ? (
              <Button variant="primary" leadingIcon={Mail} onClick={() => openConnect(null)}>
                Connect mailbox
              </Button>
            ) : undefined
          }
        />
      ) : (
        <div className="mail__grid">
          {accounts.map((account) => (
            <AccountCard
              key={account.id}
              account={account}
              canWrite={canWrite}
              onReconnect={canWrite ? () => openConnect(account.provider) : undefined}
            />
          ))}
        </div>
      )}

      {canWrite ? (
        <ConnectMailboxModal
          open={connectOpen}
          presetProvider={presetProvider}
          existingIds={accounts.map((account) => account.id)}
          onClose={() => {
            setConnectOpen(false)
            setPresetProvider(null)
          }}
          onConnected={(account) => {
            toast.success(`${account.email} is connected and ready to send.`)
            setConnectOpen(false)
            setPresetProvider(null)
            refresh()
          }}
          onCancelled={(message) => {
            setConnectOpen(false)
            setPresetProvider(null)
            toast.info(message)
            refresh()
          }}
        />
      ) : null}
    </div>
  )
}

function AccountCard({ account, canWrite, onReconnect }) {
  const meta = accountStatusMeta(account.status)
  const checked = relativeFromNow(account.lastHealthCheckAt)
  const warmupDate = account.warmupStartedAt
    ? new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(
        new Date(account.warmupStartedAt),
      )
    : null

  return (
    <article className={`mail__card app-card mail__card--${account.status}`}>
      <header className="mail__card-head">
        <span className="mail__provider" title={meta.description ?? undefined}>
          <Mail size={15} aria-hidden="true" />
          {account.provider === 'microsoft' ? 'Microsoft 365' : 'Google'}
        </span>
        <Badge tone={meta.tone} dot>
          {meta.label}
        </Badge>
      </header>

      <p className="mail__email">{account.email}</p>
      {account.fromName ? <p className="mail__from-name">From name: {account.fromName}</p> : null}

      <p className="mail__check">
        <Clock size={13} aria-hidden="true" />
        {checked ? `Health checked ${checked}` : 'No health check recorded yet'}
      </p>

      {account.lastError ? (
        <p className="mail__error" role="status">
          <AlertTriangle size={14} aria-hidden="true" />
          {account.lastError}
        </p>
      ) : null}

      <p className="mail__caps">
        Daily cap {account.dailyCap.toLocaleString()} · Hourly cap{' '}
        {account.hourlyCap.toLocaleString()} · Warm-up stage {account.rampStage}
        {warmupDate ? ` (started ${warmupDate})` : ''}
      </p>

      {canWrite && meta.reconnect ? (
        <footer className="mail__card-actions">
          <Button
            variant="outline"
            size="sm"
            leadingIcon={Refresh}
            onClick={() => onReconnect?.()}
          >
            Reconnect {account.provider === 'microsoft' ? 'Microsoft' : 'Google'} inbox
          </Button>
        </footer>
      ) : null}
    </article>
  )
}

/**
 * Provider chooser + popup consent flow. Completion is detected by polling the
 * accounts list, because the OAuth callback lands on a backend URL that the
 * UI cannot intercept. A user-closed popup without a new account is treated
 * as "not completed", and a 503 start response means the provider OAuth app
 * is not configured on this API build.
 */
function ConnectMailboxModal({ open, presetProvider = null, existingIds, onClose, onConnected, onCancelled }) {
  const [phase, setPhase] = useState('idle') // idle | starting | waiting
  const [waitingProvider, setWaitingProvider] = useState(null)
  const [error, setError] = useState(null)
  const popupRef = useRef(null)
  const pollRef = useRef(null)
  const knownIdsRef = useRef(existingIds)

  useEffect(() => {
    if (!open) return
    setPhase('idle')
    setWaitingProvider(null)
    setError(null)
    knownIdsRef.current = new Set(existingIds)
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current)
      pollRef.current = null
    }
  }, [])

  useEffect(
    () => () => {
      stopPolling()
      if (popupRef.current && !popupRef.current.closed) popupRef.current.close()
    },
    [stopPolling],
  )

  async function connect(provider) {
    setError(null)
    setPhase('starting')
    setWaitingProvider(provider)

    let started
    try {
      started = await startOAuth(provider)
    } catch (caught) {
      setPhase('idle')
      setWaitingProvider(null)
      setError(
        caught?.status === 503 || caught?.status === 400
          ? 'OAuth for this provider is not configured on this API build. Ask the platform administrator to set the provider client credentials.'
          : caught?.message || 'The connection could not be started.',
      )
      return
    }

    // NOTE: no `noopener` in the features string — it makes window.open return
    // null even though the popup opens, which would break the polling loop.
    // `closed` reads are allowed cross-origin, so the handle is safe to keep.
    const popup = window.open(started.authorizationUrl, 'reyvo-oauth', 'width=640,height=760')
    if (!popup) {
      setPhase('idle')
      setWaitingProvider(null)
      setError('The browser blocked the provider window. Allow popups for this site and try again.')
      return
    }
    popupRef.current = popup
    setPhase('waiting')

    const startedAt = Date.now()
    pollRef.current = setInterval(async () => {
      if (Date.now() - startedAt > POLL_MAX_MS) {
        stopPolling()
        setPhase('idle')
        setWaitingProvider(null)
        onCancelled('The connection took too long and was stopped. Please try again.')
        return
      }

      try {
        const items = await listEmailAccounts()
        const fresh = items.find((item) => !knownIdsRef.current.has(item.id))
        if (fresh) {
          stopPolling()
          if (popupRef.current && !popupRef.current.closed) popupRef.current.close()
          popupRef.current = null
          setPhase('idle')
          setWaitingProvider(null)
          onConnected(fresh)
          return
        }
      } catch {
        // Transient list errors during polling are ignored; the next tick retries.
      }

      try {
        if (popup.closed) {
          stopPolling()
          popupRef.current = null
          setPhase('idle')
          setWaitingProvider(null)
          onCancelled(
            'The provider window closed before the connection completed. No mailbox was changed.',
          )
        }
      } catch {
        // Cross-origin access to `closed` is always allowed; guard anyway.
      }
    }, POLL_INTERVAL_MS)
  }

  function cancelWaiting() {
    stopPolling()
    if (popupRef.current && !popupRef.current.closed) popupRef.current.close()
    popupRef.current = null
    setPhase('idle')
    setWaitingProvider(null)
    onCancelled('Connection cancelled. No mailbox was changed.')
  }

  return (
    <Modal
      open={open}
      title={
        phase === 'waiting'
          ? 'Waiting for the provider'
          : presetProvider
            ? `Reconnect the ${presetProvider === 'microsoft' ? 'Microsoft' : 'Google'} inbox`
            : 'Connect a mailbox'
      }
      description={
        phase === 'waiting'
          ? 'Complete the consent screen in the provider window. This dialog updates automatically once the mailbox is connected.'
          : 'Pick the provider of the mailbox you want to send from. Reyvo connects through OAuth, so mailbox passwords are never collected.'
      }
      size="lg"
      onClose={phase === 'waiting' ? cancelWaiting : onClose}
      footer={
        phase === 'waiting' ? (
          <Button variant="ghost" onClick={cancelWaiting}>
            Cancel connection
          </Button>
        ) : (
          <Button variant="ghost" onClick={onClose}>
            Close
          </Button>
        )
      }
    >
      {phase === 'waiting' ? (
        <div className="mail__waiting">
          <Refresh className="mail__waiting-spinner" size={22} aria-hidden="true" />
          <p>
            Waiting for{' '}
            <strong>{waitingProvider === 'microsoft' ? 'Microsoft' : 'Google'}</strong>… finish the
            consent screen in the popup. If you denied access, close the popup and start again.
          </p>
        </div>
      ) : (
        <div className="mail__providers">
          {OAUTH_PROVIDERS.filter(
            (provider) => !presetProvider || provider.value === presetProvider,
          ).map((provider) => (
            <div className="mail__provider-card" key={provider.value}>
              <div className="mail__provider-copy">
                <strong>{provider.label}</strong>
                {presetProvider ? (
                  <p className="mail__reconnect-note">
                    Reconnect flow: approving access refreshes this inbox’s tokens; campaigns using
                    it stay paused until the connection is healthy again.
                  </p>
                ) : null}
                <p>{provider.blurb}</p>
                <ul className="mail__scopes">
                  {provider.scopes.map((scope) => (
                    <li key={scope}>
                      <CheckCircle size={12} aria-hidden="true" />
                      {scope}
                    </li>
                  ))}
                </ul>
              </div>
              <Button
                variant="primary"
                size="sm"
                leadingIcon={Mail}
                loading={phase === 'starting' && waitingProvider === provider.value}
                disabled={phase === 'starting'}
                onClick={() => connect(provider.value)}
              >
                {provider.buttonLabel}
              </Button>
            </div>
          ))}

          {error ? (
            <p className="mail__error-banner" role="alert">
              <AlertTriangle size={15} aria-hidden="true" />
              {error}
            </p>
          ) : null}

          <p className="mail__modal-hint">
            After you approve access, the provider redirects to the Reyvo API and the inbox appears
            here with health tracking enabled. Denying access changes nothing.
          </p>
        </div>
      )}
    </Modal>
  )
}
