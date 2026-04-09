import { useEffect, useMemo, useRef, useState } from 'react'
import { Bot, Plus } from 'lucide-react'
import { useLocation, useNavigate } from 'react-router-dom'
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
import { useTranslation } from '../../../i18n/use-app-translation'
import { queryClient } from '../../../lib/query-client'
import type { AssistantRecord, SaveAssistantInput } from '../../assistants/assistants-query'
import {
  assistantKeys,
  createAssistant,
  listAssistants,
  updateAssistant as updateAssistantRecord
} from '../../assistants/assistants-query'
import {
  updateAssistantHeartbeat,
  type SaveAssistantHeartbeatInput
} from '../../assistants/assistant-heartbeat-query'
import type { ProviderRecord } from '../../settings/providers/providers-query'
import { listProviders } from '../../settings/providers/providers-query'
import {
  getMcpServersSettings,
  type McpServerRecord
} from '../../settings/mcp-servers/mcp-servers-query'
import {
  approveClawPairing,
  createClawChannel,
  deleteClaw,
  deleteClawChannel,
  getClawChannelAuthState,
  listClawPairings,
  listClaws,
  recoverClawChannelSetup,
  rejectClawPairing,
  revokeClawPairing,
  updateClaw,
  updateClawChannel,
  type ClawChannelAuthRecord,
  type ClawPairingRecord,
  type ClawRecord,
  type ClawsResponse,
  type CreateClawChannelInput,
  type ConfiguredClawChannelRecord,
  type UpdateClawChannelInput
} from '../claws-query'
import { AssistantManagementDialog } from '../components/assistant-management-dialog'
import { ClawCard } from '../components/claw-card'
import { ClawPairingsDialog } from '../components/claw-pairings-dialog'
import { ClawHeartbeatMonitorDialog } from '../components/claw-heartbeat-monitor-dialog'
import { ClawCronMonitorDialog } from '../components/claw-cron-monitor-dialog'

function emptyClawsResponse(): ClawsResponse {
  return {
    claws: [],
    configuredChannels: []
  }
}

function invalidateAssistantsCache(): void {
  void queryClient.invalidateQueries({ queryKey: assistantKeys.lists() })
}

function buildChannelPayload(
  currentChannelId: string,
  selectedChannelId: string
):
  | {
      mode: 'attach'
      channelId: string
    }
  | {
      mode: 'detach'
    }
  | {
      mode: 'keep'
    }
  | undefined {
  if (selectedChannelId.length === 0) {
    return currentChannelId.length > 0 ? { mode: 'detach' } : undefined
  }

  if (currentChannelId === selectedChannelId) {
    return currentChannelId.length > 0 ? { mode: 'keep' } : undefined
  }

  return {
    mode: 'attach',
    channelId: selectedChannelId
  }
}

function supportsChannelAccess(channelType: string | null | undefined): boolean {
  return channelType === 'telegram' || channelType === 'whatsapp' || channelType === 'wechat'
}

type AssistantCreatePath = 'external-acp' | 'tia'

type ClawsPageProps = {
  surface?: 'standalone' | 'settings'
}

