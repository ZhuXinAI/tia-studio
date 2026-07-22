'use client'

import { memo, type FC } from 'react'
import {
  unstable_defaultDirectiveFormatter,
  type TextMessagePartComponent,
  type Unstable_DirectiveFormatter
} from '@assistant-ui/react'
import { FileText, Wrench } from 'lucide-react'

type IconComponent = FC<{ className?: string }>

function createDirectiveText(
  formatter: Unstable_DirectiveFormatter,
  iconMap: Record<string, IconComponent>
): TextMessagePartComponent {
  const DirectiveText: TextMessagePartComponent = ({ text }) => (
    <>
      {formatter.parse(text).map((segment, index) => {
        if (segment.kind === 'text') {
          return (
            <span key={index} className="whitespace-pre-wrap">
              {segment.text}
            </span>
          )
        }
        const Icon = iconMap[segment.type]
        return (
          <span
            key={index}
            data-slot="directive-text-chip"
            data-directive-type={segment.type}
            data-directive-id={segment.id}
            className="aui-directive-chip mx-0.5 inline-flex max-w-full items-center gap-1 rounded-md border border-primary/20 bg-primary/10 px-1.5 py-0.5 align-baseline text-xs font-medium text-foreground"
            title={segment.id}
          >
            {Icon ? <Icon className="size-3 shrink-0 text-primary" /> : null}
            <span className="truncate">{segment.label}</span>
          </span>
        )
      })}
    </>
  )
  DirectiveText.displayName = 'DirectiveText'
  return DirectiveText
}

export const DirectiveText = memo(
  createDirectiveText(unstable_defaultDirectiveFormatter, { file: FileText, skill: Wrench })
)
