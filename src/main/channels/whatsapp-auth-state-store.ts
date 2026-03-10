export type WhatsAppChannelAuthStatus =
  | 'disconnected'
  | 'connecting'
  | 'qr_ready'
  | 'connected'
  | 'error'

export type WhatsAppChannelAuthState = {
  channelId: string
  status: WhatsAppChannelAuthStatus
  qrCodeDataUrl: string | null
  qrCodeValue: string | null
  phoneNumber: string | null
  errorMessage: string | null
  updatedAt: string
}

type WhatsAppAuthStateStoreOptions = {
  now?: () => Date
}

function createTimestamp(now: () => Date): string {
  return now().toISOString()
}

export function createDefaultWhatsAppChannelAuthState(
  channelId: string,
  updatedAt: string
): WhatsAppChannelAuthState {
  return {
    channelId,
    status: 'disconnected',
    qrCodeDataUrl: null,
    qrCodeValue: null,
    phoneNumber: null,
    errorMessage: null,
    updatedAt
  }
}

export class WhatsAppAuthStateStore {
  private readonly states = new Map<string, WhatsAppChannelAuthState>()
  private readonly now: () => Date

  constructor(options: WhatsAppAuthStateStoreOptions = {}) {
    this.now = options.now ?? (() => new Date())
  }

  get(channelId: string): WhatsAppChannelAuthState {
    return (
      this.states.get(channelId) ??
      createDefaultWhatsAppChannelAuthState(channelId, createTimestamp(this.now))
    )
  }

  setConnecting(channelId: string): WhatsAppChannelAuthState {
    return this.update(channelId, {
      status: 'connecting',
      qrCodeDataUrl: null,
      qrCodeValue: null,
      errorMessage: null
    })
  }

  setQrCode(
    channelId: string,
    input: { qrCodeValue: string; qrCodeDataUrl: string }
  ): WhatsAppChannelAuthState {
    return this.update(channelId, {
      status: 'qr_ready',
      qrCodeValue: input.qrCodeValue,
      qrCodeDataUrl: input.qrCodeDataUrl,
      errorMessage: null
    })
  }

  setConnected(channelId: string, phoneNumber: string | null): WhatsAppChannelAuthState {
    return this.update(channelId, {
      status: 'connected',
      phoneNumber,
      qrCodeDataUrl: null,
      qrCodeValue: null,
      errorMessage: null
    })
  }

  setDisconnected(channelId: string): WhatsAppChannelAuthState {
    return this.update(channelId, {
      status: 'disconnected',
      phoneNumber: null,
      qrCodeDataUrl: null,
      qrCodeValue: null,
      errorMessage: null
    })
  }

  setError(channelId: string, errorMessage: string): WhatsAppChannelAuthState {
    return this.update(channelId, {
      status: 'error',
      qrCodeDataUrl: null,
      qrCodeValue: null,
      phoneNumber: null,
      errorMessage
    })
  }

  clear(channelId: string): WhatsAppChannelAuthState {
    const nextState = createDefaultWhatsAppChannelAuthState(channelId, createTimestamp(this.now))
    this.states.set(channelId, nextState)
    return nextState
  }

  private update(
    channelId: string,
    partialState: Partial<Omit<WhatsAppChannelAuthState, 'channelId' | 'updatedAt'>>
  ): WhatsAppChannelAuthState {
    const nextState: WhatsAppChannelAuthState = {
      ...this.get(channelId),
      ...partialState,
      channelId,
      updatedAt: createTimestamp(this.now)
    }

    this.states.set(channelId, nextState)
    return nextState
  }
}
