import { ExternalLink, MessageCircleMore } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { listAssistants, type AssistantRecord } from '../../assistants/assistants-query'
import { Button } from '../../../components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from '../../../components/ui/card'
import { Input } from '../../../components/ui/input'
import { Label } from '../../../components/ui/label'
import { Switch } from '../../../components/ui/switch'
import {
  getChannelsSettings,
  updateChannelsSettings,
  type ChannelsSettings
} from '../channels/channels-query'

const larkSetupGuideUrl = 'https://open.larksuite.com/document/home/index'

type ChannelFormState = {
  enabled: boolean
  name: string
  assistantId: string
  appId: string
  appSecret: string
  status: 'disconnected' | 'connected' | 'error'
  errorMessage: string | null
}

function toErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    const message = error.message.trim()
    if (message.length > 0) {
      return message
    }
  }

  return 'Unexpected request error'
}

function toFormState(settings: ChannelsSettings): ChannelFormState {
  return {
    enabled: settings.lark.enabled,
    name: settings.lark.name,
    assistantId: settings.lark.assistantId ?? '',
    appId: settings.lark.appId,
    appSecret: settings.lark.appSecret,
    status: settings.lark.status,
    errorMessage: settings.lark.errorMessage
  }
}

const initialState: ChannelFormState = {
  enabled: false,
  name: 'Lark',
  assistantId: '',
  appId: '',
  appSecret: '',
  status: 'disconnected',
  errorMessage: null
}

export function ChannelsSettingsPage(): React.JSX.Element {
  const [assistants, setAssistants] = useState<AssistantRecord[]>([])
  const [formState, setFormState] = useState<ChannelFormState>(initialState)
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)

  const loadData = useCallback(async () => {
    setIsLoading(true)

    try {
      const [settings, assistantsList] = await Promise.all([getChannelsSettings(), listAssistants()])
      setFormState(toFormState(settings))
      setAssistants(assistantsList)
    } catch (error) {
      toast.error(toErrorMessage(error))
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadData()
  }, [loadData])

  const handleSave = async (): Promise<void> => {
    setIsSaving(true)

    try {
      const nextSettings = await updateChannelsSettings({
        lark: {
          enabled: formState.enabled,
          name: formState.name,
          assistantId: formState.assistantId,
          appId: formState.appId,
          appSecret: formState.appSecret
        }
      })
      setFormState(toFormState(nextSettings))
      toast.success('Lark channel settings saved.')
    } catch (error) {
      toast.error(toErrorMessage(error))
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div className="py-4 flex flex-col gap-4 space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Channels</h1>
        <p className="text-muted-foreground text-sm">
          Configure external channels and route them into one assistant thread history.
        </p>
      </header>

      <Card className="border-border/70 bg-card/80 backdrop-blur-sm">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MessageCircleMore className="size-5" />
            <span>Lark</span>
          </CardTitle>
          <CardDescription>
            Connect a Lark bot, bind it to one assistant, and keep replies in normal TIA history.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex items-center justify-between gap-4 rounded-lg border border-border/60 p-4">
            <div className="space-y-1">
              <Label htmlFor="lark-enabled">Enable Lark channel</Label>
              <p className="text-sm text-muted-foreground">
                Status: {formState.status}
                {formState.errorMessage ? ` · ${formState.errorMessage}` : ''}
              </p>
            </div>
            <Switch
              id="lark-enabled"
              aria-label="Enable Lark channel"
              checked={formState.enabled}
              disabled={isLoading || isSaving}
              onCheckedChange={(checked) => {
                setFormState((current) => ({
                  ...current,
                  enabled: checked
                }))
              }}
            />
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="lark-name">Display Name</Label>
              <Input
                id="lark-name"
                value={formState.name}
                disabled={isLoading || isSaving}
                onChange={(event) => {
                  setFormState((current) => ({
                    ...current,
                    name: event.target.value
                  }))
                }}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="lark-assistant">Assistant</Label>
              <select
                id="lark-assistant"
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm"
                value={formState.assistantId}
                disabled={isLoading || isSaving}
                onChange={(event) => {
                  setFormState((current) => ({
                    ...current,
                    assistantId: event.target.value
                  }))
                }}
              >
                <option value="">Select an assistant</option>
                {assistants.map((assistant) => (
                  <option key={assistant.id} value={assistant.id}>
                    {assistant.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="lark-app-id">App ID</Label>
              <Input
                id="lark-app-id"
                value={formState.appId}
                disabled={isLoading || isSaving}
                onChange={(event) => {
                  setFormState((current) => ({
                    ...current,
                    appId: event.target.value
                  }))
                }}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="lark-app-secret">App Secret</Label>
              <Input
                id="lark-app-secret"
                type="password"
                value={formState.appSecret}
                disabled={isLoading || isSaving}
                onChange={(event) => {
                  setFormState((current) => ({
                    ...current,
                    appSecret: event.target.value
                  }))
                }}
              />
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Button type="button" disabled={isLoading || isSaving} onClick={() => void handleSave()}>
              {isSaving ? 'Saving…' : 'Save'}
            </Button>
            <a
              href={larkSetupGuideUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-2 text-sm text-primary underline-offset-4 hover:underline"
            >
              <ExternalLink className="size-4" />
              <span>Open Lark setup guide</span>
            </a>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
