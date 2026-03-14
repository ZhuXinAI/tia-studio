import { mkdirSync, createWriteStream, type WriteStream } from 'node:fs'
import { dirname } from 'node:path'

type LogLevel = 'debug' | 'info' | 'warn' | 'error'

const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3
}

class Logger {
  private currentLevel: LogLevel
  private fileStream: WriteStream | null = null
  private filePath: string | null = null

  constructor() {
    const envLevel = process.env.LOG_LEVEL?.toLowerCase() as LogLevel
    this.currentLevel = LOG_LEVELS[envLevel] !== undefined ? envLevel : 'info'
  }

  private shouldLog(level: LogLevel): boolean {
    return LOG_LEVELS[level] >= LOG_LEVELS[this.currentLevel]
  }

  setFileOutput(filePath: string): void {
    if (this.filePath === filePath && this.fileStream) {
      return
    }

    this.closeFileOutput()
    mkdirSync(dirname(filePath), { recursive: true })

    const nextStream = createWriteStream(filePath, {
      flags: 'a'
    })
    nextStream.on('error', (error) => {
      console.error('[Logger] Failed to write log file', error)
    })

    this.fileStream = nextStream
    this.filePath = filePath
    this.info('[Logger] File output enabled', { filePath })
  }

  close(): void {
    this.closeFileOutput()
  }

  private closeFileOutput(): void {
    this.fileStream?.end()
    this.fileStream = null
    this.filePath = null
  }

  private serializeData(data: unknown): string {
    if (data === undefined) {
      return ''
    }

    if (typeof data === 'string') {
      return data
    }

    try {
      return JSON.stringify(data, (_key, value) => {
        if (value instanceof Error) {
          return {
            name: value.name,
            message: value.message,
            stack: value.stack
          }
        }

        return value
      })
    } catch {
      return String(data)
    }
  }

  private write(level: LogLevel, message: string, data?: unknown): void {
    if (!this.shouldLog(level)) {
      return
    }

    const serializedData = this.serializeData(data)
    const timestamp = new Date().toISOString()
    const line = `${timestamp} ${level.toUpperCase()} ${message}${serializedData ? ` ${serializedData}` : ''}`

    if (level === 'error') {
      console.error(message, data !== undefined ? data : '')
    } else if (level === 'warn') {
      console.warn(message, data !== undefined ? data : '')
    } else {
      console.log(message, data !== undefined ? data : '')
    }

    this.fileStream?.write(`${line}\n`)
  }

  debug(message: string, data?: unknown): void {
    this.write('debug', message, data)
  }

  info(message: string, data?: unknown): void {
    this.write('info', message, data)
  }

  warn(message: string, data?: unknown): void {
    this.write('warn', message, data)
  }

  error(message: string, data?: unknown): void {
    this.write('error', message, data)
  }
}

export const logger = new Logger()
