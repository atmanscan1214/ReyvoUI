import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { SelectField, TextField } from '../../../components/Field'
import { Badge, Button, EmptyState, ErrorPanel, PageHeader, Skeleton, useToast } from '../../../components/ui'
import { api } from '../../../lib/api'
import { listContacts } from '../../../lib/contacts'
import { listOpportunities } from '../../../lib/opportunities'
import {
  createTask,
  listTasks,
  TASK_PRIORITIES,
  TASK_STATUSES,
  updateTask,
} from '../../../lib/tasks'
import './tasks.css'

function formatDate(value) {
  try {
    return new Intl.DateTimeFormat(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    }).format(new Date(value))
  } catch {
    return 'No date'
  }
}

/**
 * Due-date state over live `due_at` datetimes. Overdue means past the start of
 * today while the task is still open/in-progress — completed and canceled
 * tasks are never overdue, so both are distinguishable in live data (T35).
 */
function classifyDueDate(task) {
  if (task.status === 'completed') return 'completed'
  if (task.status === 'canceled') return 'canceled'
  if (!task.dueAt) return 'no-date'
  const due = new Date(task.dueAt)
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  due.setHours(0, 0, 0, 0)
  if (due < today) return 'overdue'
  if (due.getTime() === today.getTime()) return 'today'
  return 'upcoming'
}

/**
 * Task queue (T35, §5.7.5). Live `GET /tasks` with the server-side status
 * filter; search/priority/assignee filter the loaded page client-side (the
 * API caps page size at 100). Status changes and creation write through
 * `PATCH/POST /tasks`. There is no `DELETE /tasks/{id}` — completed or
 * canceled tasks are filtered, not deleted, and that is named in the UI.
 * Contact/opportunity links are enriched from the live lists (first 100).
 */
