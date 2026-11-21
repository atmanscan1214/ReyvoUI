import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  Badge,
  Button,
  EmptyState,
  ErrorPanel,
  PageHeader,
  Skeleton,
  useToast,
} from '../../../components/ui'
import { useSession } from '../../../lib/session'
import { usePageTitle } from '../../../lib/usePageTitle'
import {
  CHANNEL_TYPES,
  DIGEST_CHOICES,
  metaFor,
  notificationsApi,
  preferenceRows,
  timeAgo,
} from '../../../lib/notifications'
import './notifications.css'

const PAGE_SIZE = 20

function FeedItem({ item, onRead }) {
  const meta = metaFor(item.type)
  const Icon = meta.icon
  const unread = !item.read_at

  function handleClick(event) {
    // Only plain left clicks navigate; modified clicks keep default behavior.
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey) return
    if (unread) onRead(item)
  }

  return (
    <li className={`notif-feed__item${unread ? ' is-unread' : ''}`}>
      <span className={`notif-feed__icon notif-feed__icon--${meta.tone}`} aria-hidden="true">
        <Icon size={17} />
      </span>
      <div className="notif-feed__body">
        <div className="notif-feed__title-row">
          <Link
            to={item.link || '/app/notifications'}
            className="notif-feed__title"
            onClick={handleClick}
          >
            {item.title}
          </Link>
          {unread ? (
            <span className="notif-feed__dot" aria-label="Unread" title="Unread" />
          ) : null}
        </div>
        <p className="notif-feed__summary">{item.summary}</p>
        <div className="notif-feed__meta">
          <Badge tone="outline">{meta.label}</Badge>
          <time dateTime={item.created_at}>{timeAgo(item.created_at)}</time>
          {item.email_status ? (
            <span className="notif-feed__email">
              Email: {item.email_status.replace('_', ' ')}
            </span>
          ) : null}
        </div>
      </div>
      {unread ? (
        <Button
          variant="quiet"
          size="sm"
          onClick={() => onRead(item)}
          aria-label={`Mark "${item.title}" as read`}
        >
          Mark read
        </Button>
      ) : null}
    </li>
  )
}

/**
 * Preferences matrix shared by the per-user section and the tenant-defaults
 * section: one row per configurable type with in-app and email checkboxes.
 */
