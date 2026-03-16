import { logger } from './utils/logger'

const TIA_BROWSER_TOOL_DEBUG_ENV = 'TIA_BROWSER_TOOL_DEBUG'

function isTruthy(value: string | undefined): boolean {
  if (!value) {
    return false
  }

  const normalized = value.trim().toLowerCase()
  return normalized === '1' || normalized === 'true' || normalized === 'yes' || normalized === 'on'
}

export function isTiaBrowserToolDebugEnabled(): boolean {
  return isTruthy(process.env[TIA_BROWSER_TOOL_DEBUG_ENV])
}

export function tiaBrowserToolLog(scope: string, message: string, data?: unknown): void {
  if (!isTiaBrowserToolDebugEnabled()) {
    return
  }

  logger.info(`[${scope}] ${message}`, data)
}

export function tiaBrowserToolTrace(scope: string, message: string, data?: unknown): void {
  if (!isTiaBrowserToolDebugEnabled()) {
    return
  }

  logger.debug(`[${scope}] ${message}`, data)
}
