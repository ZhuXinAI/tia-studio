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
import type { ProviderRecord } from '../../settings/providers/providers-query'
import type { AvailableClawChannelRecord, ClawRecord, SaveClawInput } from '../claws-query'

type ChannelAction = 'create' | 'attach' | 'keep' | 'detach'

type ClawEditorDialogProps = {
  isOpen: boolean
  claw: ClawRecord | null
  providers: ProviderRecord[]
  availableChannels: AvailableClawChannelRecord[]
  isSubmitting: boolean
  onClose: () => void
  onSubmit: (input: SaveClawInput) => Promise<void> | void
}

function getInitialChannelAction(claw: ClawRecord | null): ChannelAction {
  if (!claw) {
    return 'create'
  }

  return claw.channel ? 'keep' : 'create'
}

export function ClawEditorDialog({
  isOpen,
  claw,
  providers,
  availableChannels,
  isSubmitting,
  onClose,
  onSubmit
}: ClawEditorDialogProps): React.JSX.Element {
  const [name, setName] = useState(claw?.name ?? '')
  const [providerId, setProviderId] = useState(claw?.providerId ?? '')
  const [instructions, setInstructions] = useState(claw?.instructions ?? '')
  const [enabled, setEnabled] = useState(claw?.enabled ?? true)
  const [channelAction, setChannelAction] = useState<ChannelAction>(() => getInitialChannelAction(claw))
  const [existingChannelId, setExistingChannelId] = useState(availableChannels[0]?.id ?? '')
  const [channelName, setChannelName] = useState(claw?.channel?.name ?? '')
  const [appId, setAppId] = useState('')
  const [appSecret, setAppSecret] = useState('')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  useEffect(() => {
    setName(claw?.name ?? '')
    setProviderId(claw?.providerId ?? '')
    setInstructions(claw?.instructions ?? '')
    setEnabled(claw?.enabled ?? true)
    setChannelAction(getInitialChannelAction(claw))
    setExistingChannelId(availableChannels[0]?.id ?? '')
    setChannelName(claw?.channel?.name ?? '')
    setAppId('')
    setAppSecret('')
    setErrorMessage(null)
  }, [availableChannels, claw, isOpen])

  const dialogTitle = useMemo(() => {
    return claw ? 'Edit Claw' : 'Create Claw'
  }, [claw])

  const submitLabel = claw ? 'Save Claw' : 'Create Claw'

  const canAttachExisting = availableChannels.length > 0

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault()

    if (name.trim().length === 0) {
      setErrorMessage('Assistant name is required')
      return
    }

    if (providerId.trim().length === 0) {
      setErrorMessage('Provider is required')
      return
    }

    let channel: SaveClawInput['channel']

    if (channelAction === 'attach') {
      if (existingChannelId.trim().length === 0) {
        setErrorMessage('Pick a channel to attach')
        return
      }

      channel = {
        mode: 'attach',
        channelId: existingChannelId
      }
    } else if (channelAction === 'create') {
      if (
        channelName.trim().length === 0 ||
        appId.trim().length === 0 ||
        appSecret.trim().length === 0
      ) {
        setErrorMessage('Lark channel name, app ID, and app secret are required')
        return
      }

      channel = {
        mode: 'create',
        type: 'lark',
        name: channelName.trim(),
        appId: appId.trim(),
        appSecret: appSecret.trim()
      }
    } else if (channelAction === 'detach') {
      channel = {
        mode: 'detach'
      }
    } else if (claw?.channel) {
      channel = {
        mode: 'keep'
      }
    }

    await onSubmit({
      assistant: {
        name: name.trim(),
        providerId: providerId.trim(),
        instructions: instructions.trim(),
        enabled
      },
      ...(channel ? { channel } : {})
    })
  }

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>{dialogTitle}</DialogTitle>
          <DialogDescription>
            Connect an assistant to a Lark channel from one lightweight setup flow.
          </DialogDescription>
        </DialogHeader>

        <form className="space-y-4" onSubmit={(event) => void handleSubmit(event)}>
          <div className="grid gap-2">
            <label htmlFor="claw-name" className="text-sm font-medium">
              Assistant Name
            </label>
            <Input id="claw-name" value={name} onChange={(event) => setName(event.target.value)} />
          </div>

          <div className="grid gap-2">
            <label htmlFor="claw-provider" className="text-sm font-medium">
              Provider
            </label>
            <select
              id="claw-provider"
              className="border-input bg-background rounded-md border px-3 py-2 text-sm"
              value={providerId}
              onChange={(event) => setProviderId(event.target.value)}
            >
              <option value="">Select a provider</option>
              {providers.map((provider) => (
                <option key={provider.id} value={provider.id}>
                  {provider.name}
                </option>
              ))}
            </select>
          </div>

          <div className="grid gap-2">
            <label htmlFor="claw-instructions" className="text-sm font-medium">
              Instructions
            </label>
            <Textarea
              id="claw-instructions"
              value={instructions}
              onChange={(event) => setInstructions(event.target.value)}
            />
          </div>

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={enabled}
              onChange={(event) => setEnabled(event.target.checked)}
            />
            <span>Enable this claw after saving</span>
          </label>

          {claw ? (
            <div className="grid gap-2">
              <label htmlFor="claw-channel-action" className="text-sm font-medium">
                Channel Action
              </label>
              <select
                id="claw-channel-action"
                className="border-input bg-background rounded-md border px-3 py-2 text-sm"
                value={channelAction}
                onChange={(event) => setChannelAction(event.target.value as ChannelAction)}
              >
                {claw.channel ? <option value="keep">Keep current channel</option> : null}
                <option value="create">Create new Lark channel</option>
                {canAttachExisting ? <option value="attach">Attach existing channel</option> : null}
                {claw.channel ? <option value="detach">Detach current channel</option> : null}
              </select>
            </div>
          ) : null}

          {channelAction === 'attach' ? (
            <div className="grid gap-2">
              <label htmlFor="claw-existing-channel" className="text-sm font-medium">
                Existing Channel
              </label>
              <select
                id="claw-existing-channel"
                className="border-input bg-background rounded-md border px-3 py-2 text-sm"
                value={existingChannelId}
                onChange={(event) => setExistingChannelId(event.target.value)}
              >
                <option value="">Select a channel</option>
                {availableChannels.map((channel) => (
                  <option key={channel.id} value={channel.id}>
                    {channel.name}
                  </option>
                ))}
              </select>
            </div>
          ) : null}

          {channelAction === 'create' ? (
            <>
              <div className="grid gap-2">
                <label htmlFor="claw-channel-name" className="text-sm font-medium">
                  Lark Channel Name
                </label>
                <Input
                  id="claw-channel-name"
                  value={channelName}
                  onChange={(event) => setChannelName(event.target.value)}
                />
              </div>

              <div className="grid gap-2 sm:grid-cols-2">
                <div className="grid gap-2">
                  <label htmlFor="claw-channel-app-id" className="text-sm font-medium">
                    App ID
                  </label>
                  <Input
                    id="claw-channel-app-id"
                    value={appId}
                    onChange={(event) => setAppId(event.target.value)}
                  />
                </div>

                <div className="grid gap-2">
                  <label htmlFor="claw-channel-app-secret" className="text-sm font-medium">
                    App Secret
                  </label>
                  <Input
                    id="claw-channel-app-secret"
                    type="password"
                    value={appSecret}
                    onChange={(event) => setAppSecret(event.target.value)}
                  />
                </div>
              </div>
            </>
          ) : null}

          {errorMessage ? <p className="text-sm text-destructive">{errorMessage}</p> : null}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={isSubmitting}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {submitLabel}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
