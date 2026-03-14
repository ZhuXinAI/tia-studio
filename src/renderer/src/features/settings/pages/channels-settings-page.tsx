import { useCallback, useEffect, useMemo, useState } from 'react'
import { Pencil, Plus } from 'lucide-react'
import { Button } from '../../../components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from '../../../components/ui/card'
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
import { channelStatusLabel, channelTypeLabel } from '../../claws/claw-labels'
import type {
  ClawsResponse,
  ConfiguredClawChannelRecord,
  CreateClawChannelInput,
  UpdateClawChannelInput
} from '../../claws/claws-query'
import {
  createClawChannel,
  deleteClawChannel,
  listClaws,
  updateClawChannel
} from '../../claws/claws-query'

type ChannelType = 'lark' | 'telegram' | 'whatsapp' | 'wecom' | 'wechat-kf'
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
  return type === 'lark' || type === 'whatsapp' || type === 'wecom'
}

function emptyResponse(): ClawsResponse {
  return {
    claws: [],
    configuredChannels: []
  }
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
    channel.type === 'telegram'
      ? 'telegram'
      : channel.type === 'whatsapp'
        ? 'whatsapp'
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

export function ChannelsSettingsPage(): React.JSX.Element {
  const { t } = useTranslation()
  const [data, setData] = useState<ClawsResponse>(emptyResponse)
  const [isLoading, setIsLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isFormDialogOpen, setIsFormDialogOpen] = useState(false)
  const [formMode, setFormMode] = useState<ChannelFormMode>('create')
  const [editingChannel, setEditingChannel] = useState<ConfiguredClawChannelRecord | null>(null)
  const [formState, setFormState] = useState<ChannelFormState>(emptyFormState)
  const [formError, setFormError] = useState<string | null>(null)
  const [isRemoveDialogOpen, setIsRemoveDialogOpen] = useState(false)
  const [channelToRemove, setChannelToRemove] = useState<ConfiguredClawChannelRecord | null>(null)
  const [removeError, setRemoveError] = useState<string | null>(null)

  const refreshChannels = useCallback(async (): Promise<void> => {
    setIsLoading(true)
    setErrorMessage(null)

    try {
      setData(await listClaws())
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : t('settings.channels.loadFailed'))
    } finally {
      setIsLoading(false)
    }
  }, [t])

  useEffect(() => {
    void refreshChannels()
  }, [refreshChannels])

  const sortedChannels = useMemo(
    () => [...data.configuredChannels].sort((left, right) => left.name.localeCompare(right.name)),
    [data.configuredChannels]
  )

  function resetForm(): void {
    setFormMode('create')
    setEditingChannel(null)
    setFormState(emptyFormState())
    setFormError(null)
  }

  function openCreateDialog(): void {
    setFormMode('create')
    setEditingChannel(null)
    setFormState(emptyFormState())
    setFormError(null)
    setIsFormDialogOpen(true)
  }

  function openEditDialog(channel: ConfiguredClawChannelRecord): void {
    setFormMode('edit')
    setEditingChannel(channel)
    setFormState(toEditFormState(channel))
    setFormError(null)
    setIsFormDialogOpen(true)
  }

  async function handleSubmitForm(): Promise<void> {
    if (formState.name.trim().length === 0) {
      setFormError(t('claws.channelSelector.errors.nameRequired'))
      return
    }

    if (formMode === 'create') {
      if (formState.type === 'telegram') {
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

    setIsSubmitting(true)
    setFormError(null)
    setErrorMessage(null)

    try {
      if (formMode === 'create') {
        const createdChannel = await createClawChannel(buildCreateInput(formState))
        setData((current) => ({
          ...current,
          configuredChannels: [...current.configuredChannels, createdChannel]
        }))
      } else if (editingChannel) {
        const updatedChannel = await updateClawChannel(
          editingChannel.id,
          buildUpdateInput(formState)
        )
        setData((current) => ({
          ...current,
          configuredChannels: current.configuredChannels.map((channel) =>
            channel.id === updatedChannel.id ? updatedChannel : channel
          )
        }))
      }

      setIsFormDialogOpen(false)
      resetForm()
    } catch (error) {
      const fallbackKey =
        formMode === 'create'
          ? 'claws.channelSelector.errors.createFailed'
          : 'claws.channelSelector.errors.updateFailed'
      setFormError(error instanceof Error ? error.message : t(fallbackKey))
    } finally {
      setIsSubmitting(false)
    }
  }

  async function handleRemoveChannel(): Promise<void> {
    if (!channelToRemove) {
      return
    }

    setIsSubmitting(true)
    setRemoveError(null)
    setErrorMessage(null)

    try {
      await deleteClawChannel(channelToRemove.id)
      setData((current) => ({
        ...current,
        configuredChannels: current.configuredChannels.filter(
          (channel) => channel.id !== channelToRemove.id
        )
      }))
      setIsRemoveDialogOpen(false)
      setChannelToRemove(null)
    } catch (error) {
      setRemoveError(
        error instanceof Error ? error.message : t('claws.channelSelector.errors.deleteFailed')
      )
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="flex flex-col gap-6 py-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">{t('settings.channels.title')}</h1>
        <p className="text-sm text-muted-foreground">{t('settings.channels.description')}</p>
      </header>

      <Card className="border-border/70 bg-card/80 backdrop-blur-sm">
        <CardHeader className="flex flex-row items-start justify-between gap-4">
          <div className="space-y-1">
            <CardTitle>{t('settings.channels.configuredTitle')}</CardTitle>
            <CardDescription>{t('settings.channels.configuredDescription')}</CardDescription>
          </div>
          <Button id="settings-channels-add" type="button" onClick={openCreateDialog}>
            <Plus className="size-4" />
            {t('claws.channelSelector.actions.add')}
          </Button>
        </CardHeader>
        <CardContent className="space-y-4">
          {isLoading ? (
            <p className="text-sm text-muted-foreground">{t('settings.channels.loading')}</p>
          ) : null}
          {errorMessage ? <p className="text-sm text-destructive">{errorMessage}</p> : null}

          {!isLoading && sortedChannels.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t('settings.channels.empty')}</p>
          ) : null}

          <div className="grid gap-4 lg:grid-cols-2">
            {sortedChannels.map((channel) => (
              <Card key={channel.id} className="border-border/60">
                <CardHeader>
                  <CardTitle className="text-base">{channel.name}</CardTitle>
                  <CardDescription>
                    {channelTypeLabel(channel.type, t)} · {channelStatusLabel(channel.status, t)}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <p className="text-sm text-muted-foreground">
                    {channel.assistantId
                      ? t('settings.channels.boundTo', {
                          assistantName:
                            channel.assistantName ??
                            t('claws.channelSelector.otherAssistantFallback')
                        })
                      : t('settings.channels.available')}
                  </p>
                  {channel.type === 'telegram' || channel.type === 'whatsapp' ? (
                    <p className="text-xs text-muted-foreground">
                      {t('claws.telegram.pairingSummary', {
                        pairedCount: channel.pairedCount,
                        pendingCount: channel.pendingPairingCount
                      })}
                    </p>
                  ) : null}
                  <div className="flex flex-wrap gap-2">
                    <Button
                      id={`settings-channels-edit-${channel.id}`}
                      type="button"
                      variant="outline"
                      disabled={isSubmitting}
                      onClick={() => openEditDialog(channel)}
                    >
                      <Pencil className="size-4" />
                      {t('claws.channelSelector.actions.edit')}
                    </Button>
                    <Button
                      id={`settings-channels-delete-${channel.id}`}
                      type="button"
                      variant="outline"
                      disabled={channel.assistantId !== null || isSubmitting}
                      onClick={() => {
                        setChannelToRemove(channel)
                        setRemoveError(null)
                        setIsRemoveDialogOpen(true)
                      }}
                    >
                      {t('claws.channelSelector.actions.remove')}
                    </Button>
                  </div>
                  {channel.assistantId !== null ? (
                    <p className="text-xs text-muted-foreground">
                      {t('settings.channels.removeDisabled')}
                    </p>
                  ) : null}
                </CardContent>
              </Card>
            ))}
          </div>
        </CardContent>
      </Card>

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
            <DialogTitle>
              {formMode === 'create'
                ? t('claws.channelSelector.create.title')
                : t('claws.channelSelector.edit.title')}
            </DialogTitle>
            <DialogDescription>
              {formMode === 'create'
                ? t('claws.channelSelector.create.description')
                : t('claws.channelSelector.edit.description')}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            {formError ? <p className="text-sm text-destructive">{formError}</p> : null}

            <div className="grid gap-2">
              <label
                htmlFor={
                  formMode === 'create'
                    ? 'settings-channel-create-type'
                    : 'settings-channel-form-type'
                }
                className="text-sm font-medium"
              >
                {t('claws.channelSelector.create.fields.type')}
              </label>
              <select
                id={
                  formMode === 'create'
                    ? 'settings-channel-create-type'
                    : 'settings-channel-form-type'
                }
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
                <option value="lark">{t('claws.dialog.channelTypes.lark')}</option>
                <option value="telegram">{t('claws.dialog.channelTypes.telegram')}</option>
                <option value="whatsapp">{t('claws.dialog.channelTypes.whatsapp')}</option>
                <option value="wecom">{t('claws.dialog.channelTypes.wecom')}</option>
                <option value="wechat-kf">{t('claws.dialog.channelTypes.wechatKf')}</option>
              </select>
            </div>

            <div className="grid gap-2">
              <label
                htmlFor={
                  formMode === 'create'
                    ? 'settings-channel-create-name'
                    : 'settings-channel-form-name'
                }
                className="text-sm font-medium"
              >
                {t('claws.dialog.fields.channelName')}
              </label>
              <Input
                id={
                  formMode === 'create'
                    ? 'settings-channel-create-name'
                    : 'settings-channel-form-name'
                }
                value={formState.name}
                onChange={(event) =>
                  setFormState((currentState) => ({
                    ...currentState,
                    name: event.target.value
                  }))
                }
              />
            </div>

            {formState.type === 'telegram' ? (
              <div className="grid gap-2">
                <label
                  htmlFor={
                    formMode === 'create'
                      ? 'settings-channel-create-bot-token'
                      : 'settings-channel-form-bot-token'
                  }
                  className="text-sm font-medium"
                >
                  {t('claws.dialog.fields.botToken')}
                </label>
                <Input
                  id={
                    formMode === 'create'
                      ? 'settings-channel-create-bot-token'
                      : 'settings-channel-form-bot-token'
                  }
                  type="password"
                  placeholder={
                    formMode === 'edit'
                      ? t('claws.channelSelector.edit.botTokenPlaceholder')
                      : undefined
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
                          ? 'settings-channel-create-server-url'
                          : 'settings-channel-form-server-url'
                      }
                      className="text-sm font-medium"
                    >
                      {t('claws.dialog.fields.serverUrl')}
                    </label>
                    <Input
                      id={
                        formMode === 'create'
                          ? 'settings-channel-create-server-url'
                          : 'settings-channel-form-server-url'
                      }
                      placeholder={
                        formMode === 'edit'
                          ? t('claws.channelSelector.edit.appIdPlaceholder')
                          : undefined
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
                          ? 'settings-channel-create-server-key'
                          : 'settings-channel-form-server-key'
                      }
                      className="text-sm font-medium"
                    >
                      {t('claws.dialog.fields.serverKey')}
                    </label>
                    <Input
                      id={
                        formMode === 'create'
                          ? 'settings-channel-create-server-key'
                          : 'settings-channel-form-server-key'
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
                  <label
                    htmlFor={
                      formMode === 'create'
                        ? 'settings-channel-create-app-id'
                        : 'settings-channel-form-app-id'
                    }
                    className="text-sm font-medium"
                  >
                    {t('claws.dialog.fields.botId')}
                  </label>
                  <Input
                    id={
                      formMode === 'create'
                        ? 'settings-channel-create-app-id'
                        : 'settings-channel-form-app-id'
                    }
                    placeholder={
                      formMode === 'edit'
                        ? t('claws.channelSelector.edit.appIdPlaceholder')
                        : undefined
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
                  <label
                    htmlFor={
                      formMode === 'create'
                        ? 'settings-channel-create-app-secret'
                        : 'settings-channel-form-app-secret'
                    }
                    className="text-sm font-medium"
                  >
                    {t('claws.dialog.fields.secret')}
                  </label>
                  <Input
                    id={
                      formMode === 'create'
                        ? 'settings-channel-create-app-secret'
                        : 'settings-channel-form-app-secret'
                    }
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
                  <label
                    htmlFor={
                      formMode === 'create'
                        ? 'settings-channel-create-app-id'
                        : 'settings-channel-form-app-id'
                    }
                    className="text-sm font-medium"
                  >
                    {t('claws.dialog.fields.appId')}
                  </label>
                  <Input
                    id={
                      formMode === 'create'
                        ? 'settings-channel-create-app-id'
                        : 'settings-channel-form-app-id'
                    }
                    placeholder={
                      formMode === 'edit'
                        ? t('claws.channelSelector.edit.appIdPlaceholder')
                        : undefined
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
                  <label
                    htmlFor={
                      formMode === 'create'
                        ? 'settings-channel-create-app-secret'
                        : 'settings-channel-form-app-secret'
                    }
                    className="text-sm font-medium"
                  >
                    {t('claws.dialog.fields.appSecret')}
                  </label>
                  <Input
                    id={
                      formMode === 'create'
                        ? 'settings-channel-create-app-secret'
                        : 'settings-channel-form-app-secret'
                    }
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

            {formMode === 'edit' && formState.type !== 'whatsapp' ? (
              <p className="text-xs text-muted-foreground">
                {t('claws.channelSelector.edit.credentialsOptional')}
              </p>
            ) : null}

            {supportsGroupMentionSetting(formState.type) ? (
              <div className="flex items-start justify-between gap-4 rounded-lg border p-4">
                <div className="grid gap-1">
                  <label
                    htmlFor={
                      formMode === 'create'
                        ? 'settings-channel-create-group-require-mention'
                        : 'settings-channel-form-group-require-mention'
                    }
                    className="text-sm font-medium"
                  >
                    {t('claws.channelSelector.groupRequireMention.label')}
                  </label>
                  <p className="text-xs text-muted-foreground">
                    {t('claws.channelSelector.groupRequireMention.description')}
                  </p>
                </div>
                <Switch
                  id={
                    formMode === 'create'
                      ? 'settings-channel-create-group-require-mention'
                      : 'settings-channel-form-group-require-mention'
                  }
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
              id={
                formMode === 'create'
                  ? 'settings-channel-create-save'
                  : 'settings-channel-form-save'
              }
              type="button"
              disabled={isSubmitting}
              onClick={() => void handleSubmitForm()}
            >
              {formMode === 'create'
                ? t('claws.channelSelector.create.save')
                : t('claws.channelSelector.edit.save')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isRemoveDialogOpen} onOpenChange={setIsRemoveDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{t('claws.channelSelector.remove.title')}</DialogTitle>
            <DialogDescription>
              {channelToRemove
                ? t('claws.channelSelector.remove.description', {
                    channelName: channelToRemove.name
                  })
                : t('claws.channelSelector.remove.descriptionFallback')}
            </DialogDescription>
          </DialogHeader>

          {removeError ? <p className="text-sm text-destructive">{removeError}</p> : null}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setIsRemoveDialogOpen(false)}>
              {t('claws.channelSelector.actions.cancel')}
            </Button>
            <Button
              id="settings-channel-remove-confirm"
              type="button"
              disabled={channelToRemove?.assistantId !== null || isSubmitting}
              onClick={() => void handleRemoveChannel()}
            >
              {t('claws.channelSelector.remove.confirm')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
