import { lazy, useState, type ComponentType } from 'react'

/** A screen that arrives in a chunk of its own, and a way to ask for that chunk before anyone opens the screen. */
export type LazyPage<Props> = ComponentType<Props> & { preload(): Promise<void> }

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
      },
      (error: unknown) => {
        // A chunk that didn't arrive is asked for again the next time, not remembered as failed.
        loading = null
        throw error
      },
    ))
  const Waiting = lazy(async () => {
    await preload()
    return { default: Loaded! }
  })
  function Page(props: Props) {
    // Chosen once, where the screen mounts: swapping one for the other later would mount it again.
    const [Shown] = useState<ComponentType<Props>>(() => Loaded ?? Waiting)
    return <Shown {...props} />
  }
  return Object.assign(Page, { preload })
}
