import { FolderCode, Sparkles, Wrench } from 'lucide-react'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from '../../../components/ui/card'
import { RuntimeOnboardingPanel } from '../../settings/runtimes/runtime-onboarding-panel'

const curatedSkillCards = [
  {
    title: 'Agent Browser',
    description:
      'Adds an interactive browser skill for websites, screenshots, login flows, and guided testing.',
    command: 'bunx skills add https://github.com/vercel-labs/agent-browser --skill agent-browser'
  },
  {
    title: 'Find Skills',
    description:
      'Helps TIA discover installable skills when a task needs a capability that is not available yet.',
    command: 'bunx skills add https://github.com/vercel-labs/skills --skill find-skills'
  }
] as const

export function SkillsPage(): React.JSX.Element {
  return (
    <section className="flex h-full min-h-0 flex-col gap-6 overflow-auto p-8">
      <header className="space-y-3 border-b border-[color:var(--surface-border)] pb-5">
        <p className="section-kicker">Reusable capabilities</p>
        <h1 className="font-editorial text-[2.9rem] leading-none tracking-[-0.045em]">
          Curated skill catalog
        </h1>
        <p className="max-w-3xl text-sm text-muted-foreground">
          Start with a small set of trusted skills that improve research, browsing, and workflow
          setup while keeping the workspace-first shell focused.
        </p>
      </header>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)]">
        <Card className="border-[color:var(--surface-border)] bg-[linear-gradient(180deg,color-mix(in_srgb,var(--surface-paper)_96%,transparent),color-mix(in_srgb,var(--surface-panel)_78%,transparent))]">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 font-editorial text-[1.7rem] leading-none tracking-[-0.03em]">
              <Sparkles className="size-5" />
              <span>Recommended now</span>
            </CardTitle>
            <CardDescription>
              These are the first curated skills for the reset. They install globally and become
              available across the app.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {curatedSkillCards.map((skill) => (
              <div
                key={skill.title}
                className="rounded-[1rem] border border-[color:var(--surface-border)] bg-[color:var(--surface-paper)] px-4 py-3 shadow-[inset_0_1px_0_color-mix(in_srgb,var(--surface-paper)_46%,transparent)]"
              >
                <p className="font-editorial text-[1.2rem] leading-none">{skill.title}</p>
                <p className="pt-1 text-sm text-muted-foreground">{skill.description}</p>
                <code className="mt-3 block rounded-md bg-[color:var(--surface-muted)] px-2 py-1 text-[11px] leading-relaxed">
                  {skill.command}
                </code>
              </div>
            ))}
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card className="border-[color:var(--surface-border)] bg-[color:var(--surface-panel-soft)] shadow-none">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 font-editorial text-[1.45rem] leading-none tracking-[-0.03em]">
                <FolderCode className="size-5" />
                <span>Workspace-local skills</span>
              </CardTitle>
              <CardDescription>
                Folder-backed workspaces can keep their own `./skills` directories close to project
                code while the global catalog stays shared.
              </CardDescription>
            </CardHeader>
          </Card>

          <Card className="border-[color:var(--surface-border)] bg-[color:var(--surface-panel-soft)] shadow-none">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 font-editorial text-[1.45rem] leading-none tracking-[-0.03em]">
                <Wrench className="size-5" />
                <span>Install readiness</span>
              </CardTitle>
              <CardDescription>
                Install `bun` first if this machine is not ready for managed skill installs yet. The
                guided installer below keeps this flow inside Skills instead of exposing a separate
                runtime settings page.
              </CardDescription>
            </CardHeader>
          </Card>
        </div>
      </div>

      <Card className="border-[color:var(--surface-border)] bg-[color:var(--surface-panel-soft)] shadow-none">
        <CardHeader>
          <CardTitle className="font-editorial text-[1.5rem] leading-none tracking-[-0.03em]">
            Install recommended skills
          </CardTitle>
          <CardDescription>
            This uses the existing managed runtime flow and keeps the first-pass catalog
            intentionally small.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <RuntimeOnboardingPanel showHeader={false} />
        </CardContent>
      </Card>
    </section>
  )
}
