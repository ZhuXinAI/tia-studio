type LogLevel = 'debug' | 'info' | 'warn' | 'error'

const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3
}

class Logger {
  private currentLevel: LogLevel

  constructor() {
    const envLevel = process.env.LOG_LEVEL?.toLowerCase() as LogLevel
    this.currentLevel = LOG_LEVELS[envLevel] !== undefined ? envLevel : 'info'
  }

  private shouldLog(level: LogLevel): boolean {
    return LOG_LEVELS[level] >= LOG_LEVELS[this.currentLevel]
  }

  debug(message: string, data?: unknown): void {
    if (this.shouldLog('debug')) {
      console.log(message, data !== undefined ? data : '')
    }
  }

  info(message: string, data?: unknown): void {
    if (this.shouldLog('info')) {
      console.log(message, data !== undefined ? data : '')
    }
  }

  warn(message: string, data?: unknown): void {
    if (this.shouldLog('warn')) {
      console.warn(message, data !== undefined ? data : '')
    }
  }

  error(message: string, data?: unknown): void {
    if (this.shouldLog('error')) {
      console.error(message, data !== undefined ? data : '')
    }
  }
}

export const logger = new Logger()
