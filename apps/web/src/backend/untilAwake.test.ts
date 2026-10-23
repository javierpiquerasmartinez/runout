import { describe, expect, it } from 'vitest'
import { ApiError } from './api'
import { untilAwake } from './untilAwake'

/** A clock that only moves when the retries wait, so no test waits for real. */
function fakeClock() {
  let now = 0
  const waits: number[] = []
  return {
    waits,
    now: () => now,
    sleep: async (ms: number) => {
      waits.push(ms)
      now += ms
    },
  }
}

/** A call that fails with each of `failures` in turn, then answers `ok`. */
function failingFirst(...failures: Error[]) {
  let calls = 0
  return {
    calls: () => calls,
    call: async () => {
      calls += 1
      const failure = failures.shift()
      if (failure) throw failure
      return 'ok'
    },
  }
}

describe('untilAwake', () => {
  it('asks again while the server can’t be reached or answers with a 5xx, as it does while waking up', async () => {
    const clock = fakeClock()
    const task = failingFirst(new ApiError(0, 'network'), new ApiError(502, 'network'), new ApiError(503, 'network'))

    await expect(untilAwake(task.call, clock)).resolves.toBe('ok')
    expect(task.calls()).toBe(4)
    expect(clock.waits).toEqual([1000, 2000, 4000])
  })

  it('never waits more than 5 seconds between two tries', async () => {
    const clock = fakeClock()
    const task = failingFirst(...Array.from({ length: 6 }, () => new ApiError(0, 'network')))

    await untilAwake(task.call, clock)

    expect(clock.waits).toEqual([1000, 2000, 4000, 5000, 5000, 5000])
  })

  it('gives up after 90 seconds, failing as the last try did', async () => {
    const clock = fakeClock()
    const task = failingFirst(...Array.from({ length: 100 }, () => new ApiError(0, 'network')))

    await expect(untilAwake(task.call, clock)).rejects.toMatchObject({ reason: 'network' })
    expect(clock.now()).toBeLessThanOrEqual(90_000)
    expect(clock.now()).toBeGreaterThan(85_000)
  })

  it('fails at once when the server answers with a reason of its own', async () => {
    const clock = fakeClock()
    const task = failingFirst(new ApiError(401, 'unauthenticated'))

    await expect(untilAwake(task.call, clock)).rejects.toMatchObject({ reason: 'unauthenticated' })
    expect(task.calls()).toBe(1)
  })
})
