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
import { Textarea } from '../../../components/ui/textarea'
import { useTranslation } from '../../../i18n/use-app-translation'
import type { ProviderRecord, SaveProviderInput } from '../../settings/providers/providers-query'
import type {
  ClawRecord,
  ConfiguredClawChannelRecord,
  CreateClawChannelInput,
  UpdateClawChannelInput,
  SaveClawInput
} from '../claws-query'
import { ClawChannelSelectorDialog } from './claw-channel-selector-dialog'
import { ClawProviderSelectorDialog } from './claw-provider-selector-dialog'

type ClawEditorDialogProps = {
  isOpen: boolean
  claw: ClawRecord | null
  providers: ProviderRecord[]
  configuredChannels: ConfiguredClawChannelRecord[]
  isSubmitting: boolean
  onClose: () => void
  onSubmit: (input: SaveClawInput) => Promise<void> | void
  onCreateChannel: (
    input: CreateClawChannelInput
  ) => Promise<ConfiguredClawChannelRecord> | ConfiguredClawChannelRecord
  onUpdateChannel: (
    channelId: string,
    input: UpdateClawChannelInput
  ) => Promise<ConfiguredClawChannelRecord> | ConfiguredClawChannelRecord
  onDeleteChannel: (channelId: string) => Promise<void> | void
  onCreateProvider: (input: SaveProviderInput) => Promise<ProviderRecord> | ProviderRecord
  onUpdateProvider: (
    providerId: string,
    input: Partial<SaveProviderInput>
  ) => Promise<ProviderRecord> | ProviderRecord
}

function buildChannelPayload(input: {
  claw: ClawRecord | null
  selectedChannelId: string
}): SaveClawInput['channel'] {
  if (!input.selectedChannelId) {
    return input.claw?.channel ? { mode: 'detach' } : undefined
  }

  if (input.claw?.channel?.id === input.selectedChannelId) {
    return input.claw.channel ? { mode: 'keep' } : undefined
  }

  return {
    mode: 'attach',
    channelId: input.selectedChannelId
  }
}

