import { PanelRightClose, PanelRightOpen } from 'lucide-react'
import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import { Button } from '../../components/ui/button'
import { ThreadChatCard } from '../../features/threads/components/thread-chat-card'
import { useThreadPageController } from '../../features/threads/hooks/use-thread-page-controller'
import { useAppV2ShellRightRail } from './app-v2-shell-right-rail'
import { ThreadDetailsPanel } from './thread-details-panel'

export function ThreadPageV2(): React.JSX.Element {
  const controller = useThreadPageController()
  const { isOpen, setIsOpen, setHasContent, slotElement } = useAppV2ShellRightRail()

  useEffect(() => {
    setHasContent(true)

    return () => {
      setHasContent(false)
    }
  }, [setHasContent])

  return (
    <>
      <section className="relative flex h-full min-h-0 flex-row overflow-hidden">
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
            onSelectDraftWorkspace={controller.onSelectDraftWorkspace}
            onDraftProviderChange={controller.onDraftProviderChange}
            onDraftModelChange={controller.onDraftModelChange}
            onRelocateWorkspace={controller.onRelocateWorkspace}
            onDeleteWorkspace={controller.onDeleteWorkspace}
            isRelocatingWorkspace={controller.isRelocatingWorkspace}
            isDeletingWorkspace={controller.isDeletingWorkspace}
            headerLeadingAction={
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="no-drag size-8"
                onClick={() => setIsOpen(!isOpen)}
                aria-label={isOpen ? 'Collapse details' : 'Expand details'}
                title={isOpen ? 'Collapse details' : 'Expand details'}
              >
                {isOpen ? (
                  <PanelRightClose className="size-4" />
                ) : (
                  <PanelRightOpen className="size-4" />
                )}
              </Button>
            }
          />
        </div>
      </section>
      {slotElement && isOpen
        ? createPortal(<ThreadDetailsPanel controller={controller} />, slotElement)
        : null}
    </>
  )
}
