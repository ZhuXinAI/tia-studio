import { Bot, X } from 'lucide-react'
import { Link } from 'react-router-dom'
import { AssistantEditor } from '../../assistants/assistant-editor'
import type { AssistantRecord, SaveAssistantInput } from '../../assistants/assistants-query'
import type { McpServerRecord } from '../../settings/mcp-servers/mcp-servers-query'
import type { ProviderRecord } from '../../settings/providers/providers-query'
import { Button } from '../../../components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '../../../components/ui/card'
import { useTranslation } from '../../../i18n/use-app-translation'

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
  const { t } = useTranslation()
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
        aria-label={
          isCreateMode
            ? t('threads.assistantDialog.closeCreateAriaLabel')
            : t('threads.assistantDialog.closeEditAriaLabel')
        }
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
                {isCreateMode
                  ? t('threads.assistantDialog.createTitle')
                  : t('threads.assistantDialog.editTitle', {
                      name: assistant?.name ?? t('threads.chat.defaultAssistantName')
                    })}
              </CardTitle>
              <p className="text-muted-foreground text-sm">
                {isCreateMode
                  ? t('threads.assistantDialog.createDescription')
                  : t('threads.assistantDialog.editDescription')}
              </p>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={onClose}
              disabled={isSaving}
              aria-label={t('common.actions.close')}
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
                {t('threads.assistantDialog.addProviderPrefix')}{' '}
                <Link to="/settings/providers">
                  {t('threads.assistantDialog.providerLinkLabel')}
                </Link>
                .
              </p>
            ) : null}
            {errorMessage ? (
              <p role="alert" className="text-destructive text-sm">
                {errorMessage}
              </p>
            ) : null}
            <AssistantEditor
              key={
                isCreateMode
                  ? 'assistant-config-create'
                  : `assistant-config-${assistant?.id ?? 'unknown'}`
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
