// @vitest-environment jsdom

import { beforeEach, describe, expect, it } from 'vitest'
import { readStoredAppMode, storeAppMode } from './app-mode-state'

describe('app mode state', () => {
  beforeEach(() => {
    window.localStorage.clear()
  })

  it('returns null when no app mode has been stored', () => {
    expect(readStoredAppMode()).toBeNull()
  })

  it('returns null when the stored app mode is invalid', () => {
    window.localStorage.setItem('tia.app.last-mode', JSON.stringify({ mode: 'claws' }))

    expect(readStoredAppMode()).toBeNull()
  })

  it('stores and reads chat mode', () => {
    storeAppMode('chat')

    expect(readStoredAppMode()).toBe('chat')
  })

  it('stores and reads team mode', () => {
    storeAppMode('team')

    expect(readStoredAppMode()).toBe('team')
  })
})
