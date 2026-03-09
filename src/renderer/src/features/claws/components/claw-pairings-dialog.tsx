import { Button } from '../../../components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '../../../components/ui/dialog'
import { useTranslation } from '../../../i18n/use-app-translation'
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

function statusLabel(
  status: ClawPairingRecord['status'],
  translate: (key: string) => string
): string {
  switch (status) {
    case 'pending':
      return translate('claws.pairings.status.pending')
    case 'approved':
      return translate('claws.pairings.status.approved')
    case 'rejected':
      return translate('claws.pairings.status.rejected')
    case 'revoked':
      return translate('claws.pairings.status.revoked')
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
  const { t } = useTranslation()

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t('claws.pairings.title')}</DialogTitle>
          <DialogDescription>{t('claws.pairings.description', { clawName })}</DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          {isLoading ? (
            <p className="text-sm text-muted-foreground">{t('claws.pairings.loading')}</p>
          ) : null}
          {!isLoading && pairings.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t('claws.pairings.empty')}</p>
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
                        {statusLabel(pairing.status, t)}
                      </span>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {t('claws.pairings.senderIds', {
                        senderId: pairing.senderId,
                        chatId: pairing.remoteChatId
                      })}
                    </p>
                    {pairing.senderUsername ? (
                      <p className="text-sm text-muted-foreground">@{pairing.senderUsername}</p>
                    ) : null}
                    <p className="text-sm">
                      {t('claws.pairings.approvalCode', { code: pairing.code })}
                    </p>
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
                          {t('claws.pairings.actions.approve')}
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          disabled={isSubmitting}
                          onClick={() => void onReject(pairing.id)}
                        >
                          {t('claws.pairings.actions.reject')}
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
                        {t('claws.pairings.actions.revoke')}
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
            {t('common.actions.close')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
