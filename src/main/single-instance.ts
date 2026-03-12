type AppLike = {
  requestSingleInstanceLock: () => boolean
  quit: () => void
  on: (
    event: 'second-instance',
    listener: (
      event: unknown,
      argv: string[],
      workingDirectory: string,
      additionalData: unknown
    ) => void
  ) => void
  isReady: () => boolean
  whenReady: () => Promise<unknown>
}

export function registerSingleInstanceApp(options: {
  app: AppLike
  onSecondInstance: () => void
}): boolean {
  const hasSingleInstanceLock = options.app.requestSingleInstanceLock()
  if (!hasSingleInstanceLock) {
    options.app.quit()
    return false
  }

  options.app.on('second-instance', () => {
    if (options.app.isReady()) {
      options.onSecondInstance()
      return
    }

    void options.app.whenReady().then(() => {
      options.onSecondInstance()
    })
  })

  return true
}
