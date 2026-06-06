import * as React from 'react'
import { Slot } from '@radix-ui/react-slot'
import { cva, type VariantProps } from 'class-variance-authority'

import { cn } from '@renderer/lib/utils'

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg border text-sm font-medium transition-[background-color,color,border-color,box-shadow,transform] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/70 focus-visible:ring-offset-0 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        default:
          'border-transparent bg-primary text-primary-foreground shadow-[0_10px_30px_-18px_rgba(0,71,171,0.45)] hover:bg-[#003c92]',
        destructive:
          'border-transparent bg-destructive text-white shadow-[0_10px_25px_-18px_rgba(180,35,24,0.42)] hover:bg-[#9f1f15]',
        outline:
          'border-[color:var(--surface-border)] bg-[color:var(--surface-panel-soft)] text-foreground shadow-none hover:bg-[color:var(--surface-muted)] hover:text-foreground',
        secondary:
          'border-transparent bg-[color:var(--surface-active)] text-foreground shadow-none hover:bg-[color:var(--surface-active-strong)]',
        ghost:
          'border-transparent bg-transparent text-muted-foreground hover:bg-[color:var(--surface-muted)] hover:text-foreground',
        link: 'border-transparent text-primary underline-offset-4 hover:underline'
      },
      size: {
        default: 'h-9 px-4 py-2',
        sm: 'h-8 rounded-md px-3 text-xs',
        lg: 'h-10 rounded-lg px-8',
        icon: 'h-9 w-9 rounded-md'
      }
    },
    defaultVariants: {
      variant: 'default',
      size: 'default'
    }
  }
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  asChild?: boolean
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button'
    return (
      <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />
    )
  }
)
Button.displayName = 'Button'

export { Button, buttonVariants }
