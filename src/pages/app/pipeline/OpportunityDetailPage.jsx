import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import {
  Badge,
  Button,
  ErrorPanel,
  PageHeader,
  Skeleton,
  Tabs,
  useToast,
} from '../../../components/ui'
import { SelectField, TextareaField } from '../../../components/Field'
import { api } from '../../../lib/api'
import { listCompanies } from '../../../lib/companies'
import { listContacts } from '../../../lib/contacts'
import {
  fetchOpportunity,
  listOpportunityAudit,
  OPPORTUNITY_STAGES,
  opportunityValue,
  updateOpportunity,
} from '../../../lib/opportunities'
import './pipeline.css'

function formatDate(value) {
  try {
    return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', year: 'numeric' }).format(
      new Date(value),
    )
  } catch {
    return '—'
  }
}

function formatDateTime(value) {
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

const TIMELINE_TONES = {
  created: 'neutral',
  stage: 'info',
  reply: 'warning',
  task: 'info',
}

/**
 * Opportunity detail (T37, §5.7.5). Reads `GET /opportunities/{id}` live and
 * assembles the activity timeline from every observable source in this API
 * build: `opportunity.created` / `opportunity.updated` audit entries for this
 * opportunity, the linked contact's replies, and tasks linked to the
 * opportunity. Sends and meetings are not recorded by any endpoint here (a
 * meeting materializes as the Meeting stage), and note edits are not audited —
 * the page says so instead of faking entries. Stage changes PATCH through a
 * confirm step; Won/Not-interested require a reason stored in `notes`.
 */
export function OpportunityDetailPage() {
  const { opportunityId } = useParams()
  const [opportunity, setOpportunity] = useState(null)
  const [enrich, setEnrich] = useState({
    contacts: new Map(),
    companies: new Map(),
    campaigns: new Map(),
    members: new Map(),
  })
  const [audit, setAudit] = useState([])
  const [replies, setReplies] = useState([])
  const [tasks, setTasks] = useState([])
  const [status, setStatus] = useState('loading')
  const [error, setError] = useState(null)
  const [refreshing, setRefreshing] = useState(false)
  const [tab, setTab] = useState('facts')

  const [pendingMove, setPendingMove] = useState(null)
  const [moveReason, setMoveReason] = useState('')
  const [moveError, setMoveError] = useState(null)
  const [moveSaving, setMoveSaving] = useState(false)
  const [notesDraft, setNotesDraft] = useState('')
  const [notesSaving, setNotesSaving] = useState(false)
  const { toast } = useToast()

  const load = useCallback(
    async (signal) => {
      setRefreshing(true)
      setError(null)
      try {
        const [opportunityData, contactsPage, companiesPage, campaignsRaw, membersRaw, auditPage, repliesPage, tasksPage] =
          await Promise.all([
            fetchOpportunity(opportunityId, signal),
            listContacts({ limit: 100 }, signal),
            listCompanies({ limit: 100 }, signal),
            api.get('/campaigns?limit=100', { signal }),
            api.get('/tenants/current/members', { signal }),
            Promise.all([
              listOpportunityAudit({ action: undefined, limit: 100 }, signal).catch(() => ({ items: [] })),
              api.get('/tenants/current/audit-logs?action=opportunity.created&limit=100', { signal }).catch(() => ({ items: [] })),
            ]),
            api.get('/replies?limit=100', { signal }),
            api.get('/tasks?limit=100', { signal }),
          ])

        const contacts = new Map()
        for (const contact of contactsPage.items) {
          contacts.set(contact.id, { name: contact.fullName, email: contact.email, companyId: contact.companyId })
        }
        const companies = new Map()
        for (const company of companiesPage.items) {
          companies.set(company.id, company.name)
        }
        const campaigns = new Map()
        const campaignItems = Array.isArray(campaignsRaw)
          ? campaignsRaw
          : Array.isArray(campaignsRaw?.items)
            ? campaignsRaw.items
            : []
        for (const raw of campaignItems) {
          campaigns.set(String(raw?.id ?? ''), raw?.name ?? 'Unnamed campaign')
        }
        const members = new Map()
        for (const raw of Array.isArray(membersRaw) ? membersRaw : []) {
          if (raw?.user_id) members.set(String(raw.user_id), raw?.full_name || raw?.email || String(raw.user_id))
        }

        // Detail-specific audit needs `opportunity.updated` too, which the
        // shared adapter always filters to; merge both action queries here.
        const [updatedEntries, createdEntries] = auditPage
        const auditEntries = [...(updatedEntries?.items ?? []), ...(createdEntries?.items ?? [])].filter(
          (entry) => entry?.entity_id === opportunityId,
        )

        const replyItems = Array.isArray(repliesPage?.items) ? repliesPage.items : []
        const taskItems = Array.isArray(tasksPage?.items) ? tasksPage.items : []

        setOpportunity(opportunityData)
        setEnrich({ contacts, companies, campaigns, members })
        setAudit(auditEntries)
        setReplies(replyItems.filter((item) => item.contact_id === opportunityData.contactId))
        setTasks(
          taskItems.filter((item) => item.opportunity_id === opportunityId || item.contact_id === opportunityData.contactId),
        )
        setNotesDraft('')
        setStatus('ready')
      } catch (caught) {
        if (caught?.name === 'AbortError') return
        setError(caught)
        setStatus('error')
      } finally {
        setRefreshing(false)
      }
    },
    [opportunityId],
  )

  useEffect(() => {
    const controller = new AbortController()
    setStatus('loading')
    load(controller.signal)
    return () => controller.abort()
  }, [load])

  // Notes textarea follows the loaded opportunity until the user types.
  useEffect(() => {
    setNotesDraft('')
  }, [opportunity?.id])

  const { contacts = new Map(), companies = new Map(), campaigns = new Map(), members = new Map() } = enrich

  const contact = contacts.get(opportunity?.contactId ?? '')
  const companyName = companies.get(opportunity?.companyId ?? '')
  const title = contact?.name ?? companyName ?? 'Opportunity'

  const timeline = useMemo(() => {
    const entries = []
    for (const entry of audit) {
      const before = entry?.before_data?.stage
      const after = entry?.after_data?.stage
      if (entry?.action === 'opportunity.created') {
        entries.push({
          id: `audit-${entry.id}`,
          type: 'created',
          when: entry.created_at,
          label: 'Opportunity created',
          summary: `${members.get(entry.actor_id) ?? 'A member'} created this opportunity${
            after ? ` in the ${OPPORTUNITY_STAGES[after]?.label ?? after} stage` : ''
          }.`,
          href: null,
        })
        continue
      }
      if (before && after && before !== after) {
        entries.push({
          id: `audit-${entry.id}`,
          type: 'stage',
          when: entry.created_at,
          label: `Stage: ${OPPORTUNITY_STAGES[after]?.label ?? after}`,
          summary: `${members.get(entry.actor_id) ?? 'A member'} moved this opportunity from ${
            OPPORTUNITY_STAGES[before]?.label ?? before
          } to ${OPPORTUNITY_STAGES[after]?.label ?? after}.`,
          href: null,
        })
      }
    }
    for (const reply of replies) {
      const meta = OPPORTUNITY_STAGES.replied
      entries.push({
        id: `reply-${reply.id}`,
        type: 'reply',
        when: reply.received_at ?? reply.created_at,
        label: `${reply.category ? reply.category.charAt(0).toUpperCase() + reply.category.slice(1) : 'Unclassified'} reply`,
        summary:
          (reply.needs_review ? 'Needs review — ' : '') +
          `${contact?.name ?? 'The contact'} replied (${meta.label} stage signal).`,
        href: `/app/replies/${reply.id}`,
      })
    }
    for (const task of tasks) {
      entries.push({
        id: `task-${task.id}`,
        type: 'task',
        when: task.created_at,
        label: `Task ${task.status ?? 'open'}`,
        summary: `${task.title}${
          task.due_at ? ` — due ${formatDate(task.due_at)}` : ''
        } (assignee: ${members.get(task.assignee_id) ?? 'unassigned'}).`,
        href: '/app/tasks',
      })
    }
    return entries.sort((left, right) => new Date(right.when).getTime() - new Date(left.when).getTime())
  }, [audit, contact?.name, members, replies, tasks])

  /** Ask for confirmation before PATCHing (won/lost also needs a reason). */
  function requestStageChange(nextStage) {
    if (!opportunity || opportunity.stage === nextStage) return
    setPendingMove({ nextStage, previousStage: opportunity.stage })
    setMoveReason('')
    setMoveError(null)
  }

  async function confirmMove() {
    if (!pendingMove || !opportunity) return
    const closing = pendingMove.nextStage === 'won' || pendingMove.nextStage === 'not_interested'
    const reason = moveReason.trim()
    if (closing && !reason) {
      setMoveError(new Error(`Give a reason before moving to ${OPPORTUNITY_STAGES[pendingMove.nextStage].label}.`))
      return
    }
    setMoveError(null)
    setMoveSaving(true)
    try {
      const updated = await updateOpportunity(opportunity.id, {
        stage: pendingMove.nextStage,
        ...(closing ? { notes: reason } : {}),
      })
      setOpportunity(updated)
      setPendingMove(null)
      setMoveReason('')
      toast.success(
        `Stage set to ${OPPORTUNITY_STAGES[updated.stage]?.label ?? updated.stage} — the change is audited.`,
        { title: 'Stage updated' },
      )
      load()
    } catch (caught) {
      setMoveError(caught)
    } finally {
      setMoveSaving(false)
    }
  }

  async function saveNotes() {
    if (!opportunity) return
    setNotesSaving(true)
    try {
      const updated = await updateOpportunity(opportunity.id, { notes: notesDraft })
      setOpportunity(updated)
      setNotesDraft('')
      toast.success('Notes saved on the opportunity.', { title: 'Notes updated' })
    } catch (caught) {
      toast.error(caught?.message || 'Saving notes failed.', { title: 'Save failed' })
    } finally {
      setNotesSaving(false)
    }
  }

  if (status === 'loading') {
    return (
      <div className="app-page pipeline-page">
        <PageHeader
          eyebrow="Workspace · Pipeline"
          title="Opportunity"
          backTo="/app/pipeline"
          backLabel="Pipeline"
          description="Loading the live opportunity record…"
        />
        <div className="app-card">
          <Skeleton lines={6} />
        </div>
      </div>
    )
  }

  if (status === 'error') {
    return (
      <div className="app-page pipeline-page">
        <PageHeader
          eyebrow="Workspace · Pipeline"
          title="Opportunity"
          backTo="/app/pipeline"
          backLabel="Pipeline"
          description="This opportunity could not be loaded."
        />
        <ErrorPanel
          title="Couldn't load the opportunity"
          description={error?.message || undefined}
          requestId={error?.requestId}
          onRetry={() => load()}
        />
      </div>
    )
  }

  if (!opportunity) {
    return (
      <div className="app-page pipeline-page">
        <PageHeader
          eyebrow="Workspace · Pipeline"
          title="Opportunity not found"
          backTo="/app/pipeline"
          backLabel="Pipeline"
          description="The selected opportunity is not available in this workspace."
        />
      </div>
    )
  }

  const stageMeta = OPPORTUNITY_STAGES[opportunity.stage] ?? OPPORTUNITY_STAGES.new

  return (
    <div className="app-page pipeline-page">
      <PageHeader
        eyebrow="Workspace · Pipeline"
        title={title}
        backTo="/app/pipeline"
        backLabel="Pipeline"
        description={
          contact?.name && companyName
            ? `${contact.name} at ${companyName} — live record with an activity timeline built from audit entries, replies, and tasks.`
            : 'Live opportunity record with an activity timeline built from audit entries, replies, and tasks.'
        }
        actions={
          <Button variant="ghost" loading={refreshing} onClick={() => load()}>
            Refresh
          </Button>
        }
        meta={
          <>
            <Badge tone={stageMeta.tone} dot>
              {stageMeta.label}
            </Badge>
            <Badge tone="neutral" dot>
              {opportunityValue(opportunity) ?? 'No value set'}
            </Badge>
          </>
        }
      />

      <Tabs
        value={tab}
        onChange={setTab}
        className="pipeline-page__tabs"
        items={[
          {
            id: 'facts',
            label: 'Facts & controls',
            content: (
              <div className="opportunity-detail__top-grid">
                <div className="app-card opportunity-detail__card">
                  <p className="eyebrow">Opportunity</p>
                  <h3>{companyName ?? 'No company linked'}</h3>
                  <dl className="opportunity-detail__facts">
                    <div>
                      <dt>Contact</dt>
                      <dd>
                        {opportunity.contactId ? (
                          <Link to={`/app/contacts/${opportunity.contactId}`}>
                            {contact?.name ?? 'Unknown contact'}
                          </Link>
                        ) : (
                          'No contact linked'
                        )}
                      </dd>
                    </div>
                    <div>
                      <dt>Company</dt>
                      <dd>
                        {opportunity.companyId ? (
                          <Link to={`/app/companies/${opportunity.companyId}`}>
                            {companyName ?? 'Unknown company'}
                          </Link>
                        ) : (
                          'No company linked'
                        )}
                      </dd>
                    </div>
                    <div>
                      <dt>Owner</dt>
                      <dd>{opportunity.ownerId ? members.get(opportunity.ownerId) ?? 'Unknown member' : 'Unassigned'}</dd>
                    </div>
                    <div>
                      <dt>Value</dt>
                      <dd>{opportunityValue(opportunity) ?? 'No value set'}</dd>
                    </div>
                    <div>
                      <dt>Source campaign</dt>
                      <dd>
                        {opportunity.sourceCampaignId
                          ? campaigns.get(opportunity.sourceCampaignId) ?? 'Unknown campaign'
                          : 'No source campaign'}
                      </dd>
                    </div>
                    <div>
                      <dt>Created</dt>
                      <dd>{formatDateTime(opportunity.createdAt)}</dd>
                    </div>
                    <div>
                      <dt>Expected close</dt>
                      <dd>{opportunity.expectedCloseDate ? formatDate(opportunity.expectedCloseDate) : 'No date set'}</dd>
                    </div>
                    <div>
                      <dt>Last updated</dt>
                      <dd>{formatDateTime(opportunity.updatedAt)}</dd>
                    </div>
                  </dl>
                </div>

                <div className="app-card opportunity-detail__card">
                  <p className="eyebrow">Controls</p>
                  {pendingMove ? (
                    <div className="pipeline-page__confirm pipeline-page__confirm--inline">
                      <p>
                        Move from <strong>{OPPORTUNITY_STAGES[pendingMove.previousStage]?.label}</strong> to{' '}
                        <strong>{OPPORTUNITY_STAGES[pendingMove.nextStage]?.label}</strong>?
                      </p>
                      {pendingMove.nextStage === 'won' || pendingMove.nextStage === 'not_interested' ? (
                        <TextareaField
                          id="opportunity-move-reason"
                          label="Reason (stored on the opportunity's notes)"
                          rows={2}
                          value={moveReason}
                          onChange={(event) => setMoveReason(event.target.value)}
                          placeholder={
                            pendingMove.nextStage === 'won'
                              ? 'e.g. Signed the annual plan.'
                              : 'e.g. Under contract until June.'
                          }
                        />
                      ) : null}
                      {moveError ? (
                        <p className="pipeline-page__error" role="alert">
                          {moveError.message || 'The stage change failed — the stage stays as it was.'}
                        </p>
                      ) : null}
                      <div className="pipeline-page__confirm-actions">
                        <Button variant="outline" onClick={() => setPendingMove(null)}>
                          Cancel
                        </Button>
                        <Button onClick={confirmMove} loading={moveSaving}>
                          Confirm change
                        </Button>
                      </div>
                    </div>
                  ) : null}
                  <div className="opportunity-detail__controls">
                    <SelectField
                      id="opportunity-stage"
                      label="Stage"
                      value={opportunity.stage}
                      onChange={(event) => requestStageChange(event.target.value)}
                    >
                      {Object.entries(OPPORTUNITY_STAGES).map(([value, meta2]) => (
                        <option key={value} value={value}>
                          {meta2.label}
                        </option>
                      ))}
                    </SelectField>

                    <TextareaField
                      id="opportunity-notes"
                      label="Notes / won-lost reason"
                      rows={4}
                      value={notesDraft || opportunity.notes || ''}
                      onChange={(event) => setNotesDraft(event.target.value)}
                      placeholder="Reasons for a win or loss live here."
                    />
                    <Button
                      variant="ghost"
                      size="sm"
                      loading={notesSaving}
                      onClick={saveNotes}
                      disabled={!opportunity.notes && !notesDraft.trim()}
                    >
                      Save notes
                    </Button>
                  </div>
                </div>
              </div>
            ),
          },
          {
            id: 'timeline',
            label: 'Activity timeline',
            count: timeline.length,
            content: (
              <section className="app-card opportunity-detail__timeline-card">
                <div className="pipeline-page__audit-header">
                  <div>
                    <p className="eyebrow">Timeline</p>
                    <h3>Activity (newest first)</h3>
                  </div>
                </div>

                <p className="pipeline-page__gapnote">
                  Built from live audit entries (creation and stage changes), the linked contact's replies, and tasks
                  for this opportunity. This API build records no individual sends or meetings (a meeting is the
                  Meeting stage), and note edits are not audited — those entries would be placeholders, so they are
                  omitted.
                </p>

                <div className="opportunity-detail__timeline">
                  {timeline.length === 0 ? (
                    <div className="pipeline-page__empty">
                      No activity recorded yet — move the stage or receive a reply to create the first entry.
                    </div>
                  ) : (
                    timeline.map((entry) => (
                      <div key={entry.id} className="opportunity-detail__event">
                        <div
                          className={`opportunity-detail__event-icon opportunity-detail__event-icon--${entry.type}`}
                        >
                          <span>{entry.type.slice(0, 1).toUpperCase()}</span>
                        </div>
                        <div className="opportunity-detail__event-body">
                          <div className="opportunity-detail__event-meta">
                            <Badge tone={TIMELINE_TONES[entry.type] ?? 'neutral'}>{entry.label}</Badge>
                            <span>{formatDateTime(entry.when)}</span>
                          </div>
                          <p>{entry.summary}</p>
                          {entry.href ? <Link to={entry.href}>Open source record</Link> : null}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </section>
            ),
          },
        ]}
      />
    </div>
  )
}
