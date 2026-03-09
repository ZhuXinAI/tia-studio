import { useEffect, useMemo, useState } from 'react'
import { Button } from '../../../components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '../../../components/ui/dialog'
import { Input } from '../../../components/ui/input'
import { useTranslation } from '../../../i18n/use-app-translation'
import type {
  ConfiguredClawChannelRecord,
  CreateClawChannelInput
} from '../claws-query'

type ClawChannelSelectorDialogProps = {
  isOpen: boolean
  currentAssistantId: string | null
  selectedChannelId: string
  channels: ConfiguredClawChannelRecord[]
  isMutating: boolean
  errorMessage: string | null
  onClose: () => void
  onApply: (channelId: string) => void
  onCreateChannel:
    (input: CreateClawChannelInput) => Promise<ConfiguredClawChannelRecord> | ConfiguredClawChannelRecord
  onDeleteChannel: (channelId: string) => Promise<void> | void
}

type ChannelType = 'lark' | 'telegram'

function isDisabledForAssistant(
  channel: ConfiguredClawChannelRecord,
  currentAssistantId: string | null
): boolean {
  return channel.assistantId !== null && channel.assistantId !== currentAssistantId
}

function canRemoveChannel(channel: ConfiguredClawChannelRecord | null): boolean {
  return channel?.assistantId === null
}

