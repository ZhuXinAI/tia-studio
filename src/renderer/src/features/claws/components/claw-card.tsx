import { Link2, MoreVertical, Activity, Clock } from 'lucide-react'
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
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger
} from '../../../components/ui/tooltip'
import { useTranslation } from '../../../i18n/use-app-translation'
import { cn } from '../../../lib/utils'
import type { ClawRecord } from '../claws-query'

interface ClawCardProps {
  claw: ClawRecord
  providerLabel: string
  isSubmitting: boolean
  featured?: boolean
  onToggleEnabled: () => void
  onEdit: () => void
  onDelete: () => void
  onManagePairings?: () => void
  onViewHeartbeat?: () => void
  onViewCron?: () => void
}

export function ClawCard({
  claw,
  providerLabel,
  isSubmitting,
  featured = false,
  onToggleEnabled,
  onEdit,
  onDelete,
  onManagePairings,
  onViewHeartbeat,
  onViewCron
}: ClawCardProps): React.JSX.Element {
  const { t } = useTranslation()

  const showManageAccess =
    onManagePairings &&
    (claw.channel?.type === 'telegram' ||
      claw.channel?.type === 'whatsapp' ||
      claw.channel?.type === 'wechat')

  return (
    <Card
      className={cn(
        'gap-0 overflow-hidden border-[color:var(--surface-border)] bg-[color:var(--surface-panel)] shadow-none',
        featured ? 'xl:col-span-2' : ''
      )}
    >
      <CardHeader className="pb-0">
        <div className="flex items-start justify-between gap-4 overflow-hidden">
          <div className="min-w-0 flex-1">
            <div className="flex min-w-0 items-center gap-2">
              <CardTitle
                className={cn(
                  'min-w-0 truncate tracking-[-0.02em]',
                  featured ? 'text-[1.6rem]' : 'text-lg'
                )}
              >
                {claw.name}
              </CardTitle>
              {claw.channel && (
                <span
                  className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-medium ${
                    claw.enabled
                      ? 'bg-emerald-500/12 text-emerald-700 dark:text-emerald-300'
                      : 'bg-muted text-muted-foreground'
                  }`}
                >
                  {claw.enabled ? t('claws.card.statusEnabled') : t('claws.card.statusDisabled')}
                </span>
              )}
            </div>
            <CardDescription className={cn('min-w-0 pt-2', featured ? 'text-sm' : 'truncate')}>
              {claw.description || '\u00A0'}
            </CardDescription>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <TooltipProvider>
              {onViewHeartbeat ? (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="rounded-full"
                      disabled={isSubmitting}
                      onClick={onViewHeartbeat}
                    >
                      <Activity className="size-4" />
                      <span className="sr-only">View Heartbeat</span>
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>View Heartbeat</p>
                  </TooltipContent>
                </Tooltip>
              ) : null}
              {onViewCron ? (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="rounded-full"
                      disabled={isSubmitting}
                      onClick={onViewCron}
                    >
                      <Clock className="size-4" />
                      <span className="sr-only">View Cron</span>
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>View Cron</p>
                  </TooltipContent>
                </Tooltip>
              ) : null}
            </TooltipProvider>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="rounded-full"
                  disabled={isSubmitting}
                >
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
        </div>
      </CardHeader>
      <CardContent
        className={cn(
          'grid gap-4 border-t border-border/70 border-[color:var(--surface-border)] py-5',
          featured ? 'lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]' : 'sm:grid-cols-2'
        )}
      >
        <div className="space-y-1">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
            Provider
          </p>
          <p className="text-sm font-medium">{providerLabel}</p>
        </div>

        <div className="space-y-3">
          <div className="space-y-1">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Channel
            </p>
            {claw.channel ? (
              <div className="rounded-[1rem] border border-[color:var(--surface-border)] bg-[color:var(--surface-panel-soft)] px-4 py-3">
                <div className="mb-3 flex items-center gap-2">
                  <Link2 className="size-3.5 shrink-0 text-muted-foreground" />
                  <span className="truncate text-sm">{claw.channel.name}</span>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className={`rounded-full px-2 py-1 text-xs font-medium ${
                      claw.channel.status === 'connected'
                        ? 'bg-emerald-500/12 text-emerald-700 dark:text-emerald-300'
                        : claw.channel.status === 'error'
                          ? 'bg-red-500/12 text-red-700 dark:text-red-300'
                          : 'bg-muted text-muted-foreground'
                    }`}
                  >
                    {claw.channel.status}
                  </span>
                  {showManageAccess ? (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={isSubmitting}
                      onClick={onManagePairings}
                      className="h-8 rounded-full text-xs"
                    >
                      {claw.channel?.type === 'wechat'
                        ? t('claws.wechat.manageSetupButton')
                        : t('claws.telegram.managePairingsButton')}
                    </Button>
                  ) : null}
                </div>

                {showManageAccess &&
                (claw.channel?.type === 'telegram' || claw.channel?.type === 'whatsapp') ? (
                  <p className="mt-3 text-xs text-muted-foreground">
                    {t('claws.telegram.pairingSummary', {
                      pairedCount: claw.channel.pairedCount ?? 0,
                      pendingCount: claw.channel.pendingPairingCount ?? 0
                    })}
                  </p>
                ) : null}
              </div>
            ) : (
              <div className="rounded-[1rem] border border-dashed border-[color:var(--surface-border)] bg-[color:var(--surface-panel-soft)] px-4 py-3 text-sm text-muted-foreground">
                {t('claws.card.configureChannelFirst')}
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
