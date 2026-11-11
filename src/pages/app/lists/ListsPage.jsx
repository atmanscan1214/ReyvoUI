import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import {
  Copy,
  List as ListIcon,
  Lock,
  Pencil,
  Plus,
  Refresh,
  Send,
  Tag as TagIcon,
  Trash,
} from '../../../components/icons'
import {
  Badge,
  Button,
  ConfirmDialog,
  DataTable,
  EmptyState,
  ErrorPanel,
  PageHeader,
  Skeleton,
  Tabs,
  useToast,
} from '../../../components/ui'
import {
  TAG_STORAGE_AVAILABLE,
  formatContactDate,
  getAllContactTags,
  loadContactCompanies,
} from '../../../lib/contacts'
import {
  createContactList,
  deleteContactList,
  listContactLists,
} from '../../../lib/lists'
import {
  countSegment,
  definitionListIds,
  deleteSavedSegment,
  describeDefinition,
  duplicateSavedSegment,
  hydrateListMembership,
  listSavedSegments,
  loadAudienceSnapshot,
  saveSavedSegment,
} from '../../../lib/segments'
import { collectContactTags } from '../../../lib/tags'
import {
  clearPendingAudience,
  readPendingAudience,
  savePendingAudience,
} from '../../../lib/audience'
import { useSession } from '../../../lib/session'
import { usePageTitle } from '../../../lib/usePageTitle'
import { ListDetailView } from './ListDetailView'
import { ListFormModal } from './ListFormModal'
import { SegmentBuilder } from './SegmentBuilder'
import { TagManager } from './TagManager'
import './lists.css'

function plural(count, singular, pluralForm = `${singular}s`) {
  return `${count.toLocaleString()} ${count === 1 ? singular : pluralForm}`
}

function sortLists(lists) {
  return [...lists].sort((left, right) => left.name.localeCompare(right.name))
}

