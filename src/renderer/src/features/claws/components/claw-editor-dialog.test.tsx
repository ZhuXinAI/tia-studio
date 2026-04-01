// @vitest-environment jsdom

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ClawEditorDialog } from './claw-editor-dialog'
import {
  createDefaultManagedRuntimesState,
  getManagedRuntimeStatus,
  getRuntimeOnboardingSkillsStatus,
  installRuntimeOnboardingSkills
} from '../../settings/runtimes/managed-runtimes-query'

vi.mock('../../settings/runtimes/managed-runtimes-query', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../../settings/runtimes/managed-runtimes-query')>()

  return {
    ...actual,
    getManagedRuntimeStatus: vi.fn(),
    getRuntimeOnboardingSkillsStatus: vi.fn(),
    installManagedRuntime: vi.fn(),
    installRuntimeOnboardingSkills: vi.fn(),
    pickCustomRuntime: vi.fn()
  }
})

async function flushAsyncWork(): Promise<void> {
  await act(async () => {
    await Promise.resolve()
  })
}

function setElementValue(
  element: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement,
  value: string
): void {
  const prototype =
    element instanceof HTMLSelectElement
      ? HTMLSelectElement.prototype
      : element instanceof HTMLTextAreaElement
        ? HTMLTextAreaElement.prototype
        : HTMLInputElement.prototype
  const setter = Object.getOwnPropertyDescriptor(prototype, 'value')?.set

  setter?.call(element, value)
  element.dispatchEvent(
    new Event(element instanceof HTMLSelectElement ? 'change' : 'input', {
      bubbles: true
    })
  )
}

async function clickElement(element: Element | null | undefined): Promise<void> {
  await act(async () => {
    element?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
  })
}

async function flushTimerWork(): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => window.setTimeout(resolve, 0))
  })
}

const provider = {
  id: 'provider-1',
  name: 'OpenAI',
  type: 'openai' as const,
  apiKey: 'secret',
  apiHost: null,
  selectedModel: 'gpt-5',
  providerModels: null,
  enabled: true,
  supportsVision: false,
  isBuiltIn: false,
  icon: null,
  officialSite: null,
  createdAt: '2026-03-08T00:00:00.000Z',
  updatedAt: '2026-03-08T00:00:00.000Z'
}

