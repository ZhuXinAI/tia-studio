import { useEffect, useMemo, useRef, useState } from 'react'
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
import type { ProviderRecord, SaveProviderInput } from '../../settings/providers/providers-query'
import type {
  ClawRecord,
  ConfiguredClawChannelRecord,
  CreateClawChannelInput,
  SaveClawInput,
  UpdateClawChannelInput
} from '../claws-query'
import { channelStatusLabel, channelTypeLabel } from '../claw-labels'
import { ClawChannelSelectorDialog } from './claw-channel-selector-dialog'
import { ClawDialogStepper } from './claw-dialog-stepper'
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

type CreateClawDialogProps = Omit<ClawEditorDialogProps, 'claw'>

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

function CreateClawDialog({
  isOpen,
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
}: CreateClawDialogProps): React.JSX.Element {
  const { t } = useTranslation()
  const [currentStep, setCurrentStep] = useState(0)
  const [name, setName] = useState('')
  const [providerId, setProviderId] = useState('')
  const [enabled, setEnabled] = useState(true)
  const [selectedChannelId, setSelectedChannelId] = useState('')
  const [workspacePath, setWorkspacePath] = useState('')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [isProviderInlineFlowOpen, setIsProviderInlineFlowOpen] = useState(false)
  const [isChannelInlineFlowOpen, setIsChannelInlineFlowOpen] = useState(false)
  const nameInputRef = useRef<HTMLInputElement | null>(null)
  const hasFocusedNameStepRef = useRef(false)

  useEffect(() => {
    if (!isOpen) {
      hasFocusedNameStepRef.current = false
      return
    }

    setCurrentStep(0)
    setName(t('claws.dialog.defaultAssistantName'))
    setProviderId('')
    setEnabled(true)
    setSelectedChannelId('')
    setWorkspacePath('')
    setErrorMessage(null)
    setIsProviderInlineFlowOpen(false)
    setIsChannelInlineFlowOpen(false)
    hasFocusedNameStepRef.current = false
  }, [isOpen, t])

  useEffect(() => {
    if (!isOpen || currentStep !== 2) {
      return
    }

    nameInputRef.current?.focus()
    if (!hasFocusedNameStepRef.current) {
      nameInputRef.current?.select()
      hasFocusedNameStepRef.current = true
    }
  }, [currentStep, isOpen])

  const steps = [
    t('claws.dialog.stepper.steps.provider'),
    t('claws.dialog.stepper.steps.channel'),
    t('claws.dialog.stepper.steps.details')
  ]

  const selectedProvider = useMemo(() => {
    if (!providerId) {
      return null
    }

    return providers.find((provider) => provider.id === providerId) ?? null
  }, [providerId, providers])

  const selectedChannel = useMemo(() => {
    if (!selectedChannelId) {
      return null
    }

    return configuredChannels.find((channel) => channel.id === selectedChannelId) ?? null
  }, [configuredChannels, selectedChannelId])

  async function handlePickWorkspaceFolder(): Promise<void> {
    try {
      const selectedPath = await window.tiaDesktop.pickDirectory()
      if (selectedPath) {
        setWorkspacePath(selectedPath)
        setErrorMessage(null)
      }
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : t('claws.dialog.errors.pickFolderFailed')
      )
    }
  }

  function handleBack(): void {
    setErrorMessage(null)

    if (currentStep === 0) {
      onClose()
      return
    }

    setCurrentStep((step) => Math.max(step - 1, 0))
  }

  function handleNext(): void {
    if (currentStep === 0 && providerId.trim().length === 0) {
      setErrorMessage(t('claws.dialog.errors.providerRequired'))
      return
    }

    setErrorMessage(null)
    setCurrentStep((step) => Math.min(step + 1, steps.length - 1))
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault()

    if (name.trim().length === 0) {
      setErrorMessage(t('claws.dialog.errors.assistantNameRequired'))
      return
    }

    if (providerId.trim().length === 0) {
      setErrorMessage(t('claws.dialog.errors.providerRequired'))
      setCurrentStep(0)
      return
    }

    const channel = buildChannelPayload({
      claw: null,
      selectedChannelId
    })

    await onSubmit({
      assistant: {
        name: name.trim(),
        providerId: providerId.trim(),
        enabled: selectedChannelId ? enabled : false,
        ...(workspacePath.trim().length > 0 ? { workspacePath: workspacePath.trim() } : {})
      },
      ...(channel ? { channel } : {})
    })
  }

  const footerDisabled =
    isSubmitting ||
    (currentStep === 0
      ? isProviderInlineFlowOpen
      : currentStep === 1
        ? isChannelInlineFlowOpen
        : false)

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[85vh] w-[80vw] max-w-[80vw] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t('claws.dialog.createTitle')}</DialogTitle>
          <DialogDescription>{t('claws.dialog.telegramDescription')}</DialogDescription>
        </DialogHeader>

        <form className="space-y-6" onSubmit={(event) => void handleSubmit(event)}>
          <ClawDialogStepper steps={steps} currentStep={currentStep} />

          {currentStep === 0 ? (
            <ClawProviderSelectorDialog
              isOpen={isOpen}
              selectedProviderId={providerId}
              providers={providers}
              isMutating={isSubmitting}
              errorMessage={null}
              layout="inline"
              onInlineFlowChange={setIsProviderInlineFlowOpen}
              onClose={() => undefined}
              onApply={(nextProviderId) => {
                setProviderId(nextProviderId)
                setErrorMessage(null)
              }}
              onCreateProvider={onCreateProvider}
              onUpdateProvider={onUpdateProvider}
            />
          ) : null}

          {currentStep === 1 ? (
            <ClawChannelSelectorDialog
              isOpen={isOpen}
              currentAssistantId={null}
              selectedChannelId={selectedChannelId}
              channels={configuredChannels}
              isMutating={isSubmitting}
              errorMessage={null}
              layout="inline"
              onInlineFlowChange={setIsChannelInlineFlowOpen}
              onClose={() => undefined}
              onApply={(channelId) => {
                setSelectedChannelId(channelId)
                setErrorMessage(null)
              }}
              onCreateChannel={onCreateChannel}
              onUpdateChannel={onUpdateChannel}
              onDeleteChannel={onDeleteChannel}
            />
          ) : null}

          {currentStep === 2 ? (
            <div className="space-y-4">
              <div className="space-y-1">
                <h3 className="text-base font-semibold">
                  {t('claws.dialog.stepper.steps.details')}
                </h3>
                <p className="text-sm text-muted-foreground">
                  {t('claws.dialog.stepper.detailsDescription')}
                </p>
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                <div className="rounded-lg border border-border p-4">
                  <p className="text-sm font-medium">{t('claws.dialog.fields.provider')}</p>
                  {selectedProvider ? (
                    <div className="mt-2 space-y-1">
                      <p className="font-medium">{selectedProvider.name}</p>
                      <p className="text-sm text-muted-foreground">
                        {selectedProvider.type} · {selectedProvider.selectedModel}
                      </p>
                    </div>
                  ) : (
                    <p className="mt-2 text-sm text-muted-foreground">
                      {t('claws.providerSelector.noProviderSelected')}
                    </p>
                  )}
                </div>

                <div className="rounded-lg border border-border p-4">
                  <p className="text-sm font-medium">{t('claws.dialog.fields.channelName')}</p>
                  {selectedChannel ? (
                    <div className="mt-2 space-y-1">
                      <p className="font-medium">{selectedChannel.name}</p>
                      <p className="text-sm text-muted-foreground">
                        {channelTypeLabel(selectedChannel.type, t)} ·{' '}
                        {channelStatusLabel(selectedChannel.status, t)}
                      </p>
                    </div>
                  ) : (
                    <p className="mt-2 text-sm text-muted-foreground">
                      {t('claws.card.noChannelConnected')}
                    </p>
                  )}
                </div>
              </div>

              <div className="grid gap-2">
                <label htmlFor="claw-name" className="text-sm font-medium">
                  {t('claws.dialog.fields.assistantName')}
                </label>
                <Input
                  id="claw-name"
                  ref={nameInputRef}
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                />
              </div>

              <div className="grid gap-2">
                <label htmlFor="claw-workspace-path" className="text-sm font-medium">
                  {t('claws.dialog.fields.workspacePath')}
                </label>
                <div className="flex gap-2">
                  <Input
                    id="claw-workspace-path"
                    value={workspacePath}
                    onChange={(event) => setWorkspacePath(event.target.value)}
                    placeholder={t('claws.dialog.workspacePathPlaceholder')}
                    disabled={isSubmitting}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    disabled={isSubmitting}
                    onClick={() => void handlePickWorkspaceFolder()}
                  >
                    {t('claws.dialog.pickFolder')}
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  {t('claws.dialog.workspacePathHint')}
                </p>
              </div>

              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={enabled && selectedChannelId.length > 0}
                  disabled={!selectedChannelId || isSubmitting}
                  onChange={(event) => setEnabled(event.target.checked)}
                />
                <span>{t('claws.dialog.enableAfterSaving')}</span>
              </label>

              {!selectedChannelId ? (
                <p className="text-xs text-muted-foreground">
                  {t('claws.channelSelector.description')}
                </p>
              ) : null}
            </div>
          ) : null}

          {errorMessage ? <p className="text-sm text-destructive">{errorMessage}</p> : null}

          <DialogFooter>
            <Button
              id="claw-create-back"
              type="button"
              variant="outline"
              onClick={handleBack}
              disabled={footerDisabled}
            >
              {t('claws.dialog.stepper.actions.back')}
            </Button>
            {currentStep < steps.length - 1 ? (
              <Button
                id="claw-create-next"
                type="button"
                onClick={handleNext}
                disabled={footerDisabled || (currentStep === 0 && providerId.trim().length === 0)}
              >
                {t('claws.dialog.stepper.actions.next')}
              </Button>
            ) : (
              <Button id="claw-create-submit" type="submit" disabled={isSubmitting}>
                {t('claws.dialog.createButton')}
              </Button>
            )}
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function EditClawDialog({
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
}: ClawEditorDialogProps & { claw: ClawRecord }): React.JSX.Element {
  const { t } = useTranslation()
  const [name, setName] = useState(claw.name)
  const [providerId, setProviderId] = useState(claw.providerId ?? '')
  const [enabled, setEnabled] = useState(claw.enabled)
  const [selectedChannelId, setSelectedChannelId] = useState(claw.channel?.id ?? '')
  const [workspacePath, setWorkspacePath] = useState(claw.workspacePath ?? '')
  const [isChannelSelectorOpen, setIsChannelSelectorOpen] = useState(false)
  const [isProviderSelectorOpen, setIsProviderSelectorOpen] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  useEffect(() => {
    setName(claw.name)
    setProviderId(claw.providerId ?? '')
    setEnabled(claw.enabled)
    setSelectedChannelId(claw.channel?.id ?? '')
    setWorkspacePath(claw.workspacePath ?? '')
    setIsChannelSelectorOpen(false)
    setIsProviderSelectorOpen(false)
    setErrorMessage(null)
  }, [claw, isOpen])

  const selectedChannel = useMemo(() => {
    if (!selectedChannelId) {
      return null
    }

    const configuredChannel =
      configuredChannels.find((channel) => channel.id === selectedChannelId) ?? null
    if (configuredChannel) {
      return configuredChannel
    }

    if (claw.channel?.id === selectedChannelId) {
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
  }, [providerId, providers])

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
        enabled: selectedChannelId ? enabled : false,
        ...(workspacePath.trim().length > 0 ? { workspacePath: workspacePath.trim() } : {})
      },
      ...(channel ? { channel } : {})
    })
  }

  return (
    <>
      <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>{t('claws.dialog.editTitle')}</DialogTitle>
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
              <label className="text-sm font-medium">{t('claws.dialog.fields.channelName')}</label>
              <div className="rounded-lg border border-border p-4">
                {selectedChannel ? (
                  <div className="space-y-1">
                    <p className="font-medium">{selectedChannel.name}</p>
                    <p className="text-sm text-muted-foreground">
                      {channelTypeLabel(selectedChannel.type, t)} ·{' '}
                      {channelStatusLabel(selectedChannel.status, t)}
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

            <div className="grid gap-2">
              <label htmlFor="claw-workspace-path" className="text-sm font-medium">
                {t('claws.dialog.fields.workspacePath')}
              </label>
              <div className="flex gap-2">
                <Input
                  id="claw-workspace-path"
                  value={workspacePath}
                  onChange={(event) => setWorkspacePath(event.target.value)}
                  placeholder={t('claws.dialog.workspacePathPlaceholder')}
                  disabled
                  className="cursor-not-allowed bg-muted"
                />
              </div>
              <p className="text-xs text-muted-foreground">
                {t('claws.dialog.workspacePathReadOnly')}
              </p>
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
                {t('claws.dialog.saveButton')}
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
        currentAssistantId={claw.id}
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

export function ClawEditorDialog(props: ClawEditorDialogProps): React.JSX.Element {
  if (!props.claw) {
    const { claw: _claw, ...createProps } = props
    return <CreateClawDialog {...createProps} />
  }

  return <EditClawDialog {...props} claw={props.claw} />
}
