import {
  AlarmClock,
  Cable,
  Cloud,
  Info,
  Languages,
  MessageCircleMore,
  Monitor,
  Search,
  Shield,
  TerminalSquare,
  Wrench
} from 'lucide-react'
import type { ComponentType } from 'react'
import { useTranslation } from '../../../i18n/use-app-translation'
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
  titleKey: string
  to: string
  icon: ComponentType<{ className?: string }>
}

type SettingsNavGroup = {
  labelKey: string
  items: SettingsNavItem[]
}

const setupNavItems: SettingsNavItem[] = [
  {
    titleKey: 'settings.sidebar.items.providers',
    icon: Cloud,
    to: '/settings/providers'
  },
  {
    titleKey: 'settings.sidebar.items.runtimeSetup',
    icon: Wrench,
    to: '/settings/runtimes'
  },
  {
    titleKey: 'settings.sidebar.items.channels',
    icon: MessageCircleMore,
    to: '/settings/channels'
  }
]

const advancedStudioNavItems: SettingsNavItem[] = [
  {
    titleKey: 'settings.sidebar.items.security',
    icon: Shield,
    to: '/settings/security'
  },
  {
    titleKey: 'settings.sidebar.items.cronJobs',
    icon: AlarmClock,
    to: '/settings/cron-jobs'
  },
  {
    titleKey: 'settings.sidebar.items.mcpServers',
    icon: Cable,
    to: '/settings/mcp-servers'
  },
  {
    titleKey: 'settings.sidebar.items.webSearch',
    icon: Search,
    to: '/settings/web-search'
  },
  {
    titleKey: 'settings.sidebar.items.coding',
    icon: TerminalSquare,
    to: '/settings/coding'
  },
  {
    titleKey: 'settings.sidebar.items.general',
    icon: Languages,
    to: '/settings/general'
  },
  {
    titleKey: 'settings.sidebar.items.display',
    icon: Monitor,
    to: '/settings/display'
  },
  {
    titleKey: 'settings.sidebar.items.aboutFeedback',
    icon: Info,
    to: '/settings/about'
  }
]

const settingsNavGroups: SettingsNavGroup[] = [
  {
    labelKey: 'settings.sidebar.groups.acpReuse',
    items: setupNavItems
  },
  {
    labelKey: 'settings.sidebar.groups.advancedStudio',
    items: advancedStudioNavItems
  }
]

export function SettingsSidebarNav(): React.JSX.Element {
  const location = useLocation()
  const { t } = useTranslation()

  return (
    <Sidebar className="h-full border-b-0 border-r border-border/70 bg-transparent backdrop-blur-none">
      <SidebarHeader className="space-y-2">
        <p className="text-muted-foreground text-xs tracking-[0.18em] uppercase">
          {t('settings.sidebar.title')}
        </p>
        <h1 className="text-lg font-semibold">{t('settings.sidebar.subtitle')}</h1>
      </SidebarHeader>

      <SidebarContent className="py-5">
        {settingsNavGroups.map((group) => (
          <SidebarGroup key={group.labelKey}>
            <SidebarGroupLabel>{t(group.labelKey)}</SidebarGroupLabel>
            <SidebarMenu>
              {group.items.map((item) => {
                const isActive = location.pathname === item.to
                return (
                  <SidebarMenuItem key={item.to}>
                    <SidebarMenuButton asChild variant={isActive ? 'active' : 'default'}>
                      <NavLink to={item.to}>
                        <item.icon className="size-4" />
                        <span>{t(item.titleKey)}</span>
                      </NavLink>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                )
              })}
            </SidebarMenu>
          </SidebarGroup>
        ))}
      </SidebarContent>
    </Sidebar>
  )
}
