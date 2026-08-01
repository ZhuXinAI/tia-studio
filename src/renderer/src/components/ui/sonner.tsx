import { Toaster as Sonner } from 'sonner'
import { createPortal } from 'react-dom'

type ToasterProps = React.ComponentProps<typeof Sonner>

const Toaster = ({ ...props }: ToasterProps) => {
  const toaster = (
    <Sonner
      theme="dark"
      className="toaster group"
      toastOptions={{
        style: { zIndex: 2147483647 },
        classNames: {
          toast:
            'group toast group-[.toaster]:bg-background group-[.toaster]:text-foreground group-[.toaster]:border-border group-[.toaster]:shadow-lg',
          description: 'group-[.toast]:text-muted-foreground',
          actionButton: 'group-[.toast]:bg-primary group-[.toast]:text-primary-foreground',
          cancelButton: 'group-[.toast]:bg-muted group-[.toast]:text-muted-foreground'
        }
      }}
      {...props}
      style={{ zIndex: 2147483647, ...props.style }}
    />
  )

  return typeof document === 'undefined' ? toaster : createPortal(toaster, document.body)
}

export { Toaster }
