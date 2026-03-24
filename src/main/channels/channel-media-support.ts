import type { ChannelType } from './types'

const KNOWN_CHANNEL_TYPES: ChannelType[] = [
  'discord',
  'lark',
  'telegram',
  'whatsapp',
  'wechat',
  'wecom',
  'wechat-kf'
]
const IMAGE_CAPABLE_CHANNEL_TYPES = new Set<ChannelType>([
  'discord',
  'lark',
  'telegram',
  'whatsapp'
])
const CHANNEL_LABELS: Record<ChannelType, string> = {
  discord: 'Discord',
  lark: 'Lark',
  telegram: 'Telegram',
  whatsapp: 'WhatsApp',
  wechat: 'Wechat',
  wecom: 'WeCom',
  'wechat-kf': 'Wechat-KF'
}

export function isKnownChannelType(value: string | null | undefined): value is ChannelType {
  return KNOWN_CHANNEL_TYPES.includes(value as ChannelType)
}

export function supportsChannelImageDelivery(
  channelType: string | null | undefined
): channelType is ChannelType {
  return isKnownChannelType(channelType) && IMAGE_CAPABLE_CHANNEL_TYPES.has(channelType)
}

export function formatChannelTypeLabel(channelType: string | null | undefined): string {
  if (!channelType) {
    return 'this channel'
  }

  if (isKnownChannelType(channelType)) {
    return CHANNEL_LABELS[channelType]
  }

  return channelType
}

export function buildChannelImageSupportGuidance(channelType: string | null | undefined): string[] {
  if (supportsChannelImageDelivery(channelType)) {
    return [
      '- This channel supports sendImage when a screenshot or other image will help the user.'
    ]
  }

  if (isKnownChannelType(channelType)) {
    return [
      `- ${formatChannelTypeLabel(channelType)} does not support sendImage right now. Describe visual state in text instead.`
    ]
  }

  return [
    '- sendImage is available on Discord, Lark, Telegram, and WhatsApp.',
    '- Wechat, WeCom, and Wechat-KF do not support sendImage right now.'
  ]
}