export function ClawsPage({ surface = 'standalone' }: ClawsPageProps): React.JSX.Element {
  const { t } = useTranslation()
  const location = useLocation()
  const navigate = useNavigate()
  const [data, setData] = useState<ClawsResponse>(emptyClawsResponse)
  const [assistants, setAssistants] = useState<AssistantRecord[]>([])
  const [providers, setProviders] = useState<ProviderRecord[]>([])
  const [mcpServers, setMcpServers] = useState<Record<string, McpServerRecord>>({})
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [editingClaw, setEditingClaw] = useState<ClawRecord | null>(null)
  const [dialogCreatePath, setDialogCreatePath] = useState<AssistantCreatePath>('external-acp')
  const [selectedChannelId, setSelectedChannelId] = useState('')
  const [pairingsClaw, setPairingsClaw] = useState<ClawRecord | null>(null)
  const [pairings, setPairings] = useState<ClawPairingRecord[]>([])
  const [isPairingsLoading, setIsPairingsLoading] = useState(false)
  const [channelAuthState, setChannelAuthState] = useState<ClawChannelAuthRecord | null>(null)
  const [isChannelAuthLoading, setIsChannelAuthLoading] = useState(false)
  const [isPairingsSubmitting, setIsPairingsSubmitting] = useState(false)
  const [pairingsErrorMessage, setPairingsErrorMessage] = useState<string | null>(null)
  const [clawPendingDelete, setClawPendingDelete] = useState<ClawRecord | null>(null)
  const [heartbeatMonitorClaw, setHeartbeatMonitorClaw] = useState<ClawRecord | null>(null)
  const [cronMonitorClaw, setCronMonitorClaw] = useState<ClawRecord | null>(null)
  const connectedAuthRefreshKeyRef = useRef<string | null>(null)
  const createTiaEntryLabel = t('claws.newTiaButton', {
    defaultValue: 'Create TIA Agent (Advanced)'
  })
  const createTiaEmptyLabel = t('claws.empty.createTiaButton', {
    defaultValue: 'Create TIA Agent (Advanced)'
  })
  const isSettingsSurface = surface === 'settings'

  async function refreshPage(): Promise<ClawsResponse> {
    const [nextClaws, nextProviders, nextAssistants, nextMcpServers] = await Promise.all([
      listClaws(),
      listProviders(),
      listAssistants(),
      getMcpServersSettings()
    ])
    setData(nextClaws)
    setProviders(nextProviders)
    setAssistants(nextAssistants)
    setMcpServers(nextMcpServers.mcpServers)
    return nextClaws
  }

  useEffect(() => {
    void refreshPage().catch((error) => {
      setErrorMessage(error instanceof Error ? error.message : t('claws.errors.loadFailed'))
    })
  }, [t])

  useEffect(() => {
    const nextState = location.state as
      | { assistantDialog?: string; assistantCreatePath?: AssistantCreatePath }
      | null
    if (nextState?.assistantDialog !== 'create') {
      return
    }

    setEditingClaw(null)
    setDialogCreatePath(
      nextState.assistantCreatePath === 'tia' ? nextState.assistantCreatePath : 'external-acp'
    )
    setSelectedChannelId('')
    setErrorMessage(null)
    setIsDialogOpen(true)
    navigate(location.pathname, { replace: true, state: null })
  }, [location.pathname, location.state, navigate])

  const hasAnyClaw = useMemo(() => {
    return data.claws.length > 0
  }, [data.claws])

  const editingAssistant = editingClaw
    ? (assistants.find((assistant) => assistant.id === editingClaw.id) ?? null)
    : null

  function providerLabel(providerId: string | null): string {
    if (!providerId) {
      return t('claws.providers.noneSelected')
    }

    return (
      providers.find((provider) => provider.id === providerId)?.name ?? t('claws.providers.unknown')
    )
  }

  async function handleDialogSubmit(
    input: SaveAssistantInput,
    heartbeatInput?: SaveAssistantHeartbeatInput | null,
    selectedChannelIdOverride?: string
  ): Promise<void> {
    setIsSubmitting(true)
    setErrorMessage(null)

    try {
      const savedAssistant = editingClaw
        ? await updateAssistantRecord(editingClaw.id, input)
        : await createAssistant(input)

      if (heartbeatInput) {
        await updateAssistantHeartbeat(savedAssistant.id, heartbeatInput)
      }

      const currentChannelId = editingClaw?.channel?.id ?? ''
      const nextSelectedChannelId = (selectedChannelIdOverride ?? selectedChannelId).trim()
      const nextWorkspacePath =
        typeof input.workspaceConfig?.rootPath === 'string'
          ? input.workspaceConfig.rootPath.trim()
          : ''
      const channelPayload = buildChannelPayload(currentChannelId, nextSelectedChannelId)

      if (editingClaw || nextSelectedChannelId.length > 0 || channelPayload) {
        await updateClaw(savedAssistant.id, {
          assistant: {
            enabled: nextSelectedChannelId.length > 0 ? (editingClaw?.enabled ?? true) : false,
            ...(nextWorkspacePath.length > 0 ? { workspacePath: nextWorkspacePath } : {})
          },
          ...(channelPayload ? { channel: channelPayload } : {})
        })
      }

      invalidateAssistantsCache()
      setIsDialogOpen(false)
      setEditingClaw(null)
      setSelectedChannelId('')

      const nextClaws = await refreshPage()
      const savedClaw = nextClaws.claws.find((claw) => claw.id === savedAssistant.id) ?? null
      if (!editingClaw && savedClaw && supportsChannelAccess(savedClaw.channel?.type)) {
        await handleOpenPairings(savedClaw)
      }
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : t('claws.errors.saveFailed'))
    } finally {
      setIsSubmitting(false)
    }
  }

  async function handleCreateChannel(
    input: CreateClawChannelInput
  ): Promise<ConfiguredClawChannelRecord> {
    setIsSubmitting(true)
    setErrorMessage(null)

    try {
      const createdChannel = await createClawChannel(input)
      setData((current) => ({
        ...current,
        configuredChannels: [...current.configuredChannels, createdChannel]
      }))
      return createdChannel
    } catch (error) {
      const resolvedError = error instanceof Error ? error : new Error(t('claws.errors.saveFailed'))
      setErrorMessage(resolvedError.message)
      throw resolvedError
    } finally {
      setIsSubmitting(false)
    }
  }

  async function handleDeleteChannel(channelId: string): Promise<void> {
    setIsSubmitting(true)
    setErrorMessage(null)

    try {
      await deleteClawChannel(channelId)
      setData((current) => ({
        ...current,
        configuredChannels: current.configuredChannels.filter((channel) => channel.id !== channelId)
      }))
    } catch (error) {
      const resolvedError =
        error instanceof Error ? error : new Error(t('claws.errors.deleteFailed'))
      setErrorMessage(resolvedError.message)
      throw resolvedError
    } finally {
      setIsSubmitting(false)
    }
  }

  async function handleUpdateChannel(
    channelId: string,
    input: UpdateClawChannelInput
  ): Promise<ConfiguredClawChannelRecord> {
    setIsSubmitting(true)
    setErrorMessage(null)

    try {
      const updatedChannel = await updateClawChannel(channelId, input)
      setData((current) => ({
        ...current,
        configuredChannels: current.configuredChannels.map((channel) =>
          channel.id === updatedChannel.id ? updatedChannel : channel
        )
      }))
      return updatedChannel
    } catch (error) {
      const resolvedError =
        error instanceof Error ? error : new Error(t('claws.errors.updateFailed'))
      setErrorMessage(resolvedError.message)
      throw resolvedError
    } finally {
      setIsSubmitting(false)
    }
  }

  async function handleRecoverChannel(channelId: string): Promise<ConfiguredClawChannelRecord> {
    setIsSubmitting(true)
    setErrorMessage(null)

    try {
      const recoveredChannel = await recoverClawChannelSetup(channelId)
      setData((current) => ({
        ...current,
        configuredChannels: current.configuredChannels.map((channel) =>
          channel.id === recoveredChannel.id ? recoveredChannel : channel
        )
      }))
      return recoveredChannel
    } catch (error) {
      const resolvedError =
        error instanceof Error ? error : new Error(t('claws.errors.updateFailed'))
      setErrorMessage(resolvedError.message)
      throw resolvedError
    } finally {
      setIsSubmitting(false)
    }
  }

  async function setClawEnabled(claw: ClawRecord, enabled: boolean): Promise<void> {
    setIsSubmitting(true)
    setErrorMessage(null)

    try {
      await updateClaw(claw.id, {
        assistant: {
          enabled
        }
      })
      invalidateAssistantsCache()
      await refreshPage()
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : t('claws.errors.updateFailed'))
    } finally {
      setIsSubmitting(false)
    }
  }

  async function handleToggleEnabled(claw: ClawRecord): Promise<void> {
    await setClawEnabled(claw, !claw.enabled)
  }

  async function handleDisableInstead(): Promise<void> {
    if (!clawPendingDelete) {
      return
    }

    await setClawEnabled(clawPendingDelete, false)
    setClawPendingDelete(null)
  }

  async function handleConfirmDelete(): Promise<void> {
    if (!clawPendingDelete) {
      return
    }

    setIsSubmitting(true)
    setErrorMessage(null)

    try {
      await deleteClaw(clawPendingDelete.id)
      invalidateAssistantsCache()
      await refreshPage()
      setClawPendingDelete(null)
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : t('claws.errors.deleteFailed'))
    } finally {
      setIsSubmitting(false)
    }
  }

  async function refreshPairings(assistantId: string): Promise<void> {
    const nextPairings = await listClawPairings(assistantId)
    setPairings(nextPairings.pairings)
  }

  async function refreshChannelAuthState(assistantId: string): Promise<void> {
    const nextAuthState = await getClawChannelAuthState(assistantId)
    setChannelAuthState(nextAuthState)

    if (nextAuthState.status === 'connected') {
      const refreshKey = `${assistantId}:${nextAuthState.updatedAt}`
      if (connectedAuthRefreshKeyRef.current !== refreshKey) {
        connectedAuthRefreshKeyRef.current = refreshKey
        await refreshPage()
      }
    }
  }

  async function handleOpenPairings(claw: ClawRecord): Promise<void> {
    const channelType = claw.channel?.type ?? null
    const shouldLoadPairings = channelType === 'telegram' || channelType === 'whatsapp'
    const shouldLoadAuth = channelType === 'whatsapp' || channelType === 'wechat'

    setPairingsClaw(claw)
    setPairings([])
    setChannelAuthState(null)
    setPairingsErrorMessage(null)
    connectedAuthRefreshKeyRef.current = null
    setIsPairingsLoading(shouldLoadPairings)
    setIsChannelAuthLoading(shouldLoadAuth)

    try {
      await Promise.all([
        shouldLoadPairings ? refreshPairings(claw.id) : Promise.resolve(),
        shouldLoadAuth ? refreshChannelAuthState(claw.id) : Promise.resolve()
      ])
    } catch (error) {
      setPairingsErrorMessage(
        error instanceof Error ? error.message : t('claws.pairings.errors.loadFailed')
      )
    } finally {
      setIsPairingsLoading(false)
      setIsChannelAuthLoading(false)
    }
  }

  async function handlePairingAction(
    action: (assistantId: string, pairingId: string) => Promise<unknown>,
    pairingId: string
  ): Promise<void> {
    if (!pairingsClaw) {
      return
    }

    setIsPairingsSubmitting(true)
    setPairingsErrorMessage(null)

    try {
      await action(pairingsClaw.id, pairingId)
      await Promise.all([
        refreshPairings(pairingsClaw.id),
        pairingsClaw.channel?.type === 'whatsapp'
          ? refreshChannelAuthState(pairingsClaw.id)
          : Promise.resolve(),
        refreshPage()
      ])
    } catch (error) {
      setPairingsErrorMessage(
        error instanceof Error ? error.message : t('claws.pairings.errors.updateFailed')
      )
    } finally {
      setIsPairingsSubmitting(false)
    }
  }

  useEffect(() => {
    if (
      !pairingsClaw ||
      (pairingsClaw.channel?.type !== 'whatsapp' && pairingsClaw.channel?.type !== 'wechat')
    ) {
      return
    }

    if (channelAuthState?.status === 'connected') {
      return
    }

    const intervalId = window.setInterval(() => {
      void refreshChannelAuthState(pairingsClaw.id).catch((error) => {
        setPairingsErrorMessage(
          error instanceof Error ? error.message : t('claws.pairings.errors.loadFailed')
        )
      })
    }, 5000)

    return () => {
      window.clearInterval(intervalId)
    }
  }, [channelAuthState?.status, pairingsClaw, t])

  function openCreateDialog(path: AssistantCreatePath = 'external-acp'): void {
    setEditingClaw(null)
    setDialogCreatePath(path)
    setSelectedChannelId('')
    setErrorMessage(null)
    setIsDialogOpen(true)
  }

  function openEditDialog(claw: ClawRecord): void {
    setEditingClaw(claw)
    setDialogCreatePath('external-acp')
    setSelectedChannelId(claw.channel?.id ?? '')
    setErrorMessage(null)
    setIsDialogOpen(true)
  }

  return (
    <section
      data-claws-page-shell="true"
      className={
        isSettingsSurface
          ? 'min-h-0 overflow-y-auto bg-transparent py-4'
          : 'min-h-0 h-[calc(100vh-3.5rem)] overflow-y-auto bg-transparent px-6 py-6'
      }
    >
      <div className={isSettingsSurface ? 'flex w-full flex-col gap-6' : 'mx-auto flex w-full max-w-6xl flex-col gap-6'}>
        <div
          className={
            isSettingsSurface
              ? 'flex flex-wrap items-end justify-between gap-4'
              : 'flex flex-wrap items-end justify-between gap-4 rounded-[1.75rem] border border-[color:var(--surface-border)] bg-[color:var(--surface-panel)] px-6 py-6 shadow-[0_24px_70px_-52px_rgba(15,23,42,0.55)]'
          }
        >
          <div className="space-y-1">
            <p className="text-muted-foreground text-xs tracking-[0.18em] uppercase">
              {isSettingsSurface ? 'Agent Setup' : t('claws.eyebrow')}
            </p>
            <h1 className="text-3xl font-semibold tracking-[-0.03em]">
              {isSettingsSurface ? 'Agents & Channels' : t('claws.title')}
            </h1>
            <p className="max-w-2xl text-sm text-muted-foreground">
              {isSettingsSurface
                ? 'Manage ACP agents, keep custom TIA harnesses available, and attach channels only when you need them.'
                : t('claws.telegram.description')}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              className="rounded-full px-5"
              onClick={() => openCreateDialog('external-acp')}
            >
              <Plus className="size-4" />
              <span>{t('claws.newButton')}</span>
            </Button>
            <Button
              type="button"
              variant="outline"
              className="rounded-full px-5"
              onClick={() => openCreateDialog('tia')}
            >
              <span>{createTiaEntryLabel}</span>
            </Button>
          </div>
        </div>

        {!hasAnyClaw ? (
          <Card className="shadow-none">
            <CardHeader>
              <CardTitle>{t('claws.empty.title')}</CardTitle>
              <CardDescription>{t('claws.telegram.emptyDescription')}</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-wrap items-center justify-between gap-4">
              <div className="text-muted-foreground flex items-center gap-2 text-sm">
                <Bot className="size-4" />
                <span>{t('claws.empty.note')}</span>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Button type="button" onClick={() => openCreateDialog('external-acp')}>
                  {t('claws.empty.createButton')}
                </Button>
                <Button type="button" variant="outline" onClick={() => openCreateDialog('tia')}>
                  {createTiaEmptyLabel}
                </Button>
              </div>
            </CardContent>
          </Card>
        ) : null}

        {errorMessage ? <p className="text-sm text-destructive">{errorMessage}</p> : null}

        <div className={isSettingsSurface ? 'grid auto-rows-fr gap-4' : 'grid auto-rows-fr gap-4 xl:grid-cols-2'}>
          {data.claws.map((claw, index) => (
            <ClawCard
              key={claw.id}
              claw={claw}
              providerLabel={providerLabel(claw.providerId)}
              isSubmitting={isSubmitting || isPairingsSubmitting}
              featured={!isSettingsSurface && index === 0 && data.claws.length > 1}
              onToggleEnabled={() => void handleToggleEnabled(claw)}
              onEdit={() => openEditDialog(claw)}
              onDelete={() => setClawPendingDelete(claw)}
              onManagePairings={() => void handleOpenPairings(claw)}
              onViewHeartbeat={() => setHeartbeatMonitorClaw(claw)}
              onViewCron={() => setCronMonitorClaw(claw)}
            />
          ))}
        </div>

        <AssistantManagementDialog
          isOpen={isDialogOpen}
          mode={editingClaw ? 'edit' : 'create'}
          assistant={editingAssistant}
          providers={providers}
          mcpServers={mcpServers}
          initialCreatePath={dialogCreatePath}
          channels={{
            currentAssistantId: editingClaw?.id ?? null,
            channels: data.configuredChannels,
            selectedChannelId,
            isMutating: isSubmitting,
            errorMessage,
            onSelectedChannelChange: setSelectedChannelId,
            onCreateChannel: handleCreateChannel,
            onUpdateChannel: handleUpdateChannel,
            onRecoverChannel: handleRecoverChannel,
            onDeleteChannel: handleDeleteChannel
          }}
          channelSetupAction={
            editingClaw && supportsChannelAccess(editingClaw.channel?.type)
              ? {
                  label:
                    editingClaw.channel?.type === 'wechat'
                      ? t('claws.wechat.manageSetupButton')
                      : t('claws.telegram.managePairingsButton'),
                  onOpen: () => {
                    if (isSubmitting) {
                      return
                    }

                    setIsDialogOpen(false)
                    setEditingClaw(null)
                    setSelectedChannelId('')
                    void handleOpenPairings(editingClaw)
                  }
                }
              : null
          }
          isSaving={isSubmitting}
          errorMessage={errorMessage}
          onClose={() => {
            if (isSubmitting) {
              return
            }

            setIsDialogOpen(false)
            setEditingClaw(null)
            setSelectedChannelId('')
          }}
          onSubmit={handleDialogSubmit}
          onSelectWorkspacePath={() => window.tiaDesktop.pickDirectory()}
        />

        <ClawPairingsDialog
          isOpen={pairingsClaw !== null}
          clawName={pairingsClaw?.name ?? t('claws.telegram.defaultClawName')}
          channelType={pairingsClaw?.channel?.type ?? null}
          pairings={pairings}
          isLoading={isPairingsLoading}
          channelAuthState={channelAuthState}
          isChannelAuthLoading={isChannelAuthLoading}
          isSubmitting={isPairingsSubmitting}
          errorMessage={pairingsErrorMessage}
          onClose={() => {
            if (isPairingsSubmitting) {
              return
            }

            setPairingsClaw(null)
            setPairings([])
            setChannelAuthState(null)
            setIsChannelAuthLoading(false)
            setPairingsErrorMessage(null)
          }}
          onRecoverSetup={() => {
            const channelId = pairingsClaw?.channel?.id
            if (!channelId || isPairingsSubmitting) {
              return
            }

            void (async () => {
              setIsPairingsSubmitting(true)
              setPairingsErrorMessage(null)

              try {
                await handleRecoverChannel(channelId)
                if (!pairingsClaw) {
                  return
                }

                await Promise.all([
                  pairingsClaw.channel?.type === 'telegram' || pairingsClaw.channel?.type === 'whatsapp'
                    ? refreshPairings(pairingsClaw.id)
                    : Promise.resolve(),
                  pairingsClaw.channel?.type === 'whatsapp' || pairingsClaw.channel?.type === 'wechat'
                    ? refreshChannelAuthState(pairingsClaw.id)
                    : Promise.resolve(),
                  refreshPage()
                ])
              } catch (error) {
                setPairingsErrorMessage(
                  error instanceof Error ? error.message : t('claws.pairings.errors.updateFailed')
                )
              } finally {
                setIsPairingsSubmitting(false)
              }
            })()
          }}
          onApprove={(pairingId) => handlePairingAction(approveClawPairing, pairingId)}
          onReject={(pairingId) => handlePairingAction(rejectClawPairing, pairingId)}
          onRevoke={(pairingId) => handlePairingAction(revokeClawPairing, pairingId)}
        />

        <ClawHeartbeatMonitorDialog
          isOpen={heartbeatMonitorClaw !== null}
          assistantId={heartbeatMonitorClaw?.id ?? null}
          assistantName={heartbeatMonitorClaw?.name ?? ''}
          onClose={() => setHeartbeatMonitorClaw(null)}
        />

        <ClawCronMonitorDialog
          isOpen={cronMonitorClaw !== null}
          assistantId={cronMonitorClaw?.id ?? null}
          assistantName={cronMonitorClaw?.name ?? ''}
          onClose={() => setCronMonitorClaw(null)}
        />

        <Dialog
          open={clawPendingDelete !== null}
          onOpenChange={(open) => {
            if (!open && !isSubmitting) {
              setClawPendingDelete(null)
            }
          }}
        >
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>
                {t('claws.deleteDialog.title', {
                  name: clawPendingDelete?.name.trim().length
                    ? clawPendingDelete.name.trim()
                    : t('claws.card.deleteConfirmFallbackLabel')
                })}
              </DialogTitle>
              <DialogDescription>{t('claws.deleteDialog.description')}</DialogDescription>
            </DialogHeader>

            <DialogFooter>
              <Button
                id="claw-delete-dialog-cancel"
                type="button"
                variant="outline"
                disabled={isSubmitting}
                onClick={() => setClawPendingDelete(null)}
              >
                {t('claws.deleteDialog.actions.cancel')}
              </Button>
              <Button
                id="claw-delete-dialog-disable"
                type="button"
                variant="outline"
                disabled={isSubmitting || clawPendingDelete?.enabled === false}
                onClick={() => void handleDisableInstead()}
              >
                {t('claws.deleteDialog.actions.disable')}
              </Button>
              <Button
                id="claw-delete-dialog-confirm"
                type="button"
                disabled={isSubmitting}
                onClick={() => void handleConfirmDelete()}
              >
                {t('claws.deleteDialog.actions.confirmDelete')}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </section>
  )
}
