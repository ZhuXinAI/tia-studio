import { Clock3, Folder, MessageSquare } from 'lucide-react'
import { NavLink } from 'react-router-dom'
import { Button } from '../../../components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from '../../../components/ui/card'
import { useWorkspaces } from '../../workspaces/workspaces-query'

export function AutomationsPage(): React.JSX.Element {
  const { data: workspaces = [], isLoading } = useWorkspaces()
  const namedWorkspaces = workspaces.filter((workspace) => workspace.builtInKind !== 'chats')

  return (
    <section className="flex h-full min-h-0 flex-col gap-6 overflow-auto p-8">
      <header className="space-y-3 border-b border-[color:var(--surface-border)] pb-5">
        <p className="section-kicker">Scheduled work</p>
        <h1 className="font-editorial text-[2.9rem] leading-none tracking-[-0.045em]">
          Time-based workspace runs
        </h1>
        <p className="max-w-3xl text-sm text-muted-foreground">
          Automations stay limited to named workspaces. Each scheduled run will create a real new
          thread, while the built-in Chats workspace remains manual only.
        </p>
      </header>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
        <Card className="border-[color:var(--surface-border)] bg-[linear-gradient(180deg,color-mix(in_srgb,var(--surface-paper)_96%,transparent),color-mix(in_srgb,var(--surface-panel)_78%,transparent))]">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 font-editorial text-[1.7rem] leading-none tracking-[-0.03em]">
              <Clock3 className="size-5" />
              <span>Current scope</span>
            </CardTitle>
            <CardDescription>
              This page is reserved for scheduled workspace runs. The builder and schedule editor
              land next.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-muted-foreground">
            <p>Automations are time-based only.</p>
            <p>Each automation creates a normal thread instead of hidden background state.</p>
            <p>
              Chats is excluded on purpose so automations stay attached to explicit workspace
              folders.
            </p>
          </CardContent>
        </Card>

        <Card className="border-[color:var(--surface-border)] bg-[color:var(--surface-panel-soft)] shadow-none">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 font-editorial text-[1.55rem] leading-none tracking-[-0.03em]">
              <MessageSquare className="size-5" />
              <span>Built-in Chats</span>
            </CardTitle>
            <CardDescription>
              Chats remains the always-available workspace for ad-hoc and channel-originated
              conversations.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Scheduled runs are intentionally disabled here so automation ownership stays
              workspace-first.
            </p>
          </CardContent>
        </Card>
      </div>

      <Card className="border-[color:var(--surface-border)] bg-[color:var(--surface-panel-soft)] shadow-none">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 font-editorial text-[1.6rem] leading-none tracking-[-0.03em]">
            <Folder className="size-5" />
            <span>Named workspaces</span>
          </CardTitle>
          <CardDescription>
            These workspaces are the first candidates for scheduled runs once the automation builder
            is wired up.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {isLoading ? (
            <p className="text-sm text-muted-foreground">Loading workspaces...</p>
          ) : null}

          {!isLoading && namedWorkspaces.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Create a named workspace from the left rail to unlock automations here.
            </p>
          ) : null}

          {!isLoading && namedWorkspaces.length > 0 ? (
            <div className="grid gap-3 md:grid-cols-2">
              {namedWorkspaces.map((workspace) => (
                <div
                  key={workspace.id}
                  className="rounded-[1rem] border border-[color:var(--surface-border)] bg-[color:var(--surface-paper)] px-4 py-3 shadow-[inset_0_1px_0_color-mix(in_srgb,var(--surface-paper)_46%,transparent)]"
                >
                  <p className="font-editorial text-[1.2rem] leading-none">{workspace.name}</p>
                  <code className="mt-2 block rounded-md bg-[color:var(--surface-muted)] px-2 py-1 text-[11px] leading-relaxed">
                    {workspace.rootPath}
                  </code>
                  <Button asChild variant="outline" size="sm" className="mt-3">
                    <NavLink to={`/workspaces/${workspace.id}`}>Open workspace</NavLink>
                  </Button>
                </div>
              ))}
            </div>
          ) : null}
        </CardContent>
      </Card>
    </section>
  )
}
