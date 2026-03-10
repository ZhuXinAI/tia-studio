import path from 'node:path'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { app } from 'electron'
import {
  toSnakeCase,
  resolveDefaultAssistantWorkspacePath,
  createDefaultWorkspaceConfig
} from './workspace-path-resolver'

vi.mock('electron', () => ({
  app: {
    getPath: vi.fn()
  }
}))

describe('toSnakeCase', () => {
  it('converts spaces to underscores', () => {
    expect(toSnakeCase('My Assistant')).toBe('my_assistant')
  })

  it('converts hyphens to underscores', () => {
    expect(toSnakeCase('my-assistant')).toBe('my_assistant')
  })

  it('removes special characters', () => {
    expect(toSnakeCase('My@Assistant#123')).toBe('myassistant123')
  })

  it('handles multiple spaces', () => {
    expect(toSnakeCase('My   Assistant')).toBe('my_assistant')
  })

  it('trims leading and trailing underscores', () => {
    expect(toSnakeCase('  My Assistant  ')).toBe('my_assistant')
  })

  it('handles empty string', () => {
    expect(toSnakeCase('')).toBe('')
  })

  it('handles already snake_case', () => {
    expect(toSnakeCase('my_assistant')).toBe('my_assistant')
  })

  it('handles CamelCase', () => {
    expect(toSnakeCase('MyAssistant')).toBe('myassistant')
  })

  it('collapses multiple underscores', () => {
    expect(toSnakeCase('my___assistant')).toBe('my_assistant')
  })
})

describe('resolveDefaultAssistantWorkspacePath', () => {
  function expectedWorkspacePath(name: string): string {
    return path.join('/Users/test/Library/Application Support/tia-studio', 'assistants', name)
  }

  beforeEach(() => {
    vi.mocked(app.getPath).mockReturnValue('/Users/test/Library/Application Support/tia-studio')
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('creates path with snake_case name', () => {
    const result = resolveDefaultAssistantWorkspacePath('My Assistant')
    expect(result).toBe(expectedWorkspacePath('my_assistant'))
  })

  it('handles empty name with fallback', () => {
    const result = resolveDefaultAssistantWorkspacePath('')
    expect(result).toBe(expectedWorkspacePath('unnamed_assistant'))
  })

  it('handles special characters', () => {
    const result = resolveDefaultAssistantWorkspacePath('Customer Support Bot!')
    expect(result).toBe(expectedWorkspacePath('customer_support_bot'))
  })

  it('calls app.getPath with userData', () => {
    resolveDefaultAssistantWorkspacePath('Test')
    expect(app.getPath).toHaveBeenCalledWith('userData')
  })
})

describe('createDefaultWorkspaceConfig', () => {
  function expectedWorkspacePath(name: string): string {
    return path.join('/Users/test/Library/Application Support/tia-studio', 'assistants', name)
  }

  beforeEach(() => {
    vi.mocked(app.getPath).mockReturnValue('/Users/test/Library/Application Support/tia-studio')
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('creates config with rootPath property', () => {
    const result = createDefaultWorkspaceConfig('My Assistant')
    expect(result).toEqual({
      rootPath: expectedWorkspacePath('my_assistant')
    })
  })

  it('returns object with correct structure', () => {
    const result = createDefaultWorkspaceConfig('Test')
    expect(result).toHaveProperty('rootPath')
    expect(typeof result.rootPath).toBe('string')
  })
})
