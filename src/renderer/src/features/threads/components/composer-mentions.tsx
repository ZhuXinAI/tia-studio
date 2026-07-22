import { useMemo } from 'react'
import { FileText, Wrench } from 'lucide-react'
import { unstable_useMentionAdapter } from '@assistant-ui/react'
import { ComposerTriggerPopover } from '@renderer/components/assistant-ui/composer-trigger-popover'
import { useComposerMentions } from '../composer-mentions-query'

export function ComposerMentions({ workspaceId }: { workspaceId: string | null | undefined }) {
  const { data, isLoading } = useComposerMentions(workspaceId)
  const categories = useMemo(
    () => [
      {
        id: 'files',
        label: 'Files',
        items: (data?.files ?? []).map((file) => ({
          id: file.relativePath,
          type: 'file',
          label: file.name,
          icon: 'file'
        }))
      },
      {
        id: 'skills',
        label: 'Installed skills',
        items: (data?.skills ?? []).map((skill) => ({
          id: skill.id,
          type: 'skill',
          label: skill.name,
          description: skill.description ?? `${skill.source} · ${skill.relativePath}`,
          icon: 'skill'
        }))
      }
    ],
    [data?.files, data?.skills]
  )
  const mention = unstable_useMentionAdapter({
    categories,
    includeModelContextTools: false,
    iconMap: { files: FileText, skills: Wrench, file: FileText, skill: Wrench }
  })

  return (
    <ComposerTriggerPopover
      char="@"
      adapter={mention.adapter}
      directive={mention.directive}
      iconMap={mention.iconMap}
      fallbackIcon={FileText}
      isLoading={isLoading}
      aria-label="Tag a workspace file or installed skill"
      emptyItemsLabel="No matching files or skills"
    />
  )
}
