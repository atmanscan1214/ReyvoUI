import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Clock, Inbox, Refresh } from '../../../components/icons'
import { CheckboxField, SelectField, TextField } from '../../../components/Field'
import { Badge, Button, EmptyState, ErrorPanel, PageHeader, Skeleton, Tabs, useToast } from '../../../components/ui'
import {
  categoryMeta,
  fetchReplyContext,
  isUnmatchedReply,
  listReplies,
  REPLY_CATEGORIES,
  sanitizeReplyHtml,
  snippetPreview,
  updateReply,
} from '../../../lib/replies'
import './replies.css'

function formatDateTime(value) {
  if (!value) return 'Unknown date'
  try {
    return new Intl.DateTimeFormat(undefined, {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    }).format(new Date(value))
  } catch {
    return 'Unknown date'
  }
}

/**
 * Unified replies inbox (T32, §5.7.4). Rows come from the live `GET /replies`
 * route: category and review-status filters are server-side, campaign filtering
 * is server-side by id, and contact/campaign/assignee names are mapped from the
 * live contact, campaign, and member lists. `ReplyRead` has no inbox field, no
 * message bodies, and no date filter, so those are named as gaps — nothing is
 * faked. Unmatched replies (no contact or no campaign linkage) are separated.
 */
export function RepliesPage() {
  const [page, setPage] = useState({ items: [], total: 0, limit: 100, offset: 0 })
  const [context, setContext] = useState(null)
  const [status, setStatus] = useState('loading')
  const [error, setError] = useState(null)
  const [refreshing, setRefreshing] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)

  const [view, setView] = useState('list')
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('')
  const [reviewStatus, setReviewStatus] = useState('')
  const [campaignId, setCampaignId] = useState('')
  const [assignee, setAssignee] = useState('')
  const [unmatchedOnly, setUnmatchedOnly] = useState(false)
  const [selectedId, setSelectedId] = useState('')
  const { toast } = useToast()

  const [rowSaving, setRowSaving] = useState(null)
  const [rowError, setRowError] = useState(null)
  const [corrForm, setCorrForm] = useState({ category: 'other', needsReview: false, assignedTo: '' })
  const [corrSaving, setCorrSaving] = useState(false)
  const [corrError, setCorrError] = useState(null)

  const load = useCallback(
    (signal, { append = false } = {}) => {
      if (append) {
        setLoadingMore(true)
      } else {
        setRefreshing(true)
        setError(null)
      }
      const current = append ? page : { items: [], total: 0, offset: 0 }
      const request = listReplies(
        {
          category: category || undefined,
          needsReview: reviewStatus === '' ? undefined : reviewStatus === 'review',
          campaignId: campaignId || undefined,
          limit: 100,
          offset: append ? current.items.length : 0,
        },
        signal,
      )

      const contextRequest = append
        ? Promise.resolve(context)
        : fetchReplyContext(signal).catch((caught) => {
            // Context enrichment is best-effort: the list stays usable if the
            // contact/campaign/member maps fail.
            if (caught?.name === 'AbortError') throw caught
            return { contacts: new Map(), campaigns: new Map(), members: new Map() }
          })

      return Promise.all([request, contextRequest])
        .then(([nextPage, nextContext]) => {
          setPage({
            items: append ? [...page.items, ...nextPage.items] : nextPage.items,
            total: nextPage.total,
            limit: nextPage.limit,
            offset: nextPage.offset,
          })
          setContext(nextContext)
          setStatus('ready')
        })
        .catch((caught) => {
          if (caught?.name === 'AbortError') return
          setError(caught)
          setStatus('error')
        })
        .finally(() => {
          setLoadingMore(false)
          setRefreshing(false)
        })
    },
    [campaignId, category, context, page, reviewStatus],
  )

  useEffect(() => {
    const controller = new AbortController()
    setStatus('loading')
    load(controller.signal)
    return () => controller.abort()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [category, reviewStatus, campaignId])

  const { contacts = new Map(), campaigns = new Map(), members = new Map() } = context ?? {}

  const campaignOptions = useMemo(() => {
    const ids = [...new Set(page.items.map((item) => item.campaignId).filter(Boolean))]
    const known = [...campaigns.entries()]
      .filter(([id]) => ids.includes(id))
      .map(([id, meta]) => ({ id, name: meta.name }))
    for (const id of ids) {
      if (!known.some((option) => option.id === id)) known.push({ id, name: 'Unknown campaign' })
    }
    return known
  }, [campaigns, page.items])

  const assigneeOptions = useMemo(() => {
    const ids = [...new Set(page.items.map((item) => item.assignedTo).filter(Boolean))]
    const known = [...members.entries()]
      .filter(([id]) => ids.includes(id))
      .map(([id, name]) => ({ id, name }))
    for (const id of ids) {
      if (!known.some((option) => option.id === id)) known.push({ id, name: 'Unknown member' })
    }
    return known
  }, [members, page.items])

  const rows = useMemo(() => {
    const query = search.trim().toLowerCase()
    return page.items.filter((item) => {
      const contact = contacts.get(item.contactId ?? '')
      const haystack = [contact?.name, contact?.email, item.snippet]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
      const matchesSearch = !query || haystack.includes(query)
      const matchesAssignee =
        assignee === '' ||
        (assignee === 'unassigned' ? !item.assignedTo : item.assignedTo === assignee)
      const matchesUnmatched = !unmatchedOnly || isUnmatchedReply(item)
      return matchesSearch && matchesAssignee && matchesUnmatched
    })
  }, [assignee, contacts, page.items, search, unmatchedOnly])

  const summary = useMemo(() => {
    const loaded = page.items
    return {
      total: page.total,
      loaded: loaded.length,
      positive: loaded.filter((item) => item.category === 'positive').length,
      needsReview: loaded.filter((item) => item.needsReview).length,
      unmatched: loaded.filter(isUnmatchedReply).length,
      corrections: loaded.filter((item) => item.classifiedBy === 'user').length,
    }
  }, [page])

  const selectedReply = rows.find((item) => item.id === selectedId) ?? rows[0] ?? null

  useEffect(() => {
    if (selectedReply) {
      setCorrForm({
        category: selectedReply.category,
        needsReview: selectedReply.needsReview,
        assignedTo: selectedReply.assignedTo ?? '',
      })
    }
  }, [selectedReply?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  /** Replace one row in place after a live PATCH so counts and badges stay true. */
  function applyReplyUpdate(updated) {
    setPage((prev) => ({
      ...prev,
      items: prev.items.map((item) => (item.id === updated.id ? updated : item)),
    }))
  }

  async function handleApprove(item) {
    setRowError(null)
    setRowSaving(item.id)
    try {
      const updated = await updateReply(item.id, { needsReview: false })
      applyReplyUpdate(updated)
      toast.success('Marked as reviewed — no correction needed.', { title: 'Reply reviewed' })
    } catch (caught) {
      setRowError(caught)
    } finally {
      setRowSaving(null)
    }
  }

  async function handleCorrection(event) {
    event.preventDefault()
    if (!selectedReply) return
    setCorrError(null)
    setCorrSaving(true)
    try {
      const updated = await updateReply(selectedReply.id, {
        category: corrForm.category,
        needsReview: corrForm.needsReview,
        assignedTo: corrForm.assignedTo || null,
      })
      applyReplyUpdate(updated)
      toast.success('Classification saved — the correction is stored on the reply.', {
        title: 'Correction saved',
      })
    } catch (caught) {
      setCorrError(caught)
    } finally {
      setCorrSaving(false)
    }
  }

  function describeRow(item) {
    const contact = contacts.get(item.contactId ?? '')
    const campaign = campaigns.get(item.campaignId ?? '')
    const unmatched = isUnmatchedReply(item)
    return {
      contactName: contact?.name ?? (item.contactId ? 'Unknown contact' : 'No contact linked'),
      contactEmail: contact?.email ?? null,
      campaignName: campaign?.name ?? (item.campaignId ? 'Unknown campaign' : null),
      assigneeName: item.assignedTo
        ? members.get(item.assignedTo) ?? 'Unknown member'
        : null,
      unmatched,
    }
  }

  if (status === 'loading') {
    return (
      <div className="app-page replies-page">
        <PageHeader
          eyebrow="Workspace · Replies"
          title="Unified replies inbox"
          description="Live reply traffic, filtered server-side by category, review state, and campaign."
        />
        <div className="app-card">
          <Skeleton lines={6} />
        </div>
      </div>
    )
  }

  if (status === 'error') {
    return (
      <div className="app-page replies-page">
        <PageHeader
          eyebrow="Workspace · Replies"
          title="Unified replies inbox"
          description="Live reply traffic, filtered server-side by category, review state, and campaign."
        />
        <ErrorPanel
          title="Couldn't load replies"
          description={error?.message || undefined}
          requestId={error?.requestId}
          onRetry={() => load()}
        />
      </div>
    )
  }

  const canLoadMore = page.items.length < page.total

  return (
    <div className="app-page replies-page">
      <PageHeader
        eyebrow="Workspace · Replies"
        title="Unified replies inbox"
        description="Live reply traffic, filtered server-side by category, review state, and campaign."
        actions={
          <Button variant="ghost" leadingIcon={Refresh} loading={refreshing} onClick={() => load()}>
            Refresh
          </Button>
        }
        meta={
          <>
            <Badge tone="neutral" dot>
              {summary.total} total
            </Badge>
            <Badge tone="warning" dot>
              {summary.needsReview} need review
            </Badge>
            <Badge tone="success" dot>
              {summary.positive} positive
            </Badge>
          </>
        }
      />

      <div className="replies-page__summary">
        <div className="app-card replies-page__stat">
          <span>Total replies</span>
          <strong>{summary.total}</strong>
        </div>
        <div className="app-card replies-page__stat replies-page__stat--warn">
          <span>Needs review</span>
          <strong>{summary.needsReview}</strong>
        </div>
        <div className="app-card replies-page__stat replies-page__stat--good">
          <span>Positive</span>
          <strong>{summary.positive}</strong>
        </div>
        <div className="app-card replies-page__stat replies-page__stat--muted">
          <span>Unmatched</span>
          <strong>{summary.unmatched}</strong>
        </div>
        <div className="app-card replies-page__stat replies-page__stat--muted">
          <span>Corrections</span>
          <strong>{summary.corrections}</strong>
        </div>
      </div>

      <section className="app-card replies-page__filters" aria-label="Replies filters">
        <div className="replies-page__filters-grid">
          <TextField
            id="reply-search"
            label="Search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Contact, email, snippet"
          />
          <SelectField
            id="reply-campaign"
            label="Campaign"
            value={campaignId}
            onChange={(event) => setCampaignId(event.target.value)}
          >
            <option value="">All campaigns</option>
            {campaignOptions.map((option) => (
              <option key={option.id} value={option.id}>
                {option.name}
              </option>
            ))}
          </SelectField>
          <SelectField
            id="reply-category"
            label="Category"
            value={category}
            onChange={(event) => setCategory(event.target.value)}
          >
            <option value="">All categories</option>
            {Object.keys(REPLY_CATEGORIES).map((value) => (
              <option key={value} value={value}>
                {categoryMeta(value).label}
              </option>
            ))}
          </SelectField>
          <SelectField
            id="reply-status"
            label="Review state"
            value={reviewStatus}
            onChange={(event) => setReviewStatus(event.target.value)}
          >
            <option value="">All</option>
            <option value="review">Needs review</option>
            <option value="handled">No review needed</option>
          </SelectField>
          <SelectField
            id="reply-assignee"
            label="Assignee"
            value={assignee}
            onChange={(event) => setAssignee(event.target.value)}
          >
            <option value="">All assignees</option>
            {assigneeOptions.map((option) => (
              <option key={option.id} value={option.id}>
                {option.name}
              </option>
            ))}
            <option value="unassigned">Unassigned</option>
          </SelectField>
          <label className="replies-page__toggle" htmlFor="reply-unmatched">
            <input
              id="reply-unmatched"
              type="checkbox"
              checked={unmatchedOnly}
              onChange={(event) => setUnmatchedOnly(event.target.checked)}
            />
            <span>Unmatched only</span>
          </label>
        </div>
      </section>

      {summary.loaded < summary.total ? (
        <p className="replies-page__page-note">
          Showing the first {summary.loaded} of {summary.total} replies (page size 100); counts in
          the cards above cover the loaded rows.
        </p>
      ) : null}

      <Tabs
        value={view}
        onChange={setView}
        className="replies-page__tabs"
        items={[
          {
            id: 'list',
            label: 'List view',
            count: rows.length,
            content: (
              <div className="replies-page__list-view">
                {rows.length === 0 ? (
                  page.items.length === 0 && summary.total === 0 ? (
                    <EmptyState
                      title="No replies yet"
                      description="Replies appear here as inbound email is classified. There is nothing in this workspace yet."
                    />
                  ) : (
                    <div className="replies-page__empty">No replies match the current filters.</div>
                  )
                ) : (
                  rows.map((item) => {
                    const meta = categoryMeta(item.category)
                    const described = describeRow(item)
                    const selected = selectedReply?.id === item.id

                    return (
                      <div
                        key={item.id}
                        className={`replies-page__row-card ${selected ? 'is-selected' : ''}`}
                      >
                        <button
                          type="button"
                          className="replies-page__row"
                          onClick={() => {
                            setSelectedId(item.id)
                            setView('reader')
                          }}
                        >
                          <div className="replies-page__row-meta">
                            <div className="replies-page__person">
                              <strong>{described.contactName}</strong>
                              <span>{described.contactEmail ?? 'no contact linked'}</span>
                            </div>
                            <div className="replies-page__badges">
                              <Badge tone={meta.tone}>{meta.label}</Badge>
                              {item.needsReview ? (
                                <Badge tone="warning">Needs review</Badge>
                              ) : null}
                              {described.unmatched ? (
                                <Badge tone="neutral">Unmatched</Badge>
                              ) : null}
                            </div>
                          </div>

                          <div className="replies-page__row-copy">
                            <p>{snippetPreview(item.snippet) || 'No snippet available'}</p>
                            <small>
                              {described.campaignName ?? 'No campaign linked'} · classified by{' '}
                              {item.classifiedBy}
                            </small>
                          </div>

                          <div className="replies-page__row-footer">
                            <span>
                              <Clock size={13} />
                              {formatDateTime(item.receivedAt ?? item.createdAt)}
                            </span>
                            <span>
                              <Inbox size={13} />
                              {item.assignedTo ? described.assigneeName : 'Unassigned'}
                            </span>
                            <span>
                              Confidence{' '}
                              {item.confidence == null
                                ? 'n/a'
                                : `${Math.round(item.confidence * 100)}%`}
                            </span>
                          </div>
                        </button>
                        <Link to={`/app/replies/${item.id}`} className="replies-page__open-link">
                          Open thread
                        </Link>
                        {item.needsReview ? (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="replies-page__quick-approve"
                            loading={rowSaving === item.id}
                            onClick={() => handleApprove(item)}
                          >
                            Approve
                          </Button>
                        ) : null}
                      </div>
                    )
                  })
                )}
                {canLoadMore ? (
                  <div className="replies-page__load-more">
                    <Button
                      variant="ghost"
                      loading={loadingMore}
                      onClick={() => load(null, { append: true })}
                    >
                      Load {Math.min(100, page.total - page.items.length)} more
                    </Button>
                  </div>
                ) : null}
              </div>
            ),
          },
          {
            id: 'reader',
            label: 'Reader',
            content: (
              <div className="replies-page__thread-view">
                {selectedReply ? (
                  <div className="replies-page__reader-grid">
                    <aside className="replies-page__thread-panel">
                      <div className="replies-page__thread-header">
                        <div>
                          <p className="eyebrow">Reply</p>
                          <h3>{describeRow(selectedReply).contactName}</h3>
                          <small>{describeRow(selectedReply).contactEmail ?? 'no contact linked'}</small>
                        </div>
                        <Badge tone={categoryMeta(selectedReply.category).tone}>
                          {categoryMeta(selectedReply.category).label}
                        </Badge>
                      </div>

                      <dl className="replies-page__detail-list">
                        <div>
                          <dt>Campaign</dt>
                          <dd>{describeRow(selectedReply).campaignName ?? 'No campaign linked'}</dd>
                        </div>
                        <div>
                          <dt>Confidence</dt>
                          <dd>
                            {selectedReply.confidence == null
                              ? 'n/a'
                              : `${Math.round(selectedReply.confidence * 100)}%`}
                          </dd>
                        </div>
                        <div>
                          <dt>Classified by</dt>
                          <dd>{selectedReply.classifiedBy}</dd>
                        </div>
                        <div>
                          <dt>Received</dt>
                          <dd>{formatDateTime(selectedReply.receivedAt ?? selectedReply.createdAt)}</dd>
                        </div>
                      </dl>

                      <form className="replies-page__quick-form" onSubmit={handleCorrection}>
                        <p className="eyebrow">Correct classification</p>
                        <SelectField
                          id="reply-reader-category"
                          label="Category"
                          value={corrForm.category}
                          onChange={(event) =>
                            setCorrForm((form) => ({ ...form, category: event.target.value }))
                          }
                        >
                          {Object.keys(REPLY_CATEGORIES).map((value) => (
                            <option key={value} value={value}>
                              {categoryMeta(value).label}
                            </option>
                          ))}
                        </SelectField>
                        <SelectField
                          id="reply-reader-assignee"
                          label="Assignee"
                          value={corrForm.assignedTo}
                          onChange={(event) =>
                            setCorrForm((form) => ({ ...form, assignedTo: event.target.value }))
                          }
                        >
                          <option value="">Unassigned</option>
                          {[...members.entries()].map(([id, name]) => (
                            <option key={id} value={id}>
                              {name}
                            </option>
                          ))}
                        </SelectField>
                        <CheckboxField
                          id="reply-reader-review"
                          checked={corrForm.needsReview}
                          onChange={(event) =>
                            setCorrForm((form) => ({ ...form, needsReview: event.target.checked }))
                          }
                        >
                          Needs review
                        </CheckboxField>
                        {corrError ? (
                          <p className="replies-page__error" role="alert">
                            {corrError.message || 'Saving the correction failed.'}
                          </p>
                        ) : null}
                        <Button type="submit" size="sm" loading={corrSaving}>
                          Save correction
                        </Button>
                      </form>

                      <Link
                        to={`/app/replies/${selectedReply.id}`}
                        className="btn btn--ghost btn--sm"
                      >
                        Open full reply
                      </Link>
                    </aside>

                    <div className="replies-page__reader-message">
                      <div className="replies-page__message-head">
                        <strong>Snippet</strong>
                        <span>Inbound</span>
                      </div>
                      <div
                        className="replies-page__message-copy"
                        dangerouslySetInnerHTML={{ __html: sanitizeReplyHtml(selectedReply.snippet) }}
                      />
                      <p className="replies-page__gap-note">
                        This API build returns a snippet only — message bodies and thread history
                        are not exposed yet, so the reader shows the classified excerpt. Full
                        conversation actions (note, task, suppress) live on the reply detail page;
                        stop-sequence and "open in provider" are not available (the message id is
                        internal).
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="replies-page__empty">No reply selected.</div>
                )}
              </div>
            ),
          },
        ]}
      />
    </div>
  )
}
