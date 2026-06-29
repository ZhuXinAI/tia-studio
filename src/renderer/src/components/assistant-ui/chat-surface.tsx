import { cn } from '../../lib/utils'

export const chatSurfaceStyles = {
  centeredContent: 'mx-auto w-full max-w-[56rem]',
  panel: 'chat-surface-panel',
  panelElevated: 'chat-surface-panel chat-surface-panel-elevated',
  panelSubtle: 'chat-surface-panel chat-surface-panel-subtle',
  footer: 'chat-surface-footer',
  metaPill: 'chat-meta-pill',
  controlButton:
    'h-9 max-w-[14rem] justify-start gap-2 rounded-full border border-[color:var(--chat-surface-border)] bg-[color:var(--chat-surface-bg-subtle)] px-3 text-muted-foreground shadow-none hover:bg-[color:var(--chat-surface-bg)]',
  controlButtonStatic:
    'h-9 max-w-[14rem] cursor-default justify-start gap-2 rounded-full border border-[color:var(--chat-surface-border)] bg-[color:var(--chat-surface-bg-subtle)] px-3 text-muted-foreground shadow-none hover:bg-[color:var(--chat-surface-bg-subtle)]'
} as const

type ChatSurfaceTone = 'default' | 'elevated' | 'subtle'

type DivProps = React.ComponentProps<'div'>

function resolveToneClassName(tone: ChatSurfaceTone): string {
  if (tone === 'elevated') {
    return chatSurfaceStyles.panelElevated
  }

  if (tone === 'subtle') {
    return chatSurfaceStyles.panelSubtle
  }

  return chatSurfaceStyles.panel
}

export function ChatCenteredContent({ className, ...props }: DivProps): React.JSX.Element {
  return <div className={cn(chatSurfaceStyles.centeredContent, className)} {...props} />
}

export function ChatSurfacePanel({
  tone = 'default',
  className,
  ...props
}: DivProps & {
  tone?: ChatSurfaceTone
}): React.JSX.Element {
  return <div className={cn(resolveToneClassName(tone), className)} {...props} />
}

export function ChatComposerPanel({ className, ...props }: DivProps): React.JSX.Element {
  return (
    <ChatSurfacePanel
      tone="elevated"
      className={cn('overflow-hidden rounded-[1.75rem]', className)}
      {...props}
    />
  )
}

export function ChatSurfaceFooter({ className, ...props }: DivProps): React.JSX.Element {
  return <div className={cn(chatSurfaceStyles.footer, className)} {...props} />
}

export function ChatMetaPill({
  icon: Icon,
  className,
  children,
  ...props
}: DivProps & {
  icon?: React.ComponentType<{ className?: string }>
}): React.JSX.Element {
  return (
    <span className={cn(chatSurfaceStyles.metaPill, className)} {...props}>
      {Icon ? <Icon className="size-3.5 shrink-0" /> : null}
      {children}
    </span>
  )
}
