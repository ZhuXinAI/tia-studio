import { Folder, FolderPlus, MessageSquare } from 'lucide-react'
import { useMemo, useState } from 'react'
import { NavLink, useLocation, useNavigate, useParams } from 'react-router-dom'
import { Button } from '../../components/ui/button'
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem
} from '../../components/ui/sidebar'
import {
  useCreateWorkspace,
  useWorkspaces,
  type WorkspaceRecord
} from '../../features/workspaces/workspaces-query'
import { pickDirectory } from '../../lib/desktop-features'

function toWorkspaceName(rootPath: string): string {
  const normalized = rootPath.replace(/[\\/]+$/, '')
  const segments = normalized.split(/[\\/]/).filter((segment) => segment.length > 0)
  return segments.at(-1) ?? rootPath
}

function isChatsWorkspace(workspace: WorkspaceRecord): boolean {
  return workspace.builtInKind === 'chats'
}

export function WorkspaceSidebar(): React.JSX.Element {
  const navigate = useNavigate()
  const location = useLocation()
  const params = useParams()
  const { data: workspaceRecords = [], isLoading } = useWorkspaces()
  const createWorkspaceMutation = useCreateWorkspace()
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const namedWorkspaces = useMemo(
    () => workspaceRecords.filter((workspace) => !isChatsWorkspace(workspace)),
    [workspaceRecords]
  )

  async function handleCreateWorkspace(): Promise<void> {
    setErrorMessage(null)

    try {
      const selectedPath = await pickDirectory()
      if (!selectedPath) {
        return
      }

      const createdWorkspace = await createWorkspaceMutation.mutateAsync({
        name: toWorkspaceName(selectedPath),
        rootPath: selectedPath
      })
      navigate(`/workspaces/${createdWorkspace.id}`)
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Failed to create workspace')
    }
  }

  return (
    <Sidebar className="paper-panel hidden h-full w-[18.5rem] overflow-hidden rounded-[1.5rem] border-b-0 border-r-0 lg:flex">
      <SidebarHeader className="space-y-4 border-b border-[color:var(--surface-border)] bg-[linear-gradient(180deg,color-mix(in_srgb,var(--surface-paper)_96%,transparent),color-mix(in_srgb,var(--surface-panel-soft)_50%,transparent))]">
        <div className="space-y-1">
          <p className="section-kicker">Workspace navigator</p>
          <h1 className="font-editorial text-[1.75rem] leading-none tracking-[-0.03em]">
            Draft table
          </h1>
          <p className="text-muted-foreground text-xs leading-5">
            {isLoading ? 'Loading workspaces...' : 'Chats plus folder-backed workspaces.'}
          </p>
        </div>
        <Button
          type="button"
          size="sm"
          className="w-full justify-start"
          onClick={() => {
            void handleCreateWorkspace()
          }}
          disabled={createWorkspaceMutation.isPending}
        >
          <FolderPlus className="size-4" />
          {createWorkspaceMutation.isPending ? 'Creating workspace...' : 'Create workspace'}
        </Button>
        {errorMessage ? <p className="text-sm text-destructive">{errorMessage}</p> : null}
      </SidebarHeader>

      <SidebarContent className="py-5">
        <SidebarGroup>
          <SidebarGroupLabel>Chats</SidebarGroupLabel>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton
                asChild
                variant={location.pathname.startsWith('/chat') ? 'active' : 'default'}
              >
                <NavLink to="/chat">
                  <MessageSquare className="size-4" />
                  <span className="flex min-w-0 flex-1 items-center justify-between gap-3">
                    <span>Chats</span>
                    <span className="font-metadata text-[0.64rem] text-muted-foreground">
                      Built in
                    </span>
                  </span>
                </NavLink>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel>Workspaces</SidebarGroupLabel>
          <SidebarMenu>
            {namedWorkspaces.length === 0 ? (
              <p className="text-muted-foreground px-2 py-2 text-xs">
                {isLoading ? 'Loading workspaces...' : 'No named workspaces yet.'}
              </p>
            ) : (
              namedWorkspaces.map((workspace) => (
                <SidebarMenuItem key={workspace.id}>
                  <SidebarMenuButton
                    asChild
                    variant={params.workspaceId === workspace.id ? 'active' : 'default'}
                  >
                    <NavLink to={`/workspaces/${workspace.id}`}>
                      <Folder className="size-4" />
                      <span className="flex min-w-0 flex-1 flex-col items-start">
                        <span className="truncate">{workspace.name}</span>
                        <span className="truncate text-[11px] text-muted-foreground">
                          {workspace.rootPath}
                        </span>
                      </span>
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))
            )}
          </SidebarMenu>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  )
}
