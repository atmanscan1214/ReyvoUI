import { Check } from '../icons'

/**
 * Ordered progress for wizards and import flows. Completed and current steps
 * are clickable when `onStepChange` is provided; future steps stay locked
 * unless `allowFuture` is set.
 *
 * steps: [{ id?, label, description? }]
 */
export function Stepper({
  steps,
  current = 0,
  onStepChange,
  orientation = 'horizontal',
  allowFuture = false,
  label = 'Progress',
  className = '',
}) {
  const classes = ['ui-stepper', `ui-stepper--${orientation}`, className]
    .filter(Boolean)
    .join(' ')

  return (
    <ol className={classes} aria-label={label}>
      {steps.map((step, index) => {
        const state = index < current ? 'complete' : index === current ? 'current' : 'upcoming'
        const clickable =
          Boolean(onStepChange) && (allowFuture || state !== 'upcoming')

        const content = (
          <>
            <span className="ui-stepper__index" aria-hidden="true">
              {state === 'complete' ? <Check size={15} /> : index + 1}
            </span>
            <span className="ui-stepper__copy">
              <strong>{step.label}</strong>
              {step.description ? <span>{step.description}</span> : null}
            </span>
          </>
        )

        return (
          <li
            key={step.id ?? step.label}
            className="ui-stepper__item"
            data-state={state}
            aria-current={state === 'current' ? 'step' : undefined}
          >
            {clickable ? (
              <button
                type="button"
                className="ui-stepper__button"
                onClick={() => onStepChange(index, step)}
              >
                {content}
              </button>
            ) : (
              <div className="ui-stepper__button" aria-disabled={state === 'upcoming' || undefined}>
                {content}
              </div>
            )}
          </li>
        )
      })}
    </ol>
  )
}
