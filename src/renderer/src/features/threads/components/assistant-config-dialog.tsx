import { Bot, X } from 'lucide-react'
import { Link } from 'react-router-dom'
import { AssistantEditor } from '../../assistants/assistant-editor'
import type { AssistantRecord, SaveAssistantInput } from '../../assistants/assistants-query'
import type { McpServerRecord } from '../../settings/mcp-servers/mcp-servers-query'
import type { ProviderRecord } from '../../settings/providers/providers-query'
import { Button } from '../../../components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '../../../components/ui/card'

export type AssistantDialogMode = 'create' | 'edit'

type AssistantConfigDialogProps = {
  mode: AssistantDialogMode
  isOpen: boolean
  assistant: AssistantRecord | null
  providers: ProviderRecord[]
  mcpServers: Record<string, McpServerRecord>
  isSaving: boolean
  errorMessage: string | null
  onClose: () => void
  onSelectWorkspacePath: () => Promise<string | null>
  onSubmit: (input: SaveAssistantInput) => Promise<void>
}

export function AssistantConfigDialog({
  mode,
  isOpen,
  assistant,
  providers,
  mcpServers,
  isSaving,
  errorMessage,
  onClose,
  onSelectWorkspacePath,
  onSubmit
}: AssistantConfigDialogProps): React.JSX.Element | null {
  if (!isOpen) {
    return null
  }

  if (mode === 'edit' && !assistant) {
    return null
  }

  const isCreateMode = mode === 'create'
  const titleId = isCreateMode ? 'create-assistant-title' : 'assistant-config-dialog-title'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button
        type="button"
        aria-label={isCreateMode ? 'Close create assistant dialog' : 'Close assistant config dialog'}
        className="absolute inset-0 bg-background/80 backdrop-blur-sm"
        onClick={onClose}
        disabled={isSaving}
      />
      <Card
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="relative z-10 w-full max-w-4xl gap-4 py-5"
      >
        <CardHeader className="pb-0">
          <div className="flex items-start justify-between gap-2">
            <div className="space-y-1">
              <CardTitle id={titleId}>
                {isCreateMode ? 'Create Assistant' : `Configure ${assistant?.name ?? 'Assistant'}`}
              </CardTitle>
              <p className="text-muted-foreground text-sm">
                {isCreateMode
                  ? 'Configure workspace path and provider before starting chat.'
                  : 'Update provider, workspace, and prompt without leaving chat.'}
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
          <div className="space-y-3">
            {providers.length === 0 ? (
              <p className="text-muted-foreground text-sm">
                <Bot className="mr-1 inline size-4" />
                Add a provider first in <Link to="/settings/providers">Model Provider</Link>.
              </p>
            ) : null}
            {errorMessage ? (
              <p role="alert" className="text-destructive text-sm">
                {errorMessage}
              </p>
            ) : null}
            <AssistantEditor
              key={
                isCreateMode ? 'assistant-config-create' : `assistant-config-${assistant?.id ?? 'unknown'}`
              }
              providers={providers}
              mcpServers={mcpServers}
              initialValue={isCreateMode ? null : assistant}
              isSubmitting={isSaving}
              onSelectWorkspacePath={onSelectWorkspacePath}
              onSubmit={onSubmit}
            />
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
