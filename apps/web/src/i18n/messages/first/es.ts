/**
 * The messages a Visitor's first load needs, in Spanish: the Landing's, and
 * the few the app may show before any other screen has arrived. They come
 * in a chunk of their own, in the document's language only; the rest of the
 * catalogue (`../es`, which holds these too) arrives with the first screen
 * that isn't the Landing. A message asked for before its catalogue has
 * arrived is an error, so one the app's shell shows belongs here.
 */
export const es = {
  // The app, and the page that checks its connection to the server.
  'app.name': 'Runout',
  'status.subtitle': 'Comprobación de conexión con el servidor',
  'status.api': 'API (HTTP)',
  'status.realtime': 'Tiempo real (WebSocket)',
  'status.checking': 'Comprobando…',
  'status.ok': 'OK · {time}',
  'status.noResponse': 'Sin respuesta ({message})',
  'status.connecting': 'Conectando…',
  'status.connected': 'Conectado',
  'status.synced': 'Sincronizado · {latency} ms',
  'status.offline': 'Sin conexión',
  'status.designSystemLink': 'Ver el sistema visual',

  // While the app finds out who this browser is, and when a screen doesn't arrive.
  'identity.loading': 'Cargando',
  'identity.waking': 'Conectando con el servidor…',
  'identity.error': 'No hemos podido contactar con el servidor. Comprueba tu conexión y vuelve a intentarlo.',
  'identity.retry': 'Reintentar',
  'screen.notLoaded': 'No hemos podido cargar esta pantalla. Comprueba tu conexión y vuelve a intentarlo.',
  'screen.retry': 'Reintentar',

  // The brand.
  'brand.wordmark': 'RUNOUT',
  'brand.beta': 'BETA',
  'room.home': 'Runout, ir al inicio',

  // The Landing.
  'landing.opening.title': 'Tus manos. Tus números. Tu mesa.',
  'landing.opening.line': 'Tu historial de póker, por fin en un sitio donde estudiarlo.',
  'landing.scrollHint': 'Desliza',
  'landing.results.title': 'Tu gráfica no miente.',
  'landing.results.line': 'Importa tus manos y mira, sin adornos, si estás ganando.',
  'landing.library.title': 'Todo acaba aquí.',
  'landing.library.line': 'Los historiales de tu tracker, guardados y tuyos. Mano a mano.',
  'landing.rooms.title': 'Una mesa. Todo el grupo. La misma mano.',
  'landing.rooms.line': 'Repasad cada acción sincronizados, cada uno en su pantalla. Sin compartir pantalla.',
  'landing.close.title': 'Solo por invitación.',
  'landing.signIn': 'Iniciar sesión',
  'landing.haveCode': '¿Tienes un código de sala?',

  // The Results Graph's own words, which the Landing shows round its graph of chips.
  'room.table.bigBlinds': '{value} BB',
  'library.results.winRate': 'BB/100',
  'library.results.line.result': 'Resultado',
  'library.results.line.allInEv': 'EV all-in',
  'library.results.hand': 'Mano {hand}',
}
