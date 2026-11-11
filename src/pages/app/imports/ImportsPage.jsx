import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  AlertCircle,
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Ban,
  CheckCircle,
  Clock,
  Database,
  FileText,
  Info,
  Lock,
  Refresh,
  Upload,
  Users,
} from '../../../components/icons'
import {
  Badge,
  Button,
  ConfirmDialog,
  DataTable,
  ErrorPanel,
  PageHeader,
  Skeleton,
  Stepper,
  Tabs,
  UploadDropzone,
  useToast,
} from '../../../components/ui'
import { SelectField } from '../../../components/Field'
import {
  IMPORT_FIELDS,
  IMPORT_LOOKUP_MAX,
  IMPORT_MODES,
  IMPORT_PREVIEW_LIMIT,
  IMPORT_REPORT_ROW_LIMIT,
  IMPORT_RESULT_LABELS,
  IMPORT_STEPS,
  IMPORT_TEMPLATE_FILENAME,
  ImportFileError,
  applyWorkspaceImportIndex,
  autoMapColumns,
  buildCanonicalCsv,
  buildImportOutcome,
  buildImportReportCsv,
  buildTemplateCsv,
  classifyImportRows,
  createImportRollbackRecord,
  downloadCsv,
  emptyImportMapping,
  formatRollbackWindow,
  importContactsCsv,
  importErrorCopy,
  importRowName,
  isRollbackOpen,
  loadWorkspaceImportIndex,
  readCsvFile,
  readImportRollbacks,
  removeImportRollback,
  rollbackImportContacts,
  rollbackWindowMs,
  saveImportRollback,
  updateExistingContacts,
  validateImportRows,
} from '../../../lib/imports'
import { useSession } from '../../../lib/session'
import { usePageTitle } from '../../../lib/usePageTitle'
import './imports.css'

const DATE_FORMAT = new Intl.DateTimeFormat(undefined, {
  dateStyle: 'medium',
  timeStyle: 'short',
})

function formatDateTime(value) {
  const date = new Date(value ?? 0)
  return Number.isFinite(date.getTime()) ? DATE_FORMAT.format(date) : 'Unknown time'
}

function plural(count, singular, pluralForm = `${singular}s`) {
  return `${count.toLocaleString()} ${count === 1 ? singular : pluralForm}`
}

function verbFor(count, singular, pluralForm) {
  return count === 1 ? singular : pluralForm
}

function ImportAlert({ tone = 'info', icon: Icon = Info, title, children }) {
  return (
    <div
      className={`imports__alert imports__alert--${tone}`}
      role={tone === 'danger' ? 'alert' : 'status'}
    >
      <span className="imports__alert-icon" aria-hidden="true">
        <Icon size={17} />
      </span>
      <div className="imports__alert-body">
        {title ? <p className="imports__alert-title">{title}</p> : null}
        <div className="imports__alert-copy">{children}</div>
      </div>
    </div>
  )
}

function ImportStat({ label, value, tone, hint }) {
  return (
    <div className={`imports__stat${tone ? ` imports__stat--${tone}` : ''}`}>
      <span className="imports__stat-label">{label}</span>
      <span className="imports__stat-value">{value}</span>
      {hint ? <span className="imports__stat-hint">{hint}</span> : null}
    </div>
  )
}

const NEUTRAL_RESULTS = new Set(['duplicate_in_file', 'existing_contact'])

function resultTone(result) {
  if (['imported', 'updated'].includes(result)) return 'success'
  if (result === 'sent') return 'info'
  if (['suppressed', 'review_existing', 'review_role', 'review_suppressed'].includes(result)) {
    return 'warning'
  }
  if (NEUTRAL_RESULTS.has(result)) return 'neutral'
  return 'danger'
}

function ResultBadge({ result }) {
  return (
    <Badge tone={resultTone(result)} size="sm" dot>
      {IMPORT_RESULT_LABELS[result] ?? 'Error'}
    </Badge>
  )
}

function reviewCategory(row) {
  if (row.planResult === 'invalid') return 'fix'
  if (row.planResult === 'duplicate_in_file') return 'duplicate'
  if (row.planResult === 'suppressed') return 'suppressed'
  if (row.planResult === 'existing_contact') return 'existing'
  if (row.planResult === 'update') return 'update'
  if (row.planResult?.startsWith('review_')) return 'review'
  return 'new'
}

function reviewBadge(row) {
  switch (row.planResult) {
    case 'invalid':
      return (
        <Badge tone="danger" size="sm" dot>
          Needs fix
        </Badge>
      )
    case 'duplicate_in_file':
      return (
        <Badge tone="warning" size="sm" dot>
          Duplicate
        </Badge>
      )
    case 'suppressed':
      return (
        <Badge tone="warning" size="sm" dot>
          Suppressed
        </Badge>
      )
    case 'existing_contact':
      return (
        <Badge tone="neutral" size="sm" dot>
          Existing
        </Badge>
      )
    case 'update':
      return (
        <Badge tone="info" size="sm" dot>
          Update
        </Badge>
      )
    case 'review_existing':
    case 'review_role':
    case 'review_suppressed':
      return (
        <Badge tone="info" size="sm" dot>
          Review
        </Badge>
      )
    default:
      return row.roleAddress ? (
        <Badge tone="warning" size="sm" dot>
          New · role
        </Badge>
      ) : (
        <Badge tone="success" size="sm" dot>
          New
        </Badge>
      )
  }
}

