import { SidebarInset } from '../../../components/ui/sidebar'
import { AssistantConfigDialog } from '../components/assistant-config-dialog'
import { ThreadChatCard } from '../components/thread-chat-card'
import { ThreadSidebar } from '../components/thread-sidebar'
import { useThreadPageController } from '../hooks/use-thread-page-controller'

export function ThreadPage(): React.JSX.Element {
  const controller = useThreadPageController()

  return (
    <>
      <section className="flex h-[calc(100vh-3.5rem)] min-h-[650px] min-w-[720px] flex-row overflow-hidden rounded-none border border-border/80 bg-background/50">
        <ThreadSidebar
          branches={controller.sidebarBranches}
          selectedThreadId={controller.selectedThread?.id ?? null}
          deletingThreadId={controller.deletingThreadId}
          deletingAssistantId={controller.deletingAssistantId}
          isLoadingData={controller.isLoadingData}
          assistantsCount={controller.assistantsCount}
          isLoadingThreads={controller.isLoadingThreads}
          isCreatingThread={controller.isCreatingThread}
          canCreateThread={Boolean(controller.selectedAssistant)}
          onCreateThread={controller.onCreateThread}
          onCreateAssistant={controller.onCreateAssistant}
          onSelectAssistant={controller.onSelectAssistant}
          onSelectThread={controller.onSelectThread}
          onEditAssistant={controller.onEditAssistant}
          onDeleteAssistant={controller.onDeleteAssistant}
          onDeleteThread={controller.onDeleteThread}
        />

        <SidebarInset className="flex min-h-0 flex-1 flex-col p-0 rounded-none">
          <ThreadChatCard
            selectedAssistant={controller.selectedAssistant}
            selectedThread={controller.selectedThread}
            chat={controller.chat}
            readiness={controller.readiness}
            isLoadingChatHistory={controller.isLoadingChatHistory}
            isChatStreaming={controller.isChatStreaming}
            chatError={controller.chatError}
            loadError={controller.loadError}
            composerValue={controller.composerValue}
            canSendMessage={controller.canSendMessage}
            canAbortGeneration={controller.canAbortGeneration}
            tokenUsage={controller.tokenUsage}
            onComposerChange={controller.onComposerChange}
            onSubmitMessage={controller.onSubmitMessage}
            onAbortGeneration={controller.onAbortGeneration}
            onOpenAssistantConfig={controller.onOpenAssistantConfig}
            onCreateThread={controller.onCreateThread}
          />
        </SidebarInset>
      </section>

      <AssistantConfigDialog
        mode={controller.assistantDialogMode}
        isOpen={controller.isAssistantDialogOpen}
        assistant={controller.assistantDialogAssistant}
        providers={controller.providers}
        mcpServers={controller.mcpServers}
        isSaving={controller.isSubmittingAssistantDialog}
        errorMessage={controller.assistantDialogError}
        onClose={controller.onCloseAssistantDialog}
        onSelectWorkspacePath={controller.onSelectWorkspacePath}
        onSubmit={controller.onSubmitAssistantDialog}
      />
    </>
  )
}
