import { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { CheckboxField, SelectField, TextareaField, TextField } from '../../../components/Field'
import { Badge, Button, ErrorPanel, PageHeader, Skeleton, useToast } from '../../../components/ui'
import { appendContactNote } from '../../../lib/contacts'
import {
  categoryMeta,
  fetchReplyContext,
  findReplyById,
  REPLY_CATEGORIES,
  sanitizeReplyHtml,
  updateReply,
} from '../../../lib/replies'
import { SUPPRESSION_REASONS, addSuppression, listSuppressions } from '../../../lib/suppressions'
import { TASK_PRIORITIES, createTask } from '../../../lib/tasks'
import './replies.css'

function formatDateTime(value) {
  if (!value) return 'Unknown date'
  try {
    return new Intl.DateTimeFormat(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    }).format(new Date(value))
  } catch {
    return 'Unknown date'
  }
}

function toDatetimeLocal(value) {
  if (!value) return ''
  try {
    const date = new Date(value)
    const pad = (part) => String(part).padStart(2, '0')
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(
      date.getHours(),
    )}:${pad(date.getMinutes())}`
  } catch {
    return ''
  }
}

/**
 * Reply conversation view and actions (T33, §5.7.4).
 *
 * Live API reality, named rather than faked:
 * - There is no `GET /replies/{id}`; the reply is located by walking list pages
 *   (`findReplyById`, capped 5 pages).
 * - `ReplyRead` exposes a snippet only — no message bodies or thread history,
 *   so the conversation shows the classified excerpt, not a full thread.
 * - Actions write through to the API: `PATCH /replies/{id}` reclassifies /
 *   flags for review / reassigns, a contact note appends through
 *   `PATCH /contacts/{id}` (there is no notes sub-resource), a follow-up task
 *   is created via `POST /tasks`, and suppression goes through
 *   `POST /suppressions`.
 * - Stop-sequence and "open in provider" are not buildable: `message_id` is an
 *   internal UUID, not a provider message id, and there is no send-control
 *   endpoint for per-reply stops.
 */
export function ReplyDetailPage() {
  const { replyId } = useParams()
  const { toast } = useToast()

  const [reply, setReply] = useState(null)
  const [context, setContext] = useState(null)
  const [suppressedEmail, setSuppressedEmail] = useState(null)
  const [status, setStatus] = useState('loading')
  const [error, setError] = useState(null)

  const [clsForm, setClsForm] = useState({ category: 'other', needsReview: false, assignedTo: '' })
  const [clsSaving, setClsSaving] = useState(false)
  const [clsError, setClsError] = useState(null)

  const [noteText, setNoteText] = useState('')
  const [noteSaving, setNoteSaving] = useState(false)
  const [noteError, setNoteError] = useState(null)

  const [taskForm, setTaskForm] = useState({ title: '', dueAt: '', priority: 'normal', assigneeId: '' })
  const [taskSaving, setTaskSaving] = useState(false)
  const [taskError, setTaskError] = useState(null)

  const [suppressForm, setSuppressForm] = useState({ reason: 'unsubscribe', note: '' })
  const [suppressSaving, setSuppressSaving] = useState(false)
  const [suppressError, setSuppressError] = useState(null)

  const load = useCallback(
    (signal) => {
      setError(null)
      Promise.all([
        findReplyById(replyId, { signal }),
        fetchReplyContext(signal),
        listSuppressions({ limit: 100 }, signal),
      ])
        .then(([nextReply, nextContext, suppressionPage]) => {
          setReply(nextReply)
          setContext(nextContext)
          if (nextReply?.contactId) {
            const contact = nextContext.contacts.get(nextReply.contactId)
            if (contact?.email) {
              const blocked = (suppressionPage.items ?? []).some(
                (item) => item.email.toLowerCase() === contact.email.toLowerCase(),
              )
              setSuppressedEmail(blocked ? contact.email : null)
            }
          }
          setStatus('ready')
        })
        .catch((caught) => {
          if (caught?.name === 'AbortError') return
          setError(caught)
          setStatus('error')
        })
    },
    [replyId],
  )

  useEffect(() => {
    const controller = new AbortController()
    setStatus('loading')
    load(controller.signal)
    return () => controller.abort()
  }, [load])

  useEffect(() => {
    if (reply) {
      setClsForm({
        category: reply.category,
        needsReview: reply.needsReview,
        assignedTo: reply.assignedTo ?? '',
      })
    }
  }, [reply])

  if (status === 'loading') {
    return (
      <div className="app-page replies-page">
        <PageHeader
          eyebrow="Workspace · Reply"
          title="Reply"
          description="Classified inbound reply with its context and actions."
        />
        <div className="app-card">
          <Skeleton lines={5} />
        </div>
      </div>
    )
  }

  if (status === 'error') {
    return (
      <div className="app-page replies-page">
        <PageHeader
          eyebrow="Workspace · Reply"
          title="Reply"
          description="Classified inbound reply with its context and actions."
        />
        <ErrorPanel
          title="Couldn't load this reply"
          description={error?.message || undefined}
          requestId={error?.requestId}
          onRetry={() => load()}
        />
      </div>
    )
  }

  if (!reply) {
    return (
      <div className="app-page replies-page">
        <PageHeader
          eyebrow="Workspace · Replies"
          title="Reply not found"
          description="The selected reply no longer exists or is unavailable."
        />
        <Link className="btn btn--ghost btn--sm" to="/app/replies">
          Back to inbox
        </Link>
      </div>
    )
  }

  const contact = context?.contacts?.get(reply.contactId ?? '') ?? null
  const campaign = context?.campaigns?.get(reply.campaignId ?? '') ?? null
  const members = context?.members ?? new Map()
  const assigneeName = reply.assignedTo ? members.get(reply.assignedTo) ?? 'Unknown member' : null
  const unmatched = !reply.contactId || !reply.campaignId
  const meta = categoryMeta(reply.category)

  async function handleClassification(event) {
    event.preventDefault()
    setClsError(null)
    setClsSaving(true)
    try {
      const updated = await updateReply(reply.id, {
        category: clsForm.category,
        needsReview: clsForm.needsReview,
        assignedTo: clsForm.assignedTo || null,
      })
      setReply(updated)
      toast.success('Classification saved.', { title: 'Reply updated' })
    } catch (caught) {
      setClsError(caught)
    } finally {
      setClsSaving(false)
    }
  }

  async function handleNote(event) {
    event.preventDefault()
    const text = noteText.trim()
    if (!text || !reply.contactId) return
    setNoteError(null)
    setNoteSaving(true)
    try {
      await appendContactNote(reply.contactId, text)
      setNoteText('')
      toast.success('Note appended to the contact record.', { title: 'Note added' })
    } catch (caught) {
      setNoteError(caught)
    } finally {
      setNoteSaving(false)
    }
  }

  async function handleTask(event) {
    event.preventDefault()
    const title = taskForm.title.trim()
    if (!title) {
      setTaskError(new Error('Give the task a title.'))
      return
    }
    setTaskError(null)
    setTaskSaving(true)
    try {
      await createTask({
        title,
        dueAt: taskForm.dueAt ? new Date(taskForm.dueAt).toISOString() : undefined,
        priority: taskForm.priority,
        contactId: reply.contactId || undefined,
        assigneeId: taskForm.assigneeId || undefined,
      })
      setTaskForm({ title: '', dueAt: '', priority: 'normal', assigneeId: '' })
      toast.success('Follow-up task created.', { title: 'Task created' })
    } catch (caught) {
      setTaskError(caught)
    } finally {
      setTaskSaving(false)
    }
  }

  async function handleSuppress(event) {
    event.preventDefault()
    if (!contact?.email) return
    setSuppressError(null)
    setSuppressSaving(true)
    try {
      await addSuppression({
        email: contact.email,
        reason: suppressForm.reason,
        note: suppressForm.note,
      })
      setSuppressedEmail(contact.email)
      setSuppressForm({ reason: 'unsubscribe', note: '' })
      toast.success(`${contact.email} is blocked from future sends.`, { title: 'Contact suppressed' })
    } catch (caught) {
      setSuppressError(caught)
    } finally {
      setSuppressSaving(false)
    }
  }

  return (
    <div className="app-page replies-page">
      <PageHeader
        eyebrow="Workspace · Reply"
        title={contact?.name ?? 'Unknown contact'}
        description={contact?.email ?? 'No contact linked to this reply.'}
        backTo="/app/replies"
        backLabel="Replies inbox"
        meta={
          <>
            <Badge tone={meta.tone} dot>
              {meta.label}
            </Badge>
            {reply.needsReview ? (
              <Badge tone="warning" dot>
                Needs review
              </Badge>
            ) : null}
            {unmatched ? (
              <Badge tone="neutral" dot>
                Unmatched
              </Badge>
            ) : null}
            {suppressedEmail ? (
              <Badge tone="danger" dot>
                Suppressed
              </Badge>
            ) : null}
          </>
        }
      />

      <div className="reply-detail">
        <aside className="reply-detail__sidebar app-card">
          <div className="reply-detail__header">
            <div>
              <p className="eyebrow">Classification</p>
              <h3>{meta.label}</h3>
            </div>
          </div>

          <dl className="replies-page__detail-list reply-detail__list">
            <div>
              <dt>Contact</dt>
              <dd>
                {reply.contactId && contact ? (
                  <Link to={`/app/contacts/${reply.contactId}`}>{contact.name}</Link>
                ) : (
                  'No contact linked'
                )}
              </dd>
            </div>
            <div>
              <dt>Campaign</dt>
              <dd>
                {reply.campaignId && campaign ? (
                  <Link to={`/app/campaigns/${reply.campaignId}`}>{campaign.name}</Link>
                ) : (
                  'No campaign linked'
                )}
              </dd>
            </div>
            <div>
              <dt>Assignee</dt>
              <dd>{assigneeName ?? 'Unassigned'}</dd>
            </div>
            <div>
              <dt>Confidence</dt>
              <dd>{reply.confidence == null ? 'n/a' : `${Math.round(reply.confidence * 100)}%`}</dd>
            </div>
            <div>
              <dt>Classified by</dt>
              <dd>{reply.classifiedBy}</dd>
            </div>
            <div>
              <dt>Received</dt>
              <dd>{formatDateTime(reply.receivedAt ?? reply.createdAt)}</dd>
            </div>
          </dl>

          <form className="reply-detail__classification" onSubmit={handleClassification}>
            <p className="eyebrow">Update classification</p>
            <SelectField
              id="reply-detail-category"
              label="Category"
              value={clsForm.category}
              onChange={(event) =>
                setClsForm((form) => ({ ...form, category: event.target.value }))
              }
            >
              {Object.keys(REPLY_CATEGORIES).map((value) => (
                <option key={value} value={value}>
                  {categoryMeta(value).label}
                </option>
              ))}
            </SelectField>
            <SelectField
              id="reply-detail-assignee"
              label="Assignee"
              value={clsForm.assignedTo}
              onChange={(event) =>
                setClsForm((form) => ({ ...form, assignedTo: event.target.value }))
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
              id="reply-detail-review"
              checked={clsForm.needsReview}
              onChange={(event) =>
                setClsForm((form) => ({ ...form, needsReview: event.target.checked }))
              }
            >
              Flag for review
            </CheckboxField>
            {clsError ? (
              <p className="replies-page__error" role="alert">
                {clsError.message || 'Saving the classification failed.'}
              </p>
            ) : null}
            <Button type="submit" loading={clsSaving}>
              Save classification
            </Button>
          </form>

          <p className="replies-page__gap-note">
            This build's reply API exposes a snippet only — there are no message bodies or thread
            history to render. Stop-sequence and "open in provider" are not available either: the
            reply's message id is internal, not a provider message id.
          </p>
        </aside>

        <main className="reply-detail__main">
          <section className="reply-detail__thread app-card">
            <div className="reply-detail__thread-header">
              <div>
                <p className="eyebrow">Snippet</p>
                <h3>Inbound reply</h3>
              </div>
              <Link to="/app/replies" className="reply-detail__back-link">
                Back to inbox
              </Link>
            </div>

            <div className="replies-page__thread-messages reply-detail__messages">
              <div className="replies-page__message replies-page__message--inbound">
                <div className="replies-page__message-head">
                  <strong>{contact?.name ?? 'Unknown contact'}</strong>
                  <span>{contact?.email ?? 'no contact linked'}</span>
                </div>
                <div
                  className="replies-page__message-copy"
                  dangerouslySetInnerHTML={{ __html: sanitizeReplyHtml(reply.snippet) }}
                />
              </div>
            </div>
          </section>

          <section className="reply-detail__actions-panel" aria-label="Reply actions">
            <form className="reply-detail__action-card app-card" onSubmit={handleNote}>
              <div className="reply-detail__action-head">
                <p className="eyebrow">Contact note</p>
                <small>Appended to {contact?.name ?? 'the contact'}'s record via contact update.</small>
              </div>
              {reply.contactId && contact ? (
                <>
                  <TextareaField
                    id="reply-detail-note"
                    label="Note"
                    rows={3}
                    value={noteText}
                    onChange={(event) => setNoteText(event.target.value)}
                    placeholder="Context worth keeping on the contact record…"
                  />
                  {noteError ? (
                    <p className="replies-page__error" role="alert">
                      {noteError.message || 'Adding the note failed.'}
                    </p>
                  ) : null}
                  <Button type="submit" variant="ghost" loading={noteSaving} disabled={!noteText.trim()}>
                    Add note
                  </Button>
                </>
              ) : (
                <p className="replies-page__gap-note">
                  No contact is linked to this reply, so there is no record to annotate.
                </p>
              )}
            </form>

            <form className="reply-detail__action-card app-card" onSubmit={handleTask}>
              <div className="reply-detail__action-head">
                <p className="eyebrow">Follow-up task</p>
                <small>Created in the workspace task list{reply.contactId ? ', linked to this contact' : ''}.</small>
              </div>
              <TextField
                id="reply-detail-task-title"
                label="Title"
                value={taskForm.title}
                onChange={(event) => setTaskForm((form) => ({ ...form, title: event.target.value }))}
                placeholder="e.g. Send pricing follow-up"
              />
              <div className="reply-detail__form-grid">
                <TextField
                  id="reply-detail-task-due"
                  label="Due"
                  type="datetime-local"
                  value={taskForm.dueAt}
                  onChange={(event) => setTaskForm((form) => ({ ...form, dueAt: event.target.value }))}
                />
                <SelectField
                  id="reply-detail-task-priority"
                  label="Priority"
                  value={taskForm.priority}
                  onChange={(event) =>
                    setTaskForm((form) => ({ ...form, priority: event.target.value }))
                  }
                >
                  {Object.entries(TASK_PRIORITIES).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </SelectField>
                <SelectField
                  id="reply-detail-task-assignee"
                  label="Assignee"
                  value={taskForm.assigneeId}
                  onChange={(event) =>
                    setTaskForm((form) => ({ ...form, assigneeId: event.target.value }))
                  }
                >
                  <option value="">Unassigned</option>
                  {[...members.entries()].map(([id, name]) => (
                    <option key={id} value={id}>
                      {name}
                    </option>
                  ))}
                </SelectField>
              </div>
              {taskError ? (
                <p className="replies-page__error" role="alert">
                  {taskError.message || 'Creating the task failed.'}
                </p>
              ) : null}
              <Button type="submit" variant="ghost" loading={taskSaving}>
                Create task
              </Button>
            </form>

            <form className="reply-detail__action-card app-card" onSubmit={handleSuppress}>
              <div className="reply-detail__action-head">
                <p className="eyebrow">Suppress contact</p>
                <small>
                  Blocks {contact?.email ?? 'this contact'} from all future sends and marks the
                  contact unsubscribed.
                </small>
              </div>
              {contact?.email ? (
                suppressedEmail ? (
                  <p className="replies-page__gap-note">
                    <strong>{suppressedEmail}</strong> is already blocked in this workspace.
                  </p>
                ) : (
                  <>
                    <SelectField
                      id="reply-detail-suppress-reason"
                      label="Reason"
                      value={suppressForm.reason}
                      onChange={(event) =>
                        setSuppressForm((form) => ({ ...form, reason: event.target.value }))
                      }
                    >
                      {SUPPRESSION_REASONS.map((reason) => (
                        <option key={reason.value} value={reason.value}>
                          {reason.label}
                        </option>
                      ))}
                    </SelectField>
                    <TextField
                      id="reply-detail-suppress-note"
                      label="Note (optional)"
                      value={suppressForm.note}
                      onChange={(event) =>
                        setSuppressForm((form) => ({ ...form, note: event.target.value }))
                      }
                      placeholder="Why this address is being blocked"
                    />
                    {suppressError ? (
                      <p className="replies-page__error" role="alert">
                        {suppressError.message || 'Blocking this address failed.'}
                      </p>
                    ) : null}
                    <Button type="submit" variant="danger" loading={suppressSaving}>
                      Block address
                    </Button>
                  </>
                )
              ) : (
                <p className="replies-page__gap-note">
                  No contact is linked to this reply, so there is no address to suppress.
                </p>
              )}
            </form>
          </section>
        </main>
      </div>
    </div>
  )
}
