import { useEffect, useMemo, useState } from 'react'
import { CheckboxField } from '../../../components/Field'
import { AlertTriangle, ArrowLeft, CheckCircle } from '../../../components/icons'
import {
  Badge,
  Button,
  EmptyState,
  ErrorPanel,
  Modal,
  Skeleton,
  StatusBadge,
  useToast,
} from '../../../components/ui'
import {
  CONTACT_SCAN_MAX,
  buildMergePlan,
  fetchContactsForView,
  groupDuplicateContacts,
  mergeDuplicateGroup,
} from '../../../lib/contactBulk'
import { formatContactDate, TAG_STORAGE_AVAILABLE } from '../../../lib/contacts'

function companyLabel(companyId, companyMap) {
  if (!companyId) return 'No company'
  return companyMap.get(companyId)?.name ?? 'Attached company'
}

function joinList(values) {
  if (values.length === 0) return ''
  if (values.length === 1) return values[0]
  if (values.length === 2) return `${values[0]} and ${values[1]}`
  return `${values.slice(0, -1).join(', ')}, and ${values.at(-1)}`
}

/**
 * Duplicate scanner and merge flow for T15.
 *
 * The API has no dedupe or merge endpoint, so this dialog scans the tenant's
 * contacts in the browser, groups them by normalised name plus company, and
 * merges a chosen group with one `PATCH` (survivor) and one `DELETE` per
 * duplicate. Both calls are audited by the existing contact routes.
 */