describe('ClawEditorDialog', () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    vi.mocked(getManagedRuntimeStatus).mockResolvedValue({
      ...createDefaultManagedRuntimesState(),
      bun: {
        source: 'managed',
        binaryPath: '/managed/bun/bin/bun',
        version: 'bun 1.2.0',
        installedAt: '2026-03-08T00:00:00.000Z',
        lastCheckedAt: '2026-03-08T01:00:00.000Z',
        releaseUrl: 'https://example.test/bun',
        checksum: null,
        status: 'ready',
        errorMessage: null
      }
    })
    vi.mocked(getRuntimeOnboardingSkillsStatus).mockResolvedValue([])
    vi.mocked(installRuntimeOnboardingSkills).mockResolvedValue(['agent-browser', 'find-skills'])
  })

  afterEach(() => {
    act(() => {
      root.unmount()
    })
    container.remove()
    document.body.innerHTML = ''
    delete (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT
    vi.clearAllMocks()
    vi.useRealTimers()
  })

  it('guides create flow through the stepper and submits the selected provider and channel', async () => {
    const onSubmit = vi.fn(async () => undefined)

    await act(async () => {
      root.render(
        <ClawEditorDialog
          isOpen
          claw={null}
          providers={[provider]}
          configuredChannels={[
            {
              id: 'channel-free',
              type: 'telegram',
              name: 'Free Telegram',
              assistantId: null,
              assistantName: null,
              status: 'disconnected',
              errorMessage: null,
              pairedCount: 0,
              pendingPairingCount: 0
            }
          ]}
          isSubmitting={false}
          onClose={() => undefined}
          onSubmit={onSubmit}
          onCreateChannel={vi.fn(async () => {
            throw new Error('not used')
          })}
          onUpdateChannel={vi.fn(async () => {
            throw new Error('not used')
          })}
          onDeleteChannel={vi.fn(async () => undefined)}
          onCreateProvider={vi.fn(async () => {
            throw new Error('not used')
          })}
          onUpdateProvider={vi.fn(async () => {
            throw new Error('not used')
          })}
        />
      )
    })
    await flushAsyncWork()

    expect(document.body.textContent).toContain('Provider')
    const providerButton = document.body.querySelector(
      'button[data-provider-id="provider-1"]'
    ) as HTMLButtonElement
    const nextButton = document.body.querySelector(
      'button[id="claw-create-next"]'
    ) as HTMLButtonElement

    await clickElement(providerButton)
    await flushAsyncWork()

    await clickElement(nextButton)
    await flushAsyncWork()

    const channelButton = document.body.querySelector(
      'button[data-channel-id="channel-free"]'
    ) as HTMLButtonElement

    await clickElement(channelButton)
    await flushAsyncWork()

    await clickElement(document.body.querySelector('button[id="claw-create-next"]'))
    await flushAsyncWork()
    await flushTimerWork()

    const nameInput = document.body.querySelector('input[id="claw-name"]') as HTMLInputElement
    expect(nameInput.value).toBe('My First Assistant')
    expect(document.activeElement).toBe(nameInput)

    await act(async () => {
      setElementValue(nameInput, 'Ops Assistant')
    })
    await flushAsyncWork()

    await clickElement(document.body.querySelector('button[id="claw-create-next"]'))
    await flushAsyncWork()
    await flushTimerWork()

    expect(document.body.textContent).toContain('Recommended Setup')

    await clickElement(document.body.querySelector('button[id="claw-create-submit"]'))
    await flushAsyncWork()

    expect(onSubmit).toHaveBeenCalledWith({
      assistant: {
        name: 'Ops Assistant',
        providerId: 'provider-1',
        enabled: true
      },
      channel: {
        mode: 'attach',
        channelId: 'channel-free'
      }
    })
  })

  it('does not allow submitting before the details step', async () => {
    vi.useFakeTimers()
    const onSubmit = vi.fn(async () => undefined)

    await act(async () => {
      root.render(
        <ClawEditorDialog
          isOpen
          claw={null}
          providers={[provider]}
          configuredChannels={[
            {
              id: 'channel-free',
              type: 'telegram',
              name: 'Free Telegram',
              assistantId: null,
              assistantName: null,
              status: 'disconnected',
              errorMessage: null,
              pairedCount: 0,
              pendingPairingCount: 0
            }
          ]}
          isSubmitting={false}
          onClose={() => undefined}
          onSubmit={onSubmit}
          onCreateChannel={vi.fn(async () => {
            throw new Error('not used')
          })}
          onUpdateChannel={vi.fn(async () => {
            throw new Error('not used')
          })}
          onDeleteChannel={vi.fn(async () => undefined)}
          onCreateProvider={vi.fn(async () => {
            throw new Error('not used')
          })}
          onUpdateProvider={vi.fn(async () => {
            throw new Error('not used')
          })}
        />
      )
    })
    await flushAsyncWork()

    await clickElement(document.body.querySelector('button[data-provider-id="provider-1"]'))
    await flushAsyncWork()
    await clickElement(document.body.querySelector('button[id="claw-create-next"]'))
    await flushAsyncWork()

    await clickElement(document.body.querySelector('button[data-channel-id="channel-free"]'))
    await flushAsyncWork()
    await clickElement(document.body.querySelector('button[id="claw-create-next"]'))
    await flushAsyncWork()

    await clickElement(document.body.querySelector('button[id="claw-create-next"]'))
    await flushAsyncWork()

    const submitButton = document.body.querySelector(
      'button[id="claw-create-submit"]'
    ) as HTMLButtonElement | null

    expect(submitButton).not.toBeNull()
    expect(submitButton?.disabled).toBe(true)
    expect(document.body.querySelector('form')).toBeNull()

    expect(onSubmit).not.toHaveBeenCalled()
    expect(document.body.textContent).toContain('Recommended Setup')
    expect(document.body.querySelector('button[id="claw-create-next"]')).toBeNull()

    await act(async () => {
      vi.runAllTimers()
    })
    expect(submitButton?.disabled).toBe(false)
  })

  it('lets create flow skip channel selection and saves the claw disabled', async () => {
    const onSubmit = vi.fn(async () => undefined)

    await act(async () => {
      root.render(
        <ClawEditorDialog
          isOpen
          claw={null}
          providers={[provider]}
          configuredChannels={[]}
          isSubmitting={false}
          onClose={() => undefined}
          onSubmit={onSubmit}
          onCreateChannel={vi.fn(async () => {
            throw new Error('not used')
          })}
          onUpdateChannel={vi.fn(async () => {
            throw new Error('not used')
          })}
          onDeleteChannel={vi.fn(async () => undefined)}
          onCreateProvider={vi.fn(async () => {
            throw new Error('not used')
          })}
          onUpdateProvider={vi.fn(async () => {
            throw new Error('not used')
          })}
        />
      )
    })
    await flushAsyncWork()

    await clickElement(document.body.querySelector('button[data-provider-id="provider-1"]'))
    await flushAsyncWork()
    await clickElement(document.body.querySelector('button[id="claw-create-next"]'))
    await flushAsyncWork()
    await clickElement(document.body.querySelector('button[id="claw-create-next"]'))
    await flushAsyncWork()
    await flushTimerWork()

    const nameInput = document.body.querySelector('input[id="claw-name"]') as HTMLInputElement
    await act(async () => {
      setElementValue(nameInput, 'Ops Assistant')
    })
    await flushAsyncWork()

    await clickElement(document.body.querySelector('button[id="claw-create-next"]'))
    await flushAsyncWork()
    await flushTimerWork()

    await clickElement(document.body.querySelector('button[id="claw-create-submit"]'))
    await flushAsyncWork()

    expect(onSubmit).toHaveBeenCalledWith({
      assistant: {
        name: 'Ops Assistant',
        providerId: 'provider-1',
        enabled: false
      }
    })
  })

  it('installs only missing recommended skills in the setup step', async () => {
    vi.mocked(getRuntimeOnboardingSkillsStatus).mockResolvedValueOnce(['agent-browser'])

    await act(async () => {
      root.render(
        <ClawEditorDialog
          isOpen
          claw={null}
          providers={[provider]}
          configuredChannels={[]}
          isSubmitting={false}
          onClose={() => undefined}
          onSubmit={vi.fn(async () => undefined)}
          onCreateChannel={vi.fn(async () => {
            throw new Error('not used')
          })}
          onUpdateChannel={vi.fn(async () => {
            throw new Error('not used')
          })}
          onDeleteChannel={vi.fn(async () => undefined)}
          onCreateProvider={vi.fn(async () => {
            throw new Error('not used')
          })}
          onUpdateProvider={vi.fn(async () => {
            throw new Error('not used')
          })}
        />
      )
    })
    await flushAsyncWork()

    await clickElement(document.body.querySelector('button[data-provider-id="provider-1"]'))
    await flushAsyncWork()
    await clickElement(document.body.querySelector('button[id="claw-create-next"]'))
    await flushAsyncWork()
    await clickElement(document.body.querySelector('button[id="claw-create-next"]'))
    await flushAsyncWork()
    await clickElement(document.body.querySelector('button[id="claw-create-next"]'))
    await flushAsyncWork()

    const installButton = Array.from(document.body.querySelectorAll('button')).find((button) =>
      button.textContent?.includes('Install selected skills')
    ) as HTMLButtonElement | undefined

    await clickElement(installButton)
    await flushAsyncWork()

    expect(installRuntimeOnboardingSkills).toHaveBeenCalledWith(['find-skills'])
  })

  it('submits detach when an existing claw clears its channel', async () => {
    const onSubmit = vi.fn(async () => undefined)

    await act(async () => {
      root.render(
        <ClawEditorDialog
          isOpen
          claw={{
            id: 'assistant-1',
            name: 'Ops Assistant',
            description: '',
            providerId: 'provider-1',
            workspacePath: null,
            enabled: true,
            channel: {
              id: 'channel-current',
              type: 'lark',
              name: 'Current Lark',
              status: 'connected',
              errorMessage: null
            }
          }}
          providers={[provider]}
          configuredChannels={[
            {
              id: 'channel-current',
              type: 'lark',
              name: 'Current Lark',
              assistantId: 'assistant-1',
              assistantName: 'Ops Assistant',
              status: 'connected',
              errorMessage: null,
              pairedCount: 0,
              pendingPairingCount: 0
            }
          ]}
          isSubmitting={false}
          onClose={() => undefined}
          onSubmit={onSubmit}
          onCreateChannel={vi.fn(async () => {
            throw new Error('not used')
          })}
          onUpdateChannel={vi.fn(async () => {
            throw new Error('not used')
          })}
          onDeleteChannel={vi.fn(async () => undefined)}
          onCreateProvider={vi.fn(async () => {
            throw new Error('not used')
          })}
          onUpdateProvider={vi.fn(async () => {
            throw new Error('not used')
          })}
        />
      )
    })
    await flushAsyncWork()

    await clickElement(document.body.querySelector('button[id="claw-select-channel-button"]'))
    await flushAsyncWork()
    await clickElement(document.body.querySelector('button[id="claw-channel-selector-clear"]'))
    await flushAsyncWork()
    await clickElement(document.body.querySelector('button[id="claw-channel-selector-apply"]'))
    await flushAsyncWork()
    await clickElement(document.body.querySelector('form button[type="submit"]'))
    await flushAsyncWork()

    expect(onSubmit).toHaveBeenCalledWith({
      assistant: {
        name: 'Ops Assistant',
        providerId: 'provider-1',
        enabled: false
      },
      channel: {
        mode: 'detach'
      }
    })
  })

  it('submits attach when the selected channel changes for an existing claw', async () => {
    const onSubmit = vi.fn(async () => undefined)

    await act(async () => {
      root.render(
        <ClawEditorDialog
          isOpen
          claw={{
            id: 'assistant-1',
            name: 'Ops Assistant',
            description: '',
            providerId: 'provider-1',
            workspacePath: null,
            enabled: true,
            channel: {
              id: 'channel-current',
              type: 'lark',
              name: 'Current Lark',
              status: 'connected',
              errorMessage: null
            }
          }}
          providers={[provider]}
          configuredChannels={[
            {
              id: 'channel-current',
              type: 'lark',
              name: 'Current Lark',
              assistantId: 'assistant-1',
              assistantName: 'Ops Assistant',
              status: 'connected',
              errorMessage: null,
              pairedCount: 0,
              pendingPairingCount: 0
            },
            {
              id: 'channel-free',
              type: 'telegram',
              name: 'Free Telegram',
              assistantId: null,
              assistantName: null,
              status: 'disconnected',
              errorMessage: null,
              pairedCount: 0,
              pendingPairingCount: 0
            }
          ]}
          isSubmitting={false}
          onClose={() => undefined}
          onSubmit={onSubmit}
          onCreateChannel={vi.fn(async () => {
            throw new Error('not used')
          })}
          onUpdateChannel={vi.fn(async () => {
            throw new Error('not used')
          })}
          onDeleteChannel={vi.fn(async () => undefined)}
          onCreateProvider={vi.fn(async () => {
            throw new Error('not used')
          })}
          onUpdateProvider={vi.fn(async () => {
            throw new Error('not used')
          })}
        />
      )
    })
    await flushAsyncWork()

    await clickElement(document.body.querySelector('button[id="claw-select-channel-button"]'))
    await flushAsyncWork()
    await clickElement(document.body.querySelector('button[data-channel-id="channel-free"]'))
    await flushAsyncWork()
    await clickElement(document.body.querySelector('button[id="claw-channel-selector-apply"]'))
    await flushAsyncWork()
    await clickElement(document.body.querySelector('form button[type="submit"]'))
    await flushAsyncWork()

    expect(onSubmit).toHaveBeenCalledWith({
      assistant: {
        name: 'Ops Assistant',
        providerId: 'provider-1',
        enabled: true
      },
      channel: {
        mode: 'attach',
        channelId: 'channel-free'
      }
    })
  })
})
