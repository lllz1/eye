type IconName =
  | 'eye'
  | 'spark'
  | 'grid'
  | 'brush'
  | 'undo'
  | 'trash'
  | 'download'
  | 'camera'
  | 'settings'
  | 'arrow'
  | 'check'
  | 'close'
  | 'speaker'
  | 'target'
  | 'refresh'
  | 'play'

export function Icon({
  name,
  size = 18,
  className = '',
}: {
  name: IconName
  size?: number
  className?: string
}) {
  const common = {
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.7,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    className,
    'aria-hidden': true,
  }

  switch (name) {
    case 'eye':
      return (
        <svg {...common}>
          <path d="M2.5 12s3.5-6.2 9.5-6.2 9.5 6.2 9.5 6.2-3.5 6.2-9.5 6.2S2.5 12 2.5 12Z" />
          <circle cx="12" cy="12" r="2.7" />
        </svg>
      )
    case 'spark':
      return (
        <svg {...common}>
          <path d="m12 2 1.6 6.4L20 10l-6.4 1.6L12 18l-1.6-6.4L4 10l6.4-1.6L12 2Z" />
          <path d="m19 16 .7 2.3L22 19l-2.3.7L19 22l-.7-2.3L16 19l2.3-.7L19 16Z" />
        </svg>
      )
    case 'grid':
      return (
        <svg {...common}>
          <rect x="3" y="3" width="7" height="7" rx="1.5" />
          <rect x="14" y="3" width="7" height="7" rx="1.5" />
          <rect x="3" y="14" width="7" height="7" rx="1.5" />
          <rect x="14" y="14" width="7" height="7" rx="1.5" />
        </svg>
      )
    case 'brush':
      return (
        <svg {...common}>
          <path d="m14.5 4.5 5 5L9 20H4v-5L14.5 4.5Z" />
          <path d="m12 7 5 5" />
          <path d="M4 20c1.6-.2 2.6-.9 3-2.2" />
        </svg>
      )
    case 'undo':
      return (
        <svg {...common}>
          <path d="M9 7 4 12l5 5" />
          <path d="M4 12h9a5 5 0 0 1 5 5v1" />
        </svg>
      )
    case 'trash':
      return (
        <svg {...common}>
          <path d="M4 7h16" />
          <path d="m9 7 .8-2h4.4L15 7" />
          <path d="m6 7 .8 13h10.4L18 7" />
          <path d="M10 11v5M14 11v5" />
        </svg>
      )
    case 'download':
      return (
        <svg {...common}>
          <path d="M12 3v12" />
          <path d="m7 10 5 5 5-5" />
          <path d="M4 20h16" />
        </svg>
      )
    case 'camera':
      return (
        <svg {...common}>
          <path d="M4 7h3l1.5-2h7L17 7h3v12H4V7Z" />
          <circle cx="12" cy="13" r="3.2" />
        </svg>
      )
    case 'settings':
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-2.8 2.8-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6v.2h-4V21a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1L4.2 17l.1-.1a1.7 1.7 0 0 0 .3-1.9A1.7 1.7 0 0 0 3 14H2.8v-4H3a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9L4.2 7 7 4.2l.1.1A1.7 1.7 0 0 0 9 4.6a1.7 1.7 0 0 0 1-1.6v-.2h4V3a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1L19.8 7l-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.6 1h.2v4H21a1.7 1.7 0 0 0-1.6 1Z" />
        </svg>
      )
    case 'arrow':
      return (
        <svg {...common}>
          <path d="M5 12h14" />
          <path d="m14 7 5 5-5 5" />
        </svg>
      )
    case 'check':
      return (
        <svg {...common}>
          <path d="m4 12 5 5L20 6" />
        </svg>
      )
    case 'close':
      return (
        <svg {...common}>
          <path d="m6 6 12 12M18 6 6 18" />
        </svg>
      )
    case 'speaker':
      return (
        <svg {...common}>
          <path d="M4 10v4h3l4 3V7l-4 3H4Z" />
          <path d="M15 9.5a4 4 0 0 1 0 5M17.5 7a7 7 0 0 1 0 10" />
        </svg>
      )
    case 'target':
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="8" />
          <circle cx="12" cy="12" r="3" />
          <path d="M12 2v3M12 19v3M2 12h3M19 12h3" />
        </svg>
      )
    case 'refresh':
      return (
        <svg {...common}>
          <path d="M20 7v5h-5" />
          <path d="M4 17v-5h5" />
          <path d="M6.1 8a7 7 0 0 1 11.6-1L20 9M4 15l2.3 2A7 7 0 0 0 18 16" />
        </svg>
      )
    case 'play':
      return (
        <svg {...common}>
          <path d="m9 5 10 7-10 7V5Z" />
        </svg>
      )
  }
}
