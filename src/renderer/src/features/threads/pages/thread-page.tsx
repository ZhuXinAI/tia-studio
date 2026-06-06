import { SidebarInset } from '../../../components/ui/sidebar'
import { ThreadChatCard } from '../components/thread-chat-card'
import { ThreadSidebar } from '../components/thread-sidebar'
import { useThreadPageController } from '../hooks/use-thread-page-controller'

export function ThreadPage(): React.JSX.Element {
  const controller = useThreadPageController()

  return (
    <section className="paper-panel flex h-[calc(100vh-6.35rem)] min-h-[650px] min-w-[720px] flex-row overflow-hidden rounded-[1.9rem]">
      <ThreadSidebar
        chatLabel={controller.chatLabel}
        branches={controller.sidebarBranches}
        selectedThreadId={controller.selectedThread?.id ?? null}
        deletingThreadId={controller.deletingThreadId}
        isLoadingData={controller.isLoadingData}
        isLoadingThreads={controller.isLoadingThreads}
        isCreatingThread={controller.isCreatingThread}
        canCreateThread={Boolean(controller.selectedAssistant)}
        onCreateThread={controller.onCreateThread}
        onSelectThread={controller.onSelectThread}
        onDeleteThread={controller.onDeleteThread}
      />

      <SidebarInset className="flex min-h-0 flex-1 flex-col p-0">
        <ThreadChatCard
          chatLabel={controller.chatLabel}
          selectedWorkspace={controller.selectedWorkspace}
          workspaces={controller.workspaces}
          providers={controller.providers}
          isNewThreadRoute={controller.isNewThreadRoute}
          draftProviderId={controller.draftProviderId}
          draftModel={controller.draftModel}
          selectedAssistant={controller.selectedAssistant}
          selectedThread={controller.selectedThread}
          chat={controller.chat}
            readiness={controller.readiness}
            isLoadingChatHistory={controller.isLoadingChatHistory}
            isChatStreaming={controller.isChatStreaming}
            chatError={controller.chatError}
            loadError={controller.loadError}
            canAbortGeneration={controller.canAbortGeneration}
            supportsVision={controller.supportsVision}
          tokenUsage={controller.tokenUsage}
          onSubmitMessage={controller.onSubmitMessage}
          onAbortGeneration={controller.onAbortGeneration}
          onCreateThread={controller.onCreateThread}
          onSelectDraftWorkspace={controller.onSelectDraftWorkspace}
          onDraftProviderChange={controller.onDraftProviderChange}
          onDraftModelChange={controller.onDraftModelChange}
          onRelocateWorkspace={controller.onRelocateWorkspace}
          onDeleteWorkspace={controller.onDeleteWorkspace}
          isRelocatingWorkspace={controller.isRelocatingWorkspace}
          isDeletingWorkspace={controller.isDeletingWorkspace}
        />
      </SidebarInset>
    </section>
  )
}
