import { useEffect, useMemo, useState } from 'react'
import { CheckCircle2, Pencil } from 'lucide-react'
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
import { Switch } from '../../../components/ui/switch'
import { useTranslation } from '../../../i18n/use-app-translation'
import { cn } from '../../../lib/utils'
import { channelStatusLabel, channelTypeLabel } from '../claw-labels'
import type {
  ConfiguredClawChannelRecord,
  CreateClawChannelInput,
  UpdateClawChannelInput
} from '../claws-query'

type ClawChannelSelectorDialogProps = {
  isOpen: boolean
  currentAssistantId: string | null
  selectedChannelId: string
  channels: ConfiguredClawChannelRecord[]
  isMutating: boolean
  errorMessage: string | null
  layout?: 'dialog' | 'inline'
  onInlineFlowChange?: (isActive: boolean) => void
  onClose: () => void
  onApply: (channelId: string) => void
  onCreateChannel: (
    input: CreateClawChannelInput
  ) => Promise<ConfiguredClawChannelRecord> | ConfiguredClawChannelRecord
  onUpdateChannel: (
    channelId: string,
    input: UpdateClawChannelInput
  ) => Promise<ConfiguredClawChannelRecord> | ConfiguredClawChannelRecord
  onRecoverChannel: (
    channelId: string
  ) => Promise<ConfiguredClawChannelRecord> | ConfiguredClawChannelRecord
  onDeleteChannel: (channelId: string) => Promise<void> | void
}

type ChannelType = 'discord' | 'lark' | 'telegram' | 'whatsapp' | 'wechat' | 'wecom' | 'wechat-kf'
type ChannelFormMode = 'create' | 'edit'

type ChannelFormState = {
  type: ChannelType
  name: string
  appId: string
  appSecret: string
  botToken: string
  botId: string
  secret: string
  serverUrl: string
  serverKey: string
  groupRequireMention: boolean
}

function supportsGroupMentionSetting(type: ChannelType): boolean {
  return type === 'discord' || type === 'lark' || type === 'whatsapp' || type === 'wecom'
}

function isDisabledForAssistant(
  channel: ConfiguredClawChannelRecord,
  currentAssistantId: string | null
): boolean {
  return channel.assistantId !== null && channel.assistantId !== currentAssistantId
}

function canRemoveChannel(channel: ConfiguredClawChannelRecord | null): boolean {
  return channel?.assistantId === null
}

function emptyFormState(): ChannelFormState {
  return {
    type: 'lark',
    name: '',
    appId: '',
    appSecret: '',
    botToken: '',
    botId: '',
    secret: '',
    serverUrl: '',
    serverKey: '',
    groupRequireMention: true
  }
}

function toEditFormState(channel: ConfiguredClawChannelRecord): ChannelFormState {
  const type =
    channel.type === 'discord'
      ? 'discord'
      : channel.type === 'telegram'
        ? 'telegram'
        : channel.type === 'whatsapp'
          ? 'whatsapp'
          : channel.type === 'wechat'
            ? 'wechat'
          : channel.type === 'wecom'
            ? 'wecom'
            : channel.type === 'wechat-kf'
              ? 'wechat-kf'
              : 'lark'

  return {
    type,
    name: channel.name,
    appId: '',
    appSecret: '',
    botToken: '',
    botId: '',
    secret: '',
    serverUrl: '',
    serverKey: '',
    groupRequireMention: channel.groupRequireMention !== false
  }
}

