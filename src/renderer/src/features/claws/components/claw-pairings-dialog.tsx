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
import type { ClawChannelAuthRecord, ClawPairingRecord } from '../claws-query'

type ClawPairingsDialogProps = {
  isOpen: boolean
  clawName: string
  channelType: string | null
  pairings: ClawPairingRecord[]
  isLoading: boolean
  channelAuthState: ClawChannelAuthRecord | null
  isChannelAuthLoading: boolean
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

function whatsappAuthStatusLabel(
  status: ClawChannelAuthRecord['status'],
  translate: (key: string, options?: Record<string, unknown>) => string,
  channelAuthState: ClawChannelAuthRecord
): string {
  if (channelAuthState.channelType === 'wechat') {
    switch (status) {
      case 'disconnected':
        return translate('claws.pairings.wechatAuth.status.disconnected')
      case 'connecting':
        return translate('claws.pairings.wechatAuth.status.connecting')
      case 'qr_ready':
        return translate('claws.pairings.wechatAuth.status.qrReady')
      case 'connected':
        return translate('claws.pairings.wechatAuth.status.connected', {
          accountId:
            channelAuthState.accountId ?? translate('claws.pairings.wechatAuth.accountFallback')
        })
      case 'error':
        return translate('claws.pairings.wechatAuth.status.error')
      default:
        return status
    }
  }

  switch (status) {
    case 'disconnected':
      return translate('claws.pairings.whatsappAuth.status.disconnected')
    case 'connecting':
      return translate('claws.pairings.whatsappAuth.status.connecting')
    case 'qr_ready':
      return translate('claws.pairings.whatsappAuth.status.qrReady')
    case 'connected':
      return translate('claws.pairings.whatsappAuth.status.connected', {
        phoneNumber:
          channelAuthState.phoneNumber ?? translate('claws.pairings.whatsappAuth.phoneFallback')
      })
    case 'error':
      return translate('claws.pairings.whatsappAuth.status.error')
    default:
      return status
  }
}

export function ClawPairingsDialog({
  isOpen,
  clawName,
  channelType,
  pairings,
  isLoading,
  channelAuthState,
  isChannelAuthLoading,
  isSubmitting,
  errorMessage,
  onClose,
  onApprove,
  onReject,
  onRevoke
}: ClawPairingsDialogProps): React.JSX.Element {
  const { t } = useTranslation()
  const isWhatsApp = channelType === 'whatsapp'
  const isWechat = channelType === 'wechat'
  const showsAuth = isWhatsApp || isWechat
  const showsPairings = channelType === 'telegram' || channelType === 'whatsapp'

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {isWechat ? t('claws.pairings.wechatTitle') : t('claws.pairings.title')}
          </DialogTitle>
          <DialogDescription>
            {isWhatsApp
              ? t('claws.pairings.whatsappDescription', { clawName })
              : isWechat
                ? t('claws.pairings.wechatDescription', { clawName })
              : t('claws.pairings.description', { clawName })}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          {showsAuth ? (
            <div className="space-y-3 rounded-lg border border-border bg-muted/30 p-4">
              <div className="space-y-1">
                <p className="font-medium">
                  {isWechat ? t('claws.pairings.wechatAuth.title') : t('claws.pairings.whatsappAuth.title')}
                </p>
                <p className="text-sm text-muted-foreground">
                  {isWechat
                    ? t('claws.pairings.wechatAuth.description')
                    : t('claws.pairings.whatsappAuth.description')}
                </p>
              </div>

              {isChannelAuthLoading ? (
                <p className="text-sm text-muted-foreground">
                  {isWechat
                    ? t('claws.pairings.wechatAuth.loading')
                    : t('claws.pairings.whatsappAuth.loading')}
                </p>
              ) : channelAuthState ? (
                <div className="space-y-3">
                  <p className="text-sm">
                    {whatsappAuthStatusLabel(channelAuthState.status, t, channelAuthState)}
                  </p>

                  {channelAuthState.qrCodeDataUrl ? (
                    <div className="space-y-2">
                      <img
                        src={channelAuthState.qrCodeDataUrl}
                        alt={
                          isWechat
                            ? t('claws.pairings.wechatAuth.qrAlt')
                            : t('claws.pairings.whatsappAuth.qrAlt')
                        }
                        className="h-56 w-56 rounded-lg border border-border bg-white object-contain p-3"
                      />
                      <p className="text-sm text-muted-foreground">
                        {isWechat
                          ? t('claws.pairings.wechatAuth.scanHint')
                          : t('claws.pairings.whatsappAuth.scanHint')}
                      </p>
                    </div>
                  ) : null}

                  {channelAuthState.errorMessage ? (
                    <p className="text-sm text-destructive">{channelAuthState.errorMessage}</p>
                  ) : null}
                </div>
              ) : null}
            </div>
          ) : null}

          {showsPairings && isLoading ? (
            <p className="text-sm text-muted-foreground">{t('claws.pairings.loading')}</p>
          ) : null}
          {showsPairings && !isLoading && pairings.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t('claws.pairings.empty')}</p>
          ) : null}
          {showsPairings && !isLoading
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
