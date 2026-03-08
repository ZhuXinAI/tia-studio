import { useState } from 'react'
import { SidebarInset } from '../../../components/ui/sidebar'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../../../components/ui/dialog'
import { TeamChatCard } from '../components/team-chat-card'
import { TeamConfigDialog } from '../components/team-config-dialog'
import { TeamSidebar } from '../components/team-sidebar'
import { TeamStatusGraph } from '../components/team-status-graph'
import { useTeamPageController } from '../hooks/use-team-page-controller'

export function TeamPage(): React.JSX.Element {
  const controller = useTeamPageController()
  const [isStatusDialogOpen, setIsStatusDialogOpen] = useState(false)

  return (
    <>
      <section
        data-team-page-shell="true"
        className="flex h-[calc(100vh-3.5rem)] min-h-[650px] min-w-[720px] flex-row overflow-hidden rounded-none border border-border/80 bg-background/50"
      >
        <TeamSidebar
          workspaces={controller.workspaces}
          threads={controller.threads}
          selectedWorkspaceId={controller.selectedWorkspace?.id ?? null}
          selectedThreadId={controller.selectedThread?.id ?? null}
          isLoadingData={controller.isLoadingData}
          isLoadingThreads={controller.isLoadingThreads}
          isCreatingWorkspace={controller.isCreatingWorkspace}
          isCreatingThread={controller.isCreatingThread}
          deletingThreadId={controller.deletingThreadId}
          onCreateWorkspace={controller.handleCreateWorkspace}
          onCreateThread={controller.handleCreateThread}
          onSelectWorkspace={controller.handleSelectWorkspace}
          onSelectThread={controller.handleSelectThread}
          onDeleteThread={controller.handleDeleteThread}
        />

        <SidebarInset className="flex min-h-0 flex-1 flex-col p-0 rounded-none">
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
              <DialogTitle>Team Status</DialogTitle>
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