export function ClawChannelSelectorDialog({
  isOpen,
  currentAssistantId,
  selectedChannelId,
  channels,
  isMutating,
  errorMessage,
  onClose,
  onApply,
  onCreateChannel,
  onDeleteChannel
}: ClawChannelSelectorDialogProps): React.JSX.Element {
  const { t } = useTranslation()
  const [localChannels, setLocalChannels] = useState(channels)
  const [localSelectedChannelId, setLocalSelectedChannelId] = useState(selectedChannelId)
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false)
  const [isRemoveDialogOpen, setIsRemoveDialogOpen] = useState(false)
  const [createType, setCreateType] = useState<ChannelType>('lark')
  const [createName, setCreateName] = useState('')
  const [createAppId, setCreateAppId] = useState('')
  const [createAppSecret, setCreateAppSecret] = useState('')
  const [createBotToken, setCreateBotToken] = useState('')
  const [createError, setCreateError] = useState<string | null>(null)
  const [isCreateSubmitting, setIsCreateSubmitting] = useState(false)
  const [removeError, setRemoveError] = useState<string | null>(null)
  const [isDeleteSubmitting, setIsDeleteSubmitting] = useState(false)

  useEffect(() => {
    if (!isOpen) {
      return
    }

    setLocalChannels(channels)
    setCreateError(null)
    setRemoveError(null)
    setIsCreateDialogOpen(false)
    setIsRemoveDialogOpen(false)
  }, [channels, isOpen])

  useEffect(() => {
    if (!isOpen) {
      return
    }

    setLocalSelectedChannelId(selectedChannelId)
  }, [isOpen, selectedChannelId])

  const selectedChannel = useMemo(
    () => localChannels.find((channel) => channel.id === localSelectedChannelId) ?? null,
    [localChannels, localSelectedChannelId]
  )

  function resetCreateForm(): void {
    setCreateType('lark')
    setCreateName('')
    setCreateAppId('')
    setCreateAppSecret('')
    setCreateBotToken('')
    setCreateError(null)
  }

  async function handleCreateChannel(): Promise<void> {
    if (createName.trim().length === 0) {
      setCreateError(t('claws.channelSelector.errors.nameRequired'))
      return
    }

    if (createType === 'telegram') {
      if (createBotToken.trim().length === 0) {
        setCreateError(t('claws.channelSelector.errors.telegramCredentialsRequired'))
        return
      }
    } else if (createAppId.trim().length === 0 || createAppSecret.trim().length === 0) {
      setCreateError(t('claws.channelSelector.errors.larkCredentialsRequired'))
      return
    }

    setIsCreateSubmitting(true)
    setCreateError(null)

    try {
      const createdChannel = await onCreateChannel(
        createType === 'telegram'
          ? {
              type: 'telegram',
              name: createName.trim(),
              botToken: createBotToken.trim()
            }
          : {
              type: 'lark',
              name: createName.trim(),
              appId: createAppId.trim(),
              appSecret: createAppSecret.trim()
            }
      )

      setLocalChannels((currentChannels) => [...currentChannels, createdChannel])
      setLocalSelectedChannelId(createdChannel.id)
      setIsCreateDialogOpen(false)
      resetCreateForm()
    } catch (error) {
      setCreateError(
        error instanceof Error ? error.message : t('claws.channelSelector.errors.createFailed')
      )
    } finally {
      setIsCreateSubmitting(false)
    }
  }

  async function handleDeleteChannel(): Promise<void> {
    if (!selectedChannel) {
      return
    }

    setIsDeleteSubmitting(true)
    setRemoveError(null)

    try {
      await onDeleteChannel(selectedChannel.id)
      setLocalChannels((currentChannels) =>
        currentChannels.filter((channel) => channel.id !== selectedChannel.id)
      )
      setLocalSelectedChannelId('')
      setIsRemoveDialogOpen(false)
    } catch (error) {
      setRemoveError(
        error instanceof Error ? error.message : t('claws.channelSelector.errors.deleteFailed')
      )
    } finally {
      setIsDeleteSubmitting(false)
    }
  }

  function usageLabel(channel: ConfiguredClawChannelRecord): string {
    if (channel.assistantId === null) {
      return t('claws.channelSelector.available')
    }

    if (channel.assistantId === currentAssistantId) {
      return t('claws.channelSelector.inUseByCurrent')
    }

    return t('claws.channelSelector.inUseByOther', {
      assistantName: channel.assistantName ?? t('claws.channelSelector.otherAssistantFallback')
    })
  }

  const isBusy = isMutating || isCreateSubmitting || isDeleteSubmitting

  return (
    <>
      <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{t('claws.channelSelector.title')}</DialogTitle>
            <DialogDescription>{t('claws.channelSelector.description')}</DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            {errorMessage ? (
              <p className="text-sm text-destructive">{errorMessage}</p>
            ) : null}

            {localChannels.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t('claws.channelSelector.empty')}</p>
            ) : (
              <div className="space-y-2">
                {localChannels.map((channel) => {
                  const disabled = isDisabledForAssistant(channel, currentAssistantId)
                  const selected = channel.id === localSelectedChannelId

                  return (
                    <button
                      key={channel.id}
                      type="button"
                      data-channel-id={channel.id}
                      data-selected={selected ? 'true' : 'false'}
                      disabled={disabled || isBusy}
                      className="w-full rounded-lg border border-border px-4 py-3 text-left disabled:cursor-not-allowed disabled:opacity-60"
                      onClick={() => setLocalSelectedChannelId(channel.id)}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div className="space-y-1">
                          <p className="font-medium">{channel.name}</p>
                          <p className="text-sm text-muted-foreground">
                            {channel.type} · {channel.status}
                          </p>
                        </div>
                        <span className="text-xs text-muted-foreground">{usageLabel(channel)}</span>
                      </div>
                    </button>
                  )
                })}
              </div>
            )}

            <div className="flex flex-wrap gap-2">
              <Button
                id="claw-channel-selector-add"
                type="button"
                variant="outline"
                disabled={isBusy}
                onClick={() => setIsCreateDialogOpen(true)}
              >
                {t('claws.channelSelector.actions.add')}
              </Button>
              <Button
                id="claw-channel-selector-remove"
                type="button"
                variant="outline"
                disabled={!canRemoveChannel(selectedChannel) || isBusy}
                onClick={() => {
                  setRemoveError(null)
                  setIsRemoveDialogOpen(true)
                }}
              >
                {t('claws.channelSelector.actions.remove')}
              </Button>
              <Button
                id="claw-channel-selector-clear"
                type="button"
                variant="outline"
                disabled={localSelectedChannelId.length === 0 || isBusy}
                onClick={() => setLocalSelectedChannelId('')}
              >
                {t('claws.channelSelector.actions.clear')}
              </Button>
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              {t('claws.channelSelector.actions.cancel')}
            </Button>
            <Button
              id="claw-channel-selector-apply"
              type="button"
              disabled={isBusy}
              onClick={() => {
                onApply(localSelectedChannelId)
                onClose()
              }}
            >
              {t('claws.channelSelector.actions.apply')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{t('claws.channelSelector.create.title')}</DialogTitle>
            <DialogDescription>{t('claws.channelSelector.create.description')}</DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            {createError ? (
              <p id="claw-channel-create-error" className="text-sm text-destructive">
                {createError}
              </p>
            ) : null}

            <div className="grid gap-2">
              <label htmlFor="claw-channel-create-type" className="text-sm font-medium">
                {t('claws.channelSelector.create.fields.type')}
              </label>
              <select
                id="claw-channel-create-type"
                className="border-input bg-background rounded-md border px-3 py-2 text-sm"
                value={createType}
                onChange={(event) => setCreateType(event.target.value as ChannelType)}
              >
                <option value="lark">{t('claws.dialog.channelTypes.lark')}</option>
                <option value="telegram">{t('claws.dialog.channelTypes.telegram')}</option>
              </select>
            </div>

            <div className="grid gap-2">
              <label htmlFor="claw-channel-create-name" className="text-sm font-medium">
                {t('claws.dialog.fields.channelName')}
              </label>
              <Input
                id="claw-channel-create-name"
                value={createName}
                onChange={(event) => setCreateName(event.target.value)}
              />
            </div>

            {createType === 'telegram' ? (
              <div className="grid gap-2">
                <label htmlFor="claw-channel-create-bot-token" className="text-sm font-medium">
                  {t('claws.dialog.fields.botToken')}
                </label>
                <Input
                  id="claw-channel-create-bot-token"
                  type="password"
                  value={createBotToken}
                  onChange={(event) => setCreateBotToken(event.target.value)}
                />
              </div>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="grid gap-2">
                  <label htmlFor="claw-channel-create-app-id" className="text-sm font-medium">
                    {t('claws.dialog.fields.appId')}
                  </label>
                  <Input
                    id="claw-channel-create-app-id"
                    value={createAppId}
                    onChange={(event) => setCreateAppId(event.target.value)}
                  />
                </div>

                <div className="grid gap-2">
                  <label
                    htmlFor="claw-channel-create-app-secret"
                    className="text-sm font-medium"
                  >
                    {t('claws.dialog.fields.appSecret')}
                  </label>
                  <Input
                    id="claw-channel-create-app-secret"
                    type="password"
                    value={createAppSecret}
                    onChange={(event) => setCreateAppSecret(event.target.value)}
                  />
                </div>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setIsCreateDialogOpen(false)
                resetCreateForm()
              }}
            >
              {t('claws.channelSelector.actions.cancel')}
            </Button>
            <Button
              id="claw-channel-create-save"
              type="button"
              disabled={isBusy}
              onClick={() => void handleCreateChannel()}
            >
              {t('claws.channelSelector.create.save')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isRemoveDialogOpen} onOpenChange={setIsRemoveDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{t('claws.channelSelector.remove.title')}</DialogTitle>
            <DialogDescription>
              {selectedChannel
                ? t('claws.channelSelector.remove.description', { channelName: selectedChannel.name })
                : t('claws.channelSelector.remove.descriptionFallback')}
            </DialogDescription>
          </DialogHeader>

          {removeError ? <p className="text-sm text-destructive">{removeError}</p> : null}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setIsRemoveDialogOpen(false)}
            >
              {t('claws.channelSelector.actions.cancel')}
            </Button>
            <Button
              id="claw-channel-remove-confirm"
              type="button"
              disabled={!canRemoveChannel(selectedChannel) || isBusy}
              onClick={() => void handleDeleteChannel()}
            >
              {t('claws.channelSelector.remove.confirm')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
