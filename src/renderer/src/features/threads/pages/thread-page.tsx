import { SidebarInset } from '../../../components/ui/sidebar'
import { AssistantConfigDialog } from '../components/assistant-config-dialog'
import { ThreadChatCard } from '../components/thread-chat-card'
import { ThreadSidebar } from '../components/thread-sidebar'
import { ThreadToast } from '../components/thread-toast'
import { useThreadPageController } from '../hooks/use-thread-page-controller'

export function ThreadPage(): React.JSX.Element {
  const controller = useThreadPageController()

  return (
    <>
      <section className="flex h-[calc(100vh-3.5rem)] min-h-[650px] min-w-[720px] flex-row overflow-hidden rounded-none border border-border/80 bg-[radial-gradient(circle_at_0%_0%,rgba(94,234,212,0.09),transparent_40%),radial-gradient(circle_at_100%_0%,rgba(147,197,253,0.14),transparent_46%),linear-gradient(170deg,rgba(7,11,19,0.9),rgba(6,8,14,0.95))]">
        <ThreadSidebar
          branches={controller.sidebarBranches}
          selectedThreadId={controller.selectedThread?.id ?? null}
          deletingThreadId={controller.deletingThreadId}
          isLoadingData={controller.isLoadingData}
          assistantsCount={controller.assistantsCount}
          isLoadingThreads={controller.isLoadingThreads}
          isCreatingThread={controller.isCreatingThread}
          canCreateThread={Boolean(controller.selectedAssistant)}
          onCreateThread={controller.onCreateThread}
          onSelectAssistant={controller.onSelectAssistant}
          onSelectThread={controller.onSelectThread}
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
            onComposerChange={controller.onComposerChange}
            onSubmitMessage={controller.onSubmitMessage}
            onOpenAssistantConfig={controller.onOpenAssistantConfig}
          />
        </SidebarInset>
      </section>

      <AssistantConfigDialog
        isOpen={controller.isAssistantConfigDialogOpen}
        assistant={controller.selectedAssistant}
        providers={controller.providers}
        isSaving={controller.isSavingAssistantConfig}
        onClose={controller.onCloseAssistantConfig}
        onSelectWorkspacePath={controller.onSelectWorkspacePath}
        onSubmit={controller.onUpdateAssistantConfig}
      />

      <ThreadToast toast={controller.toast} />
    </>
  )
}
