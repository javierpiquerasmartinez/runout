import { useToday } from '../goals/useToday'
import { AppHeader } from '../header/AppHeader'
import { useI18n } from '../i18n'
import { CalendarCard } from './CalendarCard'
import { GoalsCard } from './GoalsCard'
import { LabCard } from './LabCard'
import { LibraryCard } from './LibraryCard'
import { RoomsCard } from './RoomsCard'
import './HomePage.css'

/** An Account's first screen: one card per section, each loading and failing on its own. A change of day is the one thing it follows by itself. */
export function HomePage() {
  const { t } = useI18n()
  const today = useToday()
  return (
    <div className="home-page">
      <AppHeader current="home" />
      <main className="home-page__main">
        <h1 className="home-page__title ro-serif">{t('home.title')}</h1>
        <div className="home-page__grid">
          <div className="home-page__slot home-page__slot--library">
            <LibraryCard today={today} />
          </div>
          <div className="home-page__slot home-page__slot--rooms">
            <RoomsCard />
          </div>
          <div className="home-page__slot home-page__slot--goals">
            <GoalsCard today={today} />
          </div>
          <div className="home-page__slot home-page__slot--calendar">
            <CalendarCard today={today} />
          </div>
          <div className="home-page__slot home-page__slot--lab">
            <LabCard />
          </div>
        </div>
      </main>
    </div>
  )
}
