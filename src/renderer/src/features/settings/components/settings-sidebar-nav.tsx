import { Cable, Cloud, Info, MessageCircleMore, Search, Monitor, Wrench } from 'lucide-react'
import type { ComponentType } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem
} from '../../../components/ui/sidebar'

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
    title: 'Channels',
    icon: MessageCircleMore,
    to: '/settings/channels'
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
  },
  {
    title: 'Runtime Setup',
    icon: Wrench,
    to: '/settings/runtimes'
  },
  {
    title: 'Display',
    icon: Monitor,
    to: '/settings/display'
  },
  {
    title: 'About & Feedback',
    icon: Info,
    to: '/settings/about'
  }
]

export function SettingsSidebarNav(): React.JSX.Element {
  const location = useLocation()

  return (
    <Sidebar className="h-full border-b-0 border-r border-border/70">
      <SidebarHeader className="space-y-1">
        <p className="text-muted-foreground text-xs tracking-[0.18em] uppercase">Settings</p>
        <h1 className="text-lg font-semibold">Configuration</h1>
      </SidebarHeader>

      <SidebarContent className="py-4">
        <SidebarGroup>
          <SidebarGroupLabel>Categories</SidebarGroupLabel>
          <SidebarMenu>
            {settingsNavItems.map((item) => {
              const isActive = location.pathname === item.to
              return (
                <SidebarMenuItem key={item.to}>
                  <SidebarMenuButton asChild variant={isActive ? 'active' : 'default'}>
                    <NavLink to={item.to}>
                      <item.icon className="size-4" />
                      <span>{item.title}</span>
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              )
            })}
          </SidebarMenu>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  )
}
