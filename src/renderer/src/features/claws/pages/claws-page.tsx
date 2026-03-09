import { useEffect, useMemo, useState } from 'react'
import { Bot, Link2, Plus } from 'lucide-react'
import { Button } from '../../../components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from '../../../components/ui/card'
import { useTranslation } from '../../../i18n/use-app-translation'
import { queryClient } from '../../../lib/query-client'
import type { ProviderRecord } from '../../settings/providers/providers-query'
import { listProviders } from '../../settings/providers/providers-query'
import { assistantKeys } from '../../assistants/assistants-query'
import {
  approveClawPairing,
  createClaw,
  deleteClaw,
  listClawPairings,
  listClaws,
  rejectClawPairing,
  revokeClawPairing,
  updateClaw,
  type ClawPairingRecord,
  type ClawRecord,
  type ClawsResponse,
  type SaveClawInput
} from '../claws-query'
import { ClawEditorDialog } from '../components/claw-editor-dialog'
import { ClawPairingsDialog } from '../components/claw-pairings-dialog'

function emptyClawsResponse(): ClawsResponse {
  return {
    claws: [],
    availableChannels: []
  }
}

function upsertClaw(claws: ClawRecord[], savedClaw: ClawRecord): ClawRecord[] {
  const existingIndex = claws.findIndex((claw) => claw.id === savedClaw.id)

  if (existingIndex === -1) {
    return [...claws, savedClaw]
  }

  return claws.map((claw) => (claw.id === savedClaw.id ? savedClaw : claw))
}

function invalidateAssistantsCache(): void {
  void queryClient.invalidateQueries({ queryKey: assistantKeys.lists() })
}

