import { Bot, X } from 'lucide-react'
import { Link } from 'react-router-dom'
import {
  AssistantEditor,
  type AssistantEditorChannelsProps
} from '../../assistants/assistant-editor'
import type { SaveAssistantHeartbeatInput } from '../../assistants/assistant-heartbeat-query'
import type { AssistantRecord, SaveAssistantInput } from '../../assistants/assistants-query'
import type { McpServerRecord } from '../../settings/mcp-servers/mcp-servers-query'
import type { ProviderRecord } from '../../settings/providers/providers-query'
import { Button } from '../../../components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '../../../components/ui/card'
import { useTranslation } from '../../../i18n/use-app-translation'

export type AssistantManagementDialogMode = 'create' | 'edit'

type AssistantManagementDialogProps = {
  mode: AssistantManagementDialogMode
  isOpen: boolean
  assistant: AssistantRecord | null
  providers: ProviderRecord[]
  mcpServers: Record<string, McpServerRecord>
  channels?: AssistantEditorChannelsProps
  isSaving: boolean
  errorMessage: string | null
  onClose: () => void
  onSelectWorkspacePath: () => Promise<string | null>
  onSubmit: (
    input: SaveAssistantInput,
    heartbeatInput?: SaveAssistantHeartbeatInput | null
  ) => Promise<void>
}

export function AssistantManagementDialog({
  mode,
  isOpen,
  assistant,
  providers,
  mcpServers,
  channels,
  isSaving,
  errorMessage,
  onClose,
  onSelectWorkspacePath,
  onSubmit
}: AssistantManagementDialogProps): React.JSX.Element | null {
  const { t } = useTranslation()

  if (!isOpen) {
    return null
  }

  if (mode === 'edit' && !assistant) {
    return null
  }

  const isCreateMode = mode === 'create'
  const titleId = isCreateMode ? 'claws-assistant-create-title' : 'claws-assistant-edit-title'
  const description = channels
    ? isCreateMode
      ? t('claws.empty.description')
      : t('claws.description')
    : isCreateMode
      ? t('threads.assistantDialog.createDescription')
      : t('threads.assistantDialog.editDescription')

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
        className="relative z-10 w-full max-w-5xl gap-4 py-5"
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
              <p className="text-sm text-muted-foreground">{description}</p>
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
              <p className="text-sm text-muted-foreground">
                <Bot className="mr-1 inline size-4" />
                {t('threads.assistantDialog.addProviderPrefix')}{' '}
                <Link to="/settings/providers">
                  {t('threads.assistantDialog.providerLinkLabel')}
                </Link>
                .
              </p>
            ) : null}

            {errorMessage ? (
              <p role="alert" className="text-sm text-destructive">
                {errorMessage}
              </p>
            ) : null}

            <AssistantEditor
              key={
                isCreateMode
                  ? 'claws-assistant-config-create'
                  : `claws-assistant-config-${assistant?.id ?? 'unknown'}`
              }
              providers={providers}
              mcpServers={mcpServers}
              initialValue={isCreateMode ? null : assistant}
              isSubmitting={isSaving}
              channels={channels}
              showActivityTab={!isCreateMode}
              submitButtonId={isCreateMode ? 'claw-create-submit' : 'claw-edit-submit'}
              onSelectWorkspacePath={onSelectWorkspacePath}
              onSubmit={onSubmit}
            />
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
