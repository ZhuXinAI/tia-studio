import { useNavigate } from 'react-router-dom'
import { AssistantManagementDialog } from '../../claws/components/assistant-management-dialog'
import { ClawCronMonitorDialog } from '../../claws/components/claw-cron-monitor-dialog'
import { ClawHeartbeatMonitorDialog } from '../../claws/components/claw-heartbeat-monitor-dialog'
import { ClawPairingsDialog } from '../../claws/components/claw-pairings-dialog'
import { ThreadChatCard } from '../components/thread-chat-card'
import { ThreadSessionSidebar } from '../components/thread-session-sidebar'
import { ThreadSidebar } from '../components/thread-sidebar'
import { useThreadPageController } from '../hooks/use-thread-page-controller'

export function ThreadPage(): React.JSX.Element {
  const controller = useThreadPageController()
  const navigate = useNavigate()

  return (
    <>
      <section className="grid h-[calc(100vh-3.5rem)] min-h-0 bg-[color:var(--surface-canvas)] lg:grid-cols-[288px_minmax(0,1fr)] xl:grid-cols-[288px_minmax(0,1fr)_auto]">
        <ThreadSidebar
          branches={controller.sidebarBranches}
          selectedThreadId={controller.selectedThread?.id ?? null}
          deletingThreadId={controller.deletingThreadId}
          isLoadingData={controller.isLoadingData}
          isLoadingThreads={controller.isLoadingThreads}
          isCreatingThread={controller.isCreatingThread}
          canCreateThread={Boolean(controller.selectedAssistant)}
          onCreateThread={controller.onCreateThread}
          onSelectAssistant={controller.onSelectAssistant}
          onSelectThread={controller.onSelectThread}
          onDeleteThread={controller.onDeleteThread}
        />

        <ThreadChatCard
          assistantOptions={controller.assistantOptions}
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
          onSelectAssistant={controller.onSelectAssistant}
          onOpenAgentSettings={() => {
            navigate('/settings/agents')
          }}
        />

        <ThreadSessionSidebar
          selectedAssistant={controller.selectedAssistant}
          selectedThread={controller.selectedThread}
          readiness={controller.readiness}
          tokenUsage={controller.tokenUsage}
          providers={controller.providers}
          onOpenNewChat={() => {
            if (controller.selectedAssistant) {
              controller.onSelectAssistant(controller.selectedAssistant.id)
            }
          }}
        />
      </section>

      <AssistantManagementDialog
        mode={controller.assistantDialogMode}
        isOpen={controller.isAssistantDialogOpen}
        assistant={controller.assistantDialogAssistant}
        providers={controller.providers}
        mcpServers={controller.mcpServers}
        channels={controller.assistantDialogChannels}
        channelSetupAction={controller.assistantDialogChannelSetupAction}
        isSaving={controller.isSubmittingAssistantDialog}
        errorMessage={controller.assistantDialogError}
        onClose={controller.onCloseAssistantDialog}
        onSelectWorkspacePath={controller.onSelectWorkspacePath}
        onSubmit={controller.onSubmitAssistantDialog}
      />

      <ClawPairingsDialog
        isOpen={controller.channelAccessClaw !== null}
        clawName={controller.channelAccessClaw?.name ?? controller.selectedAssistant?.name ?? ''}
        channelType={controller.channelAccessClaw?.channel?.type ?? null}
        pairings={controller.channelAccessPairings}
        isLoading={controller.isChannelAccessLoading}
        channelAuthState={controller.channelAuthState}
        isChannelAuthLoading={controller.isChannelAuthLoading}
        isSubmitting={controller.isChannelAccessSubmitting}
        errorMessage={controller.channelAccessError}
        onClose={controller.onCloseChannelAccessDialog}
        onRecoverSetup={controller.onRecoverChannelAccessSetup}
        onApprove={controller.onApproveChannelAccessPairing}
        onReject={controller.onRejectChannelAccessPairing}
        onRevoke={controller.onRevokeChannelAccessPairing}
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