function buildCreateInput(formState: ChannelFormState): CreateClawChannelInput {
  if (formState.type === 'discord') {
    return {
      type: 'discord',
      name: formState.name.trim(),
      botToken: formState.botToken.trim(),
      groupRequireMention: formState.groupRequireMention
    }
  }

  if (formState.type === 'telegram') {
    return {
      type: 'telegram',
      name: formState.name.trim(),
      botToken: formState.botToken.trim()
    }
  }

  if (formState.type === 'whatsapp') {
    return {
      type: 'whatsapp',
      name: formState.name.trim(),
      groupRequireMention: formState.groupRequireMention
    }
  }

  if (formState.type === 'wechat') {
    return {
      type: 'wechat',
      name: formState.name.trim()
    }
  }

  if (formState.type === 'wecom') {
    return {
      type: 'wecom',
      name: formState.name.trim(),
      botId: formState.botId.trim(),
      secret: formState.secret.trim(),
      groupRequireMention: formState.groupRequireMention
    }
  }

  if (formState.type === 'wechat-kf') {
    return {
      type: 'wechat-kf',
      name: formState.name.trim(),
      serverUrl: formState.serverUrl.trim(),
      serverKey: formState.serverKey.trim()
    }
  }

  return {
    type: 'lark',
    name: formState.name.trim(),
    appId: formState.appId.trim(),
    appSecret: formState.appSecret.trim(),
    groupRequireMention: formState.groupRequireMention
  }
}

function buildUpdateInput(formState: ChannelFormState): UpdateClawChannelInput {
  if (formState.type === 'discord') {
    return {
      type: 'discord',
      name: formState.name.trim(),
      ...(formState.botToken.trim().length > 0 ? { botToken: formState.botToken.trim() } : {}),
      groupRequireMention: formState.groupRequireMention
    }
  }

  if (formState.type === 'telegram') {
    return {
      type: 'telegram',
      name: formState.name.trim(),
      ...(formState.botToken.trim().length > 0 ? { botToken: formState.botToken.trim() } : {})
    }
  }

  if (formState.type === 'whatsapp') {
    return {
      type: 'whatsapp',
      name: formState.name.trim(),
      groupRequireMention: formState.groupRequireMention
    }
  }

  if (formState.type === 'wechat') {
    return {
      type: 'wechat',
      name: formState.name.trim()
    }
  }

  if (formState.type === 'wecom') {
    return {
      type: 'wecom',
      name: formState.name.trim(),
      ...(formState.botId.trim().length > 0 ? { botId: formState.botId.trim() } : {}),
      ...(formState.secret.trim().length > 0 ? { secret: formState.secret.trim() } : {}),
      groupRequireMention: formState.groupRequireMention
    }
  }

  if (formState.type === 'wechat-kf') {
    return {
      type: 'wechat-kf',
      name: formState.name.trim(),
      ...(formState.serverUrl.trim().length > 0 ? { serverUrl: formState.serverUrl.trim() } : {}),
      ...(formState.serverKey.trim().length > 0 ? { serverKey: formState.serverKey.trim() } : {})
    }
  }

  return {
    type: 'lark',
    name: formState.name.trim(),
    ...(formState.appId.trim().length > 0 ? { appId: formState.appId.trim() } : {}),
    ...(formState.appSecret.trim().length > 0 ? { appSecret: formState.appSecret.trim() } : {}),
    groupRequireMention: formState.groupRequireMention
  }
}

