import { ArrowUpRight, Bot, MessageCircleMore, Sparkles } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Card, CardContent, CardHeader, CardTitle } from '../../../components/ui/card'
import { Button } from '../../../components/ui/button'

export function AgentsSettingsPage(): React.JSX.Element {
  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-1 py-2">
      <section className="rounded-[2rem] border border-[color:var(--surface-border)] bg-[color:var(--surface-panel)] p-6 shadow-[0_24px_60px_-44px_rgba(15,23,42,0.72)]">
        <p className="text-muted-foreground text-[11px] uppercase tracking-[0.22em]">
          Agents
        </p>
        <h1 className="mt-3 text-3xl font-semibold tracking-[-0.04em] text-foreground">
          ACP agents now live in the workspace selector
        </h1>
        <p className="mt-3 max-w-3xl text-sm leading-7 text-muted-foreground">
          Installed ACP tools such as Codex, Claude, Gemini, Qwen Code, and OpenClaw appear in
          the Agents workspace automatically when they exist on your machine. Select an agent there
          and send the first message to create the thread directly.
        </p>
        <div className="mt-5 flex flex-wrap gap-3">
          <Button asChild className="rounded-full px-5">
            <Link to="/agents">
              Open Agents Workspace
              <ArrowUpRight className="size-4" />
            </Link>
          </Button>
          <Button asChild variant="outline" className="rounded-full px-5">
            <Link to="/settings/channels">Open Channels</Link>
          </Button>
          <Button asChild variant="outline" className="rounded-full px-5">
            <Link
              to="/claws"
              state={{
                assistantDialog: 'create',
                assistantCreatePath: 'tia'
              }}
            >
              Create TIA Agent
            </Link>
          </Button>
        </div>
      </section>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="rounded-[1.5rem] border-[color:var(--surface-border)] bg-[color:var(--surface-panel)]">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Bot className="size-4" />
              ACP-first
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm leading-7 text-muted-foreground">
            No basic ACP setup wizard is required anymore. If the local command exists, it can be
            selected and used from the Agents workspace.
          </CardContent>
        </Card>

        <Card className="rounded-[1.5rem] border-[color:var(--surface-border)] bg-[color:var(--surface-panel)]">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <MessageCircleMore className="size-4" />
              Channels
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm leading-7 text-muted-foreground">
            Channel configuration is managed from Channels settings. It no longer blocks everyday
            ACP chat setup.
          </CardContent>
        </Card>

        <Card className="rounded-[1.5rem] border-[color:var(--surface-border)] bg-[color:var(--surface-panel)]">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Sparkles className="size-4" />
              TIA advanced flow
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm leading-7 text-muted-foreground">
            The longer assistant editor is reserved for TIA-native agents when you want workspace
            automation, coding helpers, MCP, or other advanced studio features.
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
