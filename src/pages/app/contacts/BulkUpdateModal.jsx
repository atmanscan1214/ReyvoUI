import { useEffect, useState } from 'react'
import { SelectField, TextField } from '../../../components/Field'
import { Button, Modal } from '../../../components/ui'
import { CONTACT_STATUSES } from '../../../lib/contacts'

const NO_COMPANY = '__none__'

/**
 * Shared fields for a bulk contact update. Sending an empty field leaves that
 * column untouched on every selected record, so a status-only change never
 * clears a title or company.
 */
export function BulkUpdateModal({
  open,
  count = 0,
  companies = [],
  running = false,
  progress = null,
  error = null,
  onClose,
  onApply,
}) {
  const [status, setStatus] = useState('')
  const [companyId, setCompanyId] = useState('')
  const [source, setSource] = useState('')

  useEffect(() => {
    if (!open) return
    setStatus('')
    setCompanyId('')
    setSource('')
  }, [open])

  const patch = {}
  if (status) patch.status = status
  if (companyId === NO_COMPANY) patch.company_id = null
  else if (companyId) patch.company_id = companyId
  if (source.trim()) patch.source = source.trim()

  const changed = Object.keys(patch).length > 0
  const errorMessage = typeof error === 'string' ? error : error?.message
  const percentage = progress
    ? Math.round((progress.done / Math.max(1, progress.total)) * 100)
    : 0

  return (
    <Modal
      open={open}
      title={`Update ${count === 1 ? '1 contact' : `${count} contacts`}`}
      description="Only the fields you change are applied. Everything else stays as it is."
      size="md"
      onClose={running ? undefined : onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={running}>
            Cancel
          </Button>
          <Button
            variant="primary"
            onClick={() => onApply(patch)}
            loading={running}
            disabled={!changed}
          >
            {errorMessage ? 'Try again' : 'Update contacts'}
          </Button>
        </>
      }
    >
      <div className="contacts__bulk-form">
        <SelectField
          id="bulk-contact-status"
          label="Status"
          value={status}
          onChange={(event) => setStatus(event.target.value)}
          disabled={running}
          hint="Leave unchanged unless you pick a status."
        >
          <option value="">Leave status unchanged</option>
          {CONTACT_STATUSES.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </SelectField>

        <SelectField
          id="bulk-contact-company"
          label="Company"
          value={companyId}
          onChange={(event) => setCompanyId(event.target.value)}
          disabled={running}
          hint="Leave unchanged to keep each contact's current company."
        >
          <option value="">Leave company unchanged</option>
          <option value={NO_COMPANY}>Remove company</option>
          {companies.map((company) => (
            <option key={company.id} value={company.id}>
              {company.name}
            </option>
          ))}
        </SelectField>

        <TextField
          id="bulk-contact-source"
          label="Source"
          optional
          value={source}
          onChange={(event) => setSource(event.target.value)}
          placeholder="Leave unchanged"
          maxLength={120}
          disabled={running}
          hint="Applied to every selected contact when filled in."
        />

        {progress ? (
          <div className="contacts__bulk-progress">
            <p role="status">
              Updating {progress.done.toLocaleString()} of {progress.total.toLocaleString()}…
            </p>
            <div className="contacts__progress" aria-hidden="true">
              <span style={{ width: `${percentage}%` }} />
            </div>
          </div>
        ) : null}

        {errorMessage ? (
          <p className="contacts__bulk-error" role="alert">
            {errorMessage}
          </p>
        ) : null}

        <p className="contacts__merge-note">
          Every changed contact writes a <code>contact.updated</code> entry to the audit
          log.
        </p>
      </div>
    </Modal>
  )
}