export function ClawEditorDialog({
  isOpen,
  claw,
  providers,
  configuredChannels,
  isSubmitting,
  onClose,
  onSubmit,
  onCreateChannel,
  onUpdateChannel,
  onDeleteChannel,
  onCreateProvider,
  onUpdateProvider
}: ClawEditorDialogProps): React.JSX.Element {
  const { t } = useTranslation()
  const [name, setName] = useState(claw?.name ?? '')
  const [providerId, setProviderId] = useState(claw?.providerId ?? '')
  const [instructions, setInstructions] = useState(claw?.instructions ?? '')
  const [enabled, setEnabled] = useState(claw?.enabled ?? true)
  const [selectedChannelId, setSelectedChannelId] = useState(claw?.channel?.id ?? '')
  const [isChannelSelectorOpen, setIsChannelSelectorOpen] = useState(false)
  const [isProviderSelectorOpen, setIsProviderSelectorOpen] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  useEffect(() => {
    setName(claw?.name ?? '')
    setProviderId(claw?.providerId ?? '')
    setInstructions(claw?.instructions ?? '')
    setEnabled(claw?.enabled ?? true)
    setSelectedChannelId(claw?.channel?.id ?? '')
    setIsChannelSelectorOpen(false)
    setIsProviderSelectorOpen(false)
    setErrorMessage(null)
  }, [claw, isOpen])

  const dialogTitle = useMemo(
    () => (claw ? t('claws.dialog.editTitle') : t('claws.dialog.createTitle')),
    [claw, t]
  )

  const submitLabel = claw ? t('claws.dialog.saveButton') : t('claws.dialog.createButton')

  const selectedChannel = useMemo(() => {
    if (!selectedChannelId) {
      return null
    }

    const configuredChannel =
      configuredChannels.find((channel) => channel.id === selectedChannelId) ?? null
    if (configuredChannel) {
      return configuredChannel
    }

    if (claw?.channel?.id === selectedChannelId) {
      return {
        id: claw.channel.id,
        type: claw.channel.type,
        name: claw.channel.name,
        assistantId: claw.id,
        assistantName: claw.name,
        status: claw.channel.status,
        errorMessage: claw.channel.errorMessage,
        pairedCount: claw.channel.pairedCount ?? 0,
        pendingPairingCount: claw.channel.pendingPairingCount ?? 0
      }
    }

    return null
  }, [claw, configuredChannels, selectedChannelId])

  const selectedProvider = useMemo(() => {
    if (!providerId) {
      return null
    }

    return providers.find((provider) => provider.id === providerId) ?? null
  }, [providers, providerId])

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault()

    if (name.trim().length === 0) {
      setErrorMessage(t('claws.dialog.errors.assistantNameRequired'))
      return
    }

    if (providerId.trim().length === 0) {
      setErrorMessage(t('claws.dialog.errors.providerRequired'))
      return
    }

    const channel = buildChannelPayload({
      claw,
      selectedChannelId
    })

    await onSubmit({
      assistant: {
        name: name.trim(),
        providerId: providerId.trim(),
        instructions: instructions.trim(),
        enabled: selectedChannelId ? enabled : false
      },
      ...(channel ? { channel } : {})
    })
  }

  return (
    <>
      <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>{dialogTitle}</DialogTitle>
            <DialogDescription>{t('claws.dialog.telegramDescription')}</DialogDescription>
          </DialogHeader>

          <form className="space-y-4" onSubmit={(event) => void handleSubmit(event)}>
            <div className="grid gap-2">
              <label htmlFor="claw-name" className="text-sm font-medium">
                {t('claws.dialog.fields.assistantName')}
              </label>
              <Input
                id="claw-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
              />
            </div>

            <div className="grid gap-2">
              <label className="text-sm font-medium">{t('claws.dialog.fields.provider')}</label>
              <div className="rounded-lg border border-border p-4">
                {selectedProvider ? (
                  <div className="space-y-1">
                    <p className="font-medium">{selectedProvider.name}</p>
                    <p className="text-sm text-muted-foreground">
                      {selectedProvider.type} · {selectedProvider.selectedModel}
                    </p>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    {t('claws.providerSelector.noProviderSelected')}
                  </p>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <Button
                  id="claw-select-provider-button"
                  type="button"
                  variant="outline"
                  disabled={isSubmitting}
                  onClick={() => setIsProviderSelectorOpen(true)}
                >
                  {t('claws.providerSelector.openButton')}
                </Button>
                {!providerId ? (
                  <p className="text-sm text-amber-600">{t('claws.providerSelector.required')}</p>
                ) : null}
              </div>
            </div>

            <div className="grid gap-2">
              <label htmlFor="claw-instructions" className="text-sm font-medium">
                {t('claws.dialog.fields.instructions')}
              </label>
              <Textarea
                id="claw-instructions"
                value={instructions}
                onChange={(event) => setInstructions(event.target.value)}
              />
            </div>

            <div className="grid gap-2">
              <label className="text-sm font-medium">{t('claws.dialog.fields.channelName')}</label>
              <div className="rounded-lg border border-border p-4">
                {selectedChannel ? (
                  <div className="space-y-1">
                    <p className="font-medium">{selectedChannel.name}</p>
                    <p className="text-sm text-muted-foreground">
                      {selectedChannel.type} · {selectedChannel.status}
                    </p>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    {t('claws.card.noChannelConnected')}
                  </p>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <Button
                  id="claw-select-channel-button"
                  type="button"
                  variant="outline"
                  disabled={isSubmitting}
                  onClick={() => setIsChannelSelectorOpen(true)}
                >
                  {t('claws.channelSelector.openButton')}
                </Button>
                {!selectedChannelId ? (
                  <p className="text-sm text-amber-600">{t('claws.card.configureChannelFirst')}</p>
                ) : null}
              </div>
            </div>

            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={enabled}
                onChange={(event) => setEnabled(event.target.checked)}
              />
              <span>{t('claws.dialog.enableAfterSaving')}</span>
            </label>

            {errorMessage ? <p className="text-sm text-destructive">{errorMessage}</p> : null}

            <DialogFooter>
              <Button type="button" variant="outline" onClick={onClose} disabled={isSubmitting}>
                {t('common.actions.cancel')}
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {submitLabel}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <ClawProviderSelectorDialog
        isOpen={isProviderSelectorOpen}
        selectedProviderId={providerId}
        providers={providers}
        isMutating={isSubmitting}
        errorMessage={null}
        onClose={() => setIsProviderSelectorOpen(false)}
        onApply={(newProviderId) => {
          setProviderId(newProviderId)
          setErrorMessage(null)
        }}
        onCreateProvider={onCreateProvider}
        onUpdateProvider={onUpdateProvider}
      />

      <ClawChannelSelectorDialog
        isOpen={isChannelSelectorOpen}
        currentAssistantId={claw?.id ?? null}
        selectedChannelId={selectedChannelId}
        channels={configuredChannels}
        isMutating={isSubmitting}
        errorMessage={null}
        onClose={() => setIsChannelSelectorOpen(false)}
        onApply={(channelId) => {
          setSelectedChannelId(channelId)
          setErrorMessage(null)
        }}
        onCreateChannel={onCreateChannel}
        onUpdateChannel={onUpdateChannel}
        onDeleteChannel={onDeleteChannel}
      />
    </>
  )
}
