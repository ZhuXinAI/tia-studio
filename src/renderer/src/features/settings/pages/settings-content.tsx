import { cn } from '../../../lib/utils'

export function SettingsPageShell({ children }: { children: React.ReactNode }): React.JSX.Element {
  return (
    <div className="mx-auto flex min-h-full w-full max-w-6xl flex-col gap-6 px-4 py-8 pb-12 sm:px-6 lg:px-8">
      {children}
    </div>
  )
}

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
