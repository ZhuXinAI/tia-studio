import { useEffect, useState } from 'react'
import { Bot, X } from 'lucide-react'
import { Link } from 'react-router-dom'
import {
  AssistantEditor,
  type AssistantEditorDefaultConfig,
  type AssistantEditorChannelSetupAction,
  type AssistantEditorChannelsProps
} from '../../assistants/assistant-editor'
import type { SaveAssistantHeartbeatInput } from '../../assistants/assistant-heartbeat-query'
import type { AssistantRecord, SaveAssistantInput } from '../../assistants/assistants-query'
import type { McpServerRecord } from '../../settings/mcp-servers/mcp-servers-query'
import {
  createProvider,
  providerKeys,
  type ProviderRecord,
  type SaveProviderInput,
  updateProvider
} from '../../settings/providers/providers-query'
import { Button } from '../../../components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '../../../components/ui/card'
import { useTranslation } from '../../../i18n/use-app-translation'
import { queryClient } from '../../../lib/query-client'
import { ClawEditorDialog } from './claw-editor-dialog'

export type AssistantManagementDialogMode = 'create' | 'edit'
type AssistantCreatePath = 'external-acp' | 'tia'

type AssistantManagementDialogProps = {
  mode: AssistantManagementDialogMode
  isOpen: boolean
  assistant: AssistantRecord | null
  providers: ProviderRecord[]
  mcpServers: Record<string, McpServerRecord>
  channels?: AssistantEditorChannelsProps
  channelSetupAction?: AssistantEditorChannelSetupAction | null
  isSaving: boolean
  errorMessage: string | null
  onClose: () => void
  onSelectWorkspacePath: () => Promise<string | null>
  onSubmit: (
    input: SaveAssistantInput,
    heartbeatInput?: SaveAssistantHeartbeatInput | null,
    selectedChannelId?: string
  ) => Promise<void>
}

export function AssistantManagementDialog({
  mode,
  isOpen,
  assistant,
  providers,
  mcpServers,
  channels,
  channelSetupAction,
  isSaving,
  errorMessage,
  onClose,
  onSelectWorkspacePath,
  onSubmit
}: AssistantManagementDialogProps): React.JSX.Element | null {
  const { t } = useTranslation()
  const [createPath, setCreatePath] = useState<AssistantCreatePath>('external-acp')

  useEffect(() => {
    if (!isOpen || mode !== 'create') {
      setCreatePath('external-acp')
      return
    }

    setCreatePath('external-acp')
  }, [isOpen, mode])

  async function handleCreateProvider(input: SaveProviderInput): Promise<ProviderRecord> {
    const createdProvider = await createProvider(input)
    await queryClient.invalidateQueries({ queryKey: providerKeys.lists() })
    return createdProvider
  }

  async function handleUpdateProvider(
    providerId: string,
    input: Partial<SaveProviderInput>
  ): Promise<ProviderRecord> {
    const updatedProvider = await updateProvider(providerId, input)
    await queryClient.invalidateQueries({ queryKey: providerKeys.lists() })
    return updatedProvider
  }

  if (!isOpen) {
    return null
  }

  if (mode === 'edit' && !assistant) {
    return null
  }

  if (mode === 'create' && channels && createPath === 'external-acp') {
    return (
      <ClawEditorDialog
        isOpen={isOpen}
        claw={null}
        providers={providers}
        configuredChannels={channels.channels}
        isSubmitting={isSaving}
        externalErrorMessage={errorMessage}
        copy={{
          createTitle: t('threads.assistantDialog.useExistingAcpTitle'),
          description: t('threads.assistantDialog.useExistingAcpDescription'),
          createButton: t('threads.assistantDialog.useExistingAcpSubmit'),
          rootBackButton: t('threads.assistantDialog.advancedCreateTiaAction')
        }}
        onBack={() => setCreatePath('tia')}
        onClose={onClose}
        onSubmit={async (input) => {
          const assistantName = input.assistant.name?.trim() ?? ''
          const providerId = input.assistant.providerId?.trim() ?? ''
          const workspacePath = input.assistant.workspacePath?.trim() ?? ''

          if (!assistantName || !providerId) {
            return
          }

          await onSubmit(
            {
              name: assistantName,
              providerId,
              origin: 'external-acp',
              studioFeaturesEnabled: false,
              enabled: input.assistant.enabled,
              ...(workspacePath.length > 0
                ? {
                    workspaceConfig: {
                      rootPath: workspacePath
                    }
                  }
                : {})
            },
            null,
            input.channel?.mode === 'attach' ? input.channel.channelId : ''
          )
        }}
        onCreateChannel={channels.onCreateChannel}
        onUpdateChannel={channels.onUpdateChannel}
        onDeleteChannel={channels.onDeleteChannel}
        onCreateProvider={handleCreateProvider}
        onUpdateProvider={handleUpdateProvider}
      />
    )
  }

  const isCreateMode = mode === 'create'
  const titleId = isCreateMode ? 'claws-assistant-create-title' : 'claws-assistant-edit-title'
  const description = channels
    ? isCreateMode
      ? createPath === 'tia'
        ? t('threads.assistantDialog.createTiaDescription')
        : t('threads.assistantDialog.useExistingAcpDescription')
      : t('claws.description')
    : isCreateMode
      ? t('threads.assistantDialog.createDescription')
      : t('threads.assistantDialog.editDescription')
  const defaultConfig: AssistantEditorDefaultConfig | undefined =
    isCreateMode && createPath === 'tia'
      ? {
          origin: 'tia',
          studioFeaturesEnabled: true
        }
      : isCreateMode
        ? {
            origin: 'external-acp',
            studioFeaturesEnabled: false
          }
        : undefined

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
                  ? createPath === 'tia'
                    ? t('threads.assistantDialog.createTiaTitle')
                    : t('threads.assistantDialog.createTitle')
                  : t('threads.assistantDialog.editTitle', {
                      name: assistant?.name ?? t('threads.chat.defaultAssistantName')
                    })}
              </CardTitle>
              <p className="text-sm text-muted-foreground">{description}</p>
            </div>
            <div className="flex items-center gap-2">
              {isCreateMode && createPath === 'tia' && channels ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setCreatePath('external-acp')}
                  disabled={isSaving}
                >
                  {t('threads.assistantDialog.useExistingAcpTitle')}
                </Button>
              ) : null}
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
              defaultConfig={defaultConfig}
              isSubmitting={isSaving}
              channels={channels}
              showActivityTab={!isCreateMode}
              submitButtonId={isCreateMode ? 'claw-create-submit' : 'claw-edit-submit'}
              channelSetupAction={channelSetupAction}
              onSelectWorkspacePath={onSelectWorkspacePath}
              onSubmit={(input, heartbeatInput) => onSubmit(input, heartbeatInput)}
            />
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
