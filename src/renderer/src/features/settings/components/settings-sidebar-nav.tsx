import { Cable, Cloud, Info, Languages, MessageCircleMore, Monitor, Shield } from 'lucide-react'
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

const configurationItems: SettingsNavItem[] = [
  {
    titleKey: 'settings.sidebar.items.providers',
    icon: Cloud,
    to: '/settings/providers'
  },
  {
    titleKey: 'settings.sidebar.items.security',
    icon: Shield,
    to: '/settings/security'
  },
  {
    titleKey: 'settings.sidebar.items.channels',
    icon: MessageCircleMore,
    to: '/settings/channels'
  },
  {
    titleKey: 'settings.sidebar.items.mcpServers',
    icon: Cable,
    to: '/settings/mcp-servers'
  }
]

const preferenceItems: SettingsNavItem[] = [
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

export function SettingsSidebarNav(): React.JSX.Element {
  const location = useLocation()
  const { t } = useTranslation()

  function renderItems(items: SettingsNavItem[]): React.JSX.Element[] {
    return items.map((item) => {
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
    })
  }

  return (
    <Sidebar className="h-full border-b-0 border-r border-[color:var(--surface-border)] bg-[color:var(--surface-panel-soft)]">
      <SidebarHeader className="space-y-2 border-b border-[color:var(--surface-border)] bg-[color:var(--surface-panel-soft)]">
        <p className="section-kicker">{t('settings.sidebar.title')}</p>
        <h1 className="font-editorial text-[1.55rem] leading-none tracking-[-0.03em]">
          {t('settings.sidebar.subtitle')}
        </h1>
      </SidebarHeader>

      <SidebarContent className="py-5">
        <SidebarGroup>
          <SidebarGroupLabel>Configuration</SidebarGroupLabel>
          <SidebarMenu>{renderItems(configurationItems)}</SidebarMenu>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel>Preferences</SidebarGroupLabel>
          <SidebarMenu>{renderItems(preferenceItems)}</SidebarMenu>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  )
}