export function ClawChannelSelectorDialog({
  isOpen,
  currentAssistantId,
  selectedChannelId,
  channels,
  isMutating,
  errorMessage,
  layout = 'dialog',
  onInlineFlowChange,
  onClose,
  onApply,
  onCreateChannel,
  onUpdateChannel,
  onRecoverChannel,
  onDeleteChannel
}: ClawChannelSelectorDialogProps): React.JSX.Element {
  const { t } = useTranslation()
  const isInline = layout === 'inline'
  const [localChannels, setLocalChannels] = useState(channels)
  const [localSelectedChannelId, setLocalSelectedChannelId] = useState(selectedChannelId)
  const [isFormDialogOpen, setIsFormDialogOpen] = useState(false)
  const [formMode, setFormMode] = useState<ChannelFormMode>('create')
  const [formState, setFormState] = useState<ChannelFormState>(emptyFormState)
  const [formError, setFormError] = useState<string | null>(null)
  const [isFormSubmitting, setIsFormSubmitting] = useState(false)
  const [isRemoveDialogOpen, setIsRemoveDialogOpen] = useState(false)
  const [removeError, setRemoveError] = useState<string | null>(null)
  const [isDeleteSubmitting, setIsDeleteSubmitting] = useState(false)

  useEffect(() => {
    if (!isOpen) {
      return
    }

    setLocalChannels(channels)
    setFormError(null)
    setRemoveError(null)
    setIsFormDialogOpen(false)
    setIsRemoveDialogOpen(false)
    setFormState(emptyFormState())
    setFormMode('create')
  }, [channels, isOpen])

  useEffect(() => {
    if (!isOpen) {
      return
    }

    setLocalSelectedChannelId(selectedChannelId)
  }, [isOpen, selectedChannelId])

  useEffect(() => {
    if (!isInline) {
      return
    }

    onInlineFlowChange?.(isFormDialogOpen || isRemoveDialogOpen)
  }, [isFormDialogOpen, isInline, isRemoveDialogOpen, onInlineFlowChange])

  const selectedChannel = useMemo(
    () => localChannels.find((channel) => channel.id === localSelectedChannelId) ?? null,
    [localChannels, localSelectedChannelId]
  )

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

  function resetForm(): void {
    setFormMode('create')
    setFormState(emptyFormState())
    setFormError(null)
  }

  function updateSelectedChannel(channelId: string): void {
    setLocalSelectedChannelId(channelId)

    if (isInline) {
      onApply(channelId)
    }
  }

  function openCreateDialog(): void {
    setFormMode('create')
    setFormState(emptyFormState())
    setFormError(null)
    setIsFormDialogOpen(true)
  }

  function openEditDialog(): void {
    if (!selectedChannel) {
      return
    }

    setFormMode('edit')
    setFormState(toEditFormState(selectedChannel))
    setFormError(null)
    setIsFormDialogOpen(true)
  }

  function replaceLocalChannel(updatedChannel: ConfiguredClawChannelRecord): void {
    setLocalChannels((currentChannels) =>
      currentChannels.map((channel) =>
        channel.id === updatedChannel.id ? updatedChannel : channel
      )
    )
  }

  async function handleSubmitForm(): Promise<void> {
    if (formState.name.trim().length === 0) {
      setFormError(t('claws.channelSelector.errors.nameRequired'))
      return
    }

    if (formMode === 'create') {
      if (formState.type === 'discord') {
        if (formState.botToken.trim().length === 0) {
          setFormError(t('claws.channelSelector.errors.discordCredentialsRequired'))
          return
        }
      } else if (formState.type === 'telegram') {
        if (formState.botToken.trim().length === 0) {
          setFormError(t('claws.channelSelector.errors.telegramCredentialsRequired'))
          return
        }
      } else if (
        formState.type === 'wecom' &&
        (formState.botId.trim().length === 0 || formState.secret.trim().length === 0)
      ) {
        setFormError(t('claws.channelSelector.errors.wecomCredentialsRequired'))
        return
      } else if (
        formState.type === 'wechat-kf' &&
        (formState.serverUrl.trim().length === 0 || formState.serverKey.trim().length === 0)
      ) {
        setFormError(t('claws.channelSelector.errors.wechatKfCredentialsRequired'))
        return
      } else if (
        formState.type === 'lark' &&
        (formState.appId.trim().length === 0 || formState.appSecret.trim().length === 0)
      ) {
        setFormError(t('claws.channelSelector.errors.larkCredentialsRequired'))
        return
      }
    }

    setIsFormSubmitting(true)
    setFormError(null)

    try {
      if (formMode === 'create') {
        const createdChannel = await onCreateChannel(buildCreateInput(formState))
        setLocalChannels((currentChannels) => [...currentChannels, createdChannel])
        updateSelectedChannel(createdChannel.id)
      } else if (selectedChannel) {
        const updatedChannel = await onUpdateChannel(
          selectedChannel.id,
          buildUpdateInput(formState)
        )
        replaceLocalChannel(updatedChannel)
        updateSelectedChannel(updatedChannel.id)
      }

      setIsFormDialogOpen(false)
      resetForm()
    } catch (error) {
      setFormError(
        error instanceof Error
          ? error.message
          : t(
              formMode === 'create'
                ? 'claws.channelSelector.errors.createFailed'
                : 'claws.channelSelector.errors.updateFailed'
            )
      )
    } finally {
      setIsFormSubmitting(false)
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
      updateSelectedChannel('')
      setIsRemoveDialogOpen(false)
    } catch (error) {
      setRemoveError(
        error instanceof Error ? error.message : t('claws.channelSelector.errors.deleteFailed')
      )
    } finally {
      setIsDeleteSubmitting(false)
    }
  }

  async function handleRecoverChannel(): Promise<void> {
    if (!selectedChannel) {
      return
    }

    setIsFormSubmitting(true)
    setFormError(null)

    try {
      const recoveredChannel = await onRecoverChannel(selectedChannel.id)
      replaceLocalChannel(recoveredChannel)
      updateSelectedChannel(recoveredChannel.id)
    } catch (error) {
      setFormError(
        error instanceof Error ? error.message : t('claws.channelSelector.errors.recoverFailed')
      )
    } finally {
      setIsFormSubmitting(false)
    }
  }

  const isBusy = isMutating || isFormSubmitting || isDeleteSubmitting
  const channelNameInputId =
    formMode === 'create' ? 'claw-channel-create-name' : 'claw-channel-form-name'
  const channelTypeInputId =
    formMode === 'create' ? 'claw-channel-create-type' : 'claw-channel-form-type'
  const botTokenInputId =
    formMode === 'create' ? 'claw-channel-create-bot-token' : 'claw-channel-form-bot-token'
  const appIdInputId =
    formMode === 'create' ? 'claw-channel-create-app-id' : 'claw-channel-form-app-id'
  const appSecretInputId =
    formMode === 'create' ? 'claw-channel-create-app-secret' : 'claw-channel-form-app-secret'
  const saveButtonId = formMode === 'create' ? 'claw-channel-create-save' : 'claw-channel-form-save'
  const formTitle =
    formMode === 'create'
      ? t('claws.channelSelector.create.title')
      : t('claws.channelSelector.edit.title')
  const formDescription =
    formMode === 'create'
      ? t('claws.channelSelector.create.description')
      : t('claws.channelSelector.edit.description')
  const selectorBody = (
    <div className="space-y-3">
      {errorMessage ? <p className="text-sm text-destructive">{errorMessage}</p> : null}
      {!errorMessage && !isFormDialogOpen && formError ? (
        <p className="text-sm text-destructive">{formError}</p>
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
                className={cn(
                  'w-full rounded-lg border px-4 py-3 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-60',
                  selected
                    ? 'border-primary bg-primary/5 ring-1 ring-primary/30'
                    : 'border-border hover:border-primary/40 hover:bg-muted/50'
                )}
                onClick={() => updateSelectedChannel(channel.id)}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <p className="font-medium">{channel.name}</p>
                      {selected ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                          <CheckCircle2 className="size-3" />
                          {t('claws.channelSelector.selectedBadge')}
                        </span>
                      ) : null}
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {channelTypeLabel(channel.type, t)} · {channelStatusLabel(channel.status, t)}
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
          onClick={openCreateDialog}
        >
          {t('claws.channelSelector.actions.add')}
        </Button>
        <Button
          id="claw-channel-selector-edit"
          type="button"
          variant="outline"
          disabled={selectedChannel === null || isBusy}
          onClick={openEditDialog}
        >
          <Pencil className="size-4" />
          {t('claws.channelSelector.actions.edit')}
        </Button>
        <Button
          id="claw-channel-selector-recover"
          type="button"
          variant="outline"
          disabled={selectedChannel?.status !== 'error' || isBusy}
          onClick={() => void handleRecoverChannel()}
        >
          {t('claws.channelSelector.actions.retrySetup')}
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
          onClick={() => updateSelectedChannel('')}
        >
          {t('claws.channelSelector.actions.clear')}
        </Button>
      </div>
    </div>
  )
  const selectorFooter = isInline ? null : (
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
  )
  const formBody = (
    <div className="space-y-3">
      {formError ? (
        <p
          id={formMode === 'create' ? 'claw-channel-create-error' : 'claw-channel-form-error'}
          className="text-sm text-destructive"
        >
          {formError}
        </p>
      ) : null}

      <div className="grid gap-2">
        <label htmlFor={channelTypeInputId} className="text-sm font-medium">
          {t('claws.channelSelector.create.fields.type')}
        </label>
        <select
          id={channelTypeInputId}
          className="border-input bg-background rounded-md border px-3 py-2 text-sm disabled:opacity-100"
          value={formState.type}
          disabled={formMode === 'edit'}
          onChange={(event) =>
            setFormState((currentState) => ({
              ...currentState,
              type: event.target.value as ChannelType,
              appId: '',
              appSecret: '',
              botToken: '',
              botId: '',
              secret: '',
              serverUrl: '',
              serverKey: ''
            }))
          }
        >
          <option value="discord">{t('claws.dialog.channelTypes.discord')}</option>
          <option value="lark">{t('claws.dialog.channelTypes.lark')}</option>
          <option value="telegram">{t('claws.dialog.channelTypes.telegram')}</option>
          <option value="whatsapp">{t('claws.dialog.channelTypes.whatsapp')}</option>
          <option value="wechat">{t('claws.dialog.channelTypes.wechat')}</option>
          <option value="wecom">{t('claws.dialog.channelTypes.wecom')}</option>
          <option value="wechat-kf">{t('claws.dialog.channelTypes.wechatKf')}</option>
        </select>
      </div>

      <div className="grid gap-2">
        <label htmlFor={channelNameInputId} className="text-sm font-medium">
          {t('claws.dialog.fields.channelName')}
        </label>
        <Input
          id={channelNameInputId}
          value={formState.name}
          onChange={(event) =>
            setFormState((currentState) => ({
              ...currentState,
              name: event.target.value
            }))
          }
        />
      </div>

      {formState.type === 'discord' || formState.type === 'telegram' ? (
        <div className="grid gap-2">
          <label htmlFor={botTokenInputId} className="text-sm font-medium">
            {t('claws.dialog.fields.botToken')}
          </label>
          <Input
            id={botTokenInputId}
            type="password"
            placeholder={
              formMode === 'edit' ? t('claws.channelSelector.edit.botTokenPlaceholder') : undefined
            }
            value={formState.botToken}
            onChange={(event) =>
              setFormState((currentState) => ({
                ...currentState,
                botToken: event.target.value
              }))
            }
          />
        </div>
      ) : formState.type === 'whatsapp' ? (
        <p className="text-sm text-muted-foreground">
          {t('claws.channelSelector.create.whatsappHint')}
        </p>
      ) : formState.type === 'wechat' ? (
        <p className="text-sm text-muted-foreground">{t('claws.channelSelector.create.wechatHint')}</p>
      ) : formState.type === 'wechat-kf' ? (
        <div className="space-y-3">
          <div className="rounded-lg border border-border/70 bg-muted/30 p-3 text-sm text-muted-foreground">
            <p>
              {t('claws.channelSelector.create.wechatKfHintPrefix')}{' '}
              <a
                className="font-medium text-foreground underline underline-offset-2"
                href="https://github.com/windht/wechat-kf-relay"
                target="_blank"
                rel="noreferrer"
              >
                wechat-kf-relay
              </a>
              . {t('claws.channelSelector.create.wechatKfHintSuffix')}
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="grid gap-2">
              <label
                htmlFor={
                  formMode === 'create'
                    ? 'claw-channel-create-server-url'
                    : 'claw-channel-form-server-url'
                }
                className="text-sm font-medium"
              >
                {t('claws.dialog.fields.serverUrl')}
              </label>
              <Input
                id={
                  formMode === 'create'
                    ? 'claw-channel-create-server-url'
                    : 'claw-channel-form-server-url'
                }
                placeholder={
                  formMode === 'edit' ? t('claws.channelSelector.edit.appIdPlaceholder') : undefined
                }
                value={formState.serverUrl}
                onChange={(event) =>
                  setFormState((currentState) => ({
                    ...currentState,
                    serverUrl: event.target.value
                  }))
                }
              />
            </div>

            <div className="grid gap-2">
              <label
                htmlFor={
                  formMode === 'create'
                    ? 'claw-channel-create-server-key'
                    : 'claw-channel-form-server-key'
                }
                className="text-sm font-medium"
              >
                {t('claws.dialog.fields.serverKey')}
              </label>
              <Input
                id={
                  formMode === 'create'
                    ? 'claw-channel-create-server-key'
                    : 'claw-channel-form-server-key'
                }
                type="password"
                placeholder={
                  formMode === 'edit'
                    ? t('claws.channelSelector.edit.appSecretPlaceholder')
                    : undefined
                }
                value={formState.serverKey}
                onChange={(event) =>
                  setFormState((currentState) => ({
                    ...currentState,
                    serverKey: event.target.value
                  }))
                }
              />
            </div>
          </div>
        </div>
      ) : formState.type === 'wecom' ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="grid gap-2">
            <label htmlFor={appIdInputId} className="text-sm font-medium">
              {t('claws.dialog.fields.botId')}
            </label>
            <Input
              id={appIdInputId}
              placeholder={
                formMode === 'edit' ? t('claws.channelSelector.edit.appIdPlaceholder') : undefined
              }
              value={formState.botId}
              onChange={(event) =>
                setFormState((currentState) => ({
                  ...currentState,
                  botId: event.target.value
                }))
              }
            />
          </div>

          <div className="grid gap-2">
            <label htmlFor={appSecretInputId} className="text-sm font-medium">
              {t('claws.dialog.fields.secret')}
            </label>
            <Input
              id={appSecretInputId}
              type="password"
              placeholder={
                formMode === 'edit'
                  ? t('claws.channelSelector.edit.appSecretPlaceholder')
                  : undefined
              }
              value={formState.secret}
              onChange={(event) =>
                setFormState((currentState) => ({
                  ...currentState,
                  secret: event.target.value
                }))
              }
            />
          </div>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="grid gap-2">
            <label htmlFor={appIdInputId} className="text-sm font-medium">
              {t('claws.dialog.fields.appId')}
            </label>
            <Input
              id={appIdInputId}
              placeholder={
                formMode === 'edit' ? t('claws.channelSelector.edit.appIdPlaceholder') : undefined
              }
              value={formState.appId}
              onChange={(event) =>
                setFormState((currentState) => ({
                  ...currentState,
                  appId: event.target.value
                }))
              }
            />
          </div>

          <div className="grid gap-2">
            <label htmlFor={appSecretInputId} className="text-sm font-medium">
              {t('claws.dialog.fields.appSecret')}
            </label>
            <Input
              id={appSecretInputId}
              type="password"
              placeholder={
                formMode === 'edit'
                  ? t('claws.channelSelector.edit.appSecretPlaceholder')
                  : undefined
              }
              value={formState.appSecret}
              onChange={(event) =>
                setFormState((currentState) => ({
                  ...currentState,
                  appSecret: event.target.value
                }))
              }
            />
          </div>
        </div>
      )}

      {formMode === 'edit' && formState.type !== 'whatsapp' && formState.type !== 'wechat' ? (
        <p className="text-xs text-muted-foreground">
          {t('claws.channelSelector.edit.credentialsOptional')}
        </p>
      ) : null}

      {supportsGroupMentionSetting(formState.type) ? (
        <div className="flex items-start justify-between gap-4 rounded-lg border p-4">
          <div className="grid gap-1">
            <label htmlFor="claw-channel-group-require-mention" className="text-sm font-medium">
              {t('claws.channelSelector.groupRequireMention.label')}
            </label>
            <p className="text-xs text-muted-foreground">
              {t('claws.channelSelector.groupRequireMention.description')}
            </p>
          </div>
          <Switch
            id="claw-channel-group-require-mention"
            checked={formState.groupRequireMention}
            onCheckedChange={(checked) =>
              setFormState((currentState) => ({
                ...currentState,
                groupRequireMention: checked
              }))
            }
          />
        </div>
      ) : null}
    </div>
  )
  const formFooter = (
    <DialogFooter>
      <Button
        type="button"
        variant="outline"
        onClick={() => {
          setIsFormDialogOpen(false)
          resetForm()
        }}
      >
        {t('claws.channelSelector.actions.cancel')}
      </Button>
      <Button
        id={saveButtonId}
        type="button"
        disabled={isBusy}
        onClick={() => void handleSubmitForm()}
      >
        {formMode === 'create'
          ? t('claws.channelSelector.create.save')
          : t('claws.channelSelector.edit.save')}
      </Button>
    </DialogFooter>
  )
  const removeFooter = (
    <DialogFooter>
      <Button type="button" variant="outline" onClick={() => setIsRemoveDialogOpen(false)}>
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
  )

  if (isInline) {
    if (isFormDialogOpen) {
      return (
        <div className="space-y-4">
          <div className="space-y-1">
            <h3 className="text-base font-semibold">{formTitle}</h3>
            <p className="text-sm text-muted-foreground">{formDescription}</p>
          </div>
          {formBody}
          {formFooter}
        </div>
      )
    }

    if (isRemoveDialogOpen) {
      return (
        <div className="space-y-4">
          <div className="space-y-1">
            <h3 className="text-base font-semibold">{t('claws.channelSelector.remove.title')}</h3>
            <p className="text-sm text-muted-foreground">
              {selectedChannel
                ? t('claws.channelSelector.remove.description', {
                    channelName: selectedChannel.name
                  })
                : t('claws.channelSelector.remove.descriptionFallback')}
            </p>
          </div>
          {removeError ? <p className="text-sm text-destructive">{removeError}</p> : null}
          {removeFooter}
        </div>
      )
    }

    return (
      <div className="space-y-4">
        <div className="space-y-1">
          <h3 className="text-base font-semibold">{t('claws.channelSelector.title')}</h3>
          <p className="text-sm text-muted-foreground">{t('claws.channelSelector.description')}</p>
        </div>
        {selectorBody}
      </div>
    )
  }

  return (
    <>
      <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{t('claws.channelSelector.title')}</DialogTitle>
            <DialogDescription>{t('claws.channelSelector.description')}</DialogDescription>
          </DialogHeader>

          {selectorBody}
          {selectorFooter}
        </DialogContent>
      </Dialog>

      <Dialog
        open={isFormDialogOpen}
        onOpenChange={(open) => {
          setIsFormDialogOpen(open)
          if (!open) {
            resetForm()
          }
        }}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{formTitle}</DialogTitle>
            <DialogDescription>{formDescription}</DialogDescription>
          </DialogHeader>

          {formBody}
          {formFooter}
        </DialogContent>
      </Dialog>

      <Dialog open={isRemoveDialogOpen} onOpenChange={setIsRemoveDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{t('claws.channelSelector.remove.title')}</DialogTitle>
            <DialogDescription>
              {selectedChannel
                ? t('claws.channelSelector.remove.description', {
                    channelName: selectedChannel.name
                  })
                : t('claws.channelSelector.remove.descriptionFallback')}
            </DialogDescription>
          </DialogHeader>

          {removeError ? <p className="text-sm text-destructive">{removeError}</p> : null}

          {removeFooter}
        </DialogContent>
      </Dialog>
    </>
  )
}