export function TasksPage() {
  const [page, setPage] = useState({ items: [], total: 0 })
  const [enrich, setEnrich] = useState({ contacts: new Map(), opportunities: new Map(), members: new Map() })
  const [status, setStatus] = useState('loading')
  const [error, setError] = useState(null)
  const [refreshing, setRefreshing] = useState(false)

  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [priorityFilter, setPriorityFilter] = useState('')
  const [assigneeFilter, setAssigneeFilter] = useState('')

  const [draft, setDraft] = useState({
    title: '',
    dueAt: '',
    priority: 'normal',
    assigneeId: '',
    contactId: '',
    opportunityId: '',
  })
  const [draftSaving, setDraftSaving] = useState(false)
  const [draftError, setDraftError] = useState(null)

  const [rowSaving, setRowSaving] = useState(null)
  const [rowError, setRowError] = useState(null)
  const { toast } = useToast()

  const load = useCallback(
    (signal) => {
      setRefreshing(true)
      setError(null)
      Promise.all([
        listTasks({ status: statusFilter || undefined, limit: 100 }, signal),
        listContacts({ limit: 100 }, signal),
        listOpportunities({ limit: 100 }, signal),
        api.get('/tenants/current/members', { signal }),
      ])
        .then(([tasksPage, contactsPage, opportunitiesPage, membersRaw]) => {
          const contacts = new Map()
          for (const contact of contactsPage.items) {
            contacts.set(contact.id, { name: contact.fullName, email: contact.email })
          }
          const opportunities = new Map()
          for (const opportunity of opportunitiesPage.items) {
            opportunities.set(opportunity.id, opportunity)
          }
          const members = new Map()
          for (const raw of Array.isArray(membersRaw) ? membersRaw : []) {
            if (raw?.user_id) members.set(String(raw.user_id), raw?.full_name || raw?.email || String(raw.user_id))
          }
          setPage({ items: tasksPage.items, total: tasksPage.total })
          setEnrich({ contacts, opportunities, members })
          setStatus('ready')
        })
        .catch((caught) => {
          if (caught?.name === 'AbortError') return
          setError(caught)
          setStatus('error')
        })
        .finally(() => setRefreshing(false))
    },
    [statusFilter],
  )

  useEffect(() => {
    const controller = new AbortController()
    setStatus('loading')
    load(controller.signal)
    return () => controller.abort()
  }, [load])

  const { contacts = new Map(), opportunities = new Map(), members = new Map() } = enrich

  const rows = useMemo(() => {
    const query = search.trim().toLowerCase()
    return page.items.filter((task) => {
      const contact = contacts.get(task.contactId ?? '')
      const haystack = [task.title, contact?.name]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
      const matchesSearch = !query || haystack.includes(query)
      const matchesPriority = priorityFilter === '' || task.priority === priorityFilter
      const matchesAssignee =
        assigneeFilter === '' ||
        (assigneeFilter === 'unassigned' ? !task.assigneeId : task.assigneeId === assigneeFilter)
      return matchesSearch && matchesPriority && matchesAssignee
    })
  }, [assigneeFilter, contacts, page.items, priorityFilter, search])

  const summary = useMemo(() => {
    const loaded = page.items
    return {
      total: page.total,
      active: loaded.filter((task) => task.status === 'open' || task.status === 'in_progress').length,
      overdue: loaded.filter((task) => classifyDueDate(task) === 'overdue').length,
      completed: loaded.filter((task) => task.status === 'completed').length,
      high: loaded.filter(
        (task) => task.priority === 'high' && task.status !== 'completed' && task.status !== 'canceled',
      ).length,
    }
  }, [page])

  function describeTask(task) {
    const contact = contacts.get(task.contactId ?? '')
    const opportunity = opportunities.get(task.opportunityId ?? '')
    return {
      contactName: contact?.name ?? (task.contactId ? 'Unknown contact' : 'No contact linked'),
      contactLinked: Boolean(task.contactId && contact),
      opportunityLinked: Boolean(task.opportunityId && opportunity),
      opportunityLabel: opportunity
        ? `Opportunity · ${contacts.get(opportunity.contactId ?? '')?.name ?? opportunity.stage}`
        : null,
    }
  }

  function replaceTask(updated) {
    setPage((prev) => ({
      total: prev.total,
      items: prev.items.some((task) => task.id === updated.id)
        ? prev.items.map((task) => (task.id === updated.id ? updated : task))
        : [updated, ...prev.items],
    }))
  }

  async function handleStatusChange(task, nextStatus) {
    setRowError(null)
    setRowSaving(task.id)
    try {
      const updated = await updateTask(task.id, { status: nextStatus })
      replaceTask(updated)
      toast.success(`Status set to ${TASK_STATUSES[nextStatus]?.label ?? nextStatus}.`, {
        title: 'Task updated',
      })
    } catch (caught) {
      setRowError(caught)
    } finally {
      setRowSaving(null)
    }
  }

  async function handleCreate(event) {
    event.preventDefault()
    const title = draft.title.trim()
    if (!title) {
      setDraftError(new Error('Give the task a title.'))
      return
    }
    setDraftError(null)
    setDraftSaving(true)
    try {
      const created = await createTask({
        title,
        dueAt: draft.dueAt ? new Date(draft.dueAt).toISOString() : undefined,
        priority: draft.priority,
        contactId: draft.contactId || undefined,
        opportunityId: draft.opportunityId || undefined,
        assigneeId: draft.assigneeId || undefined,
      })
      replaceTask(created)
      setPage((prev) => ({ ...prev, total: prev.total + 1 }))
      setDraft({ title: '', dueAt: '', priority: 'normal', assigneeId: '', contactId: '', opportunityId: '' })
      toast.success('Task created.', { title: 'Task created' })
    } catch (caught) {
      setDraftError(caught)
    } finally {
      setDraftSaving(false)
    }
  }

  if (status === 'loading') {
    return (
      <div className="app-page tasks-page">
        <PageHeader
          eyebrow="Workspace · Tasks"
          title="Task queue"
          description="Follow-up work from replies and manual notes, tracked to completion."
        />
        <div className="app-card">
          <Skeleton lines={6} />
        </div>
      </div>
    )
  }

  if (status === 'error') {
    return (
      <div className="app-page tasks-page">
        <PageHeader
          eyebrow="Workspace · Tasks"
          title="Task queue"
          description="Follow-up work from replies and manual notes, tracked to completion."
        />
        <ErrorPanel
          title="Couldn't load tasks"
          description={error?.message || undefined}
          requestId={error?.requestId}
          onRetry={() => load()}
        />
      </div>
    )
  }

  return (
    <div className="app-page tasks-page">
      <PageHeader
        eyebrow="Workspace · Tasks"
        title="Task queue"
        description="Follow-up work from replies and manual notes, tracked to completion."
        actions={
          <Button variant="ghost" loading={refreshing} onClick={() => load()}>
            Refresh
          </Button>
        }
        meta={
          <>
            <Badge tone="neutral" dot>
              {summary.total} tasks
            </Badge>
            <Badge tone="danger" dot>
              {summary.overdue} overdue
            </Badge>
            <Badge tone="success" dot>
              {summary.completed} complete
            </Badge>
          </>
        }
      />

      <div className="tasks-page__summary">
        <div className="app-card tasks-page__stat">
          <span>Active tasks</span>
          <strong>{summary.active}</strong>
        </div>
        <div className="app-card tasks-page__stat tasks-page__stat--warn">
          <span>Overdue</span>
          <strong>{summary.overdue}</strong>
        </div>
        <div className="app-card tasks-page__stat tasks-page__stat--good">
          <span>Completed</span>
          <strong>{summary.completed}</strong>
        </div>
        <div className="app-card tasks-page__stat tasks-page__stat--muted">
          <span>High priority</span>
          <strong>{summary.high}</strong>
        </div>
      </div>

      <section className="app-card tasks-page__composer">
        <div className="tasks-page__composer-header">
          <div>
            <p className="eyebrow">Create task</p>
            <h3>New follow-up</h3>
          </div>
        </div>

        <form className="tasks-page__composer-grid" onSubmit={handleCreate}>
          <TextField
            id="task-title"
            label="Title"
            value={draft.title}
            onChange={(event) => setDraft((current) => ({ ...current, title: event.target.value }))}
            placeholder="Send pricing summary"
          />
          <TextField
            id="task-due-date"
            type="datetime-local"
            label="Due"
            value={draft.dueAt}
            onChange={(event) => setDraft((current) => ({ ...current, dueAt: event.target.value }))}
          />
          <SelectField
            id="task-priority"
            label="Priority"
            value={draft.priority}
            onChange={(event) => setDraft((current) => ({ ...current, priority: event.target.value }))}
          >
            {Object.entries(TASK_PRIORITIES).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </SelectField>
          <SelectField
            id="task-assignee"
            label="Assignee"
            value={draft.assigneeId}
            onChange={(event) => setDraft((current) => ({ ...current, assigneeId: event.target.value }))}
          >
            <option value="">Unassigned</option>
            {[...members.entries()].map(([id, name]) => (
              <option key={id} value={id}>
                {name}
              </option>
            ))}
          </SelectField>
          <SelectField
            id="task-contact"
            label="Contact"
            value={draft.contactId}
            onChange={(event) => setDraft((current) => ({ ...current, contactId: event.target.value }))}
          >
            <option value="">No contact</option>
            {[...contacts.entries()].map(([id, contact]) => (
              <option key={id} value={id}>
                {contact.name}
              </option>
            ))}
          </SelectField>
          <SelectField
            id="task-opportunity"
            label="Opportunity"
            value={draft.opportunityId}
            onChange={(event) =>
              setDraft((current) => ({ ...current, opportunityId: event.target.value }))
            }
          >
            <option value="">No opportunity</option>
            {[...opportunities.entries()].map(([id, opportunity]) => (
              <option key={id} value={id}>
                {contacts.get(opportunity.contactId ?? '')?.name ?? 'Opportunity'} ({opportunity.stage})
              </option>
            ))}
          </SelectField>
          {draftError ? (
            <p className="tasks-page__error" role="alert">
              {draftError.message || 'Creating the task failed.'}
            </p>
          ) : null}
          <div className="tasks-page__composer-actions">
            <Button variant="primary" type="submit" loading={draftSaving}>
              Create task
            </Button>
          </div>
        </form>
      </section>

      <section className="app-card tasks-page__filters">
        <div className="tasks-page__filters-grid">
          <TextField
            id="task-search"
            label="Search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Title or contact"
          />
          <SelectField
            id="task-status-filter"
            label="Status"
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value)}
          >
            <option value="">All statuses</option>
            {Object.entries(TASK_STATUSES).map(([value, meta]) => (
              <option key={value} value={value}>
                {meta.label}
              </option>
            ))}
          </SelectField>
          <SelectField
            id="task-priority-filter"
            label="Priority"
            value={priorityFilter}
            onChange={(event) => setPriorityFilter(event.target.value)}
          >
            <option value="">All priorities</option>
            {Object.entries(TASK_PRIORITIES).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </SelectField>
          <SelectField
            id="task-assignee-filter"
            label="Assignee"
            value={assigneeFilter}
            onChange={(event) => setAssigneeFilter(event.target.value)}
          >
            <option value="">All assignees</option>
            {[...members.entries()].map(([id, name]) => (
              <option key={id} value={id}>
                {name}
              </option>
            ))}
            <option value="unassigned">Unassigned</option>
          </SelectField>
        </div>
      </section>

      <section className="app-card tasks-page__list-wrap">
        <div className="tasks-page__list-header">
          <div>
            <p className="eyebrow">Task list</p>
            <h3>{rows.length} visible</h3>
          </div>
        </div>

        {rowError ? (
          <p className="tasks-page__error" role="alert">
            {rowError.message || 'Updating the task failed.'}
          </p>
        ) : null}

        <div className="tasks-page__list">
          {rows.length === 0 ? (
            page.items.length === 0 && page.total === 0 ? (
              <EmptyState
                title="No tasks yet"
                description="Tasks appear here when a teammate or a reply action creates follow-up work. The composer above creates one against the live API."
              />
            ) : (
              <div className="tasks-page__empty">No tasks match the active filters.</div>
            )
          ) : (
            rows.map((task) => {
              const statusMeta = TASK_STATUSES[task.status] ?? TASK_STATUSES.open
              const priorityLabel = TASK_PRIORITIES[task.priority] ?? task.priority
              const priorityTone =
                task.priority === 'high' ? 'danger' : task.priority === 'low' ? 'success' : 'warning'
              const dueState = classifyDueDate(task)
              const described = describeTask(task)

              return (
                <article key={task.id} className={`tasks-page__row tasks-page__row--${task.status}`}>
                  <div className="tasks-page__row-main">
                    <div className="tasks-page__title-block">
                      <span className="tasks-page__id">{task.id.slice(0, 8)}</span>
                      <h4>{task.title}</h4>
                    </div>

                    <div className="tasks-page__badges">
                      <Badge tone={statusMeta.tone}>{statusMeta.label}</Badge>
                      <Badge tone={priorityTone}>{priorityLabel}</Badge>
                      {dueState === 'overdue' ? <Badge tone="danger">Overdue</Badge> : null}
                      {dueState === 'today' ? <Badge tone="warning">Due today</Badge> : null}
                    </div>
                  </div>

                  <div className="tasks-page__meta">
                    <div>
                      <span className="tasks-page__label">Assignee</span>
                      <strong>
                        {task.assigneeId ? members.get(task.assigneeId) ?? 'Unknown member' : 'Unassigned'}
                      </strong>
                    </div>
                    <div>
                      <span className="tasks-page__label">Due</span>
                      <strong className={dueState === 'overdue' ? 'is-overdue' : ''}>
                        {task.dueAt ? formatDate(task.dueAt) : 'No date'}
                      </strong>
                    </div>
                    <div>
                      <span className="tasks-page__label">Contact</span>
                      {described.contactLinked ? (
                        <Link to={`/app/contacts/${task.contactId}`}>{described.contactName}</Link>
                      ) : (
                        <strong>{described.contactName}</strong>
                      )}
                    </div>
                    <div>
                      <span className="tasks-page__label">Opportunity</span>
                      {described.opportunityLinked ? (
                        <Link to={`/app/pipeline/${task.opportunityId}`}>
                          {described.opportunityLabel}
                        </Link>
                      ) : (
                        <strong>Not linked</strong>
                      )}
                    </div>
                  </div>

                  <div className="tasks-page__actions">
                    <SelectField
                      id={`task-status-${task.id}`}
                      label="Status"
                      value={task.status}
                      onChange={(event) => handleStatusChange(task, event.target.value)}
                    >
                      {Object.entries(TASK_STATUSES).map(([value, meta]) => (
                        <option key={value} value={value}>
                          {meta.label}
                        </option>
                      ))}
                    </SelectField>
                  </div>
                </article>
              )
            })
          )}
        </div>

        <p className="replies-page__page-note">
          Tasks cannot be deleted in this API build — mark them completed or canceled instead
          (both drop out of the active counts).
        </p>
      </section>
    </div>
  )
}
