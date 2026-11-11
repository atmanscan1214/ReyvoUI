import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  AlertTriangle,
  ArrowLeft,
  Check,
  Close,
  Copy,
  Plus,
  Refresh,
  Trash,
  Users,
} from '../../../components/icons'
import {
  Badge,
  Button,
  ErrorPanel,
  Skeleton,
  StatusBadge,
} from '../../../components/ui'
import {
  TextareaField,
  TextField,
} from '../../../components/Field'
import {
  SEGMENT_FIELDS,
  SEGMENT_SCAN_MAX,
  countSegment,
  definitionListIds,
  describeDefinition,
  getSegmentField,
  isRuleComplete,
  segmentOperatorOptions,
  segmentValueKind,
  validateSegmentDraft,
} from '../../../lib/segments'

function cloneDefinition(definition) {
  return JSON.parse(JSON.stringify(definition))
}

function MatchToggle({ value, onChange, name, options, label }) {
  return (
    <div className="lists__match-toggle" role="radiogroup" aria-label={label}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          role="radio"
          aria-checked={value === option.value}
          className={`lists__match-option${value === option.value ? ' is-active' : ''}`}
          onClick={() => onChange(option.value)}
          name={name}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}

function RuleValue({ rule, field, kind, lists, companies, tagOptions, onChange, disabled }) {
  const id = `segment-value-${rule.id}`
  const value = rule.value ?? ''

  if (kind === 'none') {
    return <span className="lists__rule-empty">No value needed</span>
  }

  if (kind === 'enum') {
    return (
      <select
        id={id}
        className="ui-select lists__rule-input"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        disabled={disabled}
        aria-label={`${field.label} value`}
      >
        <option value="">Choose a value</option>
        {field.options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    )
  }

  if (kind === 'company') {
    const known = companies.some((company) => company.id === value)
    return (
      <select
        id={id}
        className="ui-select lists__rule-input"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        disabled={disabled}
        aria-label="Company value"
      >
        <option value="">Choose a company</option>
        {!known && value ? <option value={value}>Company no longer loaded</option> : null}
        {companies.map((company) => (
          <option key={company.id} value={company.id}>
            {company.name}
          </option>
        ))}
      </select>
    )
  }

  if (kind === 'list') {
    const known = lists.some((list) => list.id === value)
    return (
      <select
        id={id}
        className="ui-select lists__rule-input"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        disabled={disabled}
        aria-label="List value"
      >
        <option value="">Choose a list</option>
        {!known && value ? <option value={value}>Deleted list</option> : null}
        {lists.map((list) => (
          <option key={list.id} value={list.id}>
            {list.name}
          </option>
        ))}
      </select>
    )
  }

  if (kind === 'tag') {
    return (
      <>
        <input
          id={id}
          className="ui-input lists__rule-input"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          disabled={disabled}
          list={`segment-tags-${rule.id}`}
          placeholder="Tag name"
          aria-label="Tag value"
        />
        <datalist id={`segment-tags-${rule.id}`}>
          {tagOptions.map((tag) => (
            <option key={tag} value={tag} />
          ))}
        </datalist>
      </>
    )
  }

  if (kind === 'days') {
    return (
      <span className="lists__rule-days">
        <input
          id={id}
          className="ui-input lists__rule-input lists__rule-input--days"
          type="number"
          min="1"
          max="3650"
          step="1"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          disabled={disabled}
          aria-label="Number of days"
        />
        <span>days</span>
      </span>
    )
  }

  if (kind === 'date') {
    return (
      <input
        id={id}
        className="ui-input lists__rule-input lists__rule-input--date"
        type="date"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        disabled={disabled}
        aria-label={`${field.label} date`}
      />
    )
  }

  return (
    <input
      id={id}
      className="ui-input lists__rule-input"
      value={value}
      onChange={(event) => onChange(event.target.value)}
      disabled={disabled}
      placeholder="Value"
      aria-label={`${field.label} value`}
    />
  )
}

/**
 * AND/OR segment builder. Every rule is evaluated in the browser against the
 * contact snapshot the page loaded; saving writes the definition to the
 * per-browser segment store. The campaign wizard consumes the saved record.
 */
export function SegmentBuilder({
  initialSegment = null,
  lists = [],
  companies = [],
  segments = [],
  snapshot = null,
  snapshotStatus = 'idle',
  snapshotError = null,
  onRetrySnapshot,
  onEnsureListMembership,
  tagOptions = [],
  saving = false,
  saveError = null,
  canWrite = false,
  onCancel,
  onSave,
  onDuplicate,
  onRequestDelete,
}) {
  const navigate = useNavigate()
  const [name, setName] = useState(initialSegment?.name ?? '')
  const [description, setDescription] = useState(initialSegment?.description ?? '')
  const [definition, setDefinition] = useState(() =>
    initialSegment?.definition
      ? cloneDefinition(initialSegment.definition)
      : { match: 'all', groups: [{ id: `group_${Date.now()}`, match: 'all', rules: [] }] },
  )
  const [errors, setErrors] = useState({})

  const listIds = useMemo(() => definitionListIds(definition), [definition])
  const listKey = listIds.join('|')

  useEffect(() => {
    if (!onEnsureListMembership || listIds.length === 0) return
    onEnsureListMembership(listIds)
    // The joined key intentionally tracks rule values, not array identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listKey, onEnsureListMembership])

  const preview = useMemo(
    () => countSegment(definition, snapshot),
    [definition, snapshot],
  )
  const summary = useMemo(
    () =>
      describeDefinition(definition, {
        companyMap: snapshot?.companyMap,
        lists,
      }),
    [definition, snapshot, lists],
  )
  const hasRules = preview.ready && preview.count > 0

  function patchDefinition(patch) {
    setDefinition((current) => ({ ...current, ...patch }))
    setErrors((current) => ({ ...current, rules: undefined }))
  }

  function updateGroup(groupId, patch) {
    setDefinition((current) => ({
      ...current,
      groups: current.groups.map((group) =>
        group.id === groupId ? { ...group, ...patch } : group,
      ),
    }))
    setErrors((current) => ({ ...current, rules: undefined }))
  }

  function addGroup() {
    setDefinition((current) => ({
      ...current,
      groups: [
        ...current.groups,
        {
          id: `group_${Date.now()}_${current.groups.length}`,
          match: 'all',
          rules: [
            { id: `rule_${Date.now()}_${current.groups.length}`, field: '', operator: '', value: '' },
          ],
        },
      ],
    }))
  }

  function removeGroup(groupId) {
    setDefinition((current) => ({
      ...current,
      groups:
        current.groups.length === 1
          ? current.groups
          : current.groups.filter((group) => group.id !== groupId),
    }))
  }

  function addRule(groupId) {
    setDefinition((current) => ({
      ...current,
      groups: current.groups.map((group) =>
        group.id === groupId
          ? {
              ...group,
              rules: [
                ...group.rules,
                {
                  id: `rule_${Date.now()}_${group.rules.length}`,
                  field: '',
                  operator: '',
                  value: '',
                },
              ],
            }
          : group,
      ),
    }))
  }

  function updateRule(groupId, ruleId, patch) {
    setDefinition((current) => ({
      ...current,
      groups: current.groups.map((group) =>
        group.id === groupId
          ? {
              ...group,
              rules: group.rules.map((rule) =>
                rule.id === ruleId ? { ...rule, ...patch } : rule,
              ),
            }
          : group,
      ),
    }))
    setErrors((current) => ({ ...current, rules: undefined }))
  }

  function removeRule(groupId, ruleId) {
    setDefinition((current) => ({
      ...current,
      groups: current.groups.map((group) =>
        group.id === groupId
          ? { ...group, rules: group.rules.filter((rule) => rule.id !== ruleId) }
          : group,
      ),
    }))
  }

  function handleFieldChange(groupId, rule, fieldKey) {
    const field = getSegmentField(fieldKey)
    updateRule(groupId, rule.id, {
      field: fieldKey,
      operator: field?.operators?.[0] ?? '',
      value: '',
    })
  }

  function handleOperatorChange(groupId, rule, operator) {
    const field = getSegmentField(rule.field)
    const previousKind = segmentValueKind(field, rule.operator)
    const nextKind = segmentValueKind(field, operator)
    updateRule(groupId, rule.id, {
      operator,
      value: previousKind === nextKind ? rule.value : '',
    })
  }

  function handleSave() {
    const nextErrors = validateSegmentDraft(
      { id: initialSegment?.id, name, description, definition },
      { segments },
    )
    setErrors(nextErrors)
    if (Object.keys(nextErrors).length > 0) return

    onSave({
      id: initialSegment?.id,
      name: name.trim(),
      description: description.trim(),
      definition,
    })
  }

  const countLabel = !preview.ready
    ? '—'
    : preview.count.toLocaleString()
  const countCaption = !preview.ready
    ? 'Scanning contacts'
    : `of ${preview.scanned.toLocaleString()} contacts scanned`

  return (
    <section className="lists__builder" aria-labelledby="segment-builder-title">
      <button type="button" className="lists__back" onClick={onCancel}>
        <ArrowLeft size={14} aria-hidden="true" />
        All segments
      </button>

      <header className="lists__builder-head">
        <div>
          <p className="eyebrow">Saved segment</p>
          <h2 id="segment-builder-title">
            {initialSegment ? 'Edit segment' : 'New segment'}
          </h2>
          <p className="lists__builder-lead">
            Rules are combined in the browser, so the preview updates as you type. A
            segment with no complete rule matches nobody.
          </p>
        </div>
        <div className="lists__builder-head-actions">
          {initialSegment ? (
            <>
              <Button
                variant="ghost"
                size="sm"
                leadingIcon={Copy}
                onClick={() => onDuplicate(initialSegment)}
              >
                Duplicate
              </Button>
              <Button
                variant="quiet"
                size="sm"
                leadingIcon={Trash}
                onClick={() => onRequestDelete(initialSegment)}
              >
                Delete
              </Button>
            </>
          ) : null}
        </div>
      </header>

      <div className="lists__builder-grid">
        <div className="lists__builder-main">
          <section className="lists__builder-card" aria-labelledby="segment-details-title">
            <h3 id="segment-details-title">Details</h3>
            <div className="lists__form">
              <TextField
                id="segment-name"
                label="Segment name"
                value={name}
                onChange={(event) => {
                  setName(event.target.value)
                  setErrors((current) => ({ ...current, name: undefined }))
                }}
                placeholder="e.g. Northwind contacts who replied"
                error={errors.name}
                maxLength={120}
                disabled={saving || !canWrite}
              />
              <TextareaField
                id="segment-description"
                label="Description"
                optional
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                placeholder="What this segment is for."
                rows={2}
                maxLength={500}
                error={errors.description}
                disabled={saving || !canWrite}
              />
            </div>
          </section>

          <section className="lists__builder-card" aria-labelledby="segment-rules-title">
            <div className="lists__builder-card-head">
              <div>
                <h3 id="segment-rules-title">Rules</h3>
                <p className="lists__builder-card-copy">
                  Groups combine with <strong>{definition.match === 'any' ? 'OR' : 'AND'}</strong>.
                  Rules inside a group combine with{' '}
                  <strong>{definition.groups.every((group) => group.match === 'any') ? 'OR' : 'AND'}</strong>.
                </p>
              </div>
              <MatchToggle
                label="How groups combine"
                name="segment-match"
                value={definition.match}
                onChange={(value) => patchDefinition({ match: value })}
                options={[
                  { value: 'all', label: 'Match all groups' },
                  { value: 'any', label: 'Match any group' },
                ]}
              />
            </div>

            <div className="lists__groups">
              {definition.groups.map((group, groupIndex) => (
                <div className="lists__group" key={group.id}>
                  <div className="lists__group-head">
                    <div className="lists__group-title">
                      <span className="lists__group-number">Group {groupIndex + 1}</span>
                      <MatchToggle
                        label={`How rules in group ${groupIndex + 1} combine`}
                        name={`group-match-${group.id}`}
                        value={group.match}
                        onChange={(value) => updateGroup(group.id, { match: value })}
                        options={[
                          { value: 'all', label: 'All rules' },
                          { value: 'any', label: 'Any rule' },
                        ]}
                      />
                    </div>
                    <button
                      type="button"
                      className="lists__icon-button"
                      onClick={() => removeGroup(group.id)}
                      disabled={definition.groups.length === 1 || saving}
                      aria-label={`Remove group ${groupIndex + 1}`}
                      title={
                        definition.groups.length === 1
                          ? 'A segment needs at least one group'
                          : 'Remove group'
                      }
                    >
                      <Close size={15} />
                    </button>
                  </div>

                  <div className="lists__rules">
                    {group.rules.length === 0 ? (
                      <p className="lists__rules-empty">
                        No rules in this group yet. An empty group is ignored.
                      </p>
                    ) : null}

                    {group.rules.map((rule, ruleIndex) => {
                      const field = getSegmentField(rule.field)
                      const operators = segmentOperatorOptions(rule.field)
                      const kind = segmentValueKind(field, rule.operator)
                      return (
                        <div className="lists__rule" key={rule.id}>
                          <span className="lists__rule-number" aria-hidden="true">
                            {ruleIndex + 1}
                          </span>

                          <select
                            className="ui-select lists__rule-field"
                            value={rule.field}
                            onChange={(event) =>
                              handleFieldChange(group.id, rule, event.target.value)
                            }
                            disabled={saving}
                            aria-label={`Rule ${ruleIndex + 1} field`}
                          >
                            <option value="">Choose a field</option>
                            {SEGMENT_FIELDS.map((option) => (
                              <option key={option.key} value={option.key}>
                                {option.label}
                              </option>
                            ))}
                          </select>

                          <select
                            className="ui-select lists__rule-operator"
                            value={rule.operator}
                            onChange={(event) =>
                              handleOperatorChange(group.id, rule, event.target.value)
                            }
                            disabled={saving || !field}
                            aria-label={`Rule ${ruleIndex + 1} operator`}
                          >
                            <option value="">Operator</option>
                            {operators.map((operator) => (
                              <option key={operator.value} value={operator.value}>
                                {operator.label}
                              </option>
                            ))}
                          </select>

                          <div className="lists__rule-value">
                            <RuleValue
                              rule={rule}
                              field={field}
                              kind={kind}
                              lists={lists}
                              companies={companies}
                              tagOptions={tagOptions}
                              onChange={(value) =>
                                updateRule(group.id, rule.id, { value })
                              }
                              disabled={saving || !field || !rule.operator}
                            />
                          </div>

                          <span
                            className={`lists__rule-state${
                              isRuleComplete(rule) ? ' is-complete' : ''
                            }`}
                            title={isRuleComplete(rule) ? 'Rule is complete' : 'Rule needs attention'}
                          >
                            {isRuleComplete(rule) ? (
                              <Check size={14} aria-hidden="true" />
                            ) : (
                              <AlertTriangle size={14} aria-hidden="true" />
                            )}
                            <span className="visually-hidden">
                              {isRuleComplete(rule) ? 'Complete' : 'Incomplete'}
                            </span>
                          </span>

                          <button
                            type="button"
                            className="lists__icon-button"
                            onClick={() => removeRule(group.id, rule.id)}
                            disabled={saving}
                            aria-label={`Remove rule ${ruleIndex + 1}`}
                          >
                            <Close size={15} />
                          </button>
                        </div>
                      )
                    })}
                  </div>

                  <Button
                    variant="quiet"
                    size="sm"
                    leadingIcon={Plus}
                    onClick={() => addRule(group.id)}
                    disabled={saving}
                  >
                    Add rule
                  </Button>
                </div>
              ))}
            </div>

            <div className="lists__rules-footer">
              <Button
                variant="ghost"
                size="sm"
                leadingIcon={Plus}
                onClick={addGroup}
                disabled={saving}
              >
                Add group
              </Button>
              {errors.rules ? (
                <p className="lists__field-error" role="alert">
                  {errors.rules}
                </p>
              ) : null}
            </div>
          </section>
        </div>

        <aside className="lists__builder-aside">
          <section className="lists__preview" aria-labelledby="segment-preview-title">
            <div className="lists__preview-head">
              <h3 id="segment-preview-title">Estimated audience</h3>
              {snapshotStatus === 'ready' ? (
                <Badge tone="lime" size="sm" dot>
                  Live preview
                </Badge>
              ) : null}
            </div>

            {snapshotStatus === 'loading' || snapshotStatus === 'idle' ? (
              <div className="lists__preview-loading" role="status">
                <Skeleton variant="text" width="42%" height={34} />
                <Skeleton variant="text" lines={2} />
              </div>
            ) : snapshotStatus === 'error' ? (
              <ErrorPanel
                compact
                title="Couldn’t scan contacts"
                description={snapshotError?.message || undefined}
                requestId={snapshotError?.requestId}
                onRetry={onRetrySnapshot}
              />
            ) : (
              <>
                <p className="lists__preview-count">{countLabel}</p>
                <p className="lists__preview-caption">{countCaption}</p>
                <div className="lists__preview-meter" aria-hidden="true">
                  <span
                    style={{
                      width: `${
                        preview.scanned > 0
                          ? Math.min(100, Math.round((preview.count / preview.scanned) * 100))
                          : 0
                      }%`,
                    }}
                  />
                </div>

                {preview.truncated ? (
                  <p className="lists__preview-note">
                    This preview stops at {SEGMENT_SCAN_MAX.toLocaleString()} contacts. The
                    saved segment is still evaluated against the same cap.
                  </p>
                ) : null}

                {snapshot?.membershipTruncated ? (
                  <p className="lists__preview-note">
                    One or more list memberships are larger than the browser lookup cap, so
                    list rules may undercount.
                  </p>
                ) : null}

                {hasRules ? (
                  <div className="lists__preview-sample">
                    <p className="lists__preview-sample-title">First matches</p>
                    <ul>
                      {preview.matched.slice(0, 5).map((contact) => (
                        <li key={contact.id}>
                          <button
                            type="button"
                            className="lists__preview-person"
                            onClick={() => navigate(`/app/contacts/${contact.id}`)}
                          >
                            <span>{contact.fullName}</span>
                            <span>{contact.email}</span>
                          </button>
                          <StatusBadge status={contact.status} size="sm" dot={false} />
                        </li>
                      ))}
                    </ul>
                    {preview.count > 5 ? (
                      <p className="lists__preview-more">
                        +{(preview.count - 5).toLocaleString()} more matching contacts
                      </p>
                    ) : null}
                  </div>
                ) : preview.ready ? (
                  <p className="lists__preview-empty">
                    <Users size={15} aria-hidden="true" />
                    No contacts match this definition yet.
                  </p>
                ) : null}

                <Button
                  variant="quiet"
                  size="sm"
                  leadingIcon={Refresh}
                  onClick={onRetrySnapshot}
                  className="lists__preview-refresh"
                >
                  Rescan contacts
                </Button>
              </>
            )}
          </section>

          <section className="lists__save-card" aria-labelledby="segment-save-title">
            <h3 id="segment-save-title">
              {initialSegment ? 'Save changes' : 'Save segment'}
            </h3>
            <p className="lists__save-copy">
              {summary || 'Add at least one complete rule to preview an audience.'}
            </p>

            {saveError ? (
              <p className="lists__error-banner" role="alert">
                {typeof saveError === 'string' ? saveError : saveError.message}
              </p>
            ) : null}

            <div className="lists__save-actions">
              <Button
                variant="primary"
                onClick={handleSave}
                loading={saving}
                disabled={!canWrite || snapshotStatus === 'loading'}
              >
                {initialSegment ? 'Save changes' : 'Save segment'}
              </Button>
              <Button variant="ghost" onClick={onCancel} disabled={saving}>
                Cancel
              </Button>
            </div>

            <p className="lists__save-note">
              Segments are stored in this browser in <code>reyvo.segments.v1</code>. The
              campaign wizard reads them through the shared audience contract.
            </p>
          </section>
        </aside>
      </div>
    </section>
  )
}
