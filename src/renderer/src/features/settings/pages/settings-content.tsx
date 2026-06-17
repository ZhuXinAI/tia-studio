import { cn } from '../../../lib/utils'

export function SettingsContent({
  children,
  size = 'default'
}: {
  children: React.ReactNode
  size?: 'default' | 'wide'
}): React.JSX.Element {
  return (
    <div
      className={cn(
        'mx-auto flex w-full flex-col gap-6 py-8',
        size === 'wide' ? 'max-w-6xl' : 'max-w-5xl'
      )}
    >
      {children}
    </div>
  )
}
