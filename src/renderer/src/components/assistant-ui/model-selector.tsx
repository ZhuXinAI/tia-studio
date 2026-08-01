import { useMemo, useState } from 'react'
import { Brain, Bot, Check, ChevronDown, Search } from 'lucide-react'
import { Button } from '@renderer/components/ui/button'
import { Input } from '@renderer/components/ui/input'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger
} from '@renderer/components/ui/dropdown-menu'
import type { AgentThinkingLevel } from '../../../../shared/agent-runtime'
import type { AgentThinkingStrength } from '../../../../shared/thinking'
import { useTranslation } from '../../i18n/use-app-translation'

export type ModelThinkingOption = {
  supportsThinking: boolean
  thinkingOnly: boolean
  allowsThinkingOff: boolean
  defaultThinkingLevel: AgentThinkingLevel
  supportedThinkingLevels: AgentThinkingStrength[]
}

export type ModelSelectorOption = {
  id: string
  name: string
  description?: string
  group: string
  disabled?: boolean
  thinking?: ModelThinkingOption
}

export function ModelSelector({
  options,
  value,
  onValueChange,
  thinkingLevel = 'off',
  onThinkingLevelChange,
  disabled = false,
  ariaLabel
}: {
  options: ModelSelectorOption[]
  value: string
  onValueChange: (value: string) => void
  thinkingLevel?: AgentThinkingLevel
  onThinkingLevelChange?: (option: ModelSelectorOption, level: AgentThinkingLevel) => void
  disabled?: boolean
  ariaLabel: string
}) {
  const { t } = useTranslation()
  const [query, setQuery] = useState('')
  const selected = options.find((option) => option.id === value)
  const groups = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase()
    const matching = options.filter(
      (option) =>
        !normalizedQuery ||
        option.name.toLowerCase().includes(normalizedQuery) ||
        option.description?.toLowerCase().includes(normalizedQuery) ||
        option.group.toLowerCase().includes(normalizedQuery)
    )
    return Array.from(new Set(matching.map((option) => option.group))).map((group) => ({
      group,
      options: matching.filter((option) => option.group === group)
    }))
  }, [options, query])

  const thinkingLevelsFor = (option: ModelSelectorOption): AgentThinkingLevel[] => {
    if (!option.thinking?.supportsThinking) return []
    return [
      ...(option.thinking.thinkingOnly || !option.thinking.allowsThinkingOff
        ? []
        : ['off' as const]),
      ...option.thinking.supportedThinkingLevels
    ]
  }

  const levelFor = (option: ModelSelectorOption): AgentThinkingLevel => {
    const levels = thinkingLevelsFor(option)
    return option.id === value && levels.includes(thinkingLevel)
      ? thinkingLevel
      : (option.thinking?.defaultThinkingLevel ?? 'off')
  }

  const renderOptionLabel = (option: ModelSelectorOption): React.JSX.Element => (
    <>
      <Bot className="size-3.5 shrink-0 text-muted-foreground" />
      <span className="min-w-0 flex-1">
        <span className="block truncate">{option.name}</span>
        {option.description ? (
          <span className="block truncate text-xs text-muted-foreground">{option.description}</span>
        ) : null}
      </span>
      {option.thinking?.supportsThinking ? (
        <Brain className="size-3.5 shrink-0 text-primary/70" aria-hidden="true" />
      ) : null}
      {option.id === value ? <Check className="mt-0.5 size-4 shrink-0" /> : null}
    </>
  )

  return (
    <DropdownMenu onOpenChange={(open) => !open && setQuery('')}>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          role="combobox"
          aria-haspopup="listbox"
          aria-label={ariaLabel}
          disabled={disabled}
          className="h-7 max-w-44 gap-1.5 rounded-lg px-2 text-xs font-normal text-muted-foreground"
        >
          <Bot className="size-3.5 shrink-0" />
          <span className="truncate">{selected?.name ?? t('threads.composer.selectModel')}</span>
          <ChevronDown className="size-3 shrink-0 opacity-60" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        side="top"
        className="w-72 max-w-[calc(100vw-2rem)] overflow-hidden p-1.5"
      >
        <div className="relative mb-1.5 px-1" onKeyDown={(event) => event.stopPropagation()}>
          <Search className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            autoFocus
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t('threads.composer.searchModels')}
            aria-label={t('threads.composer.searchModels')}
            className="h-8 pl-7 text-xs"
          />
        </div>
        <div
          role="listbox"
          aria-label={ariaLabel}
          className="chat-scrollbar max-h-60 min-w-0 overflow-x-hidden overflow-y-auto overscroll-contain"
        >
          {groups.map(({ group, options: groupOptions }, groupIndex) => (
            <div key={group}>
              {groupIndex > 0 ? <DropdownMenuSeparator /> : null}
              <DropdownMenuLabel className="px-2 text-xs text-muted-foreground">
                {group}
              </DropdownMenuLabel>
              {groupOptions.map((option) =>
                option.thinking?.supportsThinking ? (
                  <DropdownMenuSub key={option.id}>
                    <DropdownMenuSubTrigger
                      disabled={option.disabled}
                      className="min-w-0 gap-2 py-2"
                      onSelect={(event) => {
                        event.preventDefault()
                        onValueChange(option.id)
                      }}
                    >
                      {renderOptionLabel(option)}
                    </DropdownMenuSubTrigger>
                    <DropdownMenuSubContent className="w-56">
                      <DropdownMenuLabel className="flex items-center gap-2 text-xs text-muted-foreground">
                        <Brain className="size-3.5" />
                        {t('threads.composer.thinkingMode')}
                      </DropdownMenuLabel>
                      <DropdownMenuRadioGroup
                        value={levelFor(option)}
                        onValueChange={(level) => {
                          onValueChange(option.id)
                          onThinkingLevelChange?.(option, level as AgentThinkingLevel)
                        }}
                      >
                        {thinkingLevelsFor(option).map((level) => (
                          <DropdownMenuRadioItem key={level} value={level} className="gap-2">
                            <span className="flex-1">
                              {level === 'off'
                                ? t('threads.composer.thinkingOff')
                                : t(`threads.composer.thinkingLevels.${level}`)}
                            </span>
                          </DropdownMenuRadioItem>
                        ))}
                      </DropdownMenuRadioGroup>
                    </DropdownMenuSubContent>
                  </DropdownMenuSub>
                ) : (
                  <DropdownMenuItem
                    key={option.id}
                    disabled={option.disabled}
                    onSelect={() => onValueChange(option.id)}
                    className="min-w-0 gap-2 py-2"
                  >
                    {renderOptionLabel(option)}
                  </DropdownMenuItem>
                )
              )}
            </div>
          ))}
          {groups.length === 0 ? (
            <p className="px-2 py-3 text-center text-xs text-muted-foreground">
              {t('threads.composer.noModels')}
            </p>
          ) : null}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
