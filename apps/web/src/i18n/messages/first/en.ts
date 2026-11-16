import type { es } from './es'

/** The messages a Visitor's first load needs, in English: see `./es`. */
export const en: Record<keyof typeof es, string> = {
  // The app, and the page that checks its connection to the server.
  'app.name': 'Runout',
  'status.subtitle': 'Server connection check',
  'status.api': 'API (HTTP)',
  'status.realtime': 'Real time (WebSocket)',
  'status.checking': 'Checking…',
  'status.ok': 'OK · {time}',
  'status.noResponse': 'No response ({message})',
  'status.connecting': 'Connecting…',
  'status.connected': 'Connected',
  'status.synced': 'In sync · {latency} ms',
  'status.offline': 'Offline',
  'status.designSystemLink': 'See the visual system',

  // While the app finds out who this browser is, and when a screen doesn't arrive.
  'identity.loading': 'Loading',
  'identity.waking': 'Connecting to the server…',
  'identity.error': "We couldn't reach the server. Check your connection and try again.",
  'identity.retry': 'Try again',
  'screen.notLoaded': "We couldn't load this screen. Check your connection and try again.",
  'screen.retry': 'Try again',

  // The brand.
  'brand.wordmark': 'RUNOUT',
  'brand.beta': 'BETA',
  'room.home': 'Runout, go to the start',

  // The Landing.
  'landing.opening.title': 'Your hands. Your numbers. Your table.',
  'landing.opening.line': 'Your poker history, finally somewhere to study it.',
  'landing.scrollHint': 'Scroll',
  'landing.results.title': "Your graph doesn't lie.",
  'landing.results.line': "Import your hands and see, plainly, whether you're winning.",
  'landing.library.title': 'It all ends up here.',
  'landing.library.line': 'The hand histories from your tracker, kept and yours. Hand by hand.',
  'landing.rooms.title': 'One table. The whole group. The same hand.',
  'landing.rooms.line': 'Go through every action in sync, each on your own screen. No screen sharing.',
  'landing.close.title': 'Invitation only.',
  'landing.signIn': 'Sign in',
  'landing.haveCode': 'Have a room code?',

  // The Results Graph's own words, which the Landing shows round its graph of chips.
  'room.table.bigBlinds': '{value} BB',
  'library.results.winRate': 'BB/100',
  'library.results.line.result': 'Result',
  'library.results.line.allInEv': 'All-in EV',
  'library.results.hand': 'Hand {hand}',
}
