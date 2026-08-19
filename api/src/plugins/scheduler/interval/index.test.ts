import { jest } from '@jest/globals'
import intervalScheduler from './index.js'
import type { SchedulableTarget, SchedulerContext } from '../../types.js'

function context(
  targets: SchedulableTarget[],
  run: SchedulerContext['run'],
): SchedulerContext {
  return {
    getTargets: () => targets,
    run,
  }
}

describe('interval scheduler', () => {
  beforeEach(() => {
    jest.useFakeTimers()
    jest.spyOn(console, 'log').mockImplementation(() => {})
  })

  afterEach(() => {
    intervalScheduler.stop()
    jest.useRealTimers()
    jest.restoreAllMocks()
  })

  it('starts a timer per enabled target and runs after the stagger delay', async () => {
    const run = jest.fn(async () => {})
    const targets: SchedulableTarget[] = [
      { id: 1, intervalSeconds: 60, enabled: true },
      { id: 2, intervalSeconds: 60, enabled: false },
    ]
    intervalScheduler.init(context(targets, run))
    intervalScheduler.start()

    await jest.advanceTimersByTimeAsync(1000 + (1 % 7) * 250)
    expect(run).toHaveBeenCalledWith(1)
    expect(run).not.toHaveBeenCalledWith(2)
  })

  it('does not restart unchanged timers on reschedule', async () => {
    const run = jest.fn(async () => {})
    const targets: SchedulableTarget[] = [
      { id: 3, intervalSeconds: 60, enabled: true },
    ]
    intervalScheduler.init(context(targets, run))
    intervalScheduler.start()
    const delay = 1000 + (3 % 7) * 250
    await jest.advanceTimersByTimeAsync(delay - 1)
    intervalScheduler.reschedule()
    await jest.advanceTimersByTimeAsync(1)
    expect(run).toHaveBeenCalledTimes(1)
  })

  it('stops timers for removed or disabled targets', async () => {
    const run = jest.fn(async () => {})
    let targets: SchedulableTarget[] = [
      { id: 1, intervalSeconds: 60, enabled: true },
    ]
    intervalScheduler.init({
      getTargets: () => targets,
      run,
    })
    intervalScheduler.start()
    targets = []
    intervalScheduler.reschedule()
    await jest.advanceTimersByTimeAsync(10_000)
    expect(run).not.toHaveBeenCalled()
  })
})
