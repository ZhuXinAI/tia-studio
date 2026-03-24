export type WechatChannelAuthStatus =
  | 'disconnected'
  | 'connecting'
  | 'qr_ready'
  | 'connected'
  | 'error'

export type WechatChannelAuthState = {
  channelId: string
  status: WechatChannelAuthStatus
  qrCodeDataUrl: string | null
  qrCodeValue: string | null
  accountId: string | null
  errorMessage: string | null
  updatedAt: string
}

type WechatAuthStateStoreOptions = {
  now?: () => Date
}

function createTimestamp(now: () => Date): string {
  return now().toISOString()
}

export function createDefaultWechatChannelAuthState(
  channelId: string,
  updatedAt: string
): WechatChannelAuthState {
  return {
    channelId,
    status: 'disconnected',
    qrCodeDataUrl: null,
    qrCodeValue: null,
    accountId: null,
    errorMessage: null,
    updatedAt
  }
}

export class WechatAuthStateStore {
  private readonly states = new Map<string, WechatChannelAuthState>()
  private readonly now: () => Date

  constructor(options: WechatAuthStateStoreOptions = {}) {
    this.now = options.now ?? (() => new Date())
  }

  get(channelId: string): WechatChannelAuthState {
    return (
      this.states.get(channelId) ??
      createDefaultWechatChannelAuthState(channelId, createTimestamp(this.now))
    )
  }

  setConnecting(channelId: string): WechatChannelAuthState {
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
  ): WechatChannelAuthState {
    return this.update(channelId, {
      status: 'qr_ready',
      qrCodeValue: input.qrCodeValue,
      qrCodeDataUrl: input.qrCodeDataUrl,
      errorMessage: null
    })
  }

  setConnected(channelId: string, accountId: string | null): WechatChannelAuthState {
    return this.update(channelId, {
      status: 'connected',
      accountId,
      qrCodeDataUrl: null,
      qrCodeValue: null,
      errorMessage: null
    })
  }

  setDisconnected(channelId: string): WechatChannelAuthState {
    return this.update(channelId, {
      status: 'disconnected',
      accountId: null,
      qrCodeDataUrl: null,
      qrCodeValue: null,
      errorMessage: null
    })
  }

  setError(channelId: string, errorMessage: string): WechatChannelAuthState {
    return this.update(channelId, {
      status: 'error',
      accountId: null,
      qrCodeDataUrl: null,
      qrCodeValue: null,
      errorMessage
    })
  }

  clear(channelId: string): WechatChannelAuthState {
    const nextState = createDefaultWechatChannelAuthState(channelId, createTimestamp(this.now))
    this.states.set(channelId, nextState)
    return nextState
  }

  private update(
    channelId: string,
    partialState: Partial<Omit<WechatChannelAuthState, 'channelId' | 'updatedAt'>>
  ): WechatChannelAuthState {
    const nextState: WechatChannelAuthState = {
      ...this.get(channelId),
      ...partialState,
      channelId,
      updatedAt: createTimestamp(this.now)
    }

    this.states.set(channelId, nextState)
    return nextState
  }
}
