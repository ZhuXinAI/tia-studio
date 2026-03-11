import { Check } from 'lucide-react'
import { cn } from '../../../lib/utils'

type ClawDialogStepperProps = {
  steps: string[]
  currentStep: number
}

export function ClawDialogStepper({
  steps,
  currentStep
}: ClawDialogStepperProps): React.JSX.Element {
  return (
    <ol className="grid gap-3 md:grid-cols-3">
      {steps.map((step, index) => {
        const isComplete = index < currentStep
        const isCurrent = index === currentStep

        return (
          <li
            key={step}
            className={cn(
              'flex items-center gap-3 rounded-lg border px-4 py-3',
              isCurrent
                ? 'border-primary bg-primary/5'
                : isComplete
                  ? 'border-primary/40 bg-primary/5'
                  : 'border-border'
            )}
          >
            <span
              className={cn(
                'flex size-8 items-center justify-center rounded-full border text-sm font-medium',
                isCurrent
                  ? 'border-primary bg-primary text-primary-foreground'
                  : isComplete
                    ? 'border-primary bg-primary/10 text-primary'
                    : 'border-muted-foreground/30 text-muted-foreground'
              )}
            >
              {isComplete ? <Check className="size-4" /> : index + 1}
            </span>
            <span
              className={cn(
                'text-sm font-medium',
                isCurrent ? 'text-foreground' : 'text-muted-foreground'
              )}
            >
              {step}
            </span>
          </li>
        )
      })}
    </ol>
  )
}
