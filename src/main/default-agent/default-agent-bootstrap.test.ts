import os from 'node:os'
import path from 'node:path'
import { access, mkdtemp, rm } from 'node:fs/promises'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { AssistantsRepository } from '../persistence/repos/assistants-repo'
import type { ProvidersRepository } from '../persistence/repos/providers-repo'
import {
  BUILT_IN_DEFAULT_AGENT_MCP_KEY,
  DEFAULT_AGENT_NAME,
  DEFAULT_AGENT_PROMPT,
  ensureBuiltInDefaultAgent,
  resolveDefaultAgentWorkspacePath
} from './default-agent-bootstrap'

describe('default agent bootstrap', () => {
  let tempRoot: string | null = null

  afterEach(async () => {
    if (tempRoot) {
      await rm(tempRoot, { recursive: true, force: true })
      tempRoot = null
    }
  })

  it('seeds the built-in default agent when assistants are empty', async () => {
    tempRoot = await mkdtemp(path.join(os.tmpdir(), 'tia-default-agent-'))
    const assistantsRepo = {
      list: vi.fn(async () => []),
      create: vi.fn(async () => ({ id: 'assistant-1' }))
    }
    const providersRepo = {
      list: vi.fn(async () => [])
    }

    await ensureBuiltInDefaultAgent({
      assistantsRepo: assistantsRepo as unknown as AssistantsRepository,
      providersRepo: providersRepo as unknown as ProvidersRepository,
      userDataPath: tempRoot
    })

    const workspacePath = resolveDefaultAgentWorkspacePath(tempRoot)
    await expect(access(workspacePath)).resolves.toBeUndefined()
    await expect(access(path.join(workspacePath, 'skills'))).resolves.toBeUndefined()
    expect(assistantsRepo.create).toHaveBeenCalledTimes(1)
    expect(assistantsRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        name: DEFAULT_AGENT_NAME,
        instructions: DEFAULT_AGENT_PROMPT,
        providerId: '',
        workspaceConfig: {
          rootPath: workspacePath
        },
        skillsConfig: {},
        mcpConfig: {
          [BUILT_IN_DEFAULT_AGENT_MCP_KEY]: true
        },
        maxSteps: 100
      })
    )
  })

  it('does not create another default agent when assistants already exist', async () => {
    tempRoot = await mkdtemp(path.join(os.tmpdir(), 'tia-default-agent-'))
    const assistantsRepo = {
      list: vi.fn(async () => [
        {
          id: 'assistant-existing'
        }
      ]),
      create: vi.fn()
    }
    const providersRepo = {
      list: vi.fn(async () => [])
    }

    await ensureBuiltInDefaultAgent({
      assistantsRepo: assistantsRepo as unknown as AssistantsRepository,
      providersRepo: providersRepo as unknown as ProvidersRepository,
      userDataPath: tempRoot
    })

    expect(assistantsRepo.create).not.toHaveBeenCalled()
  })

  it('uses the first enabled provider when available', async () => {
    tempRoot = await mkdtemp(path.join(os.tmpdir(), 'tia-default-agent-'))
    const assistantsRepo = {
      list: vi.fn(async () => []),
      create: vi.fn(async () => ({ id: 'assistant-1' }))
    }
    const providersRepo = {
      list: vi.fn(async () => [
        {
          id: 'provider-disabled',
          enabled: false,
          selectedModel: 'gpt-5'
        },
        {
          id: 'provider-enabled',
          enabled: true,
          selectedModel: 'gpt-5-mini'
        }
      ])
    }

    await ensureBuiltInDefaultAgent({
      assistantsRepo: assistantsRepo as unknown as AssistantsRepository,
      providersRepo: providersRepo as unknown as ProvidersRepository,
      userDataPath: tempRoot
    })

    expect(assistantsRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        providerId: 'provider-enabled'
      })
    )
  })

  it('marks legacy default assistant records as protected', async () => {
    tempRoot = await mkdtemp(path.join(os.tmpdir(), 'tia-default-agent-'))
    const assistantsRepo = {
      list: vi.fn(async () => [
        {
          id: 'assistant-default',
          workspaceConfig: {
            rootPath: resolveDefaultAgentWorkspacePath(tempRoot as string)
          },
          mcpConfig: {}
        }
      ]),
      create: vi.fn(),
      update: vi.fn(async () => ({ id: 'assistant-default' }))
    }
    const providersRepo = {
      list: vi.fn(async () => [])
    }

    await ensureBuiltInDefaultAgent({
      assistantsRepo: assistantsRepo as unknown as AssistantsRepository,
      providersRepo: providersRepo as unknown as ProvidersRepository,
      userDataPath: tempRoot
    })

    expect(assistantsRepo.create).not.toHaveBeenCalled()
    expect(assistantsRepo.update).toHaveBeenCalledWith('assistant-default', {
      mcpConfig: {
        [BUILT_IN_DEFAULT_AGENT_MCP_KEY]: true
      }
    })
  })
})
