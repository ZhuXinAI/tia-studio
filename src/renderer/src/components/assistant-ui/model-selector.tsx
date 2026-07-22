import { useMemo, useState } from 'react'
import { Bot, Check, ChevronDown, Search } from 'lucide-react'
import { Button } from '@renderer/components/ui/button'
import { Input } from '@renderer/components/ui/input'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@renderer/components/ui/dropdown-menu'

export type ModelSelectorOption = {
  id: string
  name: string
  description?: string
  group: string
  disabled?: boolean
}

export function ModelSelector({
  options,
  value,
  onValueChange,
  disabled = false,
  ariaLabel
}: {
  options: ModelSelectorOption[]
  value: string
  onValueChange: (value: string) => void
  disabled?: boolean
  ariaLabel: string
}) {
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
          <span className="truncate">{selected?.name ?? 'Select model'}</span>
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
            placeholder="Search models…"
            aria-label="Search models"
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
              {groupOptions.map((option) => (
                <DropdownMenuItem
                  key={option.id}
                  disabled={option.disabled}
                  onSelect={() => onValueChange(option.id)}
                  className="min-w-0 gap-2 py-2"
                >
                  <Bot className="size-3.5 shrink-0 text-muted-foreground" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate">{option.name}</span>
                    {option.description ? (
                      <span className="block truncate text-xs text-muted-foreground">
                        {option.description}
                      </span>
                    ) : null}
                  </span>
                  {option.id === value ? <Check className="mt-0.5 size-4 shrink-0" /> : null}
                </DropdownMenuItem>
              ))}
            </div>
          ))}
          {groups.length === 0 ? (
            <p className="px-2 py-3 text-center text-xs text-muted-foreground">No models found.</p>
          ) : null}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
