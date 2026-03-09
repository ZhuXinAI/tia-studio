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
import type { ProviderRecord } from '../../settings/providers/providers-query'
import { listProviders } from '../../settings/providers/providers-query'
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

function providerLabel(providerId: string | null, providers: ProviderRecord[]): string {
  if (!providerId) {
    return 'No provider selected'
  }

  return providers.find((provider) => provider.id === providerId)?.name ?? 'Unknown provider'
}

export function ClawsPage(): React.JSX.Element {
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
      setErrorMessage(error instanceof Error ? error.message : 'Failed to load claws')
    })
  }, [])

  const hasConnectedClaw = useMemo(() => {
    return data.claws.some((claw) => claw.channel !== null)
  }, [data.claws])

  async function handleDialogSubmit(input: SaveClawInput): Promise<void> {
    setIsSubmitting(true)
    setErrorMessage(null)

    try {
      if (editingClaw) {
        await updateClaw(editingClaw.id, input)
      } else {
        await createClaw(input)
      }

      await refreshPage()
      setIsDialogOpen(false)
      setEditingClaw(null)
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Failed to save claw')
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
      await refreshPage()
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Failed to update claw')
    } finally {
      setIsSubmitting(false)
    }
  }

  async function handleDelete(claw: ClawRecord): Promise<void> {
    setIsSubmitting(true)
    setErrorMessage(null)

    try {
      await deleteClaw(claw.id)
      await refreshPage()
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Failed to delete claw')
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
      setPairingsErrorMessage(error instanceof Error ? error.message : 'Failed to load pairings')
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
      setPairingsErrorMessage(error instanceof Error ? error.message : 'Failed to update pairing')
    } finally {
      setIsPairingsSubmitting(false)
    }
  }

  return (
    <section className="min-h-full bg-muted/20 px-6 py-6">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
        <div className="flex items-center justify-between gap-4">
          <div className="space-y-1">
            <p className="text-muted-foreground text-xs tracking-[0.18em] uppercase">Claws</p>
            <h1 className="text-3xl font-semibold">Claws</h1>
            <p className="text-muted-foreground text-sm">
              Connect assistants to external Telegram or Lark channels without digging through raw
              settings.
            </p>
          </div>

          <Button
            type="button"
            onClick={() => {
              setEditingClaw(null)
              setIsDialogOpen(true)
            }}
          >
            <Plus className="size-4" />
            <span>New Claw</span>
          </Button>
        </div>

        {!hasConnectedClaw ? (
          <Card>
            <CardHeader>
              <CardTitle>Set up your first claw</CardTitle>
              <CardDescription>
                Start with one assistant, one provider, and one Telegram or Lark channel for the
                quickest onboarding path.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-wrap items-center justify-between gap-4">
              <div className="text-muted-foreground flex items-center gap-2 text-sm">
                <Bot className="size-4" />
                <span>Assistant identity, heartbeat, and future cron stay assistant-owned.</span>
              </div>
              <Button
                type="button"
                onClick={() => {
                  setEditingClaw(null)
                  setIsDialogOpen(true)
                }}
              >
                Create Your First Claw
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
                <CardDescription>{providerLabel(claw.providerId, providers)}</CardDescription>
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
                          {claw.channel.pairedCount ?? 0} paired ·{' '}
                          {claw.channel.pendingPairingCount ?? 0} pending
                        </p>
                      ) : null}
                    </div>
                  ) : (
                    <span className="text-muted-foreground">No channel connected</span>
                  )}
                </div>

                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    disabled={isSubmitting}
                    onClick={() => void handleToggleEnabled(claw)}
                  >
                    {claw.enabled ? 'Disable' : 'Enable'}
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
                    Edit
                  </Button>
                  {claw.channel?.type === 'telegram' ? (
                    <Button
                      type="button"
                      variant="outline"
                      disabled={isSubmitting || isPairingsSubmitting}
                      onClick={() => void handleOpenPairings(claw)}
                    >
                      Manage Pairings
                    </Button>
                  ) : null}
                  <Button
                    type="button"
                    variant="outline"
                    disabled={isSubmitting}
                    onClick={() => void handleDelete(claw)}
                  >
                    Delete
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
          clawName={pairingsClaw?.name ?? 'Telegram claw'}
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
