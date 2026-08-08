import {
  Activity,
  ArrowLeft,
  Cloud,
  FolderCog,
  Info,
  Languages,
  MessageCircleMore,
  Monitor,
  ShieldCheck
} from 'lucide-react'
import type { ComponentType } from 'react'
import { useTranslation } from '../../../i18n/use-app-translation'
import { NavLink, useLocation } from 'react-router-dom'
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem
} from '../../../components/ui/sidebar'
import { Button } from '../../../components/ui/button'

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
    titleKey: 'settings.sidebar.items.channels',
    icon: MessageCircleMore,
    to: '/settings/channels'
  },
  {
    titleKey: 'settings.sidebar.items.permissions',
    icon: ShieldCheck,
    to: '/settings/permissions'
  },
  {
    titleKey: 'settings.sidebar.items.workspaces',
    icon: FolderCog,
    to: '/settings/workspaces'
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
  },
  {
    titleKey: 'settings.sidebar.items.diagnostics',
    icon: Activity,
    to: '/settings/diagnostics'
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
    <Sidebar className="app-shell-pane h-full border-b-0 border-r border-[color:var(--chat-surface-border)]">
      <SidebarHeader className="space-y-3 border-b border-[color:var(--chat-surface-border)]">
        <Button
          asChild
          variant="ghost"
          className="h-10 w-full justify-start px-2 text-muted-foreground"
        >
          <NavLink to="/chat">
            <ArrowLeft className="size-4" />
            {t('settings.sidebar.backToApp')}
          </NavLink>
        </Button>
      </SidebarHeader>

      <SidebarContent className="py-4">
        <SidebarGroup className="my-0">
          <SidebarMenu>{renderItems(configurationItems)}</SidebarMenu>
        </SidebarGroup>

        <SidebarGroup className="my-0 mt-4">
          <SidebarMenu>{renderItems(preferenceItems)}</SidebarMenu>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  )
}
