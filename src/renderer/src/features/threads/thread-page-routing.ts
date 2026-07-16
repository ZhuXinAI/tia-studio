import { i18n } from '../../i18n'
import { describeRequestError } from '../../lib/request-errors'

export function toErrorMessage(error: unknown): string {
  return describeRequestError(error, i18n.t('common.errors.unexpectedRequest'))
}

export function getThreadDisplayTitle(title: string | null | undefined): string {
  if (typeof title !== 'string') {
    return i18n.t('threads.sidebar.untitledThread')
  }

  const normalizedTitle = title.trim()
  return normalizedTitle.length > 0 ? normalizedTitle : i18n.t('threads.sidebar.untitledThread')
}
