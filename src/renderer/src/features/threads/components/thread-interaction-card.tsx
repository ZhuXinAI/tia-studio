import { useState } from 'react'
import { toast } from 'sonner'
import type {
  AgentInteractionRequest,
  AgentInteractionResponse
} from '../../../../../shared/agent-runtime'
import { Button } from '../../../components/ui/button'
import { Input } from '../../../components/ui/input'
import { useTranslation } from '../../../i18n/use-app-translation'
import { toErrorMessage } from '../thread-page-routing'
import { respondToAgentInteraction } from '../agent-sessions-query'

/** A session-agnostic renderer for an agent confirmation or input request. */
export function ThreadInteractionCard({
  sessionId,
  request
}: {
  sessionId: string
  request: AgentInteractionRequest
}): React.JSX.Element {
  const { t } = useTranslation()
  const [value, setValue] = useState(request.method === 'editor' ? (request.prefill ?? '') : '')
  const [isPending, setIsPending] = useState(false)

  async function respond(response: AgentInteractionResponse): Promise<void> {
    setIsPending(true)
    try {
      await respondToAgentInteraction(sessionId, response)
    } catch (error) {
      toast.error(toErrorMessage(error))
      setIsPending(false)
    }
  }

  return (
    <div className="border-border bg-muted/40 mx-4 flex flex-wrap items-center gap-2 rounded-lg border px-3 py-2 text-sm">
      <div className="min-w-0 flex-1">
        <p className="font-medium">
          {request.method === 'permission' ? t('threads.page.allowCommand') : request.title}
        </p>
        {request.method === 'confirm' || request.method === 'permission' ? (
          <p className="text-muted-foreground mt-0.5 text-xs">
            {request.method === 'permission'
              ? t('threads.page.runCommand', { command: request.command })
              : request.message}
          </p>
        ) : null}
        {request.method === 'permission' && request.proposedPrefixes.length > 0 ? (
          <div className="mt-2 space-y-1 text-xs">
            <p className="text-muted-foreground">{t('threads.page.rememberedPrefix')}</p>
            {request.proposedPrefixes.map((prefix) => (
              <code key={prefix} className="bg-background block w-fit rounded px-1.5 py-0.5">
                {prefix}
              </code>
            ))}
          </div>
        ) : null}
        {request.method === 'permission' && !request.reusable ? (
          <p className="text-muted-foreground mt-2 text-xs">
            {t('threads.page.onceOnly', { reason: request.nonReusableReason ?? '' })}
          </p>
        ) : null}
      </div>
      {request.method === 'permission' ? (
        <>
          <Button
            size="sm"
            variant="outline"
            disabled={isPending}
            onClick={() => void respond({ id: request.id, permissionOutcome: 'deny' })}
          >
            {t('threads.page.deny')}
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={isPending}
            onClick={() => void respond({ id: request.id, permissionOutcome: 'allow-once' })}
          >
            {t('threads.page.allowOnce')}
          </Button>
          {request.reusable ? (
            <>
              <Button
                size="sm"
                variant="outline"
                disabled={isPending}
                onClick={() => void respond({ id: request.id, permissionOutcome: 'allow-session' })}
              >
                {t('threads.page.allowSession')}
              </Button>
              <Button
                size="sm"
                disabled={isPending}
                onClick={() =>
                  void respond({ id: request.id, permissionOutcome: 'allow-workspace' })
                }
              >
                {t('threads.page.allowWorkspace')}
              </Button>
            </>
          ) : null}
        </>
      ) : request.method === 'confirm' ? (
        <>
          <Button
            size="sm"
            variant="outline"
            disabled={isPending}
            onClick={() => void respond({ id: request.id, confirmed: false })}
          >
            {t('threads.page.deny')}
          </Button>
          <Button
            size="sm"
            disabled={isPending}
            onClick={() => void respond({ id: request.id, confirmed: true })}
          >
            {t('threads.page.allowOnce')}
          </Button>
        </>
      ) : request.method === 'select' ? (
        request.options.map((option) => (
          <Button
            key={option}
            size="sm"
            variant="outline"
            disabled={isPending}
            onClick={() => void respond({ id: request.id, value: option })}
          >
            {option}
          </Button>
        ))
      ) : (
        <>
          <Input
            value={value}
            placeholder={request.method === 'input' ? request.placeholder : undefined}
            className="h-8 min-w-48 flex-1"
            onChange={(event) => setValue(event.target.value)}
          />
          <Button
            size="sm"
            disabled={isPending}
            onClick={() => void respond({ id: request.id, value })}
          >
            {t('threads.page.submit')}
          </Button>
        </>
      )}
    </div>
  )
}
