import type { ComponentType } from 'react'
import { Bot, Settings2 } from 'lucide-react'
import { useTranslation } from '../../i18n/use-app-translation'
import { NavLink } from 'react-router-dom'
import { Button, buttonVariants } from '../../components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../components/ui/card'
import { cn } from '../../lib/utils'

type SidebarItem = {
  titleKey: string
  to: string
  icon: ComponentType<{ className?: string }>
}

const workspaceItems: SidebarItem[] = [
  {
    titleKey: 'appShell.legacySidebar.chat',
    to: '/chat',
    icon: Bot
  }
]

const settingItems: SidebarItem[] = [
  {
    titleKey: 'appShell.legacySidebar.modelProviders',
    to: '/settings/providers',
    icon: Settings2
  }
]

function SidebarNavGroup({ labelKey, items }: { labelKey: string; items: SidebarItem[] }) {
  const { t } = useTranslation()

  return (
    <section className="my-2">
      <h3 className="px-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
        {t(labelKey)}
      </h3>
      <div className="flex flex-col gap-1">
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
            {t(item.titleKey)}
          </NavLink>
        ))}
      </div>
    </section>
  )
}

export function StudioSidebar(): React.JSX.Element {
  const { t } = useTranslation()

  return (
    <aside className="hidden w-72 shrink-0 border-r border-border/80 bg-background/95 p-4 md:block">
      <div className="py-4">
        <Card className="border-border/70 bg-card/90 py-0">
          <CardHeader className="px-4 py-4">
            <CardDescription className="text-xs tracking-[0.18em] uppercase">
              {t('appShell.legacySidebar.title')}
            </CardDescription>
            <CardTitle className="text-base">{t('appShell.legacySidebar.subtitle')}</CardTitle>
          </CardHeader>
          <CardContent className="py-4 px-3 pb-3">
            <SidebarNavGroup labelKey="appShell.legacySidebar.workspace" items={workspaceItems} />
            <SidebarNavGroup labelKey="appShell.legacySidebar.settings" items={settingItems} />
          </CardContent>
        </Card>

        <Button asChild variant="outline" className="w-full justify-start">
          <a href="https://github.com/ZhuXinAI/tia-studio" target="_blank" rel="noreferrer">
            {t('appShell.legacySidebar.notes')}
          </a>
        </Button>
      </div>
    </aside>
  )
}
