import { useEffect, useId, useRef, useState } from 'react'
import { Building, Close, Search } from '../../../components/icons'
import { listCompanies } from '../../../lib/companies'

/**
 * Searchable company selector for the contact form. The API exposes no
 * lightweight company index, so this searches `/companies?search=` and shows
 * the first few matches. Selecting a company stores its id; the contact API
 * validates that the company belongs to the tenant.
 */
export function CompanyPicker({
  value,
  selectedCompany = null,
  onChange,
  disabled = false,
  error,
}) {
  const searchId = useId()
  const [query, setQuery] = useState('')
  const [searching, setSearching] = useState(!selectedCompany)
  const [results, setResults] = useState([])
  const [status, setStatus] = useState('idle')
  const inputRef = useRef(null)

  // Reset when the modal opens a different record or clears the selection.
  useEffect(() => {
    setSearching(!selectedCompany)
    setQuery('')
    setResults([])
    setStatus('idle')
  }, [value, selectedCompany])

  useEffect(() => {
    if (!searching || disabled) return undefined

    const controller = new AbortController()
    const timer = setTimeout(() => {
      setStatus('loading')
      listCompanies({ search: query.trim() || undefined, limit: 6 }, controller.signal)
        .then((data) => {
          setResults(data.items)
          setStatus('ready')
        })
        .catch((caught) => {
          if (caught?.name === 'AbortError') return
          setResults([])
          setStatus('error')
        })
    }, query ? 250 : 0)

    return () => {
      clearTimeout(timer)
      controller.abort()
    }
  }, [query, searching, disabled])

  function choose(company) {
    onChange?.(company)
    setSearching(false)
    setQuery('')
  }

  function startSearch() {
    setSearching(true)
    // Focus after the input mounts.
    requestAnimationFrame(() => inputRef.current?.focus())
  }

  function clear() {
    onChange?.(null)
    setSearching(true)
    setQuery('')
    requestAnimationFrame(() => inputRef.current?.focus())
  }

  const describedBy = error ? `${searchId}-error` : undefined

  return (
    <div className={`field contact-company ${error ? 'field--invalid' : ''}`.trim()}>
      <label className="field__label" htmlFor={searchId}>
        Company
        <span className="field__optional">Optional</span>
      </label>

      {selectedCompany && !searching ? (
        <div className="contact-company__selected">
          <span className="contact-company__selected-icon" aria-hidden="true">
            <Building size={16} />
          </span>
          <span className="contact-company__selected-main">
            <span className="contact-company__selected-name">{selectedCompany.name}</span>
            {selectedCompany.domain ? (
              <span className="contact-company__selected-meta">{selectedCompany.domain}</span>
            ) : null}
          </span>
          <span className="contact-company__selected-actions">
            <button
              type="button"
              className="contact-company__link"
              onClick={startSearch}
              disabled={disabled}
            >
              Change
            </button>
            <button
              type="button"
              className="contact-company__icon-btn"
              onClick={clear}
              disabled={disabled}
              aria-label={`Remove ${selectedCompany.name}`}
              title="Remove company"
            >
              <Close size={14} />
            </button>
          </span>
        </div>
      ) : (
        <>
          <div className="field__control">
            <span className="field__icon" aria-hidden="true">
              <Search size={16} />
            </span>
            <input
              id={searchId}
              ref={inputRef}
              type="search"
              className="field__input field__input--icon"
              placeholder="Search companies by name or domain…"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              disabled={disabled}
              aria-invalid={error ? 'true' : undefined}
              aria-describedby={describedBy}
              autoComplete="off"
            />
          </div>

          {searching && !disabled ? (
            <div className="contact-company__results" aria-live="polite">
              {status === 'loading' ? (
                <p className="contact-company__hint">Searching companies…</p>
              ) : status === 'error' ? (
                <p className="contact-company__hint contact-company__hint--error">
                  Company search is unavailable. You can still save the contact without one.
                </p>
              ) : results.length === 0 ? (
                <p className="contact-company__hint">
                  {query
                    ? 'No companies match. Add it in Companies first, then attach the contact.'
                    : 'No companies yet. Add one in Companies first, then attach the contact.'}
                </p>
              ) : (
                <ul className="contact-company__list">
                  {results.map((company) => (
                    <li key={company.id}>
                      <button
                        type="button"
                        className="contact-company__option"
                        onClick={() => choose(company)}
                      >
                        <span className="contact-company__option-name">{company.name}</span>
                        <span className="contact-company__option-meta">
                          {[company.domain, company.industry].filter(Boolean).join(' · ') ||
                            'Company'}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ) : null}

          {selectedCompany && searching ? (
            <button
              type="button"
              className="contact-company__cancel"
              onClick={() => {
                setSearching(false)
                setQuery('')
              }}
            >
              Keep {selectedCompany.name}
            </button>
          ) : null}
        </>
      )}

      {error ? (
        <p className="field__error" id={`${searchId}-error`}>
          {error}
        </p>
      ) : (
        <p className="field__hint">
          {selectedCompany
            ? 'This contact will appear on the company record.'
            : 'Attach the contact to an employer for company context.'}
        </p>
      )}
    </div>
  )
}
