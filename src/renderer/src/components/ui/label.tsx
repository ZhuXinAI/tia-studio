import * as React from 'react'
import * as LabelPrimitive from '@radix-ui/react-label'
import { cn } from '../../lib/utils'

function Label({ className, ...props }: React.ComponentProps<typeof LabelPrimitive.Root>) {
  return (
    <LabelPrimitive.Root
      data-slot="label"
      className={cn(
        'flex items-center gap-2 text-sm leading-none font-medium select-none has-[+input:disabled]:cursor-not-allowed has-[+input:disabled]:opacity-50 has-[+textarea:disabled]:cursor-not-allowed has-[+textarea:disabled]:opacity-50 has-[+select:disabled]:cursor-not-allowed has-[+select:disabled]:opacity-50',
        className
      )}
      {...props}
    />
  )
}

export { Label }