export function ListsPage() {
  usePageTitle('Lists & segments')

  const { role, profileStatus } = useSession()
  const { toast } = useToast()
  const [params, setParams] = useSearchParams()

  const tabParam = params.get('tab')
  const tab = ['lists', 'segments', 'tags'].includes(tabParam) ? tabParam : 'lists'
  const listId = params.get('list') ?? ''
  const segmentParam = params.get('segment') ?? ''

  const roleKnown = profileStatus === 'ready'
  const canWrite = roleKnown && (role === 'owner' || role === 'admin')

  const [lists, setLists] = useState([])
  const [listsStatus, setListsStatus] = useState('loading')
  const [listsError, setListsError] = useState(null)
  const [listsKey, setListsKey] = useState(0)

  const [companies, setCompanies] = useState([])

  const [segments, setSegments] = useState(() => listSavedSegments())
  const [tagsKey, setTagsKey] = useState(0)

  const [snapshot, setSnapshot] = useState(null)
  const [snapshotStatus, setSnapshotStatus] = useState('idle')
  const [snapshotError, setSnapshotError] = useState(null)
  const [snapshotKey, setSnapshotKey] = useState(0)

  const [pending, setPending] = useState(() => readPendingAudience())
  const [createOpen, setCreateOpen] = useState(false)
  const [createRunning, setCreateRunning] = useState(false)
  const [createError, setCreateError] = useState(null)
  const [listDeleteTarget, setListDeleteTarget] = useState(null)
  const [listDeleteRunning, setListDeleteRunning] = useState(false)
  const [segmentDeleteTarget, setSegmentDeleteTarget] = useState(null)
  const [saveRunning, setSaveRunning] = useState(false)
  const [saveError, setSaveError] = useState(null)

  function patchParams(patch, options = {}) {
    const next = new URLSearchParams(params)
    for (const [key, value] of Object.entries(patch)) {
      if (value === undefined || value === null || value === '') next.delete(key)
      else next.set(key, String(value))
    }
    setParams(next, options)
  }

  function changeTab(nextTab) {
    const next = new URLSearchParams(params)
    if (nextTab === 'lists') next.delete('tab')
    else next.set('tab', nextTab)
    next.delete('list')
    next.delete('segment')
    next.delete('page')
    setParams(next)
  }

  function openList(id) {
    patchParams({ tab: 'lists', list: id, segment: null, page: null })
  }

  function backToList() {
    patchParams({ list: null, page: null })
  }

  function openSegment(id) {
    patchParams({ tab: 'segments', segment: id, list: null, page: null })
  }

  function backToSegments() {
    patchParams({ segment: null })
  }

  useEffect(() => {
    const controller = new AbortController()
    setListsStatus('loading')
    setListsError(null)

    listContactLists(controller.signal)
      .then((data) => {
        setLists(sortLists(data))
        setListsStatus('ready')
      })
      .catch((caught) => {
        if (caught?.name === 'AbortError') return
        setListsError(caught)
        setListsStatus('error')
      })

    return () => controller.abort()
  }, [listsKey])

  useEffect(() => {
    const controller = new AbortController()
    loadContactCompanies(controller.signal)
      .then(setCompanies)
      .catch(() => {})
    return () => controller.abort()
  }, [])

  useEffect(() => {
    setSegments(listSavedSegments())
  }, [tab])

  const activeList = listId ? lists.find((list) => list.id === listId) ?? null : null
  const builderSegment =
    segmentParam && segmentParam !== 'new'
      ? segments.find((segment) => segment.id === segmentParam) ?? null
      : null
  const builderOpen = tab === 'segments' && Boolean(segmentParam)

  const referencedListIds = useMemo(() => {
    const ids = new Set()
    for (const segment of segments) {
      for (const id of definitionListIds(segment.definition)) ids.add(id)
    }
    return [...ids]
  }, [segments])
  const referencedListKey = referencedListIds.slice().sort().join('|')

  const needsSnapshot = tab === 'segments' || tab === 'tags'
  const listsReady = listsStatus === 'ready'

  useEffect(() => {
    if (!needsSnapshot) return undefined
    if (tab === 'segments' && !listsReady) return undefined

    const controller = new AbortController()
    setSnapshotStatus('loading')
    setSnapshotError(null)

    const contextLists =
      tab === 'segments'
        ? lists.filter((list) => referencedListIds.includes(list.id))
        : []

    loadAudienceSnapshot({ lists: contextLists, signal: controller.signal })
      .then((data) => {
        setSnapshot(data)
        setSnapshotStatus('ready')
      })
      .catch((caught) => {
        if (caught?.name === 'AbortError') return
        setSnapshotError(caught)
        setSnapshotStatus('error')
      })

    return () => controller.abort()
    // The joined key intentionally tracks list membership, not array identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [needsSnapshot, tab, snapshotKey, listsKey, referencedListKey, listsReady])

  const ensureListMembership = useCallback(
    (ids) => {
      if (!snapshot || !ids?.length) return
      const missing = ids.filter((id) => !snapshot.listMembership.has(String(id)))
      if (missing.length === 0) return

      hydrateListMembership(snapshot, missing)
        .then((next) => {
          if (next && next !== snapshot) setSnapshot(next)
        })
        .catch((caught) => {
          toast.error(caught?.message || 'Some list membership could not be loaded.')
        })
    },
    [snapshot, toast],
  )

  const segmentCounts = useMemo(() => {
    const counts = new Map()
    if (!snapshot) return counts
    for (const segment of segments) {
      counts.set(segment.id, countSegment(segment.definition, snapshot).count)
    }
    return counts
  }, [segments, snapshot])

  const tagsByContact = snapshot?.tagsByContact ?? getAllContactTags()
  const tagGroups = useMemo(
    () => collectContactTags(tagsByContact),
    [tagsByContact, tagsKey],
  )

  function refreshLists() {
    setListsKey((key) => key + 1)
  }

  function refreshSegments() {
    setSegments(listSavedSegments())
  }

  function handleTagsChanged() {
    const next = getAllContactTags()
    setTagsKey((key) => key + 1)
    setSnapshot((current) =>
      current ? { ...current, tagsByContact: next } : current,
    )
  }

  async function handleCreateList(values) {
    setCreateRunning(true)
    setCreateError(null)
    try {
      const created = await createContactList(values)
      setLists((current) => sortLists([...current, created]))
      refreshLists()
      setCreateOpen(false)
      toast.success(`List “${created.name}” created.`)
      openList(created.id)
    } catch (caught) {
      setCreateError(caught)
    } finally {
      setCreateRunning(false)
    }
  }

  async function handleDeleteList() {
    if (!listDeleteTarget) return
    setListDeleteRunning(true)
    try {
      await deleteContactList(listDeleteTarget.id)
      setLists((current) =>
        current.filter((list) => list.id !== listDeleteTarget.id),
      )
      if (listId === listDeleteTarget.id) backToList()
      if (pending?.type === 'list' && pending.id === listDeleteTarget.id) {
        clearPendingAudience()
        setPending(null)
      }
      toast.success(`List “${listDeleteTarget.name}” deleted.`)
      setListDeleteTarget(null)
      refreshLists()
    } catch (caught) {
      toast.error(caught?.message || 'The list could not be deleted.')
    } finally {
      setListDeleteRunning(false)
    }
  }

  function handleDeleteSegment() {
    if (!segmentDeleteTarget) return
    const target = segmentDeleteTarget
    deleteSavedSegment(target.id)
    refreshSegments()
    if (segmentParam === target.id) backToSegments()
    if (pending?.type === 'segment' && pending.id === target.id) {
      clearPendingAudience()
      setPending(null)
    }
    toast.success(`Segment “${target.name}” deleted.`)
    setSegmentDeleteTarget(null)
  }

  function handleUseList(list) {
    try {
      const record = savePendingAudience({
        type: 'list',
        id: list.id,
        name: list.name,
        count: list.contactCount,
      })
      setPending(record)
      toast.success(`“${list.name}” is set as the next campaign audience.`)
    } catch (caught) {
      toast.error(caught?.message || 'The audience could not be selected.')
    }
  }

  function handleUseSegment(segment) {
    try {
      const count = segmentCounts.get(segment.id) ?? 0
      const record = savePendingAudience({
        type: 'segment',
        id: segment.id,
        name: segment.name,
        count,
      })
      setPending(record)
      toast.success(`“${segment.name}” is set as the next campaign audience.`)
    } catch (caught) {
      toast.error(caught?.message || 'The audience could not be selected.')
    }
  }

  function handleClearPending() {
    clearPendingAudience()
    setPending(null)
    toast.info('The pending campaign audience was cleared.')
  }

  async function handleSaveSegment(draft) {
    setSaveRunning(true)
    setSaveError(null)
    try {
      const record = saveSavedSegment(draft)
      refreshSegments()
      toast.success(
        draft.id
          ? `Segment “${record.name}” saved.`
          : `Segment “${record.name}” created.`,
      )
      backToSegments()
    } catch (caught) {
      setSaveError(caught)
    } finally {
      setSaveRunning(false)
    }
  }

  function handleDuplicateSegment(segment) {
    try {
      const copy = duplicateSavedSegment(segment.id)
      refreshSegments()
      toast.success(`Segment duplicated as “${copy.name}”.`)
      openSegment(copy.id)
    } catch (caught) {
      toast.error(caught?.message || 'The segment could not be duplicated.')
    }
  }

  const listColumns = [
    {
      key: 'name',
      header: 'List',
      render: (row) => (
        <div className="lists__name-cell">
          <span className="lists__name">{row.name}</span>
          {row.description ? (
            <span className="lists__description">{row.description}</span>
          ) : null}
        </div>
      ),
    },
    {
      key: 'contactCount',
      header: 'Contacts',
      align: 'right',
      width: 110,
      render: (row) => (
        <span className="lists__count">{row.contactCount.toLocaleString()}</span>
      ),
    },
    {
      key: 'createdAt',
      header: 'Created',
      render: (row) => formatContactDate(row.createdAt) ?? '—',
    },
    {
      key: 'actions',
      header: '',
      align: 'right',
      width: 190,
      render: (row) => (
        <div className="lists__row-actions">
          <button
            type="button"
            className="lists__row-action lists__row-action--send"
            onClick={(event) => {
              event.stopPropagation()
              handleUseList(row)
            }}
            disabled={row.contactCount === 0}
            title={
              row.contactCount === 0
                ? 'Add contacts before using this list as an audience'
                : 'Select this list as the next campaign audience'
            }
          >
            <Send size={14} aria-hidden="true" />
            Use
          </button>
          {canWrite ? (
            <button
              type="button"
              className="lists__icon-button lists__icon-button--danger"
              onClick={(event) => {
                event.stopPropagation()
                setListDeleteTarget(row)
              }}
              aria-label={`Delete ${row.name}`}
              title="Delete list"
            >
              <Trash size={15} />
            </button>
          ) : null}
        </div>
      ),
    },
  ]

  const segmentColumns = [
    {
      key: 'name',
      header: 'Segment',
      render: (row) => (
        <div className="lists__name-cell">
          <span className="lists__name">{row.name}</span>
          {row.description ? (
            <span className="lists__description">{row.description}</span>
          ) : null}
        </div>
      ),
    },
    {
      key: 'definition',
      header: 'Rules',
      render: (row) => {
        const summary = describeDefinition(row.definition, {
          companyMap: snapshot?.companyMap,
          lists,
        })
        return (
          <span className={`lists__definition${summary ? '' : ' lists__muted'}`}>
            {summary || 'No complete rules'}
          </span>
        )
      },
    },
    {
      key: 'count',
      header: 'Est. audience',
      align: 'right',
      width: 130,
      render: (row) => {
        if (snapshotStatus === 'loading' || snapshotStatus === 'idle') {
          return <Skeleton variant="text" width={44} />
        }
        if (snapshotStatus === 'error') return <span className="lists__muted">—</span>
        return (
          <span
            className="lists__count"
            title="Estimated from up to 5,000 scanned contacts"
          >
            {(segmentCounts.get(row.id) ?? 0).toLocaleString()}
          </span>
        )
      },
    },
    {
      key: 'updatedAt',
      header: 'Updated',
      render: (row) => formatContactDate(row.updatedAt) ?? '—',
    },
    {
      key: 'actions',
      header: '',
      align: 'right',
      width: 160,
      render: (row) => {
        const count = segmentCounts.get(row.id) ?? 0
        return (
          <div className="lists__row-actions">
            <button
              type="button"
              className="lists__icon-button"
              onClick={(event) => {
                event.stopPropagation()
                handleUseSegment(row)
              }}
              disabled={snapshotStatus !== 'ready' || count === 0}
              aria-label={`Use ${row.name} in a campaign`}
              title={
                count === 0
                  ? 'This segment has no matching contacts right now'
                  : 'Select this segment as the next campaign audience'
              }
            >
              <Send size={15} />
            </button>
            <button
              type="button"
              className="lists__icon-button"
              onClick={(event) => {
                event.stopPropagation()
                openSegment(row.id)
              }}
              aria-label={`Edit ${row.name}`}
              title="Edit segment"
            >
              <Pencil size={15} />
            </button>
            <button
              type="button"
              className="lists__icon-button"
              onClick={(event) => {
                event.stopPropagation()
                handleDuplicateSegment(row)
              }}
              aria-label={`Duplicate ${row.name}`}
              title="Duplicate segment"
            >
              <Copy size={15} />
            </button>
            {canWrite ? (
              <button
                type="button"
                className="lists__icon-button lists__icon-button--danger"
                onClick={(event) => {
                  event.stopPropagation()
                  setSegmentDeleteTarget(row)
                }}
                aria-label={`Delete ${row.name}`}
                title="Delete segment"
              >
                <Trash size={15} />
              </button>
            ) : null}
          </div>
        )
      },
    },
  ]

  function renderListsTab() {
    if (listId) {
      if (activeList) {
        return (
          <ListDetailView
            key={activeList.id}
            list={activeList}
            companies={companies}
            canWrite={canWrite}
            onBack={backToList}
            onChanged={refreshLists}
            onRequestDelete={setListDeleteTarget}
            onUseInCampaign={handleUseList}
          />
        )
      }

      if (listsStatus === 'loading') {
        return (
          <section className="app-card lists__loading" role="status">
            <Skeleton variant="text" width="36%" height={26} />
            <Skeleton variant="text" lines={2} />
            <Skeleton variant="rect" height={180} />
          </section>
        )
      }

      return (
        <section className="app-card lists__not-found">
          <span className="lists__not-found-icon" aria-hidden="true">
            <ListIcon size={22} />
          </span>
          <h2>List not found</h2>
          <p>
            This list may have been deleted or belong to another workspace. Choose
            another list to continue.
          </p>
          <Button variant="ghost" onClick={backToList}>
            Back to lists
          </Button>
        </section>
      )
    }

    return (
      <div className="lists__tab">
        <div className="lists__tab-summary">
          <p>
            <strong>{lists.length}</strong>{' '}
            {lists.length === 1 ? 'static list' : 'static lists'} ·{' '}
            <strong>
              {lists
                .reduce((sum, list) => sum + list.contactCount, 0)
                .toLocaleString()}
            </strong>{' '}
            contact assignments
          </p>
          <p className="lists__tab-copy">
            A static list is a fixed set of contacts. Use one for an import or a
            one-off send; segment rules can also target a list.
          </p>
        </div>

        <DataTable
          caption="Static lists"
          columns={listColumns}
          rows={lists}
          getRowKey={(row) => row.id}
          loading={listsStatus === 'loading'}
          skeletonRows={4}
          error={listsStatus === 'error' ? listsError : null}
          onRetry={refreshLists}
          onRowClick={(row) => openList(row.id)}
          rowLabel={(row) => `Open ${row.name}`}
          empty={
            <EmptyState
              compact
              icon={ListIcon}
              title="No static lists yet"
              description="Create a list, then add contacts from its detail view. Lists stay fixed until you add or remove members."
              actions={
                canWrite ? (
                  <Button
                    variant="primary"
                    size="sm"
                    leadingIcon={Plus}
                    onClick={() => {
                      setCreateError(null)
                      setCreateOpen(true)
                    }}
                  >
                    Create your first list
                  </Button>
                ) : undefined
              }
            />
          }
        />
      </div>
    )
  }

  function renderSegmentsTab() {
    if (builderOpen) {
      if (segmentParam !== 'new' && !builderSegment) {
        return (
          <section className="app-card lists__not-found">
            <span className="lists__not-found-icon" aria-hidden="true">
              <ListIcon size={22} />
            </span>
            <h2>Segment not found</h2>
            <p>
              This segment may have been deleted from this browser. Choose another
              segment or create a new one.
            </p>
            <Button variant="ghost" onClick={backToSegments}>
              Back to segments
            </Button>
          </section>
        )
      }

      return (
        <SegmentBuilder
          key={segmentParam}
          initialSegment={builderSegment}
          lists={lists}
          companies={snapshot?.companies ?? companies}
          segments={segments}
          snapshot={snapshot}
          snapshotStatus={snapshotStatus}
          snapshotError={snapshotError}
          onRetrySnapshot={() => setSnapshotKey((key) => key + 1)}
          onEnsureListMembership={ensureListMembership}
          tagOptions={tagGroups.map((entry) => entry.tag)}
          saving={saveRunning}
          saveError={saveError}
          canWrite={canWrite}
          onCancel={backToSegments}
          onSave={handleSaveSegment}
          onDuplicate={handleDuplicateSegment}
          onRequestDelete={setSegmentDeleteTarget}
        />
      )
    }

    return (
      <div className="lists__tab">
        <div className="lists__tab-summary">
          <p>
            <strong>{segments.length}</strong>{' '}
            {segments.length === 1 ? 'saved segment' : 'saved segments'} ·{' '}
            <strong>{snapshotStatus === 'ready' ? 'live' : 'estimated'}</strong>{' '}
            audience preview
          </p>
          <p className="lists__tab-copy">
            Segments combine AND/OR groups of rules. Counts are estimated in the
            browser from up to 5,000 contacts because the API caps list pages at 100.
          </p>
        </div>

        {snapshotStatus === 'error' ? (
          <p className="lists__inline-warning" role="alert">
            Audience counts could not be loaded. The saved definitions are safe in
            this browser.
            <button type="button" onClick={() => setSnapshotKey((key) => key + 1)}>
              Try again
            </button>
          </p>
        ) : null}

        <DataTable
          caption="Saved segments"
          columns={segmentColumns}
          rows={segments}
          getRowKey={(row) => row.id}
          onRowClick={(row) => openSegment(row.id)}
          rowLabel={(row) => `Edit ${row.name}`}
          empty={
            <EmptyState
              compact
              icon={ListIcon}
              title="No saved segments yet"
              description="Build a segment from contact status, company, title, source, dates, list membership, and more. The preview updates as you add rules."
              actions={
                canWrite ? (
                  <Button
                    variant="primary"
                    size="sm"
                    leadingIcon={Plus}
                    onClick={() => openSegment('new')}
                  >
                    Build your first segment
                  </Button>
                ) : undefined
              }
            />
          }
        />

        <p className="lists__storage-note">
          <ListIcon size={14} aria-hidden="true" />
          This API build has no <code>/segments</code> route. Segments are stored in
          this browser under <code>reyvo.segments.v1</code>, and the campaign wizard
          reads the chosen audience through the shared contract. At launch, the
          wizard snapshots the matching contacts; later segment edits do not silently
          add people.
        </p>
      </div>
    )
  }

  function renderTagsTab() {
    return (
      <TagManager
        tagsByContact={tagsByContact}
        contacts={snapshot?.contacts ?? []}
        contactsStatus={snapshotStatus}
        canWrite={canWrite}
        onChanged={handleTagsChanged}
      />
    )
  }

  const tabItems = [
    {
      id: 'lists',
      label: 'Static lists',
      count: lists.length,
      content: renderListsTab(),
    },
    {
      id: 'segments',
      label: 'Segments',
      count: segments.length,
      content: renderSegmentsTab(),
    },
    {
      id: 'tags',
      label: 'Tags',
      count: TAG_STORAGE_AVAILABLE ? tagGroups.length : undefined,
      content: renderTagsTab(),
    },
  ]

  const headerActions = canWrite ? (
      tab === 'lists' && !listId ? (
        <Button
          variant="primary"
          leadingIcon={Plus}
          onClick={() => {
            setCreateError(null)
            setCreateOpen(true)
          }}
        >
          New list
        </Button>
      ) : tab === 'segments' && !segmentParam ? (
        <Button
          variant="primary"
          leadingIcon={Plus}
          onClick={() => openSegment('new')}
        >
          New segment
        </Button>
      ) : null
    ) : null

  return (
    <div className="app-page lists-page">
      <PageHeader
        eyebrow="Audience · Lists & segments"
        title="Lists & segments"
        description="Static collections for imports and one-off sends, plus saved AND/OR segments with an estimated audience count."
        meta={
          <>
            <Badge tone="neutral" dot>
              {plural(lists.length, 'list')}
            </Badge>
            <Badge tone="neutral" dot>
              {plural(segments.length, 'segment')}
            </Badge>
            {TAG_STORAGE_AVAILABLE && tagGroups.length > 0 ? (
              <Badge tone="neutral" dot>
                {plural(tagGroups.length, 'tag')}
              </Badge>
            ) : null}
            {roleKnown && !canWrite ? (
              <Badge tone="warning" dot>
                Read-only
              </Badge>
            ) : null}
          </>
        }
        actions={headerActions}
      />

      {roleKnown && !canWrite ? (
        <div className="lists__notice" role="status">
          <span className="lists__notice-icon" aria-hidden="true">
            <Lock size={17} />
          </span>
          <p>
            Your role can view lists, segments, and tags but not create or change
            them. Ask an owner or admin when an audience needs an update.
          </p>
        </div>
      ) : null}

      {pending ? (
        <div className="lists__pending" role="status">
          <span className="lists__pending-icon" aria-hidden="true">
            <Send size={17} />
          </span>
          <div className="lists__pending-copy">
            <p className="lists__pending-label">Next campaign audience</p>
            <p>
              <strong>{pending.name}</strong> · {pending.typeLabel} ·{' '}
              {plural(pending.count, 'contact')}
            </p>
            <p className="lists__pending-note">
              Saved for the campaign wizard, which will snapshot this audience at
              launch.
            </p>
          </div>
          <div className="lists__pending-actions">
            <Link className="btn btn--ghost btn--sm" to="/app/campaigns">
              Open campaigns
            </Link>
            <Button variant="quiet" size="sm" onClick={handleClearPending}>
              Clear
            </Button>
          </div>
        </div>
      ) : null}

      <Tabs
        items={tabItems}
        value={tab}
        onChange={changeTab}
        label="Lists, segments, and tags"
        panelClassName="lists__panel"
      />

      <ListFormModal
        open={createOpen}
        running={createRunning}
        error={createError}
        onClose={() => {
          if (createRunning) return
          setCreateOpen(false)
          setCreateError(null)
        }}
        onSave={handleCreateList}
      />

      <ConfirmDialog
        open={Boolean(listDeleteTarget)}
        title={`Delete “${listDeleteTarget?.name ?? ''}”?`}
        description="The contacts stay in the workspace. Only this list and its membership are removed."
        confirmLabel={listDeleteRunning ? 'Deleting…' : 'Delete list'}
        loading={listDeleteRunning}
        onConfirm={handleDeleteList}
        onCancel={() => {
          if (!listDeleteRunning) setListDeleteTarget(null)
        }}
      />

      <ConfirmDialog
        open={Boolean(segmentDeleteTarget)}
        title={`Delete “${segmentDeleteTarget?.name ?? ''}”?`}
        description="The saved definition is removed from this browser. Contacts and lists are not changed."
        confirmLabel="Delete segment"
        onConfirm={handleDeleteSegment}
        onCancel={() => setSegmentDeleteTarget(null)}
      />

      {snapshotStatus === 'error' && tab === 'tags' ? (
        <ErrorPanel
          compact
          title="Contact context could not be loaded"
          description="Tags are still stored in this browser, but contact names in the tag list need a contact scan."
          requestId={snapshotError?.requestId}
          onRetry={() => setSnapshotKey((key) => key + 1)}
        />
      ) : null}

      {!TAG_STORAGE_AVAILABLE && tab === 'tags' ? (
        <p className="lists__storage-note">
          <TagIcon size={14} aria-hidden="true" />
          Tags are not part of this API build, so production shows them as
          unavailable instead of pretending they persisted.
        </p>
      ) : null}

      <p className="lists__storage-note">
        <Refresh size={14} aria-hidden="true" />
        Lists are live API records. Segments and tags are browser-side compositions
        of the contact data this build exposes.
      </p>
    </div>
  )
}
