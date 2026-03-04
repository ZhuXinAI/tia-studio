import os from 'node:os'
import path from 'node:path'
import { access, mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { listAssistantSkills, removeWorkspaceSkill } from './skills-manager'

async function createSkill(baseDirectory: string, relativeDirectory: string, content: string): Promise<void> {
  const skillDirectory = path.join(baseDirectory, relativeDirectory)
  await mkdir(skillDirectory, { recursive: true })
  await writeFile(path.join(skillDirectory, 'SKILL.md'), content, 'utf8')
}

describe('skills manager', () => {
  let tempRoot: string
  let homeDirectory: string
  let workspaceDirectory: string

  beforeEach(async () => {
    tempRoot = await mkdtemp(path.join(os.tmpdir(), 'tia-skills-'))
    homeDirectory = path.join(tempRoot, 'home')
    workspaceDirectory = path.join(tempRoot, 'workspace')
    await mkdir(homeDirectory, { recursive: true })
    await mkdir(workspaceDirectory, { recursive: true })
    vi.spyOn(os, 'homedir').mockReturnValue(homeDirectory)
  })

  afterEach(async () => {
    vi.restoreAllMocks()
    if (tempRoot) {
      await rm(tempRoot, { recursive: true, force: true })
    }
  })

  it('lists skills from global and workspace directories', async () => {
    await createSkill(
      path.join(homeDirectory, '.claude', 'skills'),
      'research-helper',
      `---
name: Research Helper
description: Finds docs and summarizes them.
---
`
    )
    await createSkill(
      path.join(homeDirectory, '.agent', 'skills'),
      'deploy/checklist',
      `---
name: Deploy Checklist
description: Covers release checks.
---
`
    )
    await createSkill(
      path.join(workspaceDirectory, 'skills'),
      'workspace-lint',
      `---
name: Workspace Lint
description: Keeps workspace linting rules.
---
`
    )

    const skills = await listAssistantSkills(workspaceDirectory)

    expect(skills).toHaveLength(3)
    expect(skills).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          source: 'global-claude',
          name: 'Research Helper',
          description: 'Finds docs and summarizes them.',
          canDelete: false,
          relativePath: 'research-helper'
        }),
        expect.objectContaining({
          source: 'global-agent',
          name: 'Deploy Checklist',
          description: 'Covers release checks.',
          canDelete: false,
          relativePath: path.join('deploy', 'checklist')
        }),
        expect.objectContaining({
          source: 'workspace',
          name: 'Workspace Lint',
          description: 'Keeps workspace linting rules.',
          canDelete: true,
          relativePath: 'workspace-lint'
        })
      ])
    )
  })

  it('removes workspace skill folders', async () => {
    await createSkill(
      path.join(workspaceDirectory, 'skills'),
      'workspace-lint',
      `---
name: Workspace Lint
description: Keeps workspace linting rules.
---
`
    )

    await removeWorkspaceSkill(workspaceDirectory, 'workspace-lint')

    await expect(
      access(path.join(workspaceDirectory, 'skills', 'workspace-lint', 'SKILL.md'))
    ).rejects.toBeDefined()
  })

  it('blocks workspace skill removal outside the workspace skills root', async () => {
    await expect(removeWorkspaceSkill(workspaceDirectory, '../outside')).rejects.toThrow(
      'Workspace skill path must stay inside workspace skills directory'
    )
  })
})
