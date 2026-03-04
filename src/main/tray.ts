import type { MenuItemConstructorOptions } from 'electron'

export type MainWindowLike = {
  isMinimized: () => boolean
  restore: () => void
  isVisible: () => boolean
  show: () => void
  focus: () => void
}

export function bringWindowToFront(window: MainWindowLike): void {
  const windowIsMinimized = window.isMinimized()
  const windowIsVisible = window.isVisible()

  if (windowIsMinimized) {
    window.restore()
  }

  if (!windowIsMinimized || !windowIsVisible) {
    window.show()
  }

  window.focus()
}

export function buildTrayMenuTemplate(handlers: {
  onOpenWindow: () => void
  onQuit: () => void
}): MenuItemConstructorOptions[] {
  return [
    {
      label: 'Open Window',
      click: () => {
        handlers.onOpenWindow()
      }
    },
    {
      label: 'Quit',
      click: () => {
        handlers.onQuit()
      }
    }
  ]
}
