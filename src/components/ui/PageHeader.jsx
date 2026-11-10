import { useId } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft } from '../icons'

/**
 * Standard screen header: eyebrow, display title, supporting copy, metadata
 * badges, and right-aligned actions. Keeps every product screen's first fold
 * aligned without copying layout markup.
 */
export function PageHeader({
  id,
  eyebrow,
  title,
  description,
  meta,
  actions,
  backTo,
  backLabel = 'Back',
  className = '',
}) {
  const generatedId = useId()
  const headingId = id || generatedId
  const classes = ['ui-page-head', className].filter(Boolean).join(' ')

  return (
    <header className={classes}>
      <div className="ui-page-head__main">
        {backTo ? (
          <Link to={backTo} className="ui-page-head__back">
            <ArrowLeft size={15} aria-hidden="true" />
            {backLabel}
          </Link>
        ) : null}

        {eyebrow ? <p className="eyebrow">{eyebrow}</p> : null}
        <h1 id={headingId}>{title}</h1>
        {description ? <p className="ui-page-head__description">{description}</p> : null}
        {meta ? <div className="ui-page-head__meta">{meta}</div> : null}
      </div>

      {actions ? <div className="ui-page-head__actions">{actions}</div> : null}
    </header>
  )
}
