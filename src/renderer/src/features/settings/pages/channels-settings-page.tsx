import { useCallback, useEffect, useMemo, useState } from 'react'
import { Pencil, Plus } from 'lucide-react'
import { Button } from '../../../components/ui/button'
import { Card, CardContent, CardHeader } from '../../../components/ui/card'
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
import { channelStatusLabel, channelTypeLabel } from '../channels/channel-labels'
import type {
  ConfiguredChannelRecord,
  CreateChannelInput,
  UpdateChannelInput
} from '../channels/channels-query'
import {
  createChannel,
  deleteChannel,
  listChannels,
  updateChannel
} from '../channels/channels-query'
import { SettingsContent } from './settings-content'

const settingsSelectClassName =
  'h-11 rounded-lg border border-[color:var(--surface-border)] bg-[color:var(--surface-paper)] px-3 py-2 text-sm shadow-[inset_0_1px_0_color-mix(in_srgb,var(--surface-paper)_44%,transparent)] disabled:opacity-100'
const QR_AUTH_POLL_INTERVAL_MS = 2000

const SUPPORTED_CHANNEL_TYPES = [
  'discord',
  'lark',
  'telegram',
  'whatsapp',
  'wechat',
  'wecom'
] as const

type ChannelType = (typeof SUPPORTED_CHANNEL_TYPES)[number]
type ChannelFormMode = 'create' | 'edit'

type ChannelFormState = {
  type: ChannelType
  name: string
  appId: string
  appSecret: string
  botToken: string
  botId: string
  secret: string
  groupRequireMention: boolean
}

function isSupportedChannelType(type: string): type is ChannelType {
  return SUPPORTED_CHANNEL_TYPES.includes(type as ChannelType)
}

function canEditChannel(channel: ConfiguredChannelRecord): boolean {
  return isSupportedChannelType(channel.type)
}

function supportsGroupMentionSetting(type: ChannelType): boolean {
  return type === 'discord' || type === 'lark' || type === 'whatsapp' || type === 'wecom'
}

function supportsQrAuth(type: string): boolean {
  return type === 'wechat' || type === 'whatsapp'
}

function shouldPollChannelAuthState(channel: ConfiguredChannelRecord): boolean {
  return (
    supportsQrAuth(channel.type) &&
    (channel.authState?.status === 'connecting' || channel.authState?.status === 'qr_ready')
  )
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
    groupRequireMention: true
  }
}

function toEditFormState(channel: ConfiguredChannelRecord): ChannelFormState {
  const type = isSupportedChannelType(channel.type) ? channel.type : 'lark'

  return {
    type,
    name: channel.name,
    appId: '',
    appSecret: '',
    botToken: '',
    botId: '',
    secret: '',
    groupRequireMention: channel.groupRequireMention !== false
  }
}

function buildCreateInput(formState: ChannelFormState): CreateChannelInput {
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

  return {
    type: 'lark',
    name: formState.name.trim(),
    appId: formState.appId.trim(),
    appSecret: formState.appSecret.trim(),
    groupRequireMention: formState.groupRequireMention
  }
}

function buildUpdateInput(formState: ChannelFormState): UpdateChannelInput {
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

  return {
    type: 'lark',
    name: formState.name.trim(),
    ...(formState.appId.trim().length > 0 ? { appId: formState.appId.trim() } : {}),
    ...(formState.appSecret.trim().length > 0 ? { appSecret: formState.appSecret.trim() } : {}),
    groupRequireMention: formState.groupRequireMention
  }
}

function statusToneClassName(status: ConfiguredChannelRecord['status']): string {
  switch (status) {
    case 'connected':
      return 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
    case 'disconnected':
      return 'bg-[color:var(--surface-muted)] text-muted-foreground'
    default:
      return 'bg-red-500/10 text-red-700 dark:text-red-300'
  }
}

