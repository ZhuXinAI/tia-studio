import os from 'node:os'
import path from 'node:path'
import { access, mkdtemp, mkdir, rm, symlink, writeFile } from 'node:fs/promises'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  getInstalledRecommendedSkills,
  installRecommendedSkillsWithBunx,
  listAssistantSkills,
  removeWorkspaceSkill
} from './skills-manager'

async function createSkill(
  baseDirectory: string,
  relativeDirectory: string,
  content: string
): Promise<void> {
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

  it('lists symlinked skill directories', async () => {
    const externalSkillRoot = path.join(tempRoot, 'shared-skills')
    await createSkill(
      externalSkillRoot,
      'linked-research',
      `---
name: Linked Research
description: Shared skill available via symlink.
---
`
    )

    const claudeSkillsRoot = path.join(homeDirectory, '.claude', 'skills')
    await mkdir(claudeSkillsRoot, { recursive: true })
    await symlink(
      path.join(externalSkillRoot, 'linked-research'),
      path.join(claudeSkillsRoot, 'linked')
    )

    const skills = await listAssistantSkills(workspaceDirectory)

    expect(skills).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          source: 'global-claude',
          name: 'Linked Research',
          relativePath: 'linked',
          canDelete: false
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

  it('installs recommended skills with managed bun x alias', async () => {
    const runCommand = vi.fn(async () => undefined)

    const installedSkillIds = await installRecommendedSkillsWithBunx({
      bunxPath: '/managed/bun/bin/bun',
      bunxArgs: ['x'],
      skillIds: ['agent-browser', 'find-skills'],
      env: { PATH: '/usr/bin' },
      runCommand
    })

    expect(installedSkillIds).toEqual(['agent-browser', 'find-skills'])
    expect(runCommand).toHaveBeenNthCalledWith(
      1,
      '/managed/bun/bin/bun',
      [
        'x',
        'skills',
        'add',
        'https://github.com/vercel-labs/agent-browser',
        '--skill',
        'agent-browser',
        '--global',
        '--agent',
        'claude-code',
        '--yes'
      ],
      {
        cwd: homeDirectory,
        env: { PATH: '/usr/bin' }
      }
    )
    expect(runCommand).toHaveBeenNthCalledWith(
      2,
      '/managed/bun/bin/bun',
      [
        'x',
        'skills',
        'add',
        'https://github.com/vercel-labs/skills',
        '--skill',
        'find-skills',
        '--global',
        '--agent',
        'claude-code',
        '--yes'
      ],
      {
        cwd: homeDirectory,
        env: { PATH: '/usr/bin' }
      }
    )
  })

  it('detects installed recommended skills in global claude directory', async () => {
    await createSkill(
      path.join(homeDirectory, '.claude', 'skills'),
      'agent-browser',
      `---
name: agent-browser
description: Browser automation skill.
---
`
    )
    await createSkill(
      path.join(homeDirectory, '.agent', 'skills'),
      'find-skills',
      `---
name: find-skills
description: Helper skill.
---
`
    )

    const installed = await getInstalledRecommendedSkills()

    expect(installed).toEqual(['agent-browser'])
  })
})
