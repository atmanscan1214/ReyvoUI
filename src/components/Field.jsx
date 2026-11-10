import { useId, useState } from 'react'
import { Eye, EyeOff } from './icons'
import './field.css'

function describedBy({ id, error, hint }) {
  if (error) return `${id}-error`
  if (hint) return `${id}-hint`
  return undefined
}

export function TextField({
  id,
  label,
  error,
  hint,
  optional = false,
  icon = null,
  className = '',
  ...inputProps
}) {
  const describedById = describedBy({ id, error, hint })

  return (
    <div className={`field ${error ? 'field--invalid' : ''} ${className}`.trim()}>
      <label className="field__label" htmlFor={id}>
        {label}
        {optional ? <span className="field__optional">Optional</span> : null}
      </label>

      <div className="field__control">
        {icon ? <span className="field__icon">{icon}</span> : null}
        <input
          id={id}
          className={`field__input ${icon ? 'field__input--icon' : ''}`.trim()}
          aria-invalid={error ? 'true' : undefined}
          aria-describedby={describedById}
          {...inputProps}
        />
      </div>

      {error ? (
        <p className="field__error" id={`${id}-error`}>
          {error}
        </p>
      ) : hint ? (
        <p className="field__hint" id={`${id}-hint`}>
          {hint}
        </p>
      ) : null}
    </div>
  )
}

export function PasswordField({
  id,
  label,
  error,
  hint,
  autoComplete = 'new-password',
  value,
  onChange,
  onBlur,
  placeholder,
  ...inputProps
}) {
  const [visible, setVisible] = useState(false)
  const describedById = describedBy({ id, error, hint })

  return (
    <div className={`field ${error ? 'field--invalid' : ''}`.trim()}>
      <label className="field__label" htmlFor={id}>
        {label}
      </label>

      <div className="field__control field__control--password">
        <input
          id={id}
          className="field__input field__input--password"
          type={visible ? 'text' : 'password'}
          value={value}
          onChange={onChange}
          onBlur={onBlur}
          placeholder={placeholder}
          autoComplete={autoComplete}
          aria-invalid={error ? 'true' : undefined}
          aria-describedby={describedById}
          {...inputProps}
        />
        <button
          type="button"
          className="field__toggle"
          onClick={() => setVisible((current) => !current)}
          aria-label={visible ? 'Hide password' : 'Show password'}
          title={visible ? 'Hide password' : 'Show password'}
        >
          {visible ? <EyeOff size={19} /> : <Eye size={19} />}
        </button>
      </div>

      {error ? (
        <p className="field__error" id={`${id}-error`}>
          {error}
        </p>
      ) : hint ? (
        <p className="field__hint" id={`${id}-hint`}>
          {hint}
        </p>
      ) : null}
    </div>
  )
}

export function SelectField({
  id,
  label,
  error,
  hint,
  children,
  className = '',
  ...selectProps
}) {
  const describedById = describedBy({ id, error, hint })

  return (
    <div className={`field ${error ? 'field--invalid' : ''} ${className}`.trim()}>
      <label className="field__label" htmlFor={id}>
        {label}
      </label>

      <div className="field__control field__control--select">
        <select
          id={id}
          className="field__input field__select"
          aria-invalid={error ? 'true' : undefined}
          aria-describedby={describedById}
          {...selectProps}
        >
          {children}
        </select>
        <svg className="field__chevron" viewBox="0 0 20 20" aria-hidden="true">
          <path
            d="m5.5 8 4.5 4.5L14.5 8"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.7"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </div>

      {error ? (
        <p className="field__error" id={`${id}-error`}>
          {error}
        </p>
      ) : hint ? (
        <p className="field__hint" id={`${id}-hint`}>
          {hint}
        </p>
      ) : null}
    </div>
  )
}

export function CheckboxField({ id, checked, onChange, error, children, ...inputProps }) {
  const generatedId = useId()
  const checkboxId = id || generatedId

  return (
    <div className={`checkbox ${error ? 'checkbox--invalid' : ''}`.trim()}>
      <input
        id={checkboxId}
        className="checkbox__input"
        type="checkbox"
        checked={checked}
        onChange={onChange}
        aria-invalid={error ? 'true' : undefined}
        aria-describedby={error ? `${checkboxId}-error` : undefined}
        {...inputProps}
      />
      <label className="checkbox__label" htmlFor={checkboxId}>
        {children}
      </label>
      {error ? (
        <p className="field__error" id={`${checkboxId}-error`}>
          {error}
        </p>
      ) : null}
    </div>
  )
}