export function ChannelsSettingsPage(): React.JSX.Element {
  const { t } = useTranslation()
  const [configuredChannels, setConfiguredChannels] = useState<ConfiguredChannelRecord[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isFormDialogOpen, setIsFormDialogOpen] = useState(false)
  const [formMode, setFormMode] = useState<ChannelFormMode>('create')
  const [editingChannel, setEditingChannel] = useState<ConfiguredChannelRecord | null>(null)
  const [formState, setFormState] = useState<ChannelFormState>(emptyFormState)
  const [formError, setFormError] = useState<string | null>(null)
  const [isRemoveDialogOpen, setIsRemoveDialogOpen] = useState(false)
  const [channelToRemove, setChannelToRemove] = useState<ConfiguredChannelRecord | null>(null)
  const [removeError, setRemoveError] = useState<string | null>(null)

  const refreshChannels = useCallback(async (options?: { background?: boolean }): Promise<void> => {
    if (!options?.background) {
      setIsLoading(true)
    }
    setErrorMessage(null)

    try {
      setConfiguredChannels(await listChannels())
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : t('settings.channels.loadFailed'))
    } finally {
      if (!options?.background) {
        setIsLoading(false)
      }
    }
  }, [t])

  useEffect(() => {
    void refreshChannels()
  }, [refreshChannels])

  const sortedChannels = useMemo(
    () => [...configuredChannels].sort((left, right) => left.name.localeCompare(right.name)),
    [configuredChannels]
  )
  const activeChannelCount = useMemo(
    () => sortedChannels.filter((channel) => channel.status === 'connected').length,
    [sortedChannels]
  )
  const pairingChannelCount = useMemo(
    () =>
      sortedChannels.filter(
        (channel) =>
          (channel.type === 'telegram' || channel.type === 'whatsapp') &&
          (channel.pairedCount > 0 || channel.pendingPairingCount > 0)
      ).length,
    [sortedChannels]
  )

  useEffect(() => {
    if (!sortedChannels.some(shouldPollChannelAuthState)) {
      return
    }

    const timerId = window.setInterval(() => {
      void refreshChannels({ background: true })
    }, QR_AUTH_POLL_INTERVAL_MS)

    return () => {
      window.clearInterval(timerId)
    }
  }, [refreshChannels, sortedChannels])

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

  function openEditDialog(channel: ConfiguredChannelRecord): void {
    if (!canEditChannel(channel)) {
      return
    }

    setFormMode('edit')
    setEditingChannel(channel)
    setFormState(toEditFormState(channel))
    setFormError(null)
    setIsFormDialogOpen(true)
  }

  async function handleSubmitForm(): Promise<void> {
    if (formState.name.trim().length === 0) {
      setFormError(t('settings.channels.errors.nameRequired'))
      return
    }

    if (formMode === 'create') {
      if (formState.type === 'discord') {
        if (formState.botToken.trim().length === 0) {
          setFormError(t('settings.channels.errors.discordCredentialsRequired'))
          return
        }
      } else if (formState.type === 'telegram') {
        if (formState.botToken.trim().length === 0) {
          setFormError(t('settings.channels.errors.telegramCredentialsRequired'))
          return
        }
      } else if (
        formState.type === 'wecom' &&
        (formState.botId.trim().length === 0 || formState.secret.trim().length === 0)
      ) {
        setFormError(t('settings.channels.errors.wecomCredentialsRequired'))
        return
      } else if (
        formState.type === 'lark' &&
        (formState.appId.trim().length === 0 || formState.appSecret.trim().length === 0)
      ) {
        setFormError(t('settings.channels.errors.larkCredentialsRequired'))
        return
      }
    }

    setIsSubmitting(true)
    setFormError(null)
    setErrorMessage(null)

    try {
      if (formMode === 'create') {
        const createdChannel = await createChannel(buildCreateInput(formState))
        setConfiguredChannels((current) => [...current, createdChannel])
      } else if (editingChannel) {
        const updatedChannel = await updateChannel(editingChannel.id, buildUpdateInput(formState))
        setConfiguredChannels((current) =>
          current.map((channel) => (channel.id === updatedChannel.id ? updatedChannel : channel))
        )
      }

      setIsFormDialogOpen(false)
      resetForm()
    } catch (error) {
      const fallbackKey =
        formMode === 'create'
          ? 'settings.channels.errors.createFailed'
          : 'settings.channels.errors.updateFailed'
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
      await deleteChannel(channelToRemove.id)
      setConfiguredChannels((current) =>
        current.filter((channel) => channel.id !== channelToRemove.id)
      )
      setIsRemoveDialogOpen(false)
      setChannelToRemove(null)
    } catch (error) {
      setRemoveError(
        error instanceof Error ? error.message : t('settings.channels.errors.deleteFailed')
      )
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <SettingsContent size="wide">
      <header className="space-y-3 border-b border-[color:var(--surface-border)] pb-5">
        <p className="section-kicker">Global routing and communication</p>
        <h1 className="font-editorial text-[2.8rem] leading-none tracking-[-0.045em]">
          {t('settings.channels.title')}
        </h1>
        <p className="max-w-3xl text-sm text-muted-foreground">
          {t('settings.channels.description')}
        </p>
      </header>

      <div className="w-full">
        <Card className="overflow-hidden border-[color:var(--surface-border)] bg-[linear-gradient(180deg,color-mix(in_srgb,var(--surface-paper)_98%,transparent),color-mix(in_srgb,var(--surface-panel)_74%,transparent))]">
          <CardHeader className="flex flex-row items-center justify-between gap-4 border-b border-[color:var(--surface-border)] bg-[linear-gradient(180deg,color-mix(in_srgb,var(--surface-panel-strong)_74%,transparent),color-mix(in_srgb,var(--surface-panel)_94%,transparent))] px-6 py-4">
            <div className="flex flex-row items-center gap-6">
              <div className="flex items-center gap-2">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                </span>
                <span className="text-sm font-medium text-muted-foreground">Active Channels</span>
                <span className="font-editorial text-xl leading-none">{activeChannelCount}</span>
              </div>
              <div className="h-4 w-px bg-[color:var(--surface-border)]" />
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-muted-foreground">Pairing Queues</span>
                <span className="font-editorial text-xl leading-none">{pairingChannelCount}</span>
              </div>
            </div>
            <Button id="settings-channels-add" type="button" onClick={openCreateDialog}>
              <Plus className="size-4" />
              {t('settings.channels.actions.add')}
            </Button>
          </CardHeader>
          <CardContent className="space-y-4 py-6">
            {isLoading ? (
              <p className="text-sm text-muted-foreground">{t('settings.channels.loading')}</p>
            ) : null}
            {errorMessage ? <p className="text-sm text-destructive">{errorMessage}</p> : null}

            {!isLoading && sortedChannels.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t('settings.channels.empty')}</p>
            ) : null}

            <div className="space-y-3">
              {sortedChannels.map((channel) => (
                <div
                  key={channel.id}
                  className="rounded-[1rem] border border-[color:var(--surface-border)] bg-[color:var(--surface-paper)] px-5 py-4 shadow-[inset_0_1px_0_color-mix(in_srgb,var(--surface-paper)_46%,transparent)]"
                >
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div className="min-w-0 space-y-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className="font-editorial text-[1.45rem] leading-none tracking-[-0.03em]">
                          {channel.name}
                        </h2>
                        <span
                          className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-semibold ${statusToneClassName(channel.status)}`}
                        >
                          {channelStatusLabel(channel.status, t)}
                        </span>
                        <span className="inline-flex rounded-full bg-[color:var(--surface-muted)] px-2.5 py-1 text-[11px] font-medium text-muted-foreground">
                          {channelTypeLabel(channel.type, t)}
                        </span>
                      </div>

                      <p className="text-sm text-muted-foreground">
                        {channel.assistantId
                          ? channel.assistantName
                            ? t('settings.channels.boundTo', {
                                assistantName: channel.assistantName
                              })
                            : t('settings.channels.inUse')
                          : t('settings.channels.available')}
                      </p>

                      {channel.type === 'telegram' || channel.type === 'whatsapp' ? (
                        <p className="text-xs text-muted-foreground">
                          {t('settings.channels.pairingSummary', {
                            pairedCount: channel.pairedCount,
                            pendingCount: channel.pendingPairingCount
                          })}
                        </p>
                      ) : null}

                      {supportsQrAuth(channel.type) && channel.authState ? (
                        <div className="rounded-[1rem] border border-[color:var(--surface-border)] bg-[color:var(--surface-panel-soft)] p-4">
                          <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                            <div className="space-y-2">
                              <p className="text-sm font-medium">
                                {channel.type === 'wechat'
                                  ? 'Wechat login QR code'
                                  : 'WhatsApp login QR code'}
                              </p>
                              {channel.authState.status === 'qr_ready' ? (
                                <p className="text-sm text-muted-foreground">
                                  Scan this QR code to finish setup.
                                </p>
                              ) : channel.authState.status === 'connecting' ? (
                                <p className="text-sm text-muted-foreground">
                                  Preparing a fresh login QR code...
                                </p>
                              ) : channel.authState.status === 'connected' ? (
                                <p className="text-sm text-muted-foreground">
                                  {channel.authState.accountLabel
                                    ? `Connected as ${channel.authState.accountLabel}.`
                                    : 'Channel is connected.'}
                                </p>
                              ) : channel.authState.status === 'error' ? (
                                <p className="text-sm text-destructive">
                                  {channel.authState.errorMessage ??
                                    channel.errorMessage ??
                                    'Channel authentication failed.'}
                                </p>
                              ) : (
                                <p className="text-sm text-muted-foreground">
                                  Save or reconnect this channel to generate a login QR code.
                                </p>
                              )}
                              {channel.authState.qrCodeValue ? (
                                <a
                                  href={channel.authState.qrCodeValue}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="inline-flex text-xs font-medium text-foreground underline underline-offset-4"
                                >
                                  Open QR link
                                </a>
                              ) : null}
                            </div>

                            {channel.authState.qrCodeDataUrl ? (
                              <div className="w-fit rounded-[1rem] border border-[color:var(--surface-border)] bg-white p-3 shadow-sm">
                                <img
                                  src={channel.authState.qrCodeDataUrl}
                                  alt={`${channel.name} login QR code`}
                                  className="h-40 w-40 rounded-lg object-contain"
                                />
                              </div>
                            ) : null}
                          </div>
                        </div>
                      ) : null}
                    </div>

                    <div className="flex shrink-0 flex-wrap gap-2">
                      <Button
                        id={`settings-channels-edit-${channel.id}`}
                        type="button"
                        variant="outline"
                        disabled={!canEditChannel(channel) || isSubmitting}
                        onClick={() => openEditDialog(channel)}
                      >
                        <Pencil className="size-4" />
                        {t('settings.channels.actions.edit')}
                      </Button>
                      <Button
                        id={`settings-channels-delete-${channel.id}`}
                        type="button"
                        variant="outline"
                        disabled={isSubmitting}
                        onClick={() => {
                          setChannelToRemove(channel)
                          setRemoveError(null)
                          setIsRemoveDialogOpen(true)
                        }}
                      >
                        {t('settings.channels.actions.remove')}
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

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
            <p className="section-kicker">Channel details</p>
            <DialogTitle>
              {formMode === 'create'
                ? t('settings.channels.form.createTitle')
                : t('settings.channels.form.editTitle')}
            </DialogTitle>
            <DialogDescription>
              {formMode === 'create'
                ? t('settings.channels.createDescription')
                : t('settings.channels.form.editDescription')}
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
                {t('settings.channels.form.type')}
              </label>
              <select
                id={
                  formMode === 'create'
                    ? 'settings-channel-create-type'
                    : 'settings-channel-form-type'
                }
                className={settingsSelectClassName}
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
                    secret: ''
                  }))
                }
              >
                <option value="discord">{t('settings.channels.channelTypes.discord')}</option>
                <option value="lark">{t('settings.channels.channelTypes.lark')}</option>
                <option value="telegram">{t('settings.channels.channelTypes.telegram')}</option>
                <option value="whatsapp">{t('settings.channels.channelTypes.whatsapp')}</option>
                <option value="wechat">{t('settings.channels.channelTypes.wechat')}</option>
                <option value="wecom">{t('settings.channels.channelTypes.wecom')}</option>
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
                {t('settings.channels.form.channelName')}
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

            {formState.type === 'discord' || formState.type === 'telegram' ? (
              <div className="grid gap-2">
                <label
                  htmlFor={
                    formMode === 'create'
                      ? 'settings-channel-create-bot-token'
                      : 'settings-channel-form-bot-token'
                  }
                  className="text-sm font-medium"
                >
                  {t('settings.channels.form.botToken')}
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
                      ? t('settings.channels.form.botTokenPlaceholder')
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
              <p className="text-sm text-muted-foreground">{t('settings.channels.whatsappHint')}</p>
            ) : formState.type === 'wechat' ? (
              <p className="text-sm text-muted-foreground">{t('settings.channels.wechatHint')}</p>
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
                    {t('settings.channels.form.botId')}
                  </label>
                  <Input
                    id={
                      formMode === 'create'
                        ? 'settings-channel-create-app-id'
                        : 'settings-channel-form-app-id'
                    }
                    placeholder={
                      formMode === 'edit' ? t('settings.channels.form.appIdPlaceholder') : undefined
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
                    {t('settings.channels.form.secret')}
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
                        ? t('settings.channels.form.appSecretPlaceholder')
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
                    {t('settings.channels.form.appId')}
                  </label>
                  <Input
                    id={
                      formMode === 'create'
                        ? 'settings-channel-create-app-id'
                        : 'settings-channel-form-app-id'
                    }
                    placeholder={
                      formMode === 'edit' ? t('settings.channels.form.appIdPlaceholder') : undefined
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
                    {t('settings.channels.form.appSecret')}
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
                        ? t('settings.channels.form.appSecretPlaceholder')
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
                {t('settings.channels.form.credentialsOptional')}
              </p>
            ) : null}

            {supportsGroupMentionSetting(formState.type) ? (
              <div className="flex items-start justify-between gap-4 rounded-lg border border-[color:var(--surface-border)] bg-[color:var(--surface-panel-soft)] p-4">
                <div className="grid gap-1">
                  <label
                    htmlFor={
                      formMode === 'create'
                        ? 'settings-channel-create-group-require-mention'
                        : 'settings-channel-form-group-require-mention'
                    }
                    className="text-sm font-medium"
                  >
                    {t('settings.channels.form.groupRequireMentionLabel')}
                  </label>
                  <p className="text-xs text-muted-foreground">
                    {t('settings.channels.groupRequireMentionDescription')}
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
              {t('settings.channels.actions.cancel')}
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
                ? t('settings.channels.form.createSave')
                : t('settings.channels.form.editSave')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isRemoveDialogOpen} onOpenChange={setIsRemoveDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{t('settings.channels.remove.title')}</DialogTitle>
            <DialogDescription>
              {channelToRemove
                ? t('settings.channels.remove.description', {
                    channelName: channelToRemove.name
                  })
                : t('settings.channels.remove.descriptionFallback')}
            </DialogDescription>
          </DialogHeader>

          {removeError ? <p className="text-sm text-destructive">{removeError}</p> : null}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setIsRemoveDialogOpen(false)}>
              {t('settings.channels.actions.cancel')}
            </Button>
            <Button
              id="settings-channel-remove-confirm"
              type="button"
              disabled={isSubmitting}
              onClick={() => void handleRemoveChannel()}
            >
              {t('settings.channels.remove.confirm')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </SettingsContent>
  )
}
