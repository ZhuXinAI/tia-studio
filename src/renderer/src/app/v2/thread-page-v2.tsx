import { ThreadChatCard } from '../../features/threads/components/thread-chat-card'
import { useThreadPageController } from '../../features/threads/hooks/use-thread-page-controller'
import { ThreadDetailsPanel } from './thread-details-panel'

export function ThreadPageV2(): React.JSX.Element {
  const controller = useThreadPageController()

  return (
    <section className="flex h-full min-h-0 flex-row overflow-hidden">
      <div className="flex min-h-0 min-w-0 flex-1">
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
      </div>
      <ThreadDetailsPanel controller={controller} />
    </section>
  )
}
