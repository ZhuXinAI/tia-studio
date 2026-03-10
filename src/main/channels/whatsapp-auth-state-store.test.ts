import { describe, expect, it } from 'vitest'
import {
  createDefaultWhatsAppChannelAuthState,
  WhatsAppAuthStateStore
} from './whatsapp-auth-state-store'

describe('WhatsAppAuthStateStore', () => {
  it('returns a disconnected default state for unknown channels', () => {
    const store = new WhatsAppAuthStateStore({
      now: () => new Date('2026-03-10T00:00:00.000Z')
    })

    expect(store.get('channel-whatsapp')).toEqual(
      createDefaultWhatsAppChannelAuthState('channel-whatsapp', '2026-03-10T00:00:00.000Z')
    )
  })

  it('stores qr state and clears qr payloads once connected', () => {
    const store = new WhatsAppAuthStateStore({
      now: () => new Date('2026-03-10T00:00:00.000Z')
    })

    expect(store.setConnecting('channel-whatsapp')).toMatchObject({
      status: 'connecting',
      qrCodeDataUrl: null,
      qrCodeValue: null
    })

    expect(
      store.setQrCode('channel-whatsapp', {
        qrCodeValue: 'whatsapp-qr-value',
        qrCodeDataUrl: 'data:image/png;base64,qr'
      })
    ).toMatchObject({
      status: 'qr_ready',
      qrCodeValue: 'whatsapp-qr-value',
      qrCodeDataUrl: 'data:image/png;base64,qr'
    })

    expect(store.setConnected('channel-whatsapp', '8613800138000')).toMatchObject({
      status: 'connected',
      phoneNumber: '8613800138000',
      qrCodeValue: null,
      qrCodeDataUrl: null,
      errorMessage: null
    })
  })

  it('stores and clears error state', () => {
    const store = new WhatsAppAuthStateStore({
      now: () => new Date('2026-03-10T00:00:00.000Z')
    })

    expect(store.setError('channel-whatsapp', 'Socket closed')).toMatchObject({
      status: 'error',
      errorMessage: 'Socket closed'
    })

    expect(store.clear('channel-whatsapp')).toEqual(
      createDefaultWhatsAppChannelAuthState('channel-whatsapp', '2026-03-10T00:00:00.000Z')
    )
  })
})
