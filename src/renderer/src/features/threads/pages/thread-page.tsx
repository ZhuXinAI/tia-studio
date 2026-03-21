import { SidebarInset } from '../../../components/ui/sidebar'
import { AssistantManagementDialog } from '../../claws/components/assistant-management-dialog'
import { ClawCronMonitorDialog } from '../../claws/components/claw-cron-monitor-dialog'
import { ClawHeartbeatMonitorDialog } from '../../claws/components/claw-heartbeat-monitor-dialog'
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
          isLoadingData={controller.isLoadingData}
          isLoadingThreads={controller.isLoadingThreads}
          isCreatingThread={controller.isCreatingThread}
          canCreateThread={Boolean(controller.selectedAssistant)}
          onCreateThread={controller.onCreateThread}
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
            canAbortGeneration={controller.canAbortGeneration}
            supportsVision={controller.supportsVision}
            tokenUsage={controller.tokenUsage}
            onSubmitMessage={controller.onSubmitMessage}
            onAbortGeneration={controller.onAbortGeneration}
            onOpenAssistantConfig={controller.onOpenAssistantConfig}
            onOpenHeartbeatMonitor={controller.onOpenHeartbeatMonitor}
            onOpenCronMonitor={controller.onOpenCronMonitor}
            onCreateThread={controller.onCreateThread}
          />
        </SidebarInset>
      </section>

      <AssistantManagementDialog
        mode={controller.assistantDialogMode}
        isOpen={controller.isAssistantDialogOpen}
        assistant={controller.assistantDialogAssistant}
        providers={controller.providers}
        mcpServers={controller.mcpServers}
        channels={controller.assistantDialogChannels}
        isSaving={controller.isSubmittingAssistantDialog}
        errorMessage={controller.assistantDialogError}
        onClose={controller.onCloseAssistantDialog}
        onSelectWorkspacePath={controller.onSelectWorkspacePath}
        onSubmit={controller.onSubmitAssistantDialog}
      />

      <ClawHeartbeatMonitorDialog
        isOpen={controller.heartbeatMonitorAssistant !== null}
        assistantId={controller.heartbeatMonitorAssistant?.id ?? null}
        assistantName={controller.heartbeatMonitorAssistant?.name ?? ''}
        onClose={controller.onCloseHeartbeatMonitor}
      />

      <ClawCronMonitorDialog
        isOpen={controller.cronMonitorAssistant !== null}
        assistantId={controller.cronMonitorAssistant?.id ?? null}
        assistantName={controller.cronMonitorAssistant?.name ?? ''}
        onClose={controller.onCloseCronMonitor}
      />
    </>
  )
}
