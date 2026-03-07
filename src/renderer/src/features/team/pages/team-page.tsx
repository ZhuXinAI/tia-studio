import { TeamChatCard } from '../components/team-chat-card'
import { TeamConfigDialog } from '../components/team-config-dialog'
import { TeamSidebar } from '../components/team-sidebar'
import { TeamStatusGraph } from '../components/team-status-graph'
import { useTeamPageController } from '../hooks/use-team-page-controller'

export function TeamPage(): React.JSX.Element {
  const controller = useTeamPageController()

  return (
    <>
      <section className="grid min-h-[calc(100vh-3.5rem)] grid-cols-1 gap-4 p-4 xl:grid-cols-[320px_minmax(0,1fr)_360px]">
        <aside className="min-h-0">
          <TeamSidebar
            workspaces={controller.workspaces}
            threads={controller.threads}
            selectedWorkspaceId={controller.selectedWorkspace?.id ?? null}
            selectedThreadId={controller.selectedThread?.id ?? null}
            isLoadingData={controller.isLoadingData}
            isLoadingThreads={controller.isLoadingThreads}
            isCreatingWorkspace={controller.isCreatingWorkspace}
            isCreatingThread={controller.isCreatingThread}
            onCreateWorkspace={controller.handleCreateWorkspace}
            onCreateThread={controller.handleCreateThread}
            onSelectWorkspace={controller.handleSelectWorkspace}
            onSelectThread={controller.handleSelectThread}
          />
        </aside>

        <div className="min-h-0">
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
            onOpenTeamConfig={controller.openConfigDialog}
            onCreateThread={controller.handleCreateThread}
          />
        </div>

        <aside className="min-h-0">
          <TeamStatusGraph
            assistants={controller.selectedMembers.map((assistant) => ({
              id: assistant.id,
              name: assistant.name
            }))}
            events={controller.statusEvents}
          />
        </aside>
      </section>

      <TeamConfigDialog
        isOpen={controller.isConfigDialogOpen}
        thread={controller.selectedThread}
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
