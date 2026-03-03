import { Cable, Cloud, Search } from 'lucide-react'
import type { ComponentType } from 'react'
import { NavLink } from 'react-router-dom'
import { buttonVariants } from '../../../components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../../components/ui/card'
import { cn } from '../../../lib/utils'

type SettingsNavItem = {
  title: string
  to: string
  icon: ComponentType<{ className?: string }>
}

const settingsNavItems: SettingsNavItem[] = [
  {
    title: 'Model Provider',
    icon: Cloud,
    to: '/settings/providers'
  },
  {
    title: 'Web Search',
    icon: Search,
    to: '/settings/web-search'
  },
  {
    title: 'MCP Servers',
    icon: Cable,
    to: '/settings/mcp-servers'
  }
]

export function SettingsSidebarNav(): React.JSX.Element {
  return (
    <Card className="border-border/70 bg-card/80">
      <CardHeader className="pb-3">
        <CardTitle>Settings</CardTitle>
        <CardDescription>Configuration categories</CardDescription>
      </CardHeader>
      <CardContent className="space-y-1">
        {settingsNavItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) =>
              cn(buttonVariants({ variant: isActive ? 'secondary' : 'ghost', size: 'sm' }), 'w-full justify-start')
            }
          >
            <item.icon className="size-4" />
            {item.title}
          </NavLink>
        ))}
      </CardContent>
    </Card>
  )
}
