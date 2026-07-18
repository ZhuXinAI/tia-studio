import { describe, expect, it } from 'vitest'
import { resolveWorkDuration } from './work-duration'

describe('resolveWorkDuration', () => {
  it('uses live elapsed time while a run is active', () => {
    expect(resolveWorkDuration({ elapsed: 4_200, running: true, storedDuration: 900 })).toBe(4_200)
  })

  it('uses the persisted duration after completion', () => {
    expect(resolveWorkDuration({ elapsed: 9_000, running: false, storedDuration: 4_200 })).toBe(
      4_200
    )
  })
})
