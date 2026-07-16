import os from 'node:os'
import path from 'node:path'
import { access, mkdtemp, mkdir, rm, symlink, writeFile } from 'node:fs/promises'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  getInstalledRecommendedSkills,
  installRecommendedSkillsWithBunx,
  listAssistantSkills,
  listDiscoveredSkillsPage,
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
      path.join(homeDirectory, '.codex', 'skills'),
      'web-perf',
      `---
name: Web Perf
description: Measures production performance.
---
`
    )
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
      path.join(homeDirectory, '.agents', 'skills'),
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

    expect(skills).toHaveLength(4)
    expect(skills).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          source: 'global-codex',
          name: 'Web Perf',
          description: 'Measures production performance.',
          canDelete: false,
          relativePath: 'web-perf'
        }),
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

  it('returns cursor-paged skill catalog results with source counts and filters', async () => {
    await createSkill(
      path.join(homeDirectory, '.codex', 'skills'),
      'alpha-agent',
      `---
name: Alpha Agent
description: First global codex skill.
---
`
    )
    await createSkill(
      path.join(homeDirectory, '.codex', 'skills'),
      'bravo-agent',
      `---
name: Bravo Agent
description: Second global codex skill.
---
`
    )
    await createSkill(
      path.join(homeDirectory, '.claude', 'skills'),
      'charlie-helper',
      `---
name: Charlie Helper
description: Claude-side helper.
---
`
    )
    await createSkill(
      path.join(homeDirectory, '.agents', 'skills'),
      'delta-helper',
      `---
name: Delta Helper
description: Agent-side helper.
---
`
    )
    await createSkill(
      path.join(workspaceDirectory, 'skills'),
      'echo-workspace',
      `---
name: Echo Workspace
description: Workspace-only helper.
---
`
    )

    const firstPage = await listDiscoveredSkillsPage({
      workspaceRootPath: workspaceDirectory,
      includeWorkspaceSource: true,
      limit: 2
    })

    expect(firstPage.skills).toHaveLength(2)
    expect(firstPage.skills.map((skill) => skill.name)).toEqual(['Alpha Agent', 'Bravo Agent'])
    expect(firstPage.totalCount).toBe(5)
    expect(firstPage.sourceCounts).toEqual({
      'global-codex': 2,
      'global-claude': 1,
      'global-agent': 1,
      'global-agent-legacy': 0,
      workspace: 1
    })
    expect(firstPage.nextCursor).toBe('2')

    const secondPage = await listDiscoveredSkillsPage({
      workspaceRootPath: workspaceDirectory,
      includeWorkspaceSource: true,
      cursor: firstPage.nextCursor ?? undefined,
      limit: 2
    })

    expect(secondPage.skills).toHaveLength(2)
    expect(secondPage.skills.map((skill) => skill.name)).toEqual(['Charlie Helper', 'Delta Helper'])
    expect(secondPage.nextCursor).toBe('4')

    const filteredPage = await listDiscoveredSkillsPage({
      workspaceRootPath: workspaceDirectory,
      includeWorkspaceSource: true,
      search: 'helper',
      source: 'global-agent'
    })

    expect(filteredPage.skills).toHaveLength(1)
    expect(filteredPage.skills[0]).toEqual(
      expect.objectContaining({
        name: 'Delta Helper',
        source: 'global-agent'
      })
    )
    expect(filteredPage.totalCount).toBe(1)
    expect(filteredPage.sourceCounts).toEqual({
      'global-codex': 0,
      'global-claude': 1,
      'global-agent': 1,
      'global-agent-legacy': 0,
      workspace: 1
    })
    expect(filteredPage.nextCursor).toBeNull()
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
      path.join(homeDirectory, '.codex', 'skills'),
      'agent-browser',
      `---
name: agent-browser
description: Browser automation skill.
---
`
    )
    await createSkill(
      path.join(homeDirectory, '.agents', 'skills'),
      'find-skills',
      `---
name: find-skills
description: Helper skill.
---
`
    )

    const installed = await getInstalledRecommendedSkills()

    expect(installed).toEqual(['agent-browser', 'find-skills'])
  })
})
