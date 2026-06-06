type Translate = (key: string) => string

export function channelTypeLabel(type: string, translate: Translate): string {
  switch (type) {
    case 'discord':
      return translate('settings.channels.channelTypes.discord')
    case 'lark':
      return translate('settings.channels.channelTypes.lark')
    case 'telegram':
      return translate('settings.channels.channelTypes.telegram')
    case 'whatsapp':
      return translate('settings.channels.channelTypes.whatsapp')
    case 'wechat':
      return translate('settings.channels.channelTypes.wechat')
    case 'wecom':
      return translate('settings.channels.channelTypes.wecom')
    default:
      return type
  }
}

export function channelStatusLabel(status: string, translate: Translate): string {
  switch (status) {
    case 'connected':
      return translate('settings.channels.status.connected')
    case 'disconnected':
      return translate('settings.channels.status.disconnected')
    case 'error':
      return translate('settings.channels.status.error')
    default:
      return status
  }
}
