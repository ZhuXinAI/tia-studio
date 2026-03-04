export type AssistantSkillSource = 'global-claude' | 'global-agent' | 'workspace'

export type AssistantSkillRecord = {
  id: string
  name: string
  description: string | null
  source: AssistantSkillSource
  sourceRootPath: string
  directoryPath: string
  relativePath: string
  skillFilePath: string
  canDelete: boolean
}

export async function listAssistantSkills(
  workspaceRootPath: string
): Promise<AssistantSkillRecord[]> {
  const listSkills = window.tiaDesktop?.listAssistantSkills
  if (typeof listSkills !== 'function') {
    return []
  }

  return listSkills(workspaceRootPath)
}

export async function removeAssistantWorkspaceSkill(input: {
  workspaceRootPath: string
  relativePath: string
}): Promise<void> {
  const removeSkill = window.tiaDesktop?.removeAssistantWorkspaceSkill
  if (typeof removeSkill !== 'function') {
    throw new Error('Skill manager is not available in this environment')
  }

  await removeSkill(input.workspaceRootPath, input.relativePath)
}
