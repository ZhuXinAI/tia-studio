// @vitest-environment jsdom

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ClawPairingsDialog } from './claw-pairings-dialog'

describe('ClawPairingsDialog', () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => {
      root.unmount()
    })
    container.remove()
    document.body.innerHTML = ''
    delete (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT
    vi.clearAllMocks()
  })

  it('renders whatsapp qr auth state above pairing requests', async () => {
    await act(async () => {
      root.render(
        <ClawPairingsDialog
          isOpen
          clawName="WhatsApp Assistant"
          channelType="whatsapp"
          pairings={[]}
          isLoading={false}
          channelAuthState={{
            channelId: 'channel-whatsapp',
            channelType: 'whatsapp',
            status: 'qr_ready',
            qrCodeDataUrl: 'data:image/png;base64,qr',
            qrCodeValue: 'qr-value',
            phoneNumber: null,
            errorMessage: null,
            updatedAt: '2026-03-10T00:00:00.000Z'
          }}
          isChannelAuthLoading={false}
          isSubmitting={false}
          errorMessage={null}
          onClose={() => undefined}
          onApprove={() => undefined}
          onReject={() => undefined}
          onRevoke={() => undefined}
        />
      )
    })

    expect(document.body.textContent).toContain('WhatsApp Login')
    expect(document.body.textContent).toContain('Scan this QR code')
    expect(document.body.querySelector('img')).not.toBeNull()
  })

  it('invokes approve for pending pairing entries', async () => {
    const onApprove = vi.fn()

    await act(async () => {
      root.render(
        <ClawPairingsDialog
          isOpen
          clawName="Telegram Assistant"
          channelType="telegram"
          pairings={[
            {
              id: 'pairing-pending',
              channelId: 'channel-telegram',
              remoteChatId: '1001',
              senderId: '1001',
              senderDisplayName: 'Alice',
              senderUsername: 'alice',
              code: 'AB7KQ2XM',
              status: 'pending',
              expiresAt: '2099-03-10T01:00:00.000Z',
              approvedAt: null,
              rejectedAt: null,
              revokedAt: null,
              lastSeenAt: '2026-03-10T00:00:00.000Z',
              createdAt: '2026-03-10T00:00:00.000Z',
              updatedAt: '2026-03-10T00:00:00.000Z'
            }
          ]}
          isLoading={false}
          channelAuthState={null}
          isChannelAuthLoading={false}
          isSubmitting={false}
          errorMessage={null}
          onClose={() => undefined}
          onApprove={onApprove}
          onReject={() => undefined}
          onRevoke={() => undefined}
        />
      )
    })

    const approveButton = Array.from(document.body.querySelectorAll('button')).find((button) =>
      button.textContent?.includes('Approve')
    )

    await act(async () => {
      approveButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    expect(onApprove).toHaveBeenCalledWith('pairing-pending')
  })
})