function ModePicker({ value, onChange, disabled, counts }) {
  return (
    <fieldset className="imports__modes" disabled={disabled}>
      <legend className="imports__label">What should happen to duplicates?</legend>
      <div className="imports__mode-grid">
        {IMPORT_MODES.map((mode) => (
          <label
            key={mode.id}
            className={`imports__mode${value === mode.id ? ' is-selected' : ''}`}
          >
            <input
              type="radio"
              name="import-mode"
              value={mode.id}
              checked={value === mode.id}
              onChange={() => onChange(mode.id)}
              disabled={disabled}
            />
            <span className="imports__mode-copy">
              <strong>{mode.label}</strong>
              <span>{mode.description}</span>
              {counts?.[mode.id] ? <em>{counts[mode.id]}</em> : null}
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  )
}

function ProgressPanel({ run }) {
  const stages = [
    { id: 'prepare', label: 'Prepare rows' },
    run.total > 0 ? { id: 'upload', label: 'Upload and validate rows' } : null,
    run.phase === 'updating' ? { id: 'update', label: 'Apply updates' } : null,
    { id: 'finish', label: 'Build report and rollback window' },
  ].filter(Boolean)

  const currentIndex = Math.max(
    0,
    stages.findIndex((stage) =>
      run.phase === 'preparing'
        ? stage.id === 'prepare'
        : run.phase === 'uploading'
          ? stage.id === 'upload'
          : run.phase === 'updating'
            ? stage.id === 'update'
            : stage.id === 'finish',
    ),
  )
  const within =
    run.phase === 'updating' && run.total > 0 ? Math.min(1, run.current / run.total) : 0.4
  const percent = Math.min(
    99,
    Math.round(((currentIndex + within) / Math.max(1, stages.length)) * 100),
  )

  const title =
    run.phase === 'updating'
      ? `Updating ${run.current.toLocaleString()} of ${run.total.toLocaleString()} contacts`
      : run.phase === 'uploading'
        ? 'Uploading and validating rows'
        : run.phase === 'finishing'
          ? 'Building the report'
          : 'Preparing rows'

  return (
    <div className="imports__progress" role="status" aria-live="polite">
      <div className="imports__progress-head">
        <div>
          <p className="eyebrow">Import progress</p>
          <strong>{title}</strong>
          <p>
            {run.phase === 'uploading'
              ? 'Reyvo is checking the file and creating contacts.'
              : 'Keep this tab open. The API completes the import in one request, so there is no server job to return to later.'}
          </p>
        </div>
        <span className="imports__progress-percent">{percent}%</span>
      </div>

      <div
        className="imports__progress-bar"
        role="progressbar"
        aria-label="Import progress"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
      >
        <span style={{ width: `${percent}%` }} />
      </div>

      <ol className="imports__progress-stages">
        {stages.map((stage, index) => {
          const state = index < currentIndex ? 'done' : index === currentIndex ? 'active' : 'queued'
          return (
            <li key={stage.id} data-state={state}>
              <span className="imports__progress-dot" aria-hidden="true">
                {state === 'done' ? <CheckCircle size={15} /> : index + 1}
              </span>
              {stage.label}
            </li>
          )
        })}
      </ol>
    </div>
  )
}

function RecentImports({ records, now, onRollback, onDismiss }) {
  if (records.length === 0) return null

  return (
    <section className="app-card imports__panel imports__recent">
      <div className="imports__step-head">
        <div>
          <h2>Recent imports</h2>
          <p>
            Rollback windows are kept in this browser for 24 hours. Deleting is refused for
            contacts that have since been contacted or have replied.
          </p>
        </div>
        <Badge tone="neutral" dot>
          Last {records.length}
        </Badge>
      </div>

      <ul className="imports__recent-list">
        {records.map((record) => {
          const open = isRollbackOpen(record, now)
          const remaining = rollbackWindowMs(record, now)
          const rolledBack = record.status === 'rolled_back' || record.status === 'partial'
          return (
            <li key={record.id} className="imports__recent-item">
              <span className="imports__recent-icon" aria-hidden="true">
                {rolledBack ? <CheckCircle size={18} /> : <Clock size={18} />}
              </span>
              <div className="imports__recent-copy">
                <strong>{record.fileName || 'Contact import'}</strong>
                <p>
                  {formatDateTime(record.completedAt)} · {record.importedCount} imported
                  {record.updatedCount ? ` · ${record.updatedCount} updated` : ''}
                  {record.duplicateCount ? ` · ${record.duplicateCount} skipped` : ''}
                  {record.suppressedCount ? ` · ${record.suppressedCount} suppressed` : ''}
                  {record.errorCount ? ` · ${record.errorCount} not imported` : ''}
                </p>
                {record.rollbackResult ? (
                  <p className="imports__recent-result">
                    {record.rollbackResult.deleted} deleted
                    {record.rollbackResult.used
                      ? ` · ${record.rollbackResult.used} kept because they were used`
                      : ''}
                    {record.rollbackResult.failed
                      ? ` · ${record.rollbackResult.failed} failed`
                      : ''}
                  </p>
                ) : null}
              </div>
              <div className="imports__recent-actions">
                <Badge tone={open ? 'success' : rolledBack ? 'neutral' : 'warning'} size="sm" dot>
                  {open ? formatRollbackWindow(remaining) : rolledBack ? 'Rolled back' : 'Window closed'}
                </Badge>
                {open ? (
                  <Button variant="ghost" size="sm" onClick={() => onRollback(record)}>
                    Roll back
                  </Button>
                ) : (
                  <Button variant="quiet" size="sm" onClick={() => onDismiss(record.id)}>
                    Dismiss
                  </Button>
                )}
              </div>
            </li>
          )
        })}
      </ul>
    </section>
  )
}

function RollbackCard({ record, outcome, now, onRollback, onDismiss }) {
  if (outcome.importedCount === 0) {
    return (
      <div className="imports__note">
        <CheckCircle size={16} aria-hidden="true" />
        <p>No new contacts were created by this import, so there is nothing to roll back.</p>
      </div>
    )
  }

  if (!record) return null

  const open = isRollbackOpen(record, now)
  const remaining = rollbackWindowMs(record, now)
  const result = record.rollbackResult

  return (
    <div className={`imports__rollback${open ? '' : ' imports__rollback--closed'}`}>
      <span className="imports__rollback-icon" aria-hidden="true">
        {open ? <Clock size={20} /> : <CheckCircle size={20} />}
      </span>
      <div className="imports__rollback-copy">
        <div className="imports__rollback-head">
          <h3>24-hour rollback</h3>
          <Badge tone={open ? 'success' : record.status === 'partial' ? 'warning' : 'neutral'} size="sm" dot>
            {open
              ? formatRollbackWindow(remaining)
              : record.status === 'partial'
                ? 'Partly rolled back'
                : 'Rolled back'}
          </Badge>
        </div>
        {result ? (
          <p>
            Deleted {plural(result.deleted, 'created contact')}
            {result.used
              ? `, kept ${plural(result.used, 'contact')} because they were contacted or replied`
              : ''}
            {result.failed ? `, and ${plural(result.failed, 'delete')} failed` : ''}. Updated
            contacts and companies are not reverted.
          </p>
        ) : (
          <p>
            Remove the {plural(record.emails?.length ?? 0, 'contact')} this import created. Updates
            are not reversed, and contacts already used in a campaign are kept. Companies created
            by the import stay in the workspace.
          </p>
        )}
      </div>
      <div className="imports__rollback-actions">
        {open ? (
          <Button variant="ghost" size="sm" onClick={() => onRollback(record)}>
            Roll back import
          </Button>
        ) : (
          <Button variant="quiet" size="sm" onClick={() => onDismiss(record.id)}>
            Dismiss
          </Button>
        )}
      </div>
    </div>
  )
}

export function ImportsPage() {
  usePageTitle('Imports')

  const navigate = useNavigate()
  const { toast } = useToast()
  const { role, profileStatus, retryProfile } = useSession()

  const [step, setStep] = useState('upload')
  const [parsed, setParsed] = useState(null)
  const [mapping, setMapping] = useState(emptyImportMapping)
  const [fileError, setFileError] = useState(null)
  const [reading, setReading] = useState(false)

  const [mode, setMode] = useState('skip')
  const [workspaceIndex, setWorkspaceIndex] = useState(null)
  const [indexStatus, setIndexStatus] = useState('idle')
  const [indexError, setIndexError] = useState(null)
  const [indexAttempt, setIndexAttempt] = useState(0)

  const [run, setRun] = useState(null)
  const [submitError, setSubmitError] = useState(null)
  const [outcome, setOutcome] = useState(null)
  const [reviewFilter, setReviewFilter] = useState('all')

  const [rollbacks, setRollbacks] = useState(() => readImportRollbacks())
  const [rollbackTarget, setRollbackTarget] = useState(null)
  const [rollbackRun, setRollbackRun] = useState(null)
  const [rollbackError, setRollbackError] = useState(null)
  const [now, setNow] = useState(() => Date.now())

  const importAbort = useRef(null)

  const roleKnown = profileStatus === 'ready'
  const canWrite = roleKnown && (role === 'owner' || role === 'admin')
  const stepIndex = Math.max(
    0,
    IMPORT_STEPS.findIndex((item) => item.id === step),
  )

  const validation = useMemo(
    () => (parsed ? validateImportRows(parsed.rows, mapping) : null),
    [parsed, mapping],
  )

  const enriched = useMemo(
    () => applyWorkspaceImportIndex(validation, workspaceIndex),
    [validation, workspaceIndex],
  )

  const plan = useMemo(
    () => (enriched ? classifyImportRows(enriched.rows, mode) : null),
    [enriched, mode],
  )

  const mappedCount = Object.values(mapping).filter((value) => value != null).length
  const roleRows = enriched
    ? enriched.rows.filter(
        (row) => row.roleAddress && row.errors.length === 0 && !row.duplicateOf,
      )
    : []

  const modeCounts = enriched
    ? {
        skip:
          enriched.counts.existing + enriched.counts.suppressed > 0
            ? `${enriched.counts.existing + enriched.counts.suppressed} rows stay untouched`
            : 'No duplicates found',
        update:
          enriched.counts.existing > 0
            ? `${enriched.counts.existing} existing contacts updated`
            : 'No existing contacts to update',
        review:
          enriched.counts.existing + enriched.counts.suppressed + roleRows.length > 0
            ? `${enriched.counts.existing + enriched.counts.suppressed + roleRows.length} rows held`
            : 'Nothing to hold back',
      }
    : null

  const detailGroups = useMemo(() => {
    const groups = {
      all: outcome?.details ?? [],
      imported: [],
      updated: [],
      skipped: [],
      suppressed: [],
      review: [],
      errors: [],
    }
    for (const detail of outcome?.details ?? []) {
      if (detail.result === 'imported' || detail.result === 'sent') groups.imported.push(detail)
      else if (detail.result === 'updated') groups.updated.push(detail)
      else if (detail.result === 'suppressed') groups.suppressed.push(detail)
      else if (detail.result?.startsWith('review_')) groups.review.push(detail)
      else if (['duplicate_in_file', 'existing_contact'].includes(detail.result)) {
        groups.skipped.push(detail)
      } else groups.errors.push(detail)
    }
    return groups
  }, [outcome])

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30000)
    return () => window.clearInterval(timer)
  }, [])

  useEffect(() => () => importAbort.current?.abort(), [])

  useEffect(() => {
    if (step !== 'review' || !parsed || mapping.email == null) return undefined

    const controller = new AbortController()
    setIndexStatus('loading')
    setIndexError(null)
    setWorkspaceIndex(null)

    loadWorkspaceImportIndex({ signal: controller.signal })
      .then((index) => {
        if (controller.signal.aborted) return
        setWorkspaceIndex(index)
        setIndexStatus('ready')
      })
      .catch((error) => {
        if (controller.signal.aborted) return
        setWorkspaceIndex(null)
        setIndexStatus('error')
        setIndexError(error)
        setMode('skip')
      })

    return () => controller.abort()
  }, [step, parsed, mapping.email, indexAttempt])

  function goStep(nextStep) {
    setStep(nextStep)
    if (typeof window !== 'undefined') {
      window.scrollTo({ top: 0, behavior: 'auto' })
    }
  }

  function handleStepChange(index) {
    if (step === 'report' || run) return
    const target = IMPORT_STEPS[index]?.id
    if (!target || target === step) return
    if (target === 'upload') return goStep('upload')
    if (target === 'map' && parsed) return goStep('map')
    if (target === 'review' && parsed && mapping.email != null) return goStep('review')
  }

  function resetWizard() {
    setParsed(null)
    setMapping(emptyImportMapping())
    setFileError(null)
    setReading(false)
    setMode('skip')
    setWorkspaceIndex(null)
    setIndexStatus('idle')
    setIndexError(null)
    setIndexAttempt(0)
    setRun(null)
    setSubmitError(null)
    setOutcome(null)
    setReviewFilter('all')
    goStep('upload')
  }

  function downloadTemplate() {
    if (downloadCsv(buildTemplateCsv(), IMPORT_TEMPLATE_FILENAME)) {
      toast.info('Template downloaded. Add one contact per row, keeping the header row.')
    }
  }

  async function handleFiles(accepted, rejected) {
    if (rejected.length > 0) {
      const reason = rejected[0].reason
      setFileError(
        new ImportFileError(
          reason === 'size'
            ? 'That file is larger than 10 MB. Split it into smaller files and try again.'
            : 'That file is not a CSV. Choose a .csv file and try again.',
          'invalid_file',
        ),
      )
      return
    }

    const file = accepted[0]
    if (!file) return

    setReading(true)
    setFileError(null)
    setSubmitError(null)
    setRun(null)
    setOutcome(null)
    setWorkspaceIndex(null)
    setIndexStatus('idle')

    try {
      const next = await readCsvFile(file)
      setParsed(next)
      setMapping(autoMapColumns(next.headers))
      goStep('map')
    } catch (error) {
      setParsed(null)
      setMapping(emptyImportMapping())
      setFileError(
        error instanceof ImportFileError
          ? error
          : new ImportFileError('This file could not be read. Re-export it and try again.'),
      )
      goStep('upload')
    } finally {
      setReading(false)
    }
  }

  function handleMappingChange(fieldKey, value) {
    setMapping((current) => ({
      ...current,
      [fieldKey]: value === '' ? null : Number(value),
    }))
  }

  function isUsedElsewhere(fieldKey, columnIndex) {
    return Object.entries(mapping).some(
      ([key, value]) => key !== fieldKey && value === columnIndex,
    )
  }

  async function handleImport() {
    if (!plan || !parsed || !canWrite || run) return

    const networkRows = plan.sendRows.length + plan.updateRows.length
    if (networkRows === 0) {
      toast.error('There is nothing to import with this choice. Adjust the file or duplicate handling.')
      return
    }

    const startedAt = Date.now()
    const controller = new AbortController()
    importAbort.current = controller
    setSubmitError(null)
    setRun({
      phase: plan.sendRows.length > 0 ? 'uploading' : 'preparing',
      current: 0,
      total: plan.sendRows.length,
    })

    try {
      let serverReport = {
        importId: `local-${startedAt}`,
        status: 'completed',
        rowCount: 0,
        importedCount: 0,
        duplicateCount: 0,
        suppressedCount: 0,
        errorCount: 0,
        errors: [],
      }

      if (plan.sendRows.length > 0) {
        serverReport = await importContactsCsv({
          csv: buildCanonicalCsv(plan.sendRows, mapping),
          filename: parsed.fileName,
          signal: controller.signal,
        })
      }

      let updateResults = []
      if (plan.updateRows.length > 0) {
        setRun({ phase: 'updating', current: 0, total: plan.updateRows.length })
        updateResults = await updateExistingContacts(plan.updateRows, {
          signal: controller.signal,
          onProgress: (current, total) => {
            setRun({ phase: 'updating', current, total })
          },
        })
      }

      setRun({ phase: 'finishing', current: 0, total: 0 })

      const nextOutcome = buildImportOutcome({
        mode,
        plan,
        validation: enriched,
        serverReport,
        updateResults,
        startedAt,
        completedAt: new Date().toISOString(),
        fileName: parsed.fileName,
        index: workspaceIndex,
      })

      setOutcome(nextOutcome)
      importAbort.current = null
      setRun(null)

      if (nextOutcome.importedCount > 0 && nextOutcome.rollbackEmails.length > 0) {
        setRollbacks(saveImportRollback(createImportRollbackRecord(nextOutcome)))
      }

      goStep('report')

      if (nextOutcome.importedCount > 0) {
        toast.success(
          `${plural(nextOutcome.importedCount, 'contact')} imported${
            nextOutcome.updatedCount ? ` and ${plural(nextOutcome.updatedCount, 'contact')} updated` : ''
          }.`,
        )
      } else if (nextOutcome.updatedCount > 0) {
        toast.success(`${plural(nextOutcome.updatedCount, 'contact')} updated.`)
      } else if (nextOutcome.reviewCount > 0) {
        toast.info(`${plural(nextOutcome.reviewCount, 'row')} held for review.`)
      } else {
        toast.info('The import finished, but no new contacts were added.')
      }
    } catch (error) {
      importAbort.current = null
      setRun(null)
      if (error?.name === 'AbortError') return
      setSubmitError(error)
    }
  }

  function requestRollback(record) {
    setRollbackError(null)
    setRollbackRun(null)
    setRollbackTarget(record)
  }

  function cancelRollback() {
    if (rollbackRun) return
    setRollbackTarget(null)
    setRollbackError(null)
  }

  async function handleRollback() {
    const target = rollbackTarget
    if (!target || rollbackRun) return

    setRollbackError(null)
    setRollbackRun({ current: 0, total: target.emails?.length ?? 0 })

    try {
      const result = await rollbackImportContacts(target, {
        onProgress: (current, total) => setRollbackRun({ current, total }),
      })
      const nextRecord = {
        ...target,
        status: result.status,
        rolledBackAt: new Date().toISOString(),
        rollbackResult: result,
      }
      setRollbacks(saveImportRollback(nextRecord))
      setRollbackTarget(null)
      setRollbackRun(null)

      if (result.deleted > 0) {
        toast.success(`${plural(result.deleted, 'contact')} removed from the import.`)
      } else if (result.used > 0) {
        toast.warning(
          `${plural(result.used, 'contact')} kept because they were contacted or replied.`,
        )
      } else {
        toast.info('No contacts from this import were found to remove.')
      }
    } catch (error) {
      setRollbackRun(null)
      setRollbackError(error)
    }
  }

  function dismissRollback(id) {
    setRollbacks(removeImportRollback(id))
  }

  function downloadReport() {
    if (!outcome) return
    const name = `reyvo-import-${outcome.importId || Date.now()}.csv`
    if (downloadCsv(buildImportReportCsv(outcome), name)) {
      toast.info('Import report downloaded.')
    }
  }

  const reviewFilteredRows = plan
    ? plan.rows.filter((row) => reviewFilter === 'all' || reviewCategory(row) === reviewFilter)
    : []

  const reviewFilters = plan
    ? [
        { id: 'all', label: 'All', count: plan.rows.length },
        { id: 'new', label: 'New', count: plan.rows.filter((row) => reviewCategory(row) === 'new').length },
        { id: 'update', label: 'Update', count: plan.counts.updates },
        { id: 'existing', label: 'Existing', count: plan.rows.filter((row) => reviewCategory(row) === 'existing').length },
        { id: 'suppressed', label: 'Suppressed', count: plan.counts.suppressed },
        { id: 'duplicate', label: 'Duplicate', count: plan.counts.inFileDuplicates },
        { id: 'review', label: 'Review', count: plan.counts.review },
        { id: 'fix', label: 'Needs fix', count: plan.counts.invalid },
      ]
    : []

  const templateButton = (
    <Button variant="ghost" leadingIcon={FileText} onClick={downloadTemplate}>
      Download template
    </Button>
  )

  const pageMeta = (
    <>
      <Badge tone="neutral" dot>
        {parsed
          ? `${parsed.rows.length.toLocaleString()} ${
              parsed.rows.length === 1 ? 'row' : 'rows'
            } detected`
          : 'CSV · up to 10 MB'}
      </Badge>
      {roleKnown && !canWrite ? (
        <Badge tone="warning" dot>
          Read-only
        </Badge>
      ) : null}
    </>
  )

  const stepper = (
    <Stepper
      steps={IMPORT_STEPS}
      current={stepIndex}
      onStepChange={step === 'report' || run ? undefined : handleStepChange}
      label="Import progress"
    />
  )

  if (!roleKnown) {
    return (
      <div className="app-page imports-page">
        <PageHeader
          eyebrow="Leads · Imports"
          title="Import contacts"
          description="Bring a CSV into Reyvo, map its columns, and review every row before it lands in your workspace."
          meta={pageMeta}
          actions={templateButton}
        />
        <section
          className="app-card imports__pending"
          aria-busy={profileStatus === 'loading' ? 'true' : undefined}
        >
          {profileStatus === 'error' ? (
            <ErrorPanel
              title="We could not check your workspace access"
              description="Your role decides whether you can run imports. Retry the check, or reload the page if it keeps failing."
              onRetry={retryProfile}
              retryLabel="Check access again"
            />
          ) : (
            <>
              <p className="imports__pending-label">Checking your workspace access…</p>
              <Skeleton variant="text" lines={2} />
              <Skeleton variant="rect" height={240} />
            </>
          )}
        </section>
      </div>
    )
  }

  if (!canWrite) {
    return (
      <div className="app-page imports-page">
        <PageHeader
          eyebrow="Leads · Imports"
          title="Import contacts"
          description="Bring a CSV into Reyvo, map its columns, and review every row before it lands in your workspace."
          meta={pageMeta}
          actions={templateButton}
        />
        <section className="app-card imports__readonly">
          <span className="imports__readonly-icon" aria-hidden="true">
            <Lock size={22} />
          </span>
          <h2>Only owners and admins can import</h2>
          <p>
            You can download the template and prepare a CSV. Ask an owner or admin to run the
            import when the file is ready.
          </p>
          {templateButton}
        </section>
      </div>
    )
  }

  const reportRecord = outcome ? rollbacks.find((record) => record.id === outcome.importId) : null
  const networkRowCount = plan ? plan.sendRows.length + plan.updateRows.length : 0
  const importDisabled =
    !plan ||
    Boolean(run) ||
    networkRowCount === 0 ||
    (indexStatus !== 'ready' && mode !== 'skip')

  const importLabel = (() => {
    if (!plan) return 'Import'
    if (mode === 'update' && plan.sendRows.length > 0 && plan.updateRows.length > 0) {
      return `Import ${plan.sendRows.length.toLocaleString()} and update ${plan.updateRows.length.toLocaleString()}`
    }
    if (mode === 'update' && plan.updateRows.length > 0) {
      return `Update ${plan.updateRows.length.toLocaleString()} ${
        plan.updateRows.length === 1 ? 'contact' : 'contacts'
      }`
    }
    if (plan.sendRows.length > 0) {
      return `Import ${plan.sendRows.length.toLocaleString()} ${
        plan.sendRows.length === 1 ? 'contact' : 'contacts'
      }`
    }
    return 'Nothing to import'
  })()

  return (
    <div className="app-page imports-page">
      <PageHeader
        eyebrow="Leads · Imports"
        title="Import contacts"
        description="Bring a CSV into Reyvo, map its columns, and review every row before it lands in your workspace."
        meta={pageMeta}
        actions={templateButton}
      />

      {step !== 'report' ? stepper : null}

      {step === 'upload' ? (
        <>
          <section className="app-card imports__panel">
            <div className="imports__step-head">
              <div>
                <h2>Upload a CSV</h2>
                <p>
                  Use the Reyvo template or your own export. Columns are detected automatically.
                </p>
              </div>
              {parsed ? (
                <Badge tone="neutral" dot>
                  {parsed.fileName}
                </Badge>
              ) : null}
            </div>

            <div className="imports__template">
              <span className="imports__template-icon" aria-hidden="true">
                <FileText size={20} />
              </span>
              <div className="imports__template-copy">
                <strong>Start with the template</strong>
                <p>
                  One contact per row, with the exact headers Reyvo expects. Email is required;
                  everything else is optional.
                </p>
                <div className="imports__columns">
                  {IMPORT_FIELDS.map((field) => (
                    <code key={field.key}>{field.key}</code>
                  ))}
                </div>
              </div>
              {templateButton}
            </div>

            <div className="imports__or">
              <span>or upload your own file</span>
            </div>

            {fileError ? (
              <ImportAlert tone="danger" icon={AlertCircle} title="That file cannot be imported">
                <p>{fileError.message}</p>
                <p>
                  Re-export the file as UTF-8 CSV with a header row, or download the template above.
                </p>
              </ImportAlert>
            ) : null}

            <UploadDropzone
              id="import-csv"
              onFiles={handleFiles}
              busy={reading}
              disabled={reading}
              label="Drop your CSV here"
              hint="CSV up to 10 MB · UTF-8 · header row required"
              busyLabel="Reading your file…"
              browseLabel="Choose a CSV"
            />

            {parsed ? (
              <div className="imports__loaded">
                <span className="imports__loaded-icon" aria-hidden="true">
                  <CheckCircle size={19} />
                </span>
                <div className="imports__loaded-copy">
                  <strong>{parsed.fileName}</strong>
                  <p>
                    {parsed.rows.length.toLocaleString()} rows · {parsed.headers.length} columns ·{' '}
                    {parsed.delimiterLabel}
                  </p>
                </div>
                <div className="imports__loaded-actions">
                  <Button variant="quiet" size="sm" onClick={resetWizard}>
                    Remove
                  </Button>
                  <Button
                    variant="primary"
                    size="sm"
                    trailingIcon={ArrowRight}
                    onClick={() => goStep('map')}
                  >
                    Continue to mapping
                  </Button>
                </div>
              </div>
            ) : null}

            <ul className="imports__format">
              <li>UTF-8 encoded, with a header row in the first non-empty line.</li>
              <li>Comma, semicolon, and tab delimiters are detected automatically.</li>
              <li>
                Up to 5,000 rows per file. Existing contacts, repeated emails, and suppressed
                addresses are explained before you commit.
              </li>
              <li>Only the required email column needs to be mapped to import.</li>
            </ul>
          </section>

          <RecentImports
            records={rollbacks}
            now={now}
            onRollback={requestRollback}
            onDismiss={dismissRollback}
          />
        </>
      ) : null}

      {step === 'map' && parsed ? (
        <section className="app-card imports__panel">
          <div className="imports__step-head">
            <div>
              <h2>Map your columns</h2>
              <p>
                We matched {mappedCount} of {IMPORT_FIELDS.length} fields from{' '}
                <strong>{parsed.fileName}</strong>. Adjust anything that looks wrong.
              </p>
            </div>
            <Badge tone={mapping.email != null ? 'success' : 'warning'} dot>
              {mapping.email != null
                ? `${mappedCount} of ${IMPORT_FIELDS.length} mapped`
                : 'Email not mapped'}
            </Badge>
          </div>

          <div className="imports__detected">
            <span className="imports__label">Detected columns</span>
            <div className="imports__columns">
              {parsed.headers.map((header) => (
                <code key={header.index}>{header.label}</code>
              ))}
            </div>
          </div>

          {mapping.email == null ? (
            <ImportAlert tone="warning" icon={AlertTriangle} title="Map an email column to continue">
              <p>
                Every contact needs an email address, and Reyvo matches duplicates and suppressions
                by email. Choose the column that holds it below.
              </p>
            </ImportAlert>
          ) : null}

          <div className="imports__map-grid">
            {IMPORT_FIELDS.map((field) => (
              <SelectField
                key={field.key}
                id={`import-map-${field.key}`}
                label={field.required ? `${field.label} · required` : field.label}
                hint={
                  field.required
                    ? 'Every row needs a valid address.'
                    : `For example: ${field.example}`
                }
                value={mapping[field.key] == null ? '' : String(mapping[field.key])}
                onChange={(event) => handleMappingChange(field.key, event.target.value)}
              >
                <option value="">Not mapped</option>
                {parsed.headers.map((header) => {
                  const used = isUsedElsewhere(field.key, header.index)
                  return (
                    <option key={header.index} value={header.index} disabled={used}>
                      {header.label}
                      {used ? ' · used' : ''}
                    </option>
                  )
                })}
              </SelectField>
            ))}
          </div>

          <div className="imports__actions">
            <Button variant="ghost" leadingIcon={ArrowLeft} onClick={() => goStep('upload')}>
              Back to upload
            </Button>
            <Button
              variant="primary"
              trailingIcon={ArrowRight}
              disabled={mapping.email == null}
              onClick={() => goStep('review')}
            >
              Review {parsed.rows.length.toLocaleString()} rows
            </Button>
          </div>
        </section>
      ) : null}

      {step === 'review' && parsed && enriched && plan ? (
        <section className="app-card imports__panel">
          <div className="imports__step-head">
            <div>
              <h2>Review your import</h2>
              <p>
                Nothing has been sent yet. Reyvo checks your workspace for existing contacts and
                suppressed addresses, then applies the duplicate choice below.
              </p>
            </div>
            <Badge tone="neutral" dot>
              {parsed.fileName}
            </Badge>
          </div>

          {run ? (
            <ProgressPanel run={run} />
          ) : (
            <>
              <div className="imports__stats imports__stats--six">
                <ImportStat label="Rows in file" value={plan.counts.total.toLocaleString()} />
                <ImportStat
                  label="New contacts"
                  value={plan.counts.newContacts.toLocaleString()}
                  tone="success"
                  hint="Will be created"
                />
                <ImportStat
                  label="Existing"
                  value={plan.counts.existing.toLocaleString()}
                  tone={plan.counts.existing > 0 ? 'warning' : undefined}
                  hint={
                    mode === 'update'
                      ? `${plan.counts.updates.toLocaleString()} will update`
                      : mode === 'review'
                        ? 'Held for review'
                        : 'Kept unchanged'
                  }
                />
                <ImportStat
                  label="Suppressed"
                  value={plan.counts.suppressed.toLocaleString()}
                  tone={plan.counts.suppressed > 0 ? 'warning' : undefined}
                  hint="Never uploaded"
                />
                <ImportStat
                  label="Duplicate rows"
                  value={plan.counts.inFileDuplicates.toLocaleString()}
                  tone={plan.counts.inFileDuplicates > 0 ? 'warning' : undefined}
                  hint="First one is kept"
                />
                <ImportStat
                  label="Rows to fix"
                  value={plan.counts.invalid.toLocaleString()}
                  tone={plan.counts.invalid > 0 ? 'danger' : undefined}
                  hint="Not uploaded"
                />
              </div>

              {indexStatus === 'loading' || indexStatus === 'idle' ? (
                <div className="imports__index-status" role="status">
                  <span className="imports__spinner" aria-hidden="true" />
                  <div>
                    <strong>Checking your workspace</strong>
                    <p>
                      Looking for existing contacts and suppressions up to{' '}
                      {IMPORT_LOOKUP_MAX.toLocaleString()} records each.
                    </p>
                  </div>
                </div>
              ) : null}

              {indexStatus === 'error' ? (
                <ErrorPanel
                  compact
                  title="We could not check existing contacts"
                  description={
                    indexError?.message ||
                    'You can still import in skip mode; the API will skip duplicates and suppressed addresses, but the report will only show summary counts for them.'
                  }
                  requestId={indexError?.requestId}
                  onRetry={() => setIndexAttempt((value) => value + 1)}
                  retryLabel="Check again"
                />
              ) : null}

              <ModePicker
                value={mode}
                onChange={setMode}
                disabled={indexStatus !== 'ready' || Boolean(run)}
                counts={modeCounts}
              />

              {enriched.counts.invalid > 0 ? (
                <ImportAlert tone="warning" icon={AlertTriangle} title="Some rows need attention">
                  <p>
                    {plural(enriched.counts.invalid, 'row')}{' '}
                    {verbFor(enriched.counts.invalid, 'has', 'have')} a missing or invalid email
                    or a value that is too long. Those rows will not be sent. Fix them in the CSV
                    and upload again to include them.
                  </p>
                  <ul className="imports__issue-list">
                    {enriched.rows
                      .filter((row) => row.errors.length > 0)
                      .slice(0, 3)
                      .map((row) => (
                        <li key={row.line}>
                          <span className="imports__issue-row">Row {row.line}</span>
                          {row.values.email ? <code>{row.values.email}</code> : null}
                          <span>{row.errors[0]?.message}</span>
                        </li>
                      ))}
                    {enriched.counts.invalid > 3 ? (
                      <li className="imports__issue-more">
                        And {enriched.counts.invalid - 3} more. Filter the table by “Needs fix”.
                      </li>
                    ) : null}
                  </ul>
                </ImportAlert>
              ) : null}

              {enriched.counts.existing > 0 ? (
                <ImportAlert tone="info" icon={Database} title="Emails already in your workspace">
                  <p>
                    {plural(enriched.counts.existing, 'row')}{' '}
                    {verbFor(enriched.counts.existing, 'matches', 'match')} an existing contact.
                    {mode === 'update'
                      ? ' Mapped names, titles, phone numbers, LinkedIn URLs, and source will be applied; company is left unchanged.'
                      : mode === 'review'
                        ? ' They will be held in the review queue and left unchanged.'
                        : ' They will be skipped and left unchanged.'}
                  </p>
                </ImportAlert>
              ) : null}

              {enriched.counts.suppressed > 0 ? (
                <ImportAlert tone="warning" icon={Ban} title="Suppressed addresses found">
                  <p>
                    {plural(enriched.counts.suppressed, 'address', 'addresses')}{' '}
                    {verbFor(enriched.counts.suppressed, 'is', 'are')} on a suppression list. Reyvo
                    will never contact {verbFor(enriched.counts.suppressed, 'it', 'them')}, so the
                    rows are skipped in every duplicate mode.
                  </p>
                  <ul className="imports__issue-list">
                    {enriched.rows
                      .filter(
                        (row) =>
                          row.suppression && row.errors.length === 0 && !row.duplicateOf,
                      )
                      .slice(0, 3)
                      .map((row) => (
                        <li key={row.line}>
                          <span className="imports__issue-row">Row {row.line}</span>
                          <code>{row.values.email}</code>
                          <span>{String(row.suppression.reason ?? 'suppressed').replace(/_/g, ' ')}</span>
                        </li>
                      ))}
                  </ul>
                </ImportAlert>
              ) : null}

              {plan.counts.inFileDuplicates > 0 ? (
                <ImportAlert tone="info" icon={Info} title="Repeated emails in this file">
                  <p>
                    {plural(plan.counts.inFileDuplicates, 'row')}{' '}
                    {verbFor(plan.counts.inFileDuplicates, 'repeats', 'repeat')} an email from an
                    earlier row. The first occurrence is kept and the repeat is skipped.
                  </p>
                </ImportAlert>
              ) : null}

              {roleRows.length > 0 ? (
                <ImportAlert tone="info" icon={Info} title="Role-based addresses found">
                  <p>
                    {plural(roleRows.length, 'address', 'addresses')}{' '}
                    {verbFor(roleRows.length, 'looks', 'look')} like a shared inbox (info@, sales@,
                    hr@). They are allowed, but review them before sending a campaign.
                    {mode === 'review' ? ' Review mode holds them back instead.' : ''}
                  </p>
                </ImportAlert>
              ) : null}

              {workspaceIndex?.contactsTruncated || workspaceIndex?.suppressionsTruncated ? (
                <ImportAlert tone="warning" icon={AlertTriangle} title="Large workspace">
                  <p>
                    Your workspace has more than {IMPORT_LOOKUP_MAX.toLocaleString()} contacts or
                    suppressions, so this preview checked the first{' '}
                    {IMPORT_LOOKUP_MAX.toLocaleString()} of each. The API still skips anything
                    outside that window; the report shows those as summary counts without row
                    detail.
                  </p>
                </ImportAlert>
              ) : null}

              <div className="imports__filters">
                <span className="imports__label">Row preview</span>
                <div className="imports__filter-chips">
                  {reviewFilters.map((filter) => (
                    <button
                      key={filter.id}
                      type="button"
                      className={`imports__chip${reviewFilter === filter.id ? ' is-active' : ''}`}
                      aria-pressed={reviewFilter === filter.id}
                      onClick={() => setReviewFilter(filter.id)}
                    >
                      {filter.label}
                      <span>{filter.count.toLocaleString()}</span>
                    </button>
                  ))}
                </div>
              </div>

              <DataTable
                caption="Import rows"
                dense
                columns={[
                  {
                    key: 'row',
                    header: 'Row',
                    render: (row) => <span className="imports__muted">#{row.line}</span>,
                  },
                  {
                    key: 'email',
                    header: 'Email',
                    render: (row) =>
                      row.values.email ? (
                        <span className="imports__email">{row.values.email}</span>
                      ) : (
                        <span className="imports__missing">Missing</span>
                      ),
                  },
                  {
                    key: 'name',
                    header: 'Name',
                    render: (row) => importRowName(row.values) || <span className="imports__muted">—</span>,
                  },
                  {
                    key: 'company',
                    header: 'Company',
                    render: (row) =>
                      row.values.company || <span className="imports__muted">—</span>,
                  },
                  {
                    key: 'title',
                    header: 'Job title',
                    render: (row) =>
                      row.values.title || <span className="imports__muted">—</span>,
                  },
                  {
                    key: 'status',
                    header: 'Status',
                    render: (row) => reviewBadge(row),
                  },
                  {
                    key: 'issue',
                    header: 'Details',
                    render: (row) => (
                      <span
                        className={`imports__issue${
                          row.errors.length > 0 ? '' : ' imports__muted'
                        }`}
                      >
                        {row.planDetail}
                      </span>
                    ),
                  },
                ]}
                rows={reviewFilteredRows.slice(0, IMPORT_PREVIEW_LIMIT)}
                getRowKey={(row) => row.line}
                empty={<p className="imports__muted">No rows match this filter.</p>}
              />

              <p className="imports__preview-note">
                Showing {Math.min(IMPORT_PREVIEW_LIMIT, reviewFilteredRows.length).toLocaleString()}{' '}
                of {reviewFilteredRows.length.toLocaleString()} rows in this filter. Every row is
                checked; the import uses all rows that fit the chosen mode.
              </p>

              {submitError ? (
                <ErrorPanel
                  title={
                    submitError?.status === 403
                      ? 'Import is restricted'
                      : 'The import could not be completed'
                  }
                  description={
                    submitError?.message ||
                    'Reyvo could not finish this import. Your file is unchanged — try again.'
                  }
                  requestId={submitError?.requestId}
                  onRetry={submitError?.status === 403 ? undefined : handleImport}
                  retryLabel="Try the import again"
                />
              ) : null}

              {indexStatus === 'error' ? (
                <ImportAlert tone="warning" icon={AlertTriangle} title="Preview is limited">
                  <p>
                    Skip mode still works. Existing duplicates and suppressed addresses will be
                    skipped by the API, but they appear as summary counts in the report instead of
                    individual rows.
                  </p>
                </ImportAlert>
              ) : null}

              <div className="imports__actions">
                <Button
                  variant="ghost"
                  leadingIcon={ArrowLeft}
                  disabled={Boolean(run)}
                  onClick={() => goStep('map')}
                >
                  Back to mapping
                </Button>
                <Button
                  variant="primary"
                  leadingIcon={Upload}
                  loading={Boolean(run)}
                  disabled={importDisabled}
                  onClick={handleImport}
                >
                  {run ? 'Importing…' : importLabel}
                </Button>
              </div>

              <p className="imports__status" role="status">
                {mode === 'update'
                  ? 'Updates use one API call per existing contact after the CSV import. Failed updates are reported row by row.'
                  : mode === 'review'
                    ? 'Held rows are not imported. Adjust the file or use Skip or Update to include them.'
                    : 'The API skips remaining duplicates and suppressed addresses. The report explains every row the browser could identify.'}
              </p>
            </>
          )}
        </section>
      ) : null}

      {step === 'report' && outcome ? (
        <section className="app-card imports__panel imports__panel--report">
          <div className="imports__report-hero">
            <span
              className={`imports__report-icon ${
                outcome.importedCount + outcome.updatedCount > 0 ? 'is-success' : 'is-warning'
              }`}
              aria-hidden="true"
            >
              {outcome.importedCount + outcome.updatedCount > 0 ? (
                <CheckCircle size={26} />
              ) : (
                <AlertCircle size={26} />
              )}
            </span>
            <div className="imports__report-copy">
              <p className="eyebrow">Import report</p>
              <h2>
                {outcome.importedCount + outcome.updatedCount > 0
                  ? 'Import complete'
                  : outcome.reviewCount > 0
                    ? 'Rows held for review'
                    : 'No new contacts imported'}
              </h2>
              <p>
                {plural(outcome.fileRowCount, 'row')} read from{' '}
                <strong>{outcome.fileName ?? parsed?.fileName ?? 'your file'}</strong>.{' '}
                {outcome.importedCount.toLocaleString()} imported,{' '}
                {outcome.updatedCount.toLocaleString()} updated,{' '}
                {outcome.duplicateCount.toLocaleString()} duplicates skipped,{' '}
                {outcome.suppressedCount.toLocaleString()} suppressed,{' '}
                {outcome.reviewCount.toLocaleString()} held for review, and{' '}
                {outcome.errorCount.toLocaleString()} not imported.
              </p>
            </div>
            <div className="imports__report-badges">
              <Badge
                tone={outcome.importedCount + outcome.updatedCount > 0 ? 'success' : 'warning'}
                dot
              >
                {outcome.status}
              </Badge>
              <Badge tone="neutral" size="sm">
                {IMPORT_MODES.find((item) => item.id === outcome.mode)?.label ?? 'Skip duplicates'}
              </Badge>
            </div>
          </div>

          <div className="imports__stats imports__stats--six">
            <ImportStat
              label="Imported"
              value={outcome.importedCount.toLocaleString()}
              tone="success"
            />
            <ImportStat
              label="Updated"
              value={outcome.updatedCount.toLocaleString()}
              tone={outcome.updatedCount > 0 ? 'info' : undefined}
            />
            <ImportStat
              label="Duplicates skipped"
              value={outcome.duplicateCount.toLocaleString()}
              tone={outcome.duplicateCount > 0 ? 'warning' : undefined}
            />
            <ImportStat
              label="Suppressed"
              value={outcome.suppressedCount.toLocaleString()}
              tone={outcome.suppressedCount > 0 ? 'warning' : undefined}
            />
            <ImportStat
              label="Held for review"
              value={outcome.reviewCount.toLocaleString()}
              tone={outcome.reviewCount > 0 ? 'info' : undefined}
            />
            <ImportStat
              label="Not imported"
              value={outcome.errorCount.toLocaleString()}
              tone={outcome.errorCount > 0 ? 'danger' : undefined}
            />
          </div>

          {outcome.reviewCount > 0 ? (
            <ImportAlert tone="info" icon={Info} title="Rows held for review">
              <p>
                {plural(outcome.reviewCount, 'row')}{' '}
                {verbFor(outcome.reviewCount, 'was', 'were')} held back because it already exists,
                is suppressed, or uses a role-based inbox. Nothing was changed for those rows. Use
                Skip or Update to include the ones that should be imported.
              </p>
            </ImportAlert>
          ) : null}

          <div className="imports__errors">
            <div className="imports__step-head">
              <div>
                <h3>Row-by-row report</h3>
                <p>
                  {outcome.details.length.toLocaleString()} rows explained.{' '}
                  {outcome.explainedCount >= outcome.fileRowCount
                    ? 'Every row in the file is accounted for.'
                    : `${Math.max(
                        0,
                        outcome.fileRowCount - outcome.explainedCount,
                      ).toLocaleString()} rows are covered by server summary counts only.`}
                </p>
              </div>
              <Badge tone="neutral" size="sm">
                {plural(outcome.fileRowCount, 'row')}
              </Badge>
            </div>

            <Tabs
              key={outcome.importId}
              label="Import report categories"
              items={[
                { id: 'all', label: 'All', count: detailGroups.all.length, content: null },
                {
                  id: 'imported',
                  label: 'Imported',
                  count: detailGroups.imported.length,
                  content: null,
                },
                {
                  id: 'updated',
                  label: 'Updated',
                  count: detailGroups.updated.length,
                  content: null,
                },
                {
                  id: 'skipped',
                  label: 'Skipped',
                  count: detailGroups.skipped.length,
                  content: null,
                },
                {
                  id: 'suppressed',
                  label: 'Suppressed',
                  count: detailGroups.suppressed.length,
                  content: null,
                },
                {
                  id: 'review',
                  label: 'Review',
                  count: detailGroups.review.length,
                  content: null,
                },
                {
                  id: 'errors',
                  label: 'Errors',
                  count: detailGroups.errors.length,
                  content: null,
                },
              ].map((tab) => ({
                ...tab,
                content: (
                  <DataTable
                    caption={`${tab.label} rows`}
                    dense
                    columns={[
                      {
                        key: 'row',
                        header: 'Row',
                        render: (row) => <span className="imports__muted">#{row.row}</span>,
                      },
                      {
                        key: 'email',
                        header: 'Email',
                        render: (row) =>
                          row.email || <span className="imports__missing">Missing</span>,
                      },
                      {
                        key: 'name',
                        header: 'Name',
                        render: (row) =>
                          row.name || <span className="imports__muted">—</span>,
                      },
                      {
                        key: 'result',
                        header: 'Result',
                        render: (row) => <ResultBadge result={row.result} />,
                      },
                      {
                        key: 'message',
                        header: 'Details',
                        render: (row) => (
                          <span
                            className={`imports__issue${
                              row.result === 'imported' || row.result === 'updated'
                                ? ' imports__muted'
                                : ''
                            }`}
                          >
                            {row.message || importErrorCopy(row.reason)}
                          </span>
                        ),
                      },
                      {
                        key: 'source',
                        header: 'Checked by',
                        render: (row) => (
                          <span className="imports__muted">
                            {row.source === 'server' ? 'API' : 'Browser'}
                          </span>
                        ),
                      },
                    ]}
                    rows={detailGroups[tab.id].slice(0, IMPORT_REPORT_ROW_LIMIT)}
                    getRowKey={(row, index) => `${row.row}-${row.result}-${index}`}
                    empty={<p className="imports__muted">No rows in this category.</p>}
                  />
                ),
              }))}
            />

            {detailGroups.all.length > IMPORT_REPORT_ROW_LIMIT ? (
              <p className="imports__preview-note">
                Tables show the first {IMPORT_REPORT_ROW_LIMIT.toLocaleString()} rows in each
                category. Download the report for the full list.
              </p>
            ) : null}
          </div>

          <div className="imports__report-meta">
            <span>
              Import ID <code>{outcome.importId || 'unknown'}</code>
            </span>
            <span>
              {outcome.sentRowCount.toLocaleString()} of{' '}
              {outcome.fileRowCount.toLocaleString()} rows sent to the API
            </span>
            <span>
              {outcome.updatedCount.toLocaleString()} contacts updated through the API
            </span>
          </div>

          {outcome.unexplainedCount > 0 ? (
            <p className="imports__preview-note">
              {outcome.unexplainedCount.toLocaleString()} rows were counted by the API without
              individual detail because the workspace preview is capped at{' '}
              {IMPORT_LOOKUP_MAX.toLocaleString()} records.
            </p>
          ) : null}

          <RollbackCard
            record={reportRecord}
            outcome={outcome}
            now={now}
            onRollback={requestRollback}
            onDismiss={dismissRollback}
          />

          <div className="imports__actions">
            <Button variant="ghost" leadingIcon={Upload} onClick={resetWizard}>
              Import another file
            </Button>
            <div className="imports__actions-group">
              <Button variant="ghost" leadingIcon={FileText} onClick={downloadReport}>
                Download report
              </Button>
              <Button
                variant="primary"
                leadingIcon={Users}
                onClick={() => navigate('/app/contacts')}
              >
                View contacts
              </Button>
            </div>
          </div>
        </section>
      ) : null}

      <ConfirmDialog
        open={Boolean(rollbackTarget)}
        title="Roll back this import?"
        description={
          rollbackTarget
            ? `${rollbackTarget.fileName || 'This import'} created ${
                rollbackTarget.importedCount
              } contacts ${formatDateTime(rollbackTarget.completedAt)}.`
            : undefined
        }
        confirmLabel={
          rollbackRun ? 'Rolling back…' : rollbackError ? 'Try again' : 'Roll back import'
        }
        loading={Boolean(rollbackRun)}
        onConfirm={handleRollback}
        onCancel={cancelRollback}
      >
        {rollbackRun ? (
          <div className="imports__rollback-progress">
            <p role="status">
              Removing {rollbackRun.current.toLocaleString()} of{' '}
              {rollbackRun.total.toLocaleString()} contacts…
            </p>
            <div className="imports__progress-bar" aria-hidden="true">
              <span
                style={{
                  width: `${Math.round(
                    (rollbackRun.current / Math.max(1, rollbackRun.total)) * 100,
                  )}%`,
                }}
              />
            </div>
          </div>
        ) : (
          <>
            <ul className="imports__rollback-list">
              <li>Only contacts created by this import are deleted.</li>
              <li>Updates to existing contacts and companies created by the import are kept.</li>
              <li>Contacts that have been contacted or have replied since are kept.</li>
            </ul>
            {rollbackError ? (
              <p className="imports__rollback-error" role="alert">
                {rollbackError.message || 'The rollback could not be completed.'}
              </p>
            ) : null}
          </>
        )}
      </ConfirmDialog>
    </div>
  )
}
