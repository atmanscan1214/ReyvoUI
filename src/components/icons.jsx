const base = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.7,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
}

function Svg({ size = 20, children, ...rest }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      aria-hidden="true"
      focusable="false"
      {...base}
      {...rest}
    >
      {children}
    </svg>
  )
}

export const ArrowRight = (props) => (
  <Svg {...props}>
    <path d="M5 12h14M13 6l6 6-6 6" />
  </Svg>
)

export const ArrowLeft = (props) => (
  <Svg {...props}>
    <path d="M19 12H5M11 18l-6-6 6-6" />
  </Svg>
)

export const Check = (props) => (
  <Svg {...props}>
    <path d="m5 12.5 4.5 4.5L19 7.5" />
  </Svg>
)

export const Menu = (props) => (
  <Svg {...props}>
    <path d="M4 7h16M4 12h16M4 17h16" />
  </Svg>
)

export const Close = (props) => (
  <Svg {...props}>
    <path d="M6 6l12 12M18 6 6 18" />
  </Svg>
)

export const Eye = (props) => (
  <Svg {...props}>
    <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z" />
    <circle cx="12" cy="12" r="3" />
  </Svg>
)

export const EyeOff = (props) => (
  <Svg {...props}>
    <path d="M3 3l18 18M10.6 6c.5-.1.9-.1 1.4-.1 6 0 9.5 6.1 9.5 6.1a17 17 0 0 1-2.8 3.4M6.4 7.5A16.6 16.6 0 0 0 2.5 12S6 18.1 12 18.1c1.4 0 2.7-.3 3.8-.8" />
    <path d="M9.9 10a3 3 0 0 0 4.1 4.2" />
  </Svg>
)

export const Shield = (props) => (
  <Svg {...props}>
    <path d="M12 3 5 6v5.4c0 4.4 2.9 8.2 7 9.6 4.1-1.4 7-5.2 7-9.6V6l-7-3Z" />
    <path d="m9 11.8 2.1 2.2L15.3 9.6" />
  </Svg>
)

export const Sparkles = (props) => (
  <Svg {...props}>
    <path d="M12 3.5 13.5 8 18 9.5 13.5 11 12 15.5 10.5 11 6 9.5 10.5 8 12 3.5Z" />
    <path d="M18.5 15.5l.7 2 2 .7-2 .7-.7 2-.7-2-2-.7 2-.7.7-2Z" />
    <path d="M5 15l.6 1.6L7.2 17l-1.6.6L5 19.2l-.6-1.6L2.8 17l1.6-.4L5 15Z" />
  </Svg>
)

export const Inbox = (props) => (
  <Svg {...props}>
    <path d="M4 4.8h16l1.5 9.4H16l-1.4 2.6h-5.2L8 14.2H2.5L4 4.8Z" />
    <path d="M2.5 14.2V19h19v-4.8" />
  </Svg>
)

export const Send = (props) => (
  <Svg {...props}>
    <path d="M21 3 10.5 13.5M21 3l-6.6 18-3.9-7.5L3 9.6 21 3Z" />
  </Svg>
)

export const Chart = (props) => (
  <Svg {...props}>
    <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />
  </Svg>
)

export const Users = (props) => (
  <Svg {...props}>
    <circle cx="9" cy="8" r="3.2" />
    <path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6" />
    <path d="M16 5.2a3.2 3.2 0 0 1 0 5.6M18 14.4c2 .7 3.4 2.5 3.4 4.6" />
  </Svg>
)

export const Mail = (props) => (
  <Svg {...props}>
    <rect x="2.5" y="5" width="19" height="14" rx="2.5" />
    <path d="m3.5 7 8.5 6 8.5-6" />
  </Svg>
)

export const Building = (props) => (
  <Svg {...props}>
    <path d="M4 21V5.5A1.5 1.5 0 0 1 5.5 4h7A1.5 1.5 0 0 1 14 5.5V21" />
    <path d="M14 10h4.5A1.5 1.5 0 0 1 20 11.5V21M2 21h20M7 8h4M7 12h4M7 16h4M17 14h0M17 18h0" />
  </Svg>
)

export const Clock = (props) => (
  <Svg {...props}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7v5.3l3.4 2" />
  </Svg>
)

export const Globe = (props) => (
  <Svg {...props}>
    <circle cx="12" cy="12" r="9" />
    <path d="M3.5 9h17M3.5 15h17M12 3c2.4 2.5 3.7 5.6 3.7 9s-1.3 6.5-3.7 9c-2.4-2.5-3.7-5.6-3.7-9S9.6 5.5 12 3Z" />
  </Svg>
)

export const Lock = (props) => (
  <Svg {...props}>
    <rect x="4" y="10" width="16" height="10.5" rx="2.5" />
    <path d="M8 10V7.5a4 4 0 0 1 8 0V10" />
  </Svg>
)

export const MailCheck = (props) => (
  <Svg {...props}>
    <path d="M2.5 6.5h13v6" />
    <path d="M2.5 6.5h13v11h-13v-11ZM2.5 7.5l6.5 4.5 6.5-4.5" />
    <path d="m15.5 17.5 2 2 4-4.5" />
  </Svg>
)

export const Database = (props) => (
  <Svg {...props}>
    <ellipse cx="12" cy="5.5" rx="7.5" ry="3" />
    <path d="M4.5 5.5v13c0 1.7 3.4 3 7.5 3s7.5-1.3 7.5-3v-13" />
    <path d="M4.5 12c0 1.7 3.4 3 7.5 3s7.5-1.3 7.5-3" />
  </Svg>
)

export const Pause = (props) => (
  <Svg {...props}>
    <rect x="6" y="5" width="4" height="14" rx="1" />
    <rect x="14" y="5" width="4" height="14" rx="1" />
  </Svg>
)
