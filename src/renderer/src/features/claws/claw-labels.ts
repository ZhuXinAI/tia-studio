import type { ProviderType } from '../settings/providers/providers-query'

type Translate = (key: string) => string

export function channelTypeLabel(type: string, translate: Translate): string {
  switch (type) {
    case 'lark':
      return translate('claws.dialog.channelTypes.lark')
    case 'telegram':
      return translate('claws.dialog.channelTypes.telegram')
    case 'whatsapp':
      return translate('claws.dialog.channelTypes.whatsapp')
    default:
      return type
  }
}

export function channelStatusLabel(status: string, translate: Translate): string {
  switch (status) {
    case 'connected':
      return translate('claws.channelStatus.connected')
    case 'disconnected':
      return translate('claws.channelStatus.disconnected')
    case 'error':
      return translate('claws.channelStatus.error')
    default:
      return status
  }
}

export function providerTypeLabel(type: ProviderType, translate: Translate): string {
  return translate(`settings.providers.typeLabels.${type}`)
}
