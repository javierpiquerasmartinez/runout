import { lazy, useState, type ComponentType } from 'react'
import { screenArrived } from './recovery'

/** A screen that arrives in a chunk of its own, and a way to ask for that chunk before anyone opens the screen. */
export type LazyPage<Props> = ComponentType<Props> & { preload(): Promise<void> }

/** A screen's chunk didn't arrive: the connection, or a build of the app that is no longer the one deployed. `ScreenBoundary` recovers from it. */
export class ScreenNotLoaded extends Error {
  constructor(cause: unknown) {
    super("A screen's chunk didn't arrive", { cause })
    this.name = 'ScreenNotLoaded'
  }
}

/** The screens whose chunks didn't arrive, each as a way to have it asked for afresh. */
const notLoaded = new Set<() => void>()

/**
 * Has every screen whose chunk didn't arrive ask for it again the next time
 * it mounts. Until then it fails as it did: React holds a screen to the
 * first answer its chunk gave.
 */
export function retryScreens() {
  for (const retry of notLoaded) retry()
  notLoaded.clear()
}

/**
 * A screen loaded by the route that shows it, so nobody downloads the ones
 * they never open. Until its chunk arrives the nearest `Suspense` stands in;
 * once it has, by `preload` or by having been shown, the screen renders at
 * once, with no frame of anything else in between.
 */
export function lazyPage<Props extends object>(load: () => Promise<ComponentType<Props>>): LazyPage<Props> {
  let Loaded: ComponentType<Props> | null = null
  let loading: Promise<void> | null = null
  const preload = () =>
    (loading ??= load().then(
      (page) => {
        Loaded = page
        screenArrived()
      },
      (error: unknown) => {
        // A chunk that didn't arrive is asked for again the next time, not remembered as failed.
        loading = null
        notLoaded.add(() => (Waiting = waiting()))
        throw new ScreenNotLoaded(error)
      },
    ))
  const waiting = () =>
    lazy(async () => {
      await preload()
      return { default: Loaded! }
    })
  let Waiting = waiting()
  function Page(props: Props) {
    // Chosen once, where the screen mounts: swapping one for the other later would mount it again.
    const [Shown] = useState<ComponentType<Props>>(() => Loaded ?? Waiting)
    return <Shown {...props} />
  }
  return Object.assign(Page, { preload })
}
