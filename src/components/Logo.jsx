import './logo.css'

export function Logo({ size = 28, showWordmark = true, className = '' }) {
  return (
    <span className={`logo ${className}`.trim()} style={{ '--logo-size': `${size}px` }}>
      <span className="logo__mark" aria-hidden="true">
        <svg viewBox="0 0 32 32" role="presentation" focusable="false">
          <path
            d="M8 25V7h8.6c4.2 0 6.9 2.3 6.9 6 0 2.6-1.4 4.6-3.8 5.5L24 25h-5.3l-3.8-5.7h-2.2V25H8Zm4.7-9.6h3.7c1.5 0 2.4-.8 2.4-2.1 0-1.4-.9-2.1-2.4-2.1h-3.7v4.2Z"
            fill="currentColor"
          />
        </svg>
      </span>
      {showWordmark ? <span className="logo__word">reyvo</span> : null}
    </span>
  )
}
