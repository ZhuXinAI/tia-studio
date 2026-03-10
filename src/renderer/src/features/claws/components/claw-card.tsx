import { Link2, MoreVertical } from 'lucide-react'
import { Button } from '../../../components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from '../../../components/ui/card'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '../../../components/ui/dropdown-menu'
import { useTranslation } from '../../../i18n/use-app-translation'
import type { ClawRecord } from '../claws-query'

interface ClawCardProps {
  claw: ClawRecord
  providerLabel: string
  isSubmitting: boolean
  onToggleEnabled: () => void
  onEdit: () => void
  onDelete: () => void
  onManagePairings?: () => void
}

export function ClawCard({
  claw,
  providerLabel,
  isSubmitting,
  onToggleEnabled,
  onEdit,
  onDelete,
  onManagePairings
}: ClawCardProps): React.JSX.Element {
  const { t } = useTranslation()

  const showManagePairings =
    onManagePairings && (claw.channel?.type === 'telegram' || claw.channel?.type === 'whatsapp')

  return (
    <Card className="gap-3">
      <CardHeader className="pb-0">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <CardTitle className="truncate">{claw.name}</CardTitle>
              {claw.channel && (
                <span
                  className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                    claw.enabled
                      ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                      : 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-400'
                  }`}
                >
                  {claw.enabled ? t('claws.card.statusEnabled') : t('claws.card.statusDisabled')}
                </span>
              )}
            </div>
            <CardDescription className="truncate">{claw.description || '\u00A0'}</CardDescription>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" disabled={isSubmitting}>
                <MoreVertical className="size-4" />
                <span className="sr-only">Actions</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem
                disabled={isSubmitting || claw.channel === null}
                onClick={onToggleEnabled}
              >
                {claw.enabled ? t('claws.card.disableButton') : t('claws.card.enableButton')}
              </DropdownMenuItem>
              <DropdownMenuItem disabled={isSubmitting} onClick={onEdit}>
                {t('claws.card.editButton')}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                disabled={isSubmitting}
                onClick={onDelete}
                className="text-destructive focus:text-destructive"
              >
                {t('claws.card.deleteButton')}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Provider
            </p>
            <p className="text-sm">{providerLabel}</p>
          </div>

          <div className="space-y-1">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Channel
            </p>
            {claw.channel ? (
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Link2 className="size-3.5 text-muted-foreground flex-shrink-0" />
                  <span className="text-sm truncate">{claw.channel.name}</span>
                  <span
                    className={`text-xs px-1.5 py-0.5 rounded ${
                      claw.channel.status === 'connected'
                        ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                        : claw.channel.status === 'error'
                          ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
                          : 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-400'
                    }`}
                  >
                    {claw.channel.status}
                  </span>
                </div>
                {showManagePairings ? (
                  <div className="space-y-1">
                    <p className="text-xs text-muted-foreground">
                      {t('claws.telegram.pairingSummary', {
                        pairedCount: claw.channel.pairedCount ?? 0,
                        pendingCount: claw.channel.pendingPairingCount ?? 0
                      })}
                    </p>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={isSubmitting}
                      onClick={onManagePairings}
                      className="h-7 text-xs"
                    >
                      {t('claws.telegram.managePairingsButton')}
                    </Button>
                  </div>
                ) : null}
              </div>
            ) : (
              <span className="text-sm text-amber-600 dark:text-amber-500">
                {t('claws.card.configureChannelFirst')}
              </span>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
