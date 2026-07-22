'use client'

import { memo, type ComponentPropsWithoutRef, type FC } from 'react'
import {
  ComposerPrimitive,
  unstable_defaultDirectiveFormatter,
  unstable_useTriggerPopoverScopeContext,
  type Unstable_DirectiveFormatter,
  type Unstable_TriggerItem
} from '@assistant-ui/react'
import { ChevronLeft, ChevronRight, Sparkles } from 'lucide-react'
import { cn } from '@renderer/lib/utils'

type IconComponent = FC<{ className?: string }>

type ComposerTriggerPopoverProps = Omit<
  ComponentPropsWithoutRef<typeof ComposerPrimitive.Unstable_TriggerPopover>,
  'children'
> & {
  directive: {
    formatter?: Unstable_DirectiveFormatter
    onInserted?: (item: Unstable_TriggerItem) => void
  }
  iconMap?: Record<string, IconComponent>
  fallbackIcon?: IconComponent
  backLabel?: string
  emptyCategoriesLabel?: string
  emptyItemsLabel?: string
  loadingLabel?: string
}

const iconFor = (
  key: string | undefined,
  iconMap: Record<string, IconComponent> | undefined,
  fallbackIcon: IconComponent
): IconComponent => (key && iconMap?.[key] ? iconMap[key] : fallbackIcon)

function ComposerTriggerItems({
  iconMap,
  fallbackIcon,
  backLabel,
  emptyItemsLabel,
  loadingLabel
}: Pick<
  ComposerTriggerPopoverProps,
  'iconMap' | 'fallbackIcon' | 'backLabel' | 'emptyItemsLabel' | 'loadingLabel'
> & { fallbackIcon: IconComponent }) {
  const { isLoading } = unstable_useTriggerPopoverScopeContext()
  return (
    <ComposerPrimitive.Unstable_TriggerPopoverItems>
      {(items) => (
        <div className="flex min-h-0 flex-1 flex-col">
          <ComposerPrimitive.Unstable_TriggerPopoverBack className="hover:bg-accent flex cursor-pointer items-center gap-1.5 border-b px-3 py-2 text-xs font-medium text-muted-foreground outline-none">
            <ChevronLeft className="size-3.5" />
            {backLabel}
          </ComposerPrimitive.Unstable_TriggerPopoverBack>
          <div className="min-h-0 overflow-y-auto py-1">
            {items.map((item, index) => {
              const iconKey =
                typeof item.metadata?.icon === 'string' ? item.metadata.icon : undefined
              const Icon = iconFor(iconKey, iconMap, fallbackIcon)
              return (
                <ComposerPrimitive.Unstable_TriggerPopoverItem
                  key={`${item.type}:${item.id}`}
                  item={item}
                  index={index}
                  className="hover:bg-accent data-[highlighted]:bg-accent flex w-full min-w-0 cursor-pointer items-center gap-2 px-3 py-2 text-left outline-none"
                  title={item.description ?? item.label}
                >
                  <Icon className="size-3.5 shrink-0 text-primary" />
                  <span className="min-w-0 shrink truncate text-sm font-medium">{item.label}</span>
                  {item.description ? (
                    <span className="min-w-0 flex-1 truncate text-sm text-muted-foreground">
                      {item.description}
                    </span>
                  ) : null}
                </ComposerPrimitive.Unstable_TriggerPopoverItem>
              )
            })}
            {items.length === 0 ? (
              <p className="px-3 py-2 text-sm text-muted-foreground">
                {isLoading ? loadingLabel : emptyItemsLabel}
              </p>
            ) : null}
          </div>
        </div>
      )}
    </ComposerPrimitive.Unstable_TriggerPopoverItems>
  )
}

const ComposerTriggerPopoverImpl: FC<ComposerTriggerPopoverProps> = ({
  directive,
  iconMap,
  fallbackIcon = Sparkles,
  backLabel = 'Back',
  emptyCategoriesLabel = 'No tags available',
  emptyItemsLabel = 'No matching tags',
  loadingLabel = 'Loading tags…',
  className,
  ...props
}) => {
  return (
    <ComposerPrimitive.Unstable_TriggerPopover
      {...props}
      className={cn(
        'aui-composer-trigger-popover bg-popover text-popover-foreground absolute bottom-full start-0 z-50 mb-2 flex max-h-[calc(100dvh-8rem)] w-80 flex-col overflow-hidden rounded-xl border shadow-lg',
        className
      )}
    >
      <ComposerPrimitive.Unstable_TriggerPopover.Directive
        formatter={directive.formatter ?? unstable_defaultDirectiveFormatter}
        onInserted={directive.onInserted}
      />
      <ComposerPrimitive.Unstable_TriggerPopoverCategories>
        {(categories) => (
          <div className="flex flex-col py-1">
            {categories.map((category) => {
              const Icon = iconFor(category.id, iconMap, fallbackIcon)
              return (
                <ComposerPrimitive.Unstable_TriggerPopoverCategoryItem
                  key={category.id}
                  categoryId={category.id}
                  className="hover:bg-accent data-[highlighted]:bg-accent flex cursor-pointer items-center justify-between gap-2 px-3 py-2 text-sm outline-none"
                >
                  <span className="flex items-center gap-2">
                    <Icon className="size-4 text-muted-foreground" />
                    {category.label}
                  </span>
                  <ChevronRight className="size-4 text-muted-foreground" />
                </ComposerPrimitive.Unstable_TriggerPopoverCategoryItem>
              )
            })}
            {categories.length === 0 ? (
              <p className="px-3 py-2 text-sm text-muted-foreground">{emptyCategoriesLabel}</p>
            ) : null}
          </div>
        )}
      </ComposerPrimitive.Unstable_TriggerPopoverCategories>
      <ComposerTriggerItems
        iconMap={iconMap}
        fallbackIcon={fallbackIcon}
        backLabel={backLabel}
        emptyItemsLabel={emptyItemsLabel}
        loadingLabel={loadingLabel}
      />
    </ComposerPrimitive.Unstable_TriggerPopover>
  )
}

export const ComposerTriggerPopover = memo(ComposerTriggerPopoverImpl)
