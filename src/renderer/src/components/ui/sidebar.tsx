import * as React from 'react'
import { Slot } from '@radix-ui/react-slot'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '../../lib/utils'

function Sidebar({ className, ...props }: React.ComponentProps<'aside'>): React.JSX.Element {
  return (
    <aside
      data-slot="sidebar"
      className={cn(
        'bg-card/85 text-card-foreground flex h-full w-80 shrink-0 flex-col border-r border-border/80 backdrop-blur',
        className
      )}
      {...props}
    />
  )
}

function SidebarHeader({ className, ...props }: React.ComponentProps<'div'>): React.JSX.Element {
  return (
    <div
      data-slot="sidebar-header"
      className={cn('border-b border-border/70 px-4 py-4', className)}
      {...props}
    />
  )
}

function SidebarContent({ className, ...props }: React.ComponentProps<'div'>): React.JSX.Element {
  return (
    <div
      data-slot="sidebar-content"
      className={cn('flex-1 overflow-y-auto px-3 py-3', className)}
      {...props}
    />
  )
}

function SidebarFooter({ className, ...props }: React.ComponentProps<'div'>): React.JSX.Element {
  return (
    <div
      data-slot="sidebar-footer"
      className={cn('border-t border-border/70 px-4 py-3', className)}
      {...props}
    />
  )
}

function SidebarGroup({ className, ...props }: React.ComponentProps<'section'>): React.JSX.Element {
  return <section data-slot="sidebar-group" className={cn('my-2', className)} {...props} />
}

function SidebarGroupLabel({ className, ...props }: React.ComponentProps<'h2'>): React.JSX.Element {
  return (
    <h2
      data-slot="sidebar-group-label"
      className={cn(
        'text-muted-foreground px-2 text-xs font-semibold tracking-wide uppercase',
        className
      )}
      {...props}
    />
  )
}

function SidebarMenu({ className, ...props }: React.ComponentProps<'ul'>): React.JSX.Element {
  return <ul data-slot="sidebar-menu" className={cn('space-y-1', className)} {...props} />
}

function SidebarMenuItem({ className, ...props }: React.ComponentProps<'li'>): React.JSX.Element {
  return <li data-slot="sidebar-menu-item" className={cn('space-y-1', className)} {...props} />
}

const sidebarMenuButtonVariants = cva(
  'focus-visible:ring-ring/50 flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm outline-none transition-colors focus-visible:ring-[3px] disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      variant: {
        default: 'hover:bg-accent/60 hover:text-accent-foreground',
        active: 'bg-accent text-accent-foreground'
      }
    },
    defaultVariants: {
      variant: 'default'
    }
  }
)

type SidebarMenuButtonProps = React.ComponentProps<'button'> &
  VariantProps<typeof sidebarMenuButtonVariants> & {
    asChild?: boolean
  }

function SidebarMenuButton({
  className,
  variant,
  asChild = false,
  ...props
}: SidebarMenuButtonProps): React.JSX.Element {
  const Comp = asChild ? Slot : 'button'
  return (
    <Comp
      data-slot="sidebar-menu-button"
      className={cn(sidebarMenuButtonVariants({ variant, className }))}
      {...props}
    />
  )
}

function SidebarMenuSub({ className, ...props }: React.ComponentProps<'ul'>): React.JSX.Element {
  return (
    <ul
      data-slot="sidebar-menu-sub"
      className={cn('ml-4 space-y-1 border-l border-border/60 pl-3', className)}
      {...props}
    />
  )
}

function SidebarMenuSubItem({
  className,
  ...props
}: React.ComponentProps<'li'>): React.JSX.Element {
  return <li data-slot="sidebar-menu-sub-item" className={cn(className)} {...props} />
}

const sidebarMenuSubButtonVariants = cva(
  'focus-visible:ring-ring/50 text-muted-foreground hover:text-foreground hover:bg-accent/45 flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-xs outline-none transition-colors focus-visible:ring-[3px]',
  {
    variants: {
      variant: {
        default: '',
        active: 'bg-accent/70 text-foreground'
      }
    },
    defaultVariants: {
      variant: 'default'
    }
  }
)

type SidebarMenuSubButtonProps = React.ComponentProps<'button'> &
  VariantProps<typeof sidebarMenuSubButtonVariants> & {
    asChild?: boolean
  }

function SidebarMenuSubButton({
  className,
  variant,
  asChild = false,
  ...props
}: SidebarMenuSubButtonProps): React.JSX.Element {
  const Comp = asChild ? Slot : 'button'
  return (
    <Comp
      data-slot="sidebar-menu-sub-button"
      className={cn(sidebarMenuSubButtonVariants({ variant, className }))}
      {...props}
    />
  )
}

function SidebarInset({ className, ...props }: React.ComponentProps<'div'>): React.JSX.Element {
  return <div data-slot="sidebar-inset" className={cn('min-h-0 flex-1', className)} {...props} />
}

export {
  Sidebar,
  SidebarHeader,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarMenuSub,
  SidebarMenuSubItem,
  SidebarMenuSubButton,
  SidebarInset
}