export function MergeDuplicatesModal({ open, companies = [], onClose, onMerged }) {
  const { toast } = useToast()
  const [status, setStatus] = useState('loading')
  const [error, setError] = useState(null)
  const [groups, setGroups] = useState([])
  const [total, setTotal] = useState(0)
  const [truncated, setTruncated] = useState(false)
  const [scanKey, setScanKey] = useState(0)
  const [view, setView] = useState('list')
  const [activeKey, setActiveKey] = useState(null)
  const [survivorId, setSurvivorId] = useState('')
  const [confirmed, setConfirmed] = useState(false)
  const [mergeRunning, setMergeRunning] = useState(false)
  const [mergeError, setMergeError] = useState(null)
  const [notice, setNotice] = useState(null)

  const companyMap = useMemo(
    () => new Map(companies.map((company) => [company.id, company])),
    [companies],
  )

  useEffect(() => {
    if (!open) return
    setNotice(null)
  }, [open])

  useEffect(() => {
    if (!open) return undefined

    const controller = new AbortController()
    setStatus('loading')
    setError(null)
    setView('list')
    setActiveKey(null)
    setMergeError(null)
    setConfirmed(false)

    fetchContactsForView({ signal: controller.signal, max: CONTACT_SCAN_MAX })
      .then((data) => {
        setGroups(groupDuplicateContacts(data.items))
        setTotal(data.total)
        setTruncated(data.truncated)
        setStatus('ready')
      })
      .catch((caught) => {
        if (caught?.name === 'AbortError') return
        setError(caught)
        setStatus('error')
      })

    return () => controller.abort()
  }, [open, scanKey])

  const activeGroup = groups.find((group) => group.key === activeKey) ?? null
  const survivor =
    activeGroup?.contacts.find((contact) => contact.id === survivorId) ??
    activeGroup?.contacts[0] ??
    null
  const duplicates = activeGroup
    ? activeGroup.contacts.filter((contact) => contact.id !== survivor?.id)
    : []
  const plan =
    activeGroup && survivor ? buildMergePlan(survivor, duplicates) : null

  function openGroup(group) {
    setActiveKey(group.key)
    setSurvivorId(group.contacts[0]?.id ?? '')
    setConfirmed(false)
    setMergeError(null)
    setView('detail')
  }

  function chooseSurvivor(contactId) {
    setSurvivorId(contactId)
    setConfirmed(false)
    setMergeError(null)
  }

  function backToList() {
    setView('list')
    setActiveKey(null)
    setMergeError(null)
    setConfirmed(false)
  }

  async function handleMerge() {
    if (!activeGroup || !survivor || duplicates.length === 0) return

    setMergeRunning(true)
    setMergeError(null)

    try {
      const result = await mergeDuplicateGroup({ survivor, duplicates })
      const label = survivor.fullName || survivor.email

      if (result.failed.length > 0) {
        const reason =
          result.failed[0]?.error?.message || 'A duplicate could not be deleted.'
        const message = `${result.deleted.length} of ${result.total} duplicates removed from ${label}. ${result.failed.length} failed: ${reason}`
        setNotice({ tone: 'warning', text: message })
        toast.warning(message)
      } else {
        const message = `Merged ${result.total} duplicate${
          result.total === 1 ? '' : 's'
        } into ${label}.`
        setNotice({ tone: 'success', text: message })
        toast.success(message)
      }

      onMerged?.()
      setScanKey((key) => key + 1)
    } catch (caught) {
      setMergeError(caught)
      toast.error(caught?.message || 'The merge could not be completed.')
    } finally {
      setMergeRunning(false)
    }
  }

  const detailOpen = status === 'ready' && view === 'detail' && activeGroup
  const errorMessage = typeof mergeError === 'string' ? mergeError : mergeError?.message

  const footer = detailOpen ? (
    <>
      <Button variant="ghost" onClick={backToList} disabled={mergeRunning}>
        Back to groups
      </Button>
      <Button
        variant="danger"
        onClick={handleMerge}
        loading={mergeRunning}
        disabled={!confirmed || duplicates.length === 0}
      >
        {errorMessage
          ? 'Try again'
          : `Merge ${duplicates.length} duplicate${duplicates.length === 1 ? '' : 's'}`}
      </Button>
    </>
  ) : (
    <Button variant="ghost" onClick={onClose}>
      Close
    </Button>
  )

  return (
    <Modal
      open={open}
      title={detailOpen ? 'Review merge' : 'Merge duplicates'}
      description={
        detailOpen
          ? 'Choose the record to keep. Blank fields are filled from the others, then the duplicates are deleted.'
          : 'Contacts that share a name and company are grouped here. Emails are unique, so duplicates usually appear under different addresses.'
      }
      size="lg"
      onClose={mergeRunning ? undefined : onClose}
      footer={footer}
    >
      {status === 'loading' ? (
        <div className="contacts__merge-loading" role="status">
          <p>Scanning contacts for duplicate names…</p>
          <Skeleton variant="text" lines={3} />
        </div>
      ) : null}

      {status === 'error' ? (
        <ErrorPanel
          compact
          title="Couldn’t scan for duplicates"
          description={error?.message || undefined}
          requestId={error?.requestId}
          onRetry={() => setScanKey((key) => key + 1)}
        />
      ) : null}

      {status === 'ready' && view === 'list' ? (
        <div className="contacts__merge">
          {notice ? (
            <p
              className={`contacts__merge-alert contacts__merge-alert--${notice.tone}`}
              role="status"
            >
              {notice.text}
            </p>
          ) : null}

          <div className="contacts__merge-summary">
            <p>
              <strong>{groups.length}</strong>{' '}
              {groups.length === 1 ? 'duplicate group' : 'duplicate groups'} across{' '}
              <strong>{total.toLocaleString()}</strong>{' '}
              {total === 1 ? 'contact' : 'contacts'} scanned.
            </p>
            {truncated ? (
              <p className="contacts__merge-caption">
                This scan stops at {CONTACT_SCAN_MAX.toLocaleString()} contacts. Groups
                beyond that are not shown.
              </p>
            ) : null}
          </div>

          {groups.length === 0 ? (
            <EmptyState
              compact
              icon={CheckCircle}
              title="No duplicate names found"
              description="No two contacts share the same normalised name and company. Duplicates usually appear when the same person is imported under a different email address."
            />
          ) : (
            <ul className="contacts__merge-groups">
              {groups.map((group) => (
                <li key={group.key} className="contacts__merge-group">
                  <div className="contacts__merge-group-main">
                    <p className="contacts__merge-group-name">
                      {group.contacts[0].fullName}
                    </p>
                    <p className="contacts__merge-group-meta">
                      {companyLabel(group.companyId, companyMap)} ·{' '}
                      {group.contacts.length} records
                    </p>
                    <ul className="contacts__merge-emails">
                      {group.contacts.map((contact) => (
                        <li key={contact.id}>
                          <span>{contact.email}</span>
                          <StatusBadge status={contact.status} size="sm" dot={false} />
                        </li>
                      ))}
                    </ul>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => openGroup(group)}
                    className="contacts__merge-review"
                  >
                    Review merge
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}

      {detailOpen ? (
        <div className="contacts__merge">
          <button
            type="button"
            className="contacts__merge-back"
            onClick={backToList}
            disabled={mergeRunning}
          >
            <ArrowLeft size={14} aria-hidden="true" />
            All duplicate groups
          </button>

          <div className="contacts__merge-detail-head">
            <p className="contacts__merge-group-name">{survivor?.fullName}</p>
            <p className="contacts__merge-group-meta">
              {companyLabel(activeGroup.companyId, companyMap)} ·{' '}
              {activeGroup.contacts.length} records
            </p>
          </div>

          <fieldset className="contacts__merge-pick" disabled={mergeRunning}>
            <legend>Choose the record to keep</legend>
            {activeGroup.contacts.map((contact) => {
              const selected = contact.id === survivor?.id
              return (
                <label
                  key={contact.id}
                  className={`contacts__merge-option${selected ? ' is-selected' : ''}`}
                >
                  <input
                    type="radio"
                    name="merge-survivor"
                    value={contact.id}
                    checked={selected}
                    onChange={() => chooseSurvivor(contact.id)}
                  />
                  <span className="contacts__merge-option-body">
                    <span className="contacts__merge-option-name">
                      {contact.fullName}
                    </span>
                    <span className="contacts__merge-option-email">{contact.email}</span>
                    <span className="contacts__merge-option-meta">
                      Created {formatContactDate(contact.createdAt) ?? 'on an unknown date'}
                      {contact.title ? ` · ${contact.title}` : ''}
                    </span>
                  </span>
                  <span className="contacts__merge-option-side">
                    <StatusBadge status={contact.status} size="sm" />
                    <Badge tone={selected ? 'success' : 'warning'} size="sm" dot>
                      {selected ? 'Keep' : 'Delete'}
                    </Badge>
                  </span>
                </label>
              )
            })}
          </fieldset>

          <div className="contacts__merge-preview">
            <h3>What this merge does</h3>
            <ul>
              {plan?.filledFields.length > 0 ? (
                <li>
                  Fills the survivor’s {joinList(plan.filledFields)} from the other
                  records.
                </li>
              ) : (
                <li>The survivor already has values in every shared field.</li>
              )}
              {plan?.customFields.length > 0 ? (
                <li>Adds custom fields: {joinList(plan.customFields)}.</li>
              ) : null}
              <li>
                {TAG_STORAGE_AVAILABLE
                  ? 'Combines browser-side tags and deletes '
                  : 'Deletes '}
                {duplicates.length === 1 ? '1 duplicate' : `${duplicates.length} duplicates`}.
              </li>
              <li>
                Related campaigns, opportunities, tasks, and activities are not moved by
                this API build.
              </li>
            </ul>
          </div>

          <p className="contacts__merge-warning">
            <AlertTriangle size={16} aria-hidden="true" />
            <span>
              Deleting duplicates is permanent. This API build has no merge endpoint or
              30-day undo.
            </span>
          </p>

          <CheckboxField
            id="merge-confirm"
            checked={confirmed}
            onChange={(event) => setConfirmed(event.target.checked)}
            disabled={mergeRunning}
          >
            I understand the {duplicates.length === 1 ? 'duplicate' : 'duplicates'} will be
            deleted permanently.
          </CheckboxField>

          {errorMessage ? (
            <p className="contacts__bulk-error" role="alert">
              {errorMessage}
            </p>
          ) : null}

          <p className="contacts__merge-note">
            The survivor update and each deletion are written to the audit log as{' '}
            <code>contact.updated</code> and <code>contact.deleted</code>.
          </p>
        </div>
      ) : null}
    </Modal>
  )
}
