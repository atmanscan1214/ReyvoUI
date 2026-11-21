import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Badge, Button, ErrorPanel, PageHeader, Skeleton, Tabs, useToast } from '../../../components/ui'
import { SelectField, TextareaField } from '../../../components/Field'
import { api } from '../../../lib/api'
import { listCompanies } from '../../../lib/companies'
import { listContacts } from '../../../lib/contacts'
import {
  fetchPipelineSummary,
  listOpportunities,
  listOpportunityAudit,
  OPPORTUNITY_STAGES,
  opportunityValue,
  updateOpportunity,
} from '../../../lib/opportunities'
import './pipeline.css'

function formatDate(value) {
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

function ageDays(createdAt) {
  if (!createdAt) return null
  const created = new Date(createdAt)
  if (Number.isNaN(created.getTime())) return null
  return Math.max(0, Math.floor((Date.now() - created.getTime()) / 86_400_000))
}

/**
 * Pipeline board and table (T36, §5.7.5). Fixed live stages (`OpportunityStage`
 * enum: new / contacted / replied / meeting / won / not_interested). Stage
 * changes — drag-and-drop, Advance, or the stage select — go through a confirm
 * step, then `PATCH /opportunities/{id}`, which the backend audits as
 * `opportunity.updated` with before/after stage data; the audit panel reads
 * those entries back from `GET /tenants/current/audit-logs`. The last move can
 * be undone with a real PATCH back to the previous stage, and a failed PATCH
 * keeps the opportunity where it was with the error and retry available.
 * Won/Not-interested moves require a reason, stored on the opportunity's
 * notes (the API has no dedicated reason field).
 */
export function PipelinePage() {
  const [view, setView] = useState('board')
  const [page, setPage] = useState({ items: [], total: 0 })
  const [summary, setSummary] = useState([])
  const [enrich, setEnrich] = useState({
    contacts: new Map(),
    companies: new Map(),
    campaigns: new Map(),
    members: new Map(),
  })
  const [audit, setAudit] = useState([])
  const [status, setStatus] = useState('loading')
  const [error, setError] = useState(null)
  const [refreshing, setRefreshing] = useState(false)

  const [search, setSearch] = useState('')
  const [ownerFilter, setOwnerFilter] = useState('')
  const [selectedId, setSelectedId] = useState('')
  const [pendingMove, setPendingMove] = useState(null)
  const [moveReason, setMoveReason] = useState('')
  const [moveError, setMoveError] = useState(null)
  const [moveSaving, setMoveSaving] = useState(false)
  const [lastMove, setLastMove] = useState(null)
  const [undoing, setUndoing] = useState(false)
  const [notesDraft, setNotesDraft] = useState('')
  const [notesSaving, setNotesSaving] = useState(false)
  const { toast } = useToast()

  const load = useCallback(
    (signal) => {
      setRefreshing(true)
      setError(null)
      Promise.all([
        listOpportunities({ limit: 100 }, signal),
        fetchPipelineSummary(signal),
        listOpportunityAudit({ limit: 10 }, signal),
        listContacts({ limit: 100 }, signal),
        listCompanies({ limit: 100 }, signal),
        api.get('/campaigns?limit=100', { signal }),
        api.get('/tenants/current/members', { signal }),
      ])
        .then(([oppPage, pipelineSummary, auditPage, contactsPage, companiesPage, campaignsRaw, membersRaw]) => {
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
          setPage({ items: Array.isArray(oppPage?.items) ? oppPage.items : [], total: Number(oppPage?.total ?? 0) })
          setSummary(pipelineSummary)
          setAudit(auditPage.items)
          setEnrich({ contacts, companies, campaigns, members })
          setNotesDraft('')
          setStatus('ready')
        })
        .catch((caught) => {
          if (caught?.name === 'AbortError') return
          setError(caught)
          setStatus('error')
        })
        .finally(() => setRefreshing(false))
    },
    [],
  )

  const refreshAudit = useCallback(async () => {
    try {
      const auditPage = await listOpportunityAudit({ limit: 10 })
      setAudit(auditPage.items)
    } catch {
      /* keep the current trail if the refresh fails */
    }
  }, [])

  useEffect(() => {
    const controller = new AbortController()
    setStatus('loading')
    load(controller.signal)
    return () => controller.abort()
  }, [load])

  const { contacts = new Map(), companies = new Map(), campaigns = new Map(), members = new Map() } = enrich

  const rows = useMemo(() => {
    const query = search.trim().toLowerCase()
    return page.items.filter((item) => {
      const contact = contacts.get(item.contactId ?? '')
      const company = companies.get(item.companyId ?? '')
      const haystack = [contact?.name, company, opportunityValue(item)]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
      const matchesSearch = !query || haystack.includes(query)
      const matchesOwner =
        ownerFilter === '' ||
        (ownerFilter === 'unassigned' ? !item.ownerId : item.ownerId === ownerFilter)
      return matchesSearch && matchesOwner
    })
  }, [companies, contacts, ownerFilter, page.items, search])

  const summaryByStage = useMemo(() => {
    const map = new Map(summary.map((entry) => [entry.stage, entry]))
    return Object.keys(OPPORTUNITY_STAGES).map((stage) => ({
      stage,
      label: OPPORTUNITY_STAGES[stage].label,
      count: map.get(stage)?.count ?? 0,
      valueCents: map.get(stage)?.valueCents ?? 0,
    }))
  }, [summary])

  const totalValue = summaryByStage.reduce((sum, entry) => sum + entry.valueCents, 0)
  const meetingCount = summaryByStage.find((entry) => entry.stage === 'meeting')?.count ?? 0

  const selectedOpportunity = useMemo(
    () => page.items.find((item) => item.id === selectedId) ?? null,
    [page.items, selectedId],
  )

  // Notes textarea follows the selected opportunity until the user types.
  useEffect(() => {
    setNotesDraft('')
  }, [selectedId])

  function describeOpportunity(item) {
    const contact = contacts.get(item.contactId ?? '')
    const company = companies.get(item.companyId ?? '')
    return {
      contactName: contact?.name ?? (item.contactId ? 'Unknown contact' : 'No contact linked'),
      contactLinked: Boolean(item.contactId && contact),
      companyName: company ?? (item.companyId ? 'Unknown company' : null),
      companyLinked: Boolean(item.companyId && company),
      ownerName: item.ownerId ? members.get(item.ownerId) ?? 'Unknown member' : 'Unassigned',
      sourceName: item.sourceCampaignId
        ? campaigns.get(item.sourceCampaignId) ?? 'Unknown campaign'
        : null,
      age: ageDays(item.createdAt),
    }
  }

  /** Ask for confirmation before PATCHing (won/lost also needs a reason). */
  function requestStageChange(opportunityId, nextStage) {
    const opportunity = page.items.find((item) => item.id === opportunityId)
    if (!opportunity || opportunity.stage === nextStage) return
    setPendingMove({ opportunityId, nextStage, previousStage: opportunity.stage })
    setMoveReason('')
    setMoveError(null)
    setSelectedId(opportunityId)
  }

  async function confirmMove() {
    if (!pendingMove) return
    const closing = pendingMove.nextStage === 'won' || pendingMove.nextStage === 'not_interested'
    const reason = moveReason.trim()
    if (closing && !reason) {
      setMoveError(new Error(`Give a reason before moving to ${OPPORTUNITY_STAGES[pendingMove.nextStage].label}.`))
      return
    }
    setMoveError(null)
    setMoveSaving(true)
    try {
      const updated = await updateOpportunity(pendingMove.opportunityId, {
        stage: pendingMove.nextStage,
        ...(closing ? { notes: reason } : {}),
      })
      setPage((prev) => ({
        ...prev,
        items: prev.items.map((item) => (item.id === updated.id ? updated : item)),
      }))
      setLastMove({ id: updated.id, previousStage: pendingMove.previousStage })
      setPendingMove(null)
      setMoveReason('')
      toast.success(
        `Stage set to ${OPPORTUNITY_STAGES[updated.stage]?.label ?? updated.stage} — the change is audited.`,
        { title: 'Stage updated' },
      )
      await Promise.all([refreshAudit(), fetchPipelineSummary().then(setSummary).catch(() => {})])
    } catch (caught) {
      setMoveError(caught)
    } finally {
      setMoveSaving(false)
    }
  }

  /** Real recovery: PATCH the opportunity back to its previous stage. */
  async function undoLastMove() {
    if (!lastMove) return
    setUndoing(true)
    try {
      const updated = await updateOpportunity(lastMove.id, { stage: lastMove.previousStage })
      setPage((prev) => ({
        ...prev,
        items: prev.items.map((item) => (item.id === updated.id ? updated : item)),
      }))
      setLastMove(null)
      toast.success('Stage restored to its previous value.', { title: 'Move undone' })
      await Promise.all([refreshAudit(), fetchPipelineSummary().then(setSummary).catch(() => {})])
    } catch (caught) {
      toast.error(caught?.message || 'Restoring the previous stage failed.', { title: 'Undo failed' })
    } finally {
      setUndoing(false)
    }
  }

  async function saveNotes() {
    if (!selectedOpportunity) return
    setNotesSaving(true)
    try {
      const updated = await updateOpportunity(selectedOpportunity.id, { notes: notesDraft })
      setPage((prev) => ({
        ...prev,
        items: prev.items.map((item) => (item.id === updated.id ? updated : item)),
      }))
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
          title="Pipeline board"
          description="Opportunities tracked through a fixed stage flow with an auditable, reversible stage history."
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
          title="Pipeline board"
          description="Opportunities tracked through a fixed stage flow with an auditable, reversible stage history."
        />
        <ErrorPanel
          title="Couldn't load the pipeline"
          description={error?.message || undefined}
          requestId={error?.requestId}
          onRetry={() => load()}
        />
      </div>
    )
  }

  return (
    <div className="app-page pipeline-page">
      <PageHeader
        eyebrow="Workspace · Pipeline"
        title="Pipeline board"
        description="Opportunities tracked through a fixed stage flow with an auditable, reversible stage history."
        actions={
          <Button variant="ghost" loading={refreshing} onClick={() => load()}>
            Refresh
          </Button>
        }
        meta={
          <>
            <Badge tone="neutral" dot>
              {page.total} deals
            </Badge>
            <Badge tone="success" dot>
              {opportunityValue({ valueCents: totalValue, currency: 'USD' })} total value
            </Badge>
            <Badge tone="warning" dot>
              {meetingCount} in meetings
            </Badge>
          </>
        }
      />

      <div className="pipeline-page__summary">
        {summaryByStage.map((entry) => (
          <div key={entry.stage} className="app-card pipeline-page__stat">
            <span>{entry.label}</span>
            <strong>{entry.count}</strong>
            <small>{opportunityValue({ valueCents: entry.valueCents, currency: 'USD' })}</small>
          </div>
        ))}
      </div>

      {pendingMove ? (
        <div className="pipeline-page__confirm app-card">
          <div>
            <p className="eyebrow">Confirm move</p>
            <strong>
              Move{' '}
              {describeOpportunity(
                page.items.find((item) => item.id === pendingMove.opportunityId) ?? {},
              ).contactName}{' '}
              from {OPPORTUNITY_STAGES[pendingMove.previousStage]?.label} to{' '}
              {OPPORTUNITY_STAGES[pendingMove.nextStage]?.label}?
            </strong>
            {pendingMove.nextStage === 'won' || pendingMove.nextStage === 'not_interested' ? (
              <TextareaField
                id="pipeline-move-reason"
                label={`Reason (stored on the opportunity's notes)`}
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
                {moveError.message || 'The stage change failed — the opportunity stays where it was.'}
              </p>
            ) : null}
          </div>
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

      <section className="app-card pipeline-page__filters" aria-label="Pipeline filters">
        <div className="pipeline-page__filters-grid">
          <label className="field">
            <span className="field__label" htmlFor="pipeline-search">
              Search
            </span>
            <input
              id="pipeline-search"
              className="field__input"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Contact, company, value"
            />
          </label>
          <SelectField
            id="pipeline-owner"
            label="Owner"
            value={ownerFilter}
            onChange={(event) => setOwnerFilter(event.target.value)}
          >
            <option value="">All owners</option>
            {[...members.entries()].map(([id, name]) => (
              <option key={id} value={id}>
                {name}
              </option>
            ))}
            <option value="unassigned">Unassigned</option>
          </SelectField>
          {lastMove ? (
            <Button variant="ghost" onClick={undoLastMove} loading={undoing} className="pipeline-page__undo">
              Undo last stage change
            </Button>
          ) : null}
        </div>
      </section>

      <Tabs
        value={view}
        onChange={setView}
        className="pipeline-page__tabs"
        items={[
          {
            id: 'board',
            label: 'Board view',
            content: (
              <div className="pipeline-page__board">
                {summaryByStage.map((stage) => {
                  const items = rows.filter((item) => item.stage === stage.stage)
                  return (
                    <div
                      key={stage.stage}
                      className="pipeline-page__column"
                      onDragOver={(event) => event.preventDefault()}
                      onDrop={(event) => {
                        event.preventDefault()
                        const draggedId = event.dataTransfer.getData('text/opportunity-id') || sessionStorage.getItem('pipeline-drag-id')
                        if (draggedId) requestStageChange(draggedId, stage.stage)
                      }}
                    >
                      <div className="pipeline-page__column-head">
                        <strong>{stage.label}</strong>
                        <Badge tone="neutral">{items.length}</Badge>
                      </div>

                      <div className="pipeline-page__column-list">
                        {items.length === 0 ? (
                          <div className="pipeline-page__empty">No deals</div>
                        ) : (
                          items.map((opportunity) => {
                            const described = describeOpportunity(opportunity)
                            return (
                              <div
                                key={opportunity.id}
                                className={`pipeline-page__card ${selectedOpportunity?.id === opportunity.id ? 'is-selected' : ''}`}
                                draggable
                                onDragStart={(event) => {
                                  event.dataTransfer.effectAllowed = 'move'
                                  event.dataTransfer.setData('text/opportunity-id', opportunity.id)
                                  sessionStorage.setItem('pipeline-drag-id', opportunity.id)
                                  setSelectedId(opportunity.id)
                                }}
                                onClick={() => setSelectedId(opportunity.id)}
                              >
                                <div className="pipeline-page__card-header">
                                  <strong>{described.contactName}</strong>
                                  <span>{described.ownerName}</span>
                                </div>
                                <p>{described.companyName ?? 'No company linked'}</p>
                                <div className="pipeline-page__card-meta">
                                  <strong>
                                    {opportunityValue(opportunity) ?? 'No value set'}
                                  </strong>
                                  <span>{described.sourceName ?? 'No source campaign'}</span>
                                </div>
                                <div className="pipeline-page__card-footer">
                                  <small>{described.age == null ? 'age n/a' : `${described.age}d`}</small>
                                  <div className="pipeline-page__card-actions">
                                    <Link
                                      to={`/app/pipeline/${opportunity.id}`}
                                      onClick={(event) => event.stopPropagation()}
                                    >
                                      Detail
                                    </Link>
                                    <button
                                      type="button"
                                      onClick={(event) => {
                                        event.stopPropagation()
                                        const stages = Object.keys(OPPORTUNITY_STAGES)
                                        const next =
                                          stages[
                                            Math.min(stages.indexOf(opportunity.stage) + 1, stages.length - 1)
                                          ]
                                        requestStageChange(opportunity.id, next)
                                      }}
                                    >
                                      Advance
                                    </button>
                                  </div>
                                </div>
                              </div>
                            )
                          })
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            ),
          },
          {
            id: 'table',
            label: 'Table view',
            count: rows.length,
            content: (
              <div className="app-card pipeline-page__table-wrap">
                <table className="pipeline-page__table">
                  <thead>
                    <tr>
                      <th>Contact</th>
                      <th>Company</th>
                      <th>Stage</th>
                      <th>Owner</th>
                      <th>Value</th>
                      <th>Source</th>
                      <th>Age</th>
                      <th>Close date</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.length === 0 ? (
                      <tr>
                        <td colSpan={8} className="pipeline-page__empty">
                          No opportunities match the filters.
                        </td>
                      </tr>
                    ) : (
                      rows.map((opportunity) => {
                        const described = describeOpportunity(opportunity)
                        const stageMeta = OPPORTUNITY_STAGES[opportunity.stage] ?? OPPORTUNITY_STAGES.new
                        return (
                          <tr
                            key={opportunity.id}
                            onClick={() => setSelectedId(opportunity.id)}
                            className={selectedOpportunity?.id === opportunity.id ? 'is-selected' : ''}
                          >
                            <td>
                              {described.contactLinked ? (
                                <Link to={`/app/contacts/${opportunity.contactId}`}>
                                  {described.contactName}
                                </Link>
                              ) : (
                                described.contactName
                              )}
                            </td>
                            <td>{described.companyName ?? '—'}</td>
                            <td>
                              <Badge tone={stageMeta.tone}>{stageMeta.label}</Badge>
                            </td>
                            <td>{described.ownerName}</td>
                            <td>{opportunityValue(opportunity) ?? '—'}</td>
                            <td>{described.sourceName ?? '—'}</td>
                            <td>{described.age == null ? '—' : `${described.age}d`}</td>
                            <td>
                              {opportunity.expectedCloseDate
                                ? formatDate(opportunity.expectedCloseDate)
                                : '—'}
                            </td>
                          </tr>
                        )
                      })
                    )}
                  </tbody>
                </table>
              </div>
            ),
          },
        ]}
      />

      {selectedOpportunity ? (
        <section className="app-card pipeline-page__detail">
          <div className="pipeline-page__detail-header">
            <div>
              <p className="eyebrow">Opportunity details</p>
              <h3>{describeOpportunity(selectedOpportunity).contactName}</h3>
            </div>
            <div className="pipeline-page__detail-actions">
              <Link to={`/app/pipeline/${selectedOpportunity.id}`} className="pipeline-page__detail-link">
                Open detail
              </Link>
              <Button
                variant="outline"
                onClick={() => {
                  const stages = Object.keys(OPPORTUNITY_STAGES)
                  const next = stages[Math.min(stages.indexOf(selectedOpportunity.stage) + 1, stages.length - 1)]
                  requestStageChange(selectedOpportunity.id, next)
                }}
              >
                Advance stage
              </Button>
            </div>
          </div>

          <div className="pipeline-page__detail-grid">
            <div className="pipeline-page__detail-card">
              <dl>
                <div>
                  <dt>Company</dt>
                  <dd>
                    {describeOpportunity(selectedOpportunity).companyLinked ? (
                      <Link to={`/app/companies/${selectedOpportunity.companyId}`}>
                        {describeOpportunity(selectedOpportunity).companyName}
                      </Link>
                    ) : (
                      describeOpportunity(selectedOpportunity).companyName ?? 'No company linked'
                    )}
                  </dd>
                </div>
                <div>
                  <dt>Contact</dt>
                  <dd>
                    {describeOpportunity(selectedOpportunity).contactLinked ? (
                      <Link to={`/app/contacts/${selectedOpportunity.contactId}`}>
                        {describeOpportunity(selectedOpportunity).contactName}
                      </Link>
                    ) : (
                      describeOpportunity(selectedOpportunity).contactName
                    )}
                  </dd>
                </div>
                <div>
                  <dt>Owner</dt>
                  <dd>{describeOpportunity(selectedOpportunity).ownerName}</dd>
                </div>
                <div>
                  <dt>Source campaign</dt>
                  <dd>{describeOpportunity(selectedOpportunity).sourceName ?? 'No source campaign'}</dd>
                </div>
                <div>
                  <dt>Value</dt>
                  <dd>{opportunityValue(selectedOpportunity) ?? 'No value set'}</dd>
                </div>
                <div>
                  <dt>Age</dt>
                  <dd>
                    {describeOpportunity(selectedOpportunity).age == null
                      ? 'n/a'
                      : `${describeOpportunity(selectedOpportunity).age} days`}
                  </dd>
                </div>
                <div>
                  <dt>Expected close</dt>
                  <dd>
                    {selectedOpportunity.expectedCloseDate
                      ? formatDate(selectedOpportunity.expectedCloseDate)
                      : 'No date set'}
                  </dd>
                </div>
              </dl>
            </div>

            <div className="pipeline-page__detail-card">
              <SelectField
                id="pipeline-stage-select"
                label="Stage"
                value={selectedOpportunity.stage}
                onChange={(event) => requestStageChange(selectedOpportunity.id, event.target.value)}
              >
                {Object.entries(OPPORTUNITY_STAGES).map(([value, meta]) => (
                  <option key={value} value={value}>
                    {meta.label}
                  </option>
                ))}
              </SelectField>

              <TextareaField
                id="pipeline-notes"
                label="Notes / won-lost reason"
                rows={3}
                value={notesDraft || selectedOpportunity.notes || ''}
                onChange={(event) => setNotesDraft(event.target.value)}
                placeholder="Reasons for a win or loss live here."
              />
              <Button
                variant="ghost"
                size="sm"
                loading={notesSaving}
                onClick={saveNotes}
                disabled={!selectedOpportunity.notes && !notesDraft.trim()}
              >
                Save notes
              </Button>
            </div>
          </div>
        </section>
      ) : null}

      <section className="app-card pipeline-page__audit">
        <div className="pipeline-page__audit-header">
          <div>
            <p className="eyebrow">Audit trail</p>
            <h3>Recent stage changes (live audit log)</h3>
          </div>
        </div>

        <ul className="pipeline-page__audit-list">
          {audit.length === 0 ? (
            <li className="pipeline-page__empty">
              No stage changes recorded yet — move a card to create the first audited entry.
            </li>
          ) : (
            audit.map((entry) => {
              const before = entry?.before_data?.stage
              const after = entry?.after_data?.stage
              const movedLabel = contacts.get(
                page.items.find((item) => item.id === entry.entity_id)?.contactId ?? '',
              )?.name
              return (
                <li key={entry.id}>
                  <span>{formatDate(entry.created_at)}</span>
                  <strong>
                    {members.get(entry.actor_id) ?? 'Unknown member'} moved{' '}
                    {movedLabel ?? 'an opportunity'}{' '}
                    {before ? `from ${OPPORTUNITY_STAGES[before]?.label ?? before} ` : ''}
                    {after ? `to ${OPPORTUNITY_STAGES[after]?.label ?? after}` : ''}
                  </strong>
                </li>
              )
            })
          )}
        </ul>
      </section>
    </div>
  )
}
