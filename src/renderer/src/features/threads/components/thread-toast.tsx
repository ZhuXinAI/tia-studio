import { cn } from '../../../lib/utils'

type ThreadToastState = {
  kind: 'success' | 'error'
  message: string
}

type ThreadToastProps = {
  toast: ThreadToastState | null
}

export function ThreadToast({ toast }: ThreadToastProps): React.JSX.Element | null {
  if (!toast) {
    return null
  }

  return (
    <div className="pointer-events-none fixed right-4 bottom-4 z-40 max-w-sm">
      <p
        role={toast.kind === 'error' ? 'alert' : 'status'}
        className={cn(
          'rounded-md border bg-background/95 px-3 py-2 text-sm shadow-lg backdrop-blur',
          toast.kind === 'error'
            ? 'border-destructive/60 text-destructive'
            : 'border-emerald-500/60 text-emerald-300'
        )}
      >
        {toast.message}
      </p>
    </div>
  )
}
