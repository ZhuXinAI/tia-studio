import { X } from 'lucide-react'
import { AssistantEditor } from '../../assistants/assistant-editor'
import type { AssistantRecord, SaveAssistantInput } from '../../assistants/assistants-query'
import type { McpServerRecord } from '../../settings/mcp-servers/mcp-servers-query'
import type { ProviderRecord } from '../../settings/providers/providers-query'
import { Button } from '../../../components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '../../../components/ui/card'

type AssistantConfigDialogProps = {
  isOpen: boolean
  assistant: AssistantRecord | null
  providers: ProviderRecord[]
  mcpServers: Record<string, McpServerRecord>
  isSaving: boolean
  onClose: () => void
  onSelectWorkspacePath: () => Promise<string | null>
  onSubmit: (input: SaveAssistantInput) => Promise<void>
}

export function AssistantConfigDialog({
  isOpen,
  assistant,
  providers,
  mcpServers,
  isSaving,
  onClose,
  onSelectWorkspacePath,
  onSubmit
}: AssistantConfigDialogProps): React.JSX.Element | null {
  if (!isOpen || !assistant) {
    return null
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button
        type="button"
        aria-label="Close assistant config dialog"
        className="absolute inset-0 bg-background/80 backdrop-blur-sm"
        onClick={onClose}
        disabled={isSaving}
      />
      <Card
        role="dialog"
        aria-modal="true"
        aria-labelledby="assistant-config-dialog-title"
        className="relative z-10 w-full max-w-4xl gap-4 py-5"
      >
        <CardHeader className="pb-0">
          <div className="flex items-start justify-between gap-2">
            <div className="space-y-1">
              <CardTitle id="assistant-config-dialog-title">Configure {assistant.name}</CardTitle>
              <p className="text-muted-foreground text-sm">
                Update provider, workspace, and prompt without leaving chat.
              </p>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={onClose}
              disabled={isSaving}
              aria-label="Close dialog"
            >
              <X className="size-4" />
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <AssistantEditor
            key={`assistant-config-${assistant.id}`}
            providers={providers}
            mcpServers={mcpServers}
            initialValue={assistant}
            isSubmitting={isSaving}
            onSelectWorkspacePath={onSelectWorkspacePath}
            onSubmit={onSubmit}
          />
        </CardContent>
      </Card>
    </div>
  )
}