export function ClawsPage(): React.JSX.Element {
  const { t } = useTranslation()
  const [data, setData] = useState<ClawsResponse>(emptyClawsResponse)
  const [providers, setProviders] = useState<ProviderRecord[]>([])
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [editingClaw, setEditingClaw] = useState<ClawRecord | null>(null)
  const [pairingsClaw, setPairingsClaw] = useState<ClawRecord | null>(null)
  const [pairings, setPairings] = useState<ClawPairingRecord[]>([])
  const [isPairingsLoading, setIsPairingsLoading] = useState(false)
  const [isPairingsSubmitting, setIsPairingsSubmitting] = useState(false)
  const [pairingsErrorMessage, setPairingsErrorMessage] = useState<string | null>(null)

  async function refreshPage(): Promise<void> {
    const [nextClaws, nextProviders] = await Promise.all([listClaws(), listProviders()])
    setData(nextClaws)
    setProviders(nextProviders.filter((provider) => provider.enabled))
  }

  useEffect(() => {
    void refreshPage().catch((error) => {
      setErrorMessage(error instanceof Error ? error.message : t('claws.errors.loadFailed'))
    })
  }, [t])

  const hasConnectedClaw = useMemo(() => {
    return data.claws.some((claw) => claw.channel !== null)
  }, [data.claws])

  function providerLabel(providerId: string | null): string {
    if (!providerId) {
      return t('claws.providers.noneSelected')
    }

    return (
      providers.find((provider) => provider.id === providerId)?.name ?? t('claws.providers.unknown')
    )
  }

  async function handleDialogSubmit(input: SaveClawInput): Promise<void> {
    setIsSubmitting(true)
    setErrorMessage(null)

    try {
      const savedClaw = editingClaw
        ? await updateClaw(editingClaw.id, input)
        : await createClaw(input)

      setData((current) => ({
        ...current,
        claws: upsertClaw(current.claws, savedClaw)
      }))
      invalidateAssistantsCache()
      setIsDialogOpen(false)
      setEditingClaw(null)

      if (input.channel?.mode === 'create' && input.channel.type === 'telegram') {
        await handleOpenPairings(savedClaw)
      }

      void refreshPage().catch((error) => {
        setErrorMessage(error instanceof Error ? error.message : t('claws.errors.loadFailed'))
      })
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : t('claws.errors.saveFailed'))
    } finally {
      setIsSubmitting(false)
    }
  }

  async function handleToggleEnabled(claw: ClawRecord): Promise<void> {
    setIsSubmitting(true)
    setErrorMessage(null)

    try {
      await updateClaw(claw.id, {
        assistant: {
          enabled: !claw.enabled
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

  async function handleDelete(claw: ClawRecord): Promise<void> {
    setIsSubmitting(true)
    setErrorMessage(null)

    try {
      await deleteClaw(claw.id)
      invalidateAssistantsCache()
      await refreshPage()
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

  async function handleOpenPairings(claw: ClawRecord): Promise<void> {
    setPairingsClaw(claw)
    setPairings([])
    setPairingsErrorMessage(null)
    setIsPairingsLoading(true)

    try {
      await refreshPairings(claw.id)
    } catch (error) {
      setPairingsErrorMessage(
        error instanceof Error ? error.message : t('claws.pairings.errors.loadFailed')
      )
    } finally {
      setIsPairingsLoading(false)
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
      await Promise.all([refreshPairings(pairingsClaw.id), refreshPage()])
    } catch (error) {
      setPairingsErrorMessage(
        error instanceof Error ? error.message : t('claws.pairings.errors.updateFailed')
      )
    } finally {
      setIsPairingsSubmitting(false)
    }
  }

  return (
    <section className="min-h-full bg-muted/20 px-6 py-6">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
        <div className="flex items-center justify-between gap-4">
          <div className="space-y-1">
            <p className="text-muted-foreground text-xs tracking-[0.18em] uppercase">
              {t('claws.eyebrow')}
            </p>
            <h1 className="text-3xl font-semibold">{t('claws.title')}</h1>
            <p className="text-muted-foreground text-sm">{t('claws.telegram.description')}</p>
          </div>

          <Button
            type="button"
            onClick={() => {
              setEditingClaw(null)
              setIsDialogOpen(true)
            }}
          >
            <Plus className="size-4" />
            <span>{t('claws.newButton')}</span>
          </Button>
        </div>

        {!hasConnectedClaw ? (
          <Card>
            <CardHeader>
              <CardTitle>{t('claws.empty.title')}</CardTitle>
              <CardDescription>{t('claws.telegram.emptyDescription')}</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-wrap items-center justify-between gap-4">
              <div className="text-muted-foreground flex items-center gap-2 text-sm">
                <Bot className="size-4" />
                <span>{t('claws.empty.note')}</span>
              </div>
              <Button
                type="button"
                onClick={() => {
                  setEditingClaw(null)
                  setIsDialogOpen(true)
                }}
              >
                {t('claws.empty.createButton')}
              </Button>
            </CardContent>
          </Card>
        ) : null}

        {errorMessage ? <p className="text-sm text-destructive">{errorMessage}</p> : null}

        <div className="grid gap-4 md:grid-cols-2">
          {data.claws.map((claw) => (
            <Card key={claw.id}>
              <CardHeader>
                <CardTitle>{claw.name}</CardTitle>
                <CardDescription>{providerLabel(claw.providerId)}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="text-sm">
                  {claw.channel ? (
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <Link2 className="size-4 text-muted-foreground" />
                        <span>{claw.channel.name}</span>
                        <span className="text-muted-foreground">({claw.channel.status})</span>
                      </div>
                      {claw.channel.type === 'telegram' ? (
                        <p className="text-muted-foreground text-xs">
                          {t('claws.telegram.pairingSummary', {
                            pairedCount: claw.channel.pairedCount ?? 0,
                            pendingCount: claw.channel.pendingPairingCount ?? 0
                          })}
                        </p>
                      ) : null}
                    </div>
                  ) : (
                    <span className="text-muted-foreground">
                      {t('claws.card.noChannelConnected')}
                    </span>
                  )}
                </div>

                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    disabled={isSubmitting}
                    onClick={() => void handleToggleEnabled(claw)}
                  >
                    {claw.enabled ? t('claws.card.disableButton') : t('claws.card.enableButton')}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    disabled={isSubmitting}
                    onClick={() => {
                      setEditingClaw(claw)
                      setIsDialogOpen(true)
                    }}
                  >
                    {t('claws.card.editButton')}
                  </Button>
                  {claw.channel?.type === 'telegram' ? (
                    <Button
                      type="button"
                      variant="outline"
                      disabled={isSubmitting || isPairingsSubmitting}
                      onClick={() => void handleOpenPairings(claw)}
                    >
                      {t('claws.telegram.managePairingsButton')}
                    </Button>
                  ) : null}
                  <Button
                    type="button"
                    variant="outline"
                    disabled={isSubmitting}
                    onClick={() => void handleDelete(claw)}
                  >
                    {t('claws.card.deleteButton')}
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        <ClawEditorDialog
          isOpen={isDialogOpen}
          claw={editingClaw}
          providers={providers}
          availableChannels={data.availableChannels}
          isSubmitting={isSubmitting}
          onClose={() => {
            if (isSubmitting) {
              return
            }

            setIsDialogOpen(false)
            setEditingClaw(null)
          }}
          onSubmit={handleDialogSubmit}
        />

        <ClawPairingsDialog
          isOpen={pairingsClaw !== null}
          clawName={pairingsClaw?.name ?? t('claws.telegram.defaultClawName')}
          pairings={pairings}
          isLoading={isPairingsLoading}
          isSubmitting={isPairingsSubmitting}
          errorMessage={pairingsErrorMessage}
          onClose={() => {
            if (isPairingsSubmitting) {
              return
            }

            setPairingsClaw(null)
            setPairings([])
            setPairingsErrorMessage(null)
          }}
          onApprove={(pairingId) => handlePairingAction(approveClawPairing, pairingId)}
          onReject={(pairingId) => handlePairingAction(rejectClawPairing, pairingId)}
          onRevoke={(pairingId) => handlePairingAction(revokeClawPairing, pairingId)}
        />
      </div>
    </section>
  )
}
