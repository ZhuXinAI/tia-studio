import { describe, expect, it } from 'vitest'
import {
  createDefaultWechatChannelAuthState,
  WechatAuthStateStore
} from './wechat-auth-state-store'

describe('WechatAuthStateStore', () => {
  it('returns a disconnected default state for unknown channels', () => {
    const store = new WechatAuthStateStore({
      now: () => new Date('2026-03-24T00:00:00.000Z')
    })

    expect(store.get('channel-wechat')).toEqual(
      createDefaultWechatChannelAuthState('channel-wechat', '2026-03-24T00:00:00.000Z')
    )
  })

  it('stores qr state and clears qr payloads once connected', () => {
    const store = new WechatAuthStateStore({
      now: () => new Date('2026-03-24T00:00:00.000Z')
    })

    expect(store.setConnecting('channel-wechat')).toMatchObject({
      status: 'connecting',
      qrCodeDataUrl: null,
      qrCodeValue: null
    })

    expect(
      store.setQrCode('channel-wechat', {
        qrCodeValue: 'https://wechat.example/qr',
        qrCodeDataUrl: 'data:image/png;base64,wechat-qr'
      })
    ).toMatchObject({
      status: 'qr_ready',
      qrCodeValue: 'https://wechat.example/qr',
      qrCodeDataUrl: 'data:image/png;base64,wechat-qr'
    })

    expect(store.setConnected('channel-wechat', 'wechat-user-1')).toMatchObject({
      status: 'connected',
      accountId: 'wechat-user-1',
      qrCodeValue: null,
      qrCodeDataUrl: null,
      errorMessage: null
    })
  })

  it('stores and clears error state', () => {
    const store = new WechatAuthStateStore({
      now: () => new Date('2026-03-24T00:00:00.000Z')
    })

    expect(store.setError('channel-wechat', 'WeChat server unavailable')).toMatchObject({
      status: 'error',
      errorMessage: 'WeChat server unavailable'
    })

    expect(store.clear('channel-wechat')).toEqual(
      createDefaultWechatChannelAuthState('channel-wechat', '2026-03-24T00:00:00.000Z')
    )
  })
})
