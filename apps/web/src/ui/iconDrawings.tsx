import type { ReactNode } from 'react'

/*
 * The "Iconografía" board as one sprite: a <symbol> per icon, 24×24 viewBox,
 * rounded ends, colour from currentColor. Stroke width is left to the <Icon> that
 * uses the symbol, so it can be compensated at 16, 20 and 32 px.
 */
const stroke = { stroke: 'currentColor', strokeLinecap: 'round', strokeLinejoin: 'round' } as const
const fill = { fill: 'currentColor' } as const

export const drawings = {
  // Navigation
  home: <path {...stroke} d="M3.5 10.5 12 4l8.5 6.5V19a1.5 1.5 0 0 1-1.5 1.5h-4.5v-6h-5v6H5A1.5 1.5 0 0 1 3.5 19v-8.5z" />,
  library: (
    <>
      <rect {...stroke} x="3.5" y="4" width="5" height="16" rx="1.4" />
      <rect {...stroke} x="10.5" y="4" width="4" height="16" rx="1.4" />
      <path {...stroke} d="m17.2 5.2 3.2 14.2" />
    </>
  ),
  room: (
    <>
      <ellipse {...stroke} cx="12" cy="12" rx="9" ry="5.5" />
      <circle {...fill} cx="12" cy="12" r="1.6" />
    </>
  ),
  search: (
    <>
      <circle {...stroke} cx="11" cy="11" r="6.5" />
      <path {...stroke} d="m16 16 4 4" />
    </>
  ),
  profile: (
    <>
      <circle {...stroke} cx="12" cy="8.5" r="3.6" />
      <path {...stroke} d="M5 20c0-3.3 3.1-5.5 7-5.5s7 2.2 7 5.5" />
    </>
  ),
  settings: (
    <>
      <circle {...stroke} cx="12" cy="12" r="3" />
      <path
        {...stroke}
        d="M12 3v2.2M12 18.8V21M21 12h-2.2M5.2 12H3M18.4 5.6l-1.6 1.6M7.2 16.8l-1.6 1.6M18.4 18.4l-1.6-1.6M7.2 7.2 5.6 5.6"
      />
    </>
  ),
  chevron: <path {...stroke} d="M9.5 5.5 16 12l-6.5 6.5" />,
  expand: <path {...stroke} d="M6 9.5 12 15.5l6-6" />,
  menu: <path {...stroke} d="M4 6.5h16M4 12h16M4 17.5h16" />,

  // Player
  play: <path {...fill} d="M7 4.5 19.5 12 7 19.5v-15z" />,
  pause: <path {...fill} d="M8 4.5h3.2v15H8zM12.8 4.5H16v15h-3.2z" />,
  previous: (
    <>
      <path {...fill} d="M19 5.5 8.5 12 19 18.5v-13z" />
      <path {...stroke} strokeWidth="2.2" d="M5.5 5.5v13" />
    </>
  ),
  next: (
    <>
      <path {...fill} d="M5 5.5 15.5 12 5 18.5v-13z" />
      <path {...stroke} strokeWidth="2.2" d="M18.5 5.5v13" />
    </>
  ),
  'street-back': <path {...fill} d="M20 5.5 12.5 12 20 18.5v-13zM11 5.5 3.5 12 11 18.5v-13z" />,
  'street-forward': <path {...fill} d="M4 5.5 11.5 12 4 18.5v-13zM13 5.5 20.5 12 13 18.5v-13z" />,
  speed: (
    <>
      <path {...stroke} d="M4 17a8 8 0 1 1 16 0" />
      <path {...stroke} d="m12 13 4.5-3.5" />
    </>
  ),
  repeat: (
    <>
      <path {...stroke} d="M4 8h13.5a3.5 3.5 0 0 1 0 7H10" />
      <path {...stroke} d="m7.5 4.5-3.5 3.5 3.5 3.5M12.5 11.5 9 15l3.5 3.5" />
    </>
  ),
  'in-progress': <path {...stroke} strokeWidth="2.2" d="M4 14v-4M9 19V5M14 16V8M19 13v-2" />,
  history: (
    <>
      <path {...stroke} d="M12 21a9 9 0 1 0-9-9" />
      <path {...stroke} d="M3 16v-4h4" />
      <path {...stroke} d="M12 8v4.5l3 1.8" />
    </>
  ),

  // Room and collaboration
  master: <path {...stroke} d="M3 7.5 7.5 12 12 5l4.5 7L21 7.5 19.5 18h-15L3 7.5z" />,
  live: (
    <>
      <circle {...stroke} cx="12" cy="12" r="8.5" />
      <circle {...fill} cx="12" cy="12" r="3" />
    </>
  ),
  link: (
    <>
      <path {...stroke} d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1" />
      <path {...stroke} d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" />
    </>
  ),
  copy: (
    <>
      <rect {...stroke} x="9" y="9" width="11" height="11" rx="2" />
      <path {...stroke} d="M15 5.5A1.5 1.5 0 0 0 13.5 4h-8A1.5 1.5 0 0 0 4 5.5v8A1.5 1.5 0 0 0 5.5 15" />
    </>
  ),
  participants: (
    <>
      <circle {...stroke} cx="8.5" cy="9" r="3.2" />
      <circle {...stroke} cx="16" cy="10.5" r="2.6" />
      <path {...stroke} d="M3 19c0-2.8 2.5-4.6 5.5-4.6S14 16.2 14 19M15.5 15c2.6.2 5.5 1.4 5.5 4" />
    </>
  ),
  locked: (
    <>
      <rect {...stroke} x="5" y="10.5" width="14" height="9.5" rx="2" />
      <path {...stroke} d="M8.5 10.5V7.8a3.5 3.5 0 0 1 7 0v2.7" />
    </>
  ),
  share: (
    <>
      <circle {...stroke} cx="6.5" cy="12" r="2.5" />
      <circle {...stroke} cx="17" cy="6.5" r="2.5" />
      <circle {...stroke} cx="17" cy="17.5" r="2.5" />
      <path {...stroke} d="m8.8 10.8 5.9-3M8.8 13.2l5.9 3" />
    </>
  ),
  note: <path {...stroke} d="M4.5 5.5h15v10h-9l-4 3.5-.5-3.5h-1.5v-10z" />,
  notifications: (
    <>
      <path {...stroke} d="M6 9.5a6 6 0 0 1 12 0c0 4 1.5 5.5 1.5 5.5h-15S6 13.5 6 9.5z" />
      <path {...stroke} d="M10 18.5a2 2 0 0 0 4 0" />
    </>
  ),

  // Hands and data
  import: <path {...stroke} d="M12 16V4m0 0L7.5 8.5M12 4l4.5 4.5M4 16v2.5A1.5 1.5 0 0 0 5.5 20h13a1.5 1.5 0 0 0 1.5-1.5V16" />,
  file: (
    <>
      <path {...stroke} d="M6 3.5h7l5 5v12H6v-17z" />
      <path {...stroke} d="M13 3.5v5h5" />
    </>
  ),
  tag: (
    <>
      <path {...stroke} d="M4 4.5h7.5l8 8-7 7-8.5-8.5V4.5z" />
      <circle {...fill} cx="8.5" cy="9" r="1.3" />
    </>
  ),
  filter: <path {...stroke} d="M4 6h16M7 12h10M10 18h4" />,
  sort: <path {...stroke} d="M7 20V4m0 16-3-3m3 3 3-3M17 4v16m0-16-3 3m3-3 3 3" />,
  mark: <path {...stroke} d="M5 4.5h14v15l-7-4.2-7 4.2v-15z" />,
  stats: (
    <>
      <path {...stroke} d="M5 19V11M12 19V5M19 19v-6" />
      <path {...stroke} d="M3.5 21h17" />
    </>
  ),
  pot: (
    <>
      <circle {...stroke} cx="12" cy="12" r="8.5" />
      <path {...stroke} d="M12 7.5v5l3 2" />
    </>
  ),
  delete: <path {...stroke} d="M5 7h14M9.5 7V5h5v2M6.5 7l1 13h9l1-13" />,

  // System and validation
  success: (
    <>
      <circle {...stroke} cx="12" cy="12" r="8.5" />
      <path {...stroke} d="m8 12.2 2.7 2.8L16 9.5" />
    </>
  ),
  warning: (
    <>
      <path {...stroke} d="M12 4.5 21 19.5H3L12 4.5z" />
      <path {...stroke} d="M12 10v4" />
      <circle {...fill} cx="12" cy="16.6" r="0.9" />
    </>
  ),
  error: (
    <>
      <circle {...stroke} cx="12" cy="12" r="8.5" />
      <path {...stroke} d="m9 9 6 6M15 9l-6 6" />
    </>
  ),
  close: <path {...stroke} d="m6 6 12 12M18 6 6 18" />,
  add: <path {...stroke} d="M12 5v14M5 12h14" />,
  help: (
    <>
      <circle {...stroke} cx="12" cy="12" r="8.5" />
      <path {...stroke} d="M12 11v5.5" />
      <circle {...fill} cx="12" cy="8" r="1" />
    </>
  ),
} satisfies Record<string, ReactNode>

export type IconName = keyof typeof drawings

export const iconGroups = {
  navigation: ['home', 'library', 'room', 'search', 'profile', 'settings', 'chevron', 'expand', 'menu'],
  player: ['play', 'pause', 'previous', 'next', 'street-back', 'street-forward', 'speed', 'repeat', 'in-progress', 'history'],
  room: ['master', 'live', 'link', 'copy', 'participants', 'locked', 'share', 'note', 'notifications'],
  hands: ['import', 'file', 'tag', 'filter', 'sort', 'mark', 'stats', 'pot', 'delete'],
  system: ['success', 'warning', 'error', 'close', 'add', 'help'],
} as const satisfies Record<string, readonly IconName[]>
