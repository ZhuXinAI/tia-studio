import { SidebarInset } from '../../../components/ui/sidebar'
import { GroupChatCard } from '../components/group-chat-card'
import { GroupConfigDialog } from '../components/group-config-dialog'
import { GroupSidebar } from '../components/group-sidebar'
import { useGroupPageController } from '../hooks/use-group-page-controller'

export function GroupPage(): React.JSX.Element {
  const controller = useGroupPageController()

  return (
    <>
      <section
        data-group-page-shell="true"
        className="flex h-[calc(100vh-3.5rem)] min-h-[650px] min-w-[720px] flex-row overflow-hidden rounded-none border border-border/80 bg-background/50"
      >
        <GroupSidebar
          groups={controller.groups}
          threads={controller.threads}
          selectedGroupId={controller.selectedGroup?.id ?? null}
          selectedThreadId={controller.selectedThread?.id ?? null}
          isLoadingData={controller.isLoadingData}
          isLoadingThreads={controller.isLoadingThreads}
          isCreatingGroup={controller.isCreatingGroup}
          isCreatingThread={controller.isCreatingThread}
          deletingThreadId={controller.deletingThreadId}
          onCreateGroup={controller.handleCreateGroup}
          onCreateThread={controller.handleCreateThread}
          onSelectGroup={controller.handleSelectGroup}
          onSelectThread={controller.handleSelectThread}
          onDeleteThread={controller.handleDeleteThread}
        />

        <SidebarInset className="flex min-h-0 flex-1 flex-col rounded-none p-0">
          <div data-group-main-chat="true" className="min-h-0 flex-1">
            <GroupChatCard
              selectedGroup={controller.selectedGroup}
              selectedThread={controller.selectedThread}
              messages={controller.messages}
              members={controller.selectedMembers}
              readiness={controller.readiness}
              isLoadingMessages={controller.isLoadingMessages}
              isSubmittingMessage={controller.isSubmittingMessage}
              isAgentTyping={controller.isAgentTyping}
              activeSpeakerName={controller.activeSpeakerName}
              loadError={controller.loadError}
              onSubmitMessage={controller.handleSubmitMessage}
              onOpenConfig={controller.openConfigDialog}
              onCreateThread={controller.handleCreateThread}
            />
          </div>
        </SidebarInset>
      </section>

      <GroupConfigDialog
        mode={controller.configDialogMode}
        isOpen={controller.isConfigDialogOpen}
        group={controller.configDialogMode === 'create' ? null : controller.selectedGroup}
        assistants={controller.assistants}
        selectedAssistantIds={
          controller.configDialogMode === 'create' ? [] : controller.selectedMemberIds
        }
        isSaving={controller.isSavingConfig}
        errorMessage={controller.configError}
        onClose={controller.closeConfigDialog}
        onSubmit={controller.handleSubmitConfig}
      />
    </>
  )
}
