import { useNarrowScreen } from '../calendar/narrowScreen'
import { useToday } from '../goals/useToday'
import { AppHeader } from '../header/AppHeader'
import { useI18n } from '../i18n'
import { CalendarCard } from './CalendarCard'
import { GoalsCard } from './GoalsCard'
import { LabCard } from './LabCard'
import { LibraryCard } from './LibraryCard'
import { RoomsCard } from './RoomsCard'
import './HomePage.css'

/** The order of the document, so that the keyboard and screen readers follow what is drawn. */
const WIDE_ORDER = ['library', 'rooms', 'goals', 'calendar', 'lab'] as const
/** One column on a narrow screen, in the order of the header's sections. */
const NARROW_ORDER = ['library', 'rooms', 'lab', 'calendar', 'goals'] as const

/** An Account's first screen: one card per section, each loading and failing on its own. A change of day is the one thing it follows by itself. */
export function HomePage() {
  const { t } = useI18n()
  const today = useToday()
  const narrow = useNarrowScreen()
  const cards = {
    library: <LibraryCard today={today} />,
    rooms: <RoomsCard />,
    goals: <GoalsCard today={today} />,
    calendar: <CalendarCard today={today} />,
    lab: <LabCard />,
  }
  return (
    <div className="home-page">
      <AppHeader current="home" />
      <main className="home-page__main">
        <h1 className="home-page__title ro-serif">{t('home.title')}</h1>
        <div className="home-page__grid">
          {(narrow ? NARROW_ORDER : WIDE_ORDER).map((slot) => (
            <div key={slot} className={`home-page__slot home-page__slot--${slot}`}>
              {cards[slot]}
            </div>
          ))}
        </div>
      </main>
    </div>
  )
}
