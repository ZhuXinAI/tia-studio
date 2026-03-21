import { Search } from 'lucide-react'
import { useMemo, useState } from 'react'
import type { ProviderRecord } from '../settings/providers/providers-query'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../../components/ui/dialog'
import { Input } from '../../components/ui/input'
import { Avatar, AvatarFallback, AvatarImage } from '../../components/ui/avatar'
import { cn } from '../../lib/utils'
import { useTranslation } from '../../i18n/use-app-translation'
import minimaxLogo from '../../assets/providers/minimax.png'
import glmLogo from '../../assets/providers/glm.png'
import ollamaLogo from '../../assets/providers/ollama.png'
import openaiLogo from '../../assets/providers/openai.png'
import anthropicLogo from '../../assets/providers/anthropic.png'
import geminiLogo from '../../assets/providers/gemini.png'
import kimiLogo from '../../assets/providers/kimi.png'

type ModelPickerDialogProps = {
  open: boolean
  providers: ProviderRecord[]
  selectedProviderId: string
  onSelect: (providerId: string) => void
  onOpenChange: (open: boolean) => void
}

function getProviderAvatarPath(icon: string | null): string | null {
  if (!icon) {
    return null
  }

  const iconMap: Record<string, string> = {
    minimax: minimaxLogo,
    glm: glmLogo,
    ollama: ollamaLogo,
    openai: openaiLogo,
    anthropic: anthropicLogo,
    gemini: geminiLogo,
    kimi: kimiLogo
  }

  return iconMap[icon] || null
}

function getProviderInitials(name: string): string {
  return name
    .split(' ')
    .map((word) => word[0])
    .join('')
    .toUpperCase()
    .slice(0, 2)
}

export function ModelPickerDialog({
  open,
  providers,
  selectedProviderId,
  onSelect,
  onOpenChange
}: ModelPickerDialogProps): React.JSX.Element {
  const { t } = useTranslation()
  const [searchQuery, setSearchQuery] = useState('')

  const filteredProviders = useMemo(() => {
    const query = searchQuery.trim().toLowerCase()
    if (query.length === 0) {
      return providers
    }

    return providers.filter((provider) => {
      return [provider.name, provider.selectedModel, provider.type].some((value) =>
        value.toLowerCase().includes(query)
      )
    })
  }, [searchQuery, providers])

  const handleSelect = (providerId: string): void => {
    onSelect(providerId)
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        aria-describedby={undefined}
        className="max-w-2xl max-h-[600px] flex flex-col p-0"
      >
        <DialogHeader className="px-6 pt-6 pb-4">
          <DialogTitle>{t('assistants.modelPicker.title')}</DialogTitle>
        </DialogHeader>

        <div className="px-6 pb-4">
          <div className="relative">
            <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2" />
            <Input
              placeholder={t('assistants.modelPicker.searchPlaceholder')}
              className="h-9 pl-9"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              autoFocus
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-6 pb-6">
          {filteredProviders.length === 0 ? (
            <p className="text-muted-foreground text-sm text-center py-8">
              {t('assistants.modelPicker.empty')}
            </p>
          ) : (
            <div className="space-y-1">
              {filteredProviders.map((provider) => {
                const isSelected = provider.id === selectedProviderId
                const avatarPath = getProviderAvatarPath(provider.icon)
                const initials = getProviderInitials(provider.name)

                return (
                  <button
                    key={provider.id}
                    type="button"
                    className={cn(
                      'w-full flex items-center gap-3 px-4 py-3 rounded-lg text-left transition-colors',
                      isSelected ? 'bg-primary/10 text-primary' : 'hover:bg-accent/40'
                    )}
                    onClick={() => handleSelect(provider.id)}
                  >
                    <Avatar className="h-10 w-10 shrink-0">
                      {avatarPath ? <AvatarImage src={avatarPath} alt={provider.name} /> : null}
                      <AvatarFallback className="text-xs font-semibold">{initials}</AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <p className="text-base font-semibold truncate">{provider.name}</p>
                      <p className="text-muted-foreground text-sm truncate">
                        {provider.selectedModel}
                      </p>
                    </div>
                  </button>
                )
              })}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
