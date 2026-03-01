import type { ComponentType } from 'react'
import { Bot, Settings2 } from 'lucide-react'
import { NavLink } from 'react-router-dom'
import { Button, buttonVariants } from '../../components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../components/ui/card'
import { cn } from '../../lib/utils'

type SidebarItem = {
  title: string
  to: string
  icon: ComponentType<{ className?: string }>
}

const workspaceItems: SidebarItem[] = [
  {
    title: 'Assistants',
    to: '/assistants',
    icon: Bot
  }
]

const settingItems: SidebarItem[] = [
  {
    title: 'Model Providers',
    to: '/settings/providers',
    icon: Settings2
  }
]

function SidebarNavGroup({ label, items }: { label: string; items: SidebarItem[] }) {
  return (
    <section className="space-y-2">
      <h3 className="px-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">{label}</h3>
      <div className="space-y-1">
        {items.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) =>
              cn(
                buttonVariants({
                  variant: isActive ? 'secondary' : 'ghost',
                  size: 'sm'
                }),
                'w-full justify-start'
              )
            }
          >
            <item.icon className="size-4" />
            {item.title}
          </NavLink>
        ))}
      </div>
    </section>
  )
}

export function StudioSidebar(): React.JSX.Element {
  return (
    <aside className="hidden w-72 shrink-0 border-r border-border/80 bg-background/95 p-4 md:block">
      <div className="space-y-4">
        <Card className="border-border/70 bg-card/90 py-0">
          <CardHeader className="px-4 py-4">
            <CardDescription className="text-xs tracking-[0.18em] uppercase">Tia Studio</CardDescription>
            <CardTitle className="text-base">Control Center</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 px-3 pb-3">
            <SidebarNavGroup label="Workspace" items={workspaceItems} />
            <SidebarNavGroup label="Settings" items={settingItems} />
          </CardContent>
        </Card>

        <Button asChild variant="outline" className="w-full justify-start">
          <a href="https://deepwiki.com/CherryHQ/cherry-studio" target="_blank" rel="noreferrer">
            Cherry Studio Notes
          </a>
        </Button>
      </div>
    </aside>
  )
}
