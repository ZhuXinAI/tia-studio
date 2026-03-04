import { describe, expect, it, vi } from 'vitest'
import { bringWindowToFront, buildTrayMenuTemplate } from './tray'

function createWindowStub(
  overrides?: Partial<Parameters<typeof bringWindowToFront>[0]>
): Parameters<typeof bringWindowToFront>[0] {
  const windowStub = {
    isMinimized: vi.fn(() => false),
    restore: vi.fn(),
    isVisible: vi.fn(() => true),
    show: vi.fn(),
    focus: vi.fn(),
    ...overrides
  }

  return windowStub
}

describe('buildTrayMenuTemplate', () => {
  it('creates menu items for opening the window and quitting', () => {
    const onOpenWindow = vi.fn()
    const onQuit = vi.fn()

    const template = buildTrayMenuTemplate({ onOpenWindow, onQuit })

    expect(template).toHaveLength(2)
    expect(template.map((item) => item.label)).toEqual(['Open Window', 'Quit'])

    template[0]?.click?.({} as never, {} as never, {} as never)
    template[1]?.click?.({} as never, {} as never, {} as never)

    expect(onOpenWindow).toHaveBeenCalledTimes(1)
    expect(onQuit).toHaveBeenCalledTimes(1)
  })
})

describe('bringWindowToFront', () => {
  it('restores a minimized window before focusing it', () => {
    const windowStub = createWindowStub({
      isMinimized: vi.fn(() => true)
    })

    bringWindowToFront(windowStub)

    expect(windowStub.restore).toHaveBeenCalledTimes(1)
    expect(windowStub.show).not.toHaveBeenCalled()
    expect(windowStub.focus).toHaveBeenCalledTimes(1)
  })

  it('shows a visible window before focusing it so it comes to the front', () => {
    const windowStub = createWindowStub()

    bringWindowToFront(windowStub)

    expect(windowStub.show).toHaveBeenCalledTimes(1)
    expect(windowStub.focus).toHaveBeenCalledTimes(1)
  })

  it('shows a hidden window before focusing it', () => {
    const windowStub = createWindowStub({
      isVisible: vi.fn(() => false)
    })

    bringWindowToFront(windowStub)

    expect(windowStub.show).toHaveBeenCalledTimes(1)
    expect(windowStub.focus).toHaveBeenCalledTimes(1)
  })
})