function ChannelMatrix({ rows, disabled, onToggle, idPrefix, caption }) {
  return (
    <div className="notif-prefs__matrix-wrap">
      <table className="notif-prefs__matrix">
        <caption className="visually-hidden">{caption}</caption>
        <thead>
          <tr>
            <th scope="col">Notification</th>
            <th scope="col">In-app</th>
            <th scope="col">Email</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const Icon = row.icon
            return (
              <tr key={row.type} className={row.overridden ? 'is-overridden' : ''}>
                <th scope="row">
                  <span className="notif-prefs__type">
                    <Icon size={15} aria-hidden="true" />
                    <span>
                      <strong>{row.label}</strong>
                      <small>{row.description}</small>
                    </span>
                  </span>
                </th>
                <td>
                  <input
                    id={`${idPrefix}-inapp-${row.type}`}
                    type="checkbox"
                    checked={row.inApp}
                    disabled={disabled}
                    onChange={() => onToggle(row.type, 'in_app', !row.inApp)}
                    aria-label={`${row.label} in-app notifications`}
                  />
                </td>
                <td>
                  <input
                    id={`${idPrefix}-email-${row.type}`}
                    type="checkbox"
                    checked={row.email}
                    disabled={disabled}
                    onChange={() => onToggle(row.type, 'email', !row.email)}
                    aria-label={`${row.label} email notifications`}
                  />
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

export function NotificationsPage() {
  usePageTitle('Notifications')
  const { role } = useSession()
  const { toast } = useToast()
  const navigate = useNavigate()

  const [feedFilter, setFeedFilter] = useState('all')
  const [items, setItems] = useState([])
  const [total, setTotal] = useState(0)
  const [feedState, setFeedState] = useState('loading')
  const [feedError, setFeedError] = useState(null)
  const [loadingMore, setLoadingMore] = useState(false)

  const [prefs, setPrefs] = useState(null)
  const [prefsState, setPrefsState] = useState('loading')
  const [prefsError, setPrefsError] = useState(null)
  const [savingPrefs, setSavingPrefs] = useState(false)

  const [defaults, setDefaults] = useState(null)
  const [defaultsState, setDefaultsState] = useState('idle')
  const [defaultsError, setDefaultsError] = useState(null)
  const [savingDefaults, setSavingDefaults] = useState(false)

  const canManageDefaults = role === 'owner' || role === 'admin'
  const prefsTimer = useRef(null)

  const unreadFilter = feedFilter === 'unread' ? true : undefined

  const loadFeed = useCallback(
    async ({ append = false } = {}) => {
      if (append) setLoadingMore(true)
      else setFeedState('loading')
      setFeedError(null)
      try {
        const page = await notificationsApi.list({
          unread: unreadFilter,
          limit: PAGE_SIZE,
          offset: append ? items.length : 0,
        })
        if (!Array.isArray(page?.items)) {
          throw new Error('The notifications endpoint returned an unexpected response.')
        }
        setItems((current) => (append ? [...current, ...page.items] : page.items))
        setTotal(page.total ?? page.items.length)
        setFeedState('ready')
      } catch (error) {
        if (!append) setFeedError(error)
        setFeedState('error')
      } finally {
        if (append) setLoadingMore(false)
      }
    },
    [unreadFilter, items.length],
  )

  const loadPreferences = useCallback(async () => {
    setPrefsState('loading')
    setPrefsError(null)
    try {
      const data = await notificationsApi.getPreferences()
      if (!data?.effective || !Array.isArray(Object.keys(data.tenant_defaults || {}))) {
        throw new Error('The preferences endpoint returned an unexpected response.')
      }
      setPrefs(data)
      setPrefsState('ready')
    } catch (error) {
      setPrefsError(error)
      setPrefsState('error')
    }
  }, [])

  const loadDefaults = useCallback(async () => {
    setDefaultsState('loading')
    setDefaultsError(null)
    try {
      const data = await notificationsApi.getDefaults()
      if (!data?.channels) {
        throw new Error('The defaults endpoint returned an unexpected response.')
      }
      setDefaults(data)
      setDefaultsState('ready')
    } catch (error) {
      setDefaultsState('error')
      setDefaultsError(error)
    }
  }, [])

  useEffect(() => {
    loadFeed()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [feedFilter])

  useEffect(() => {
    loadPreferences()
  }, [loadPreferences])

  useEffect(() => {
    if (canManageDefaults) loadDefaults()
  }, [canManageDefaults, loadDefaults])

  useEffect(() => () => window.clearTimeout(prefsTimer.current), [])

  const userRows = useMemo(
    () => (prefs ? preferenceRows(prefs, { isTenant: false }) : []),
    [prefs],
  )
  const defaultRows = useMemo(
    () => (defaults ? preferenceRows({ tenant_defaults: defaults.channels, user_overrides: {} }, { isTenant: true }) : []),
    [defaults],
  )

  async function markRead(item) {
    try {
      const updated = await notificationsApi.markRead(item.id)
      setItems((current) =>
        current.map((row) => (row.id === updated.id ? { ...row, read_at: updated.read_at } : row)),
      )
      navigate(item.link || '/app/notifications')
    } catch (error) {
      toast.error(error?.message || 'The notification could not be marked as read.')
    }
  }

  async function markAllRead() {
    try {
      const result = await notificationsApi.markAllRead()
      setItems((current) =>
        current.map((row) => (row.read_at ? row : { ...row, read_at: new Date().toISOString() })),
      )
      toast.success(
        result?.updated
          ? `${result.updated} notification${result.updated === 1 ? '' : 's'} marked as read.`
          : 'All notifications were already read.',
      )
      loadFeed()
    } catch (error) {
      toast.error(error?.message || 'Notifications could not be marked as read.')
    }
  }

  // Preferences save is debounced so dragging through checkboxes is one save.
  function savePreferences(nextChannels, nextDigest, { immediate = false } = {}) {
    setPrefs((current) => ({
      ...current,
      effective: nextChannels,
      digest: nextDigest,
    }))
    window.clearTimeout(prefsTimer.current)
    const run = async () => {
      setSavingPrefs(true)
      try {
        const saved = await notificationsApi.savePreferences({
          channels: nextChannels,
          digest: nextDigest,
        })
        setPrefs(saved)
        toast.success('Notification preferences saved.')
      } catch (error) {
        toast.error(error?.message || 'Notification preferences could not be saved.')
        loadPreferences()
      } finally {
        setSavingPrefs(false)
      }
    }
    if (immediate) run()
    else prefsTimer.current = window.setTimeout(run, 600)
  }

  function toggleUserChannel(type, channel, value) {
    if (!prefs) return
    const nextChannels = {
      ...prefs.effective,
      [type]: { ...prefs.effective[type], [channel]: value },
    }
    savePreferences(nextChannels, prefs.digest)
  }

  function setDigest(value) {
    if (!prefs) return
    // Digest choice changes are not debounced — it's a single deliberate pick.
    savePreferences(prefs.effective, value, { immediate: true })
  }

  async function toggleDefaultChannel(type, channel, value) {
    if (!defaults || savingDefaults) return
    const nextChannels = {
      ...defaults.channels,
      [type]: { ...defaults.channels[type], [channel]: value },
    }
    setDefaults({ channels: nextChannels })
    setSavingDefaults(true)
    try {
      const saved = await notificationsApi.saveDefaults({ channels: nextChannels })
      setDefaults(saved)
      toast.success('Workspace notification defaults saved.')
    } catch (error) {
      toast.error(error?.message || 'Workspace defaults could not be saved.')
      loadDefaults()
    } finally {
      setSavingDefaults(false)
    }
  }

  const unreadCount = items.filter((item) => !item.read_at).length
  const hasMore = items.length < total

  return (
    <div className="app-page notif-page">
      <PageHeader
        eyebrow="Workspace"
        title="Notifications"
        description="Alerts for the events that need a human, plus your delivery preferences."
        meta={
          unreadCount > 0 ? (
            <Badge tone="warning">{unreadCount} unread</Badge>
          ) : (
            <Badge tone="outline">All caught up</Badge>
          )
        }
        actions={
          <Button
            variant="ghost"
            size="sm"
            disabled={unreadCount === 0}
            onClick={markAllRead}
          >
            Mark all as read
          </Button>
        }
      />

      <section className="app-card notif-feed" aria-labelledby="notif-feed-title">
        <div className="notif-feed__head">
          <div>
            <p className="eyebrow">Feed</p>
            <h2 id="notif-feed-title">Recent notifications</h2>
          </div>
          <div className="notif-feed__filters" role="group" aria-label="Filter notifications">
            {[
              { id: 'all', label: 'All' },
              { id: 'unread', label: 'Unread' },
            ].map((filter) => (
              <button
                key={filter.id}
                type="button"
                className={`notif-feed__chip${feedFilter === filter.id ? ' is-active' : ''}`}
                aria-pressed={feedFilter === filter.id}
                onClick={() => setFeedFilter(filter.id)}
              >
                {filter.label}
              </button>
            ))}
          </div>
        </div>

        {feedState === 'loading' ? (
          <Skeleton lines={6} />
        ) : feedState === 'error' ? (
          <ErrorPanel
            title="Couldn't load notifications"
            description={feedError?.message || 'The notification feed could not be loaded.'}
            requestId={feedError?.requestId}
            onRetry={() => loadFeed()}
          />
        ) : items.length === 0 ? (
          <EmptyState
            title={feedFilter === 'unread' ? 'No unread notifications' : 'No notifications yet'}
            description={
              feedFilter === 'unread'
                ? 'Every notification has been read.'
                : 'Campaign completions, imports, quota warnings, and billing issues land here.'
            }
            compact
          />
        ) : (
          <>
            <ul className="notif-feed__list">
              {items.map((item) => (
                <FeedItem key={item.id} item={item} onRead={markRead} />
              ))}
            </ul>
            {hasMore ? (
              <div className="notif-feed__more">
                <Button
                  variant="quiet"
                  loading={loadingMore}
                  onClick={() => loadFeed({ append: true })}
                >
                  Load more
                </Button>
                <span className="notif-feed__count">
                  {items.length} of {total}
                </span>
              </div>
            ) : null}
          </>
        )}
      </section>

      <section className="app-card notif-prefs" aria-labelledby="notif-prefs-title">
        <div className="notif-prefs__head">
          <div>
            <p className="eyebrow">Preferences</p>
            <h2 id="notif-prefs-title">Your delivery preferences</h2>
            <p>
              These override the workspace defaults per notification type. Changes save
              automatically.
            </p>
          </div>
          <span className="notif-prefs__status" role="status">
            {savingPrefs ? 'Saving…' : prefsState === 'ready' ? 'Saved' : ''}
          </span>
        </div>

        {prefsState === 'loading' ? (
          <Skeleton lines={6} />
        ) : prefsState === 'error' ? (
          <ErrorPanel
            title="Couldn't load your preferences"
            description={prefsError?.message || 'Your notification preferences could not be loaded.'}
            requestId={prefsError?.requestId}
            onRetry={loadPreferences}
          />
        ) : (
          <>
            <ChannelMatrix
              rows={userRows}
              disabled={savingPrefs}
              onToggle={toggleUserChannel}
              idPrefix="notif-user"
              caption="Your in-app and email channels per notification type"
            />

            <div className="notif-prefs__digest">
              <div>
                <h3>Email digest</h3>
                <p>
                  A summary of unread notifications, delivered by email. Weekly digests run on
                  Mondays. The digest lists notification titles and links only.
                </p>
              </div>
              <div className="notif-prefs__digest-options" role="group" aria-label="Digest cadence">
                {DIGEST_CHOICES.map((choice) => (
                  <button
                    key={choice.value}
                    type="button"
                    className={`notif-feed__chip${prefs.digest === choice.value ? ' is-active' : ''}`}
                    aria-pressed={prefs.digest === choice.value}
                    disabled={savingPrefs}
                    onClick={() => setDigest(choice.value)}
                  >
                    {choice.label}
                  </button>
                ))}
              </div>
            </div>
          </>
        )}
      </section>

      {canManageDefaults ? (
        <section className="app-card notif-prefs" aria-labelledby="notif-defaults-title">
          <div className="notif-prefs__head">
            <div>
              <p className="eyebrow">Workspace</p>
              <h2 id="notif-defaults-title">Workspace defaults</h2>
              <p>
                New members start with these channels for every type. Individual overrides
                layer on top.
              </p>
            </div>
            <span className="notif-prefs__status" role="status">
              {savingDefaults ? 'Saving…' : defaultsState === 'ready' ? 'Saved' : ''}
            </span>
          </div>

          {defaultsState === 'loading' ? (
            <Skeleton lines={6} />
          ) : defaultsState === 'error' ? (
            <ErrorPanel
              title="Couldn't load workspace defaults"
              description={defaultsError?.message || 'The workspace notification defaults could not be loaded.'}
              requestId={defaultsError?.requestId}
              onRetry={loadDefaults}
            />
          ) : (
            <ChannelMatrix
              rows={defaultRows}
              disabled={savingDefaults}
              onToggle={toggleDefaultChannel}
              idPrefix="notif-default"
              caption="Workspace default channels per notification type"
            />
          )}
        </section>
      ) : (
        <p className="notif-page__notice" role="status">
          Only workspace owners and admins can edit the workspace notification defaults.
        </p>
      )}
    </div>
  )
}
