import { Button } from '../../../components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '../../../components/ui/dialog'
import type { ClawPairingRecord } from '../claws-query'

type ClawPairingsDialogProps = {
  isOpen: boolean
  clawName: string
  pairings: ClawPairingRecord[]
  isLoading: boolean
  isSubmitting: boolean
  errorMessage: string | null
  onClose: () => void
  onApprove: (pairingId: string) => Promise<void> | void
  onReject: (pairingId: string) => Promise<void> | void
  onRevoke: (pairingId: string) => Promise<void> | void
}

function statusLabel(status: ClawPairingRecord['status']): string {
  switch (status) {
    case 'pending':
      return 'Pending approval'
    case 'approved':
      return 'Approved'
    case 'rejected':
      return 'Rejected'
    case 'revoked':
      return 'Revoked'
    default:
      return status
  }
}

export function ClawPairingsDialog({
  isOpen,
  clawName,
  pairings,
  isLoading,
  isSubmitting,
  errorMessage,
  onClose,
  onApprove,
  onReject,
  onRevoke
}: ClawPairingsDialogProps): React.JSX.Element {
  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Manage Pairings</DialogTitle>
          <DialogDescription>Review Telegram pairing requests for {clawName}.</DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          {isLoading ? <p className="text-sm text-muted-foreground">Loading pairings...</p> : null}
          {!isLoading && pairings.length === 0 ? (
            <p className="text-sm text-muted-foreground">No Telegram pairings yet.</p>
          ) : null}
          {!isLoading
            ? pairings.map((pairing) => (
                <div
                  key={pairing.id}
                  className="space-y-3 rounded-lg border border-border bg-background p-4"
                >
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-medium">{pairing.senderDisplayName}</p>
                      <span className="text-xs text-muted-foreground">
                        {statusLabel(pairing.status)}
                      </span>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      Sender ID: {pairing.senderId} · Chat ID: {pairing.remoteChatId}
                    </p>
                    {pairing.senderUsername ? (
                      <p className="text-sm text-muted-foreground">@{pairing.senderUsername}</p>
                    ) : null}
                    <p className="text-sm">Approval code: {pairing.code}</p>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    {pairing.status === 'pending' ? (
                      <>
                        <Button
                          type="button"
                          size="sm"
                          disabled={isSubmitting}
                          onClick={() => void onApprove(pairing.id)}
                        >
                          Approve
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          disabled={isSubmitting}
                          onClick={() => void onReject(pairing.id)}
                        >
                          Reject
                        </Button>
                      </>
                    ) : null}

                    {pairing.status === 'approved' ? (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={isSubmitting}
                        onClick={() => void onRevoke(pairing.id)}
                      >
                        Revoke
                      </Button>
                    ) : null}
                  </div>
                </div>
              ))
            : null}
        </div>

        {errorMessage ? <p className="text-sm text-destructive">{errorMessage}</p> : null}

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose} disabled={isSubmitting}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
