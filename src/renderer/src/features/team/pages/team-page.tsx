import { useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { SidebarInset } from '../../../components/ui/sidebar'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../../../components/ui/dialog'
import { useTranslation } from '../../../i18n/use-app-translation'
import { TeamChatCard } from '../components/team-chat-card'
import { TeamConfigDialog } from '../components/team-config-dialog'
import { TeamSidebar } from '../components/team-sidebar'
import { TeamStatusGraph } from '../components/team-status-graph'
import { useTeamPageController } from '../hooks/use-team-page-controller'

export function TeamPage(): React.JSX.Element {
  const { t } = useTranslation()
  const location = useLocation()
  const navigate = useNavigate()
  const controller = useTeamPageController()
  const handleCreateWorkspace = controller.handleCreateWorkspace
  const [isStatusDialogOpen, setIsStatusDialogOpen] = useState(false)
  const hasHandledCreateWorkspaceRef = useRef(false)

  const shouldCreateWorkspace = Boolean(
    (location.state as { createWorkspace?: boolean } | null)?.createWorkspace
  )

  useEffect(() => {
    if (!shouldCreateWorkspace) {
      hasHandledCreateWorkspaceRef.current = false
      return
    }

    if (hasHandledCreateWorkspaceRef.current) {
      return
    }

    hasHandledCreateWorkspaceRef.current = true
    void handleCreateWorkspace().finally(() => {
      navigate(location.pathname, { replace: true, state: null })
    })
  }, [handleCreateWorkspace, location.pathname, navigate, shouldCreateWorkspace])

  return (
    <>
      <section
        data-team-page-shell="true"
        className="flex h-[calc(100vh-3.5rem)] min-h-[650px] min-w-[720px] flex-row overflow-hidden rounded-[1.5rem] border border-border/80 bg-background/50 border-[color:var(--surface-border)] bg-[color:var(--surface-panel)] shadow-[0_28px_80px_-60px_rgba(15,23,42,0.65)]"
      >
        <TeamSidebar
          selectedWorkspace={controller.selectedWorkspace}
          threads={controller.threads}
          selectedThreadId={controller.selectedThread?.id ?? null}
          isLoadingData={controller.isLoadingData}
          isLoadingThreads={controller.isLoadingThreads}
          isCreatingThread={controller.isCreatingThread}
          deletingThreadId={controller.deletingThreadId}
          onCreateThread={controller.handleCreateThread}
          onSelectThread={controller.handleSelectThread}
          onDeleteThread={controller.handleDeleteThread}
        />

        <SidebarInset className="flex min-h-0 flex-1 flex-col p-0">
          <div data-team-main-chat="true" className="min-h-0 flex-1">
            <TeamChatCard
              selectedWorkspace={controller.selectedWorkspace}
              selectedThread={controller.selectedThread}
              selectedMembers={controller.selectedMembers}
              chat={controller.chat}
              readiness={controller.readiness}
              isLoadingChatHistory={controller.isLoadingChatHistory}
              isChatStreaming={controller.isChatStreaming}
              chatError={controller.chatError}
              loadError={controller.loadError}
              canAbortGeneration={controller.canAbortGeneration}
              onSubmitMessage={controller.handleSubmitMessage}
              onAbortGeneration={controller.handleAbortGeneration}
              onOpenStatusDialog={() => setIsStatusDialogOpen(true)}
              onOpenTeamConfig={controller.openConfigDialog}
              onCreateThread={controller.handleCreateThread}
            />
          </div>
        </SidebarInset>
      </section>

      <div data-team-status-dialog="true">
        <Dialog open={isStatusDialogOpen} onOpenChange={setIsStatusDialogOpen}>
          <DialogContent className="w-[min(92vw,960px)] max-w-none">
            <DialogHeader>
              <DialogTitle>{t('team.status.title')}</DialogTitle>
            </DialogHeader>
            <div className="h-[min(70vh,640px)] min-h-0">
              <TeamStatusGraph
                assistants={controller.selectedMembers.map((assistant) => ({
                  id: assistant.id,
                  name: assistant.name
                }))}
                events={controller.statusEvents}
                showEventLog={false}
              />
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <TeamConfigDialog
        isOpen={controller.isConfigDialogOpen}
        workspace={controller.selectedWorkspace}
        providers={controller.providers}
        assistants={controller.assistants}
        selectedAssistantIds={controller.selectedMemberIds}
        isSaving={controller.isSavingConfig}
        errorMessage={controller.configError}
        onClose={controller.closeConfigDialog}
        onSubmit={controller.handleSubmitConfig}
      />
    </>
  )
}
