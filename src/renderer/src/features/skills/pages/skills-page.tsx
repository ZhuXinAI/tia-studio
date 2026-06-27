import { Check, Download, Plus, Search, Sparkles, Star, Upload } from 'lucide-react'
import { useMemo, useRef, useState } from 'react'
import { Button } from '../../../components/ui/button'
import { Input } from '../../../components/ui/input'
import { cn } from '../../../lib/utils'

type SkillCategory =
  | 'All'
  | 'Recommended'
  | 'Productivity'
  | 'Content'
  | 'Development'
  | 'Data'
  | 'Design'

type SkillCardRecord = {
  id: string
  title: string
  summary: string
  provider: string
  category: Exclude<SkillCategory, 'All'>
  downloads: string
  stars: number
  source: 'market' | 'upload'
}

const catalogSkills: SkillCardRecord[] = [
  {
    id: 'skill-web-tools-guide',
    title: 'web-tools-guide',
    summary: 'Mandatory browsing and fetching helper for tasks that need web context.',
    provider: 'docs.internal',
    category: 'Recommended',
    downloads: '164k',
    stars: 77,
    source: 'market'
  },
  {
    id: 'skill-kdocs',
    title: 'kdocs skill',
    summary: 'Search, read, and work with KDocs and WPS cloud documents.',
    provider: '365.kdocs.cn',
    category: 'Productivity',
    downloads: '31k',
    stars: 54,
    source: 'market'
  },
  {
    id: 'skill-tencent-docs',
    title: 'Tencent Docs',
    summary: 'Manage Tencent Docs content, permissions, and shared drafting workflows.',
    provider: 'docs.qq.com',
    category: 'Productivity',
    downloads: '100k',
    stars: 163,
    source: 'market'
  },
  {
    id: 'skill-anysearch',
    title: 'AnySearch',
    summary: 'Real-time search engine with web, news, and structured result modes.',
    provider: 'search.anysearch.ai',
    category: 'Data',
    downloads: '17k',
    stars: 36,
    source: 'market'
  },
  {
    id: 'skill-pptx',
    title: 'pptx',
    summary: 'Generate slide decks and presentation-ready outlines from prompts.',
    provider: 'slides.tools',
    category: 'Content',
    downloads: '17k',
    stars: 10,
    source: 'market'
  },
  {
    id: 'skill-cos',
    title: 'Tencent COS',
    summary: 'Store and retrieve large files, artifacts, and generated outputs.',
    provider: 'cloud.tencent.com',
    category: 'Development',
    downloads: '14k',
    stars: 9,
    source: 'market'
  },
  {
    id: 'skill-lighthouse',
    title: 'Tencent Cloud Lighthouse',
    summary: 'Launch lightweight compute tasks and deployment helpers.',
    provider: 'cloud.tencent.com',
    category: 'Development',
    downloads: '17k',
    stars: 7,
    source: 'market'
  },
  {
    id: 'skill-poster',
    title: 'poster-studio',
    summary: 'Prepare polished poster and visual layout drafts for quick campaign work.',
    provider: 'design.tools',
    category: 'Design',
    downloads: '8.8k',
    stars: 38,
    source: 'market'
  },
  {
    id: 'skill-copy-lab',
    title: 'copy-lab',
    summary: 'Rewrite, tone-shift, and clean editorial copy with less AI residue.',
    provider: 'copy.tools',
    category: 'Content',
    downloads: '17k',
    stars: 99,
    source: 'market'
  }
]

const categoryOptions: SkillCategory[] = [
  'All',
  'Recommended',
  'Productivity',
  'Content',
  'Development',
  'Data',
  'Design'
]

function buildUploadedSkill(file: File): SkillCardRecord {
  const normalizedTitle = file.name.replace(/\.zip$/i, '')
  return {
    id: `upload-${file.name}-${file.lastModified}`,
    title: normalizedTitle,
    summary: 'Uploaded from a local zip package.',
    provider: 'Local zip',
    category: 'Development',
    downloads: 'local',
    stars: 0,
    source: 'upload'
  }
}

export function SkillsPage(): React.JSX.Element {
  const [activeTab, setActiveTab] = useState<'market' | 'installed'>('market')
  const [activeCategory, setActiveCategory] = useState<SkillCategory>('All')
  const [searchQuery, setSearchQuery] = useState('')
  const [installedSkillIds, setInstalledSkillIds] = useState<string[]>([
    'skill-web-tools-guide',
    'skill-tencent-docs',
    'skill-anysearch'
  ])
  const [uploadedSkills, setUploadedSkills] = useState<SkillCardRecord[]>([])
  const zipInputRef = useRef<HTMLInputElement | null>(null)

  const installedSkills = useMemo(() => {
    return [
      ...catalogSkills.filter((skill) => installedSkillIds.includes(skill.id)),
      ...uploadedSkills
    ]
  }, [installedSkillIds, uploadedSkills])

  const visibleSkills = useMemo(() => {
    const baseSkills = activeTab === 'market' ? catalogSkills : installedSkills
    const normalizedQuery = searchQuery.trim().toLowerCase()

    return baseSkills.filter((skill) => {
      const matchesCategory = activeCategory === 'All' || skill.category === activeCategory
      const matchesQuery =
        normalizedQuery.length === 0 ||
        [skill.title, skill.summary, skill.provider].some((value) =>
          value.toLowerCase().includes(normalizedQuery)
        )

      return matchesCategory && matchesQuery
    })
  }, [activeCategory, activeTab, installedSkills, searchQuery])

  const handleInstallSkill = (skillId: string): void => {
    setInstalledSkillIds((current) => (current.includes(skillId) ? current : [...current, skillId]))
    setActiveTab('installed')
  }

  const handleUploadZip = (event: React.ChangeEvent<HTMLInputElement>): void => {
    const files = Array.from(event.target.files ?? [])
    if (files.length === 0) {
      return
    }

    setUploadedSkills((current) => {
      const next = [...current]
      for (const file of files) {
        next.unshift(buildUploadedSkill(file))
      }
      return next
    })
    setActiveTab('installed')
    event.target.value = ''
  }

  return (
    <section className="flex h-full min-h-0 flex-col overflow-hidden">
      <div className="border-b border-[color:var(--surface-border)] px-8 py-6">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              className={cn(
                'inline-flex items-center gap-2 rounded-xl border px-4 py-2 text-sm transition-colors',
                activeTab === 'market'
                  ? 'border-[color:var(--surface-border-strong)] bg-[color:var(--surface-active)] text-foreground shadow-[inset_0_0_0_1px_var(--surface-active-strong)]'
                  : 'border-transparent text-muted-foreground hover:bg-[color:var(--surface-muted)] hover:text-foreground'
              )}
              onClick={() => setActiveTab('market')}
            >
              <Sparkles className="size-4" />
              Skill market
            </button>
            <button
              type="button"
              className={cn(
                'inline-flex items-center gap-2 rounded-xl border px-4 py-2 text-sm transition-colors',
                activeTab === 'installed'
                  ? 'border-[color:var(--surface-border-strong)] bg-[color:var(--surface-active)] text-foreground shadow-[inset_0_0_0_1px_var(--surface-active-strong)]'
                  : 'border-transparent text-muted-foreground hover:bg-[color:var(--surface-muted)] hover:text-foreground'
              )}
              onClick={() => setActiveTab('installed')}
            >
              <Check className="size-4" />
              Installed
              <span className="rounded-full bg-[color:var(--surface-muted)] px-2 py-0.5 text-[11px] text-muted-foreground">
                {installedSkills.length}
              </span>
            </button>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="relative w-full sm:w-[22rem]">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder="Search skills"
                className="h-11 rounded-xl pl-9"
              />
            </div>
            <Button
              type="button"
              variant="outline"
              className="h-11 rounded-xl px-4"
              onClick={() => zipInputRef.current?.click()}
            >
              <Upload className="size-4" />
              Add Skill Zip
            </Button>
            <input
              ref={zipInputRef}
              type="file"
              accept=".zip,application/zip"
              multiple
              className="hidden"
              onChange={handleUploadZip}
            />
          </div>
        </div>
      </div>

      <div className="border-b border-[color:var(--surface-border)] px-8 py-4">
        <div className="flex flex-wrap gap-2">
          {categoryOptions.map((category) => (
            <button
              key={category}
              type="button"
              className={cn(
                'rounded-xl px-4 py-2 text-sm transition-colors',
                activeCategory === category
                  ? 'bg-[color:var(--surface-active)] text-foreground'
                  : 'text-muted-foreground hover:bg-[color:var(--surface-muted)] hover:text-foreground'
              )}
              onClick={() => setActiveCategory(category)}
            >
              {category}
            </button>
          ))}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-8 py-6">
        {visibleSkills.length === 0 ? (
          <div className="rounded-[1.4rem] border border-dashed border-[color:var(--surface-border)] px-6 py-10 text-center text-sm text-muted-foreground">
            No skills match this view.
          </div>
        ) : (
          <div className="grid gap-4 xl:grid-cols-3">
            {visibleSkills.map((skill) => {
              const isInstalled =
                installedSkillIds.includes(skill.id) || uploadedSkills.some((item) => item.id === skill.id)

              return (
                <article
                  key={skill.id}
                  className="rounded-[1.4rem] border border-[color:var(--surface-border)] bg-[linear-gradient(180deg,color-mix(in_srgb,var(--surface-paper)_98%,transparent),color-mix(in_srgb,var(--surface-panel)_70%,transparent))] p-5 shadow-[inset_0_1px_0_color-mix(in_srgb,var(--surface-paper)_40%,transparent)]"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="space-y-1">
                      <p className="font-editorial text-[1.35rem] leading-none tracking-[-0.025em]">
                        {skill.title}
                      </p>
                      <p className="text-sm text-muted-foreground">{skill.provider}</p>
                    </div>
                    <Button
                      type="button"
                      variant={isInstalled ? 'secondary' : 'outline'}
                      size="icon"
                      className="size-10 rounded-xl"
                      onClick={() => {
                        if (!isInstalled) {
                          handleInstallSkill(skill.id)
                        }
                      }}
                    >
                      {isInstalled ? <Check className="size-4" /> : <Plus className="size-4" />}
                    </Button>
                  </div>

                  <p className="pt-4 text-sm leading-6 text-muted-foreground">{skill.summary}</p>

                  <div className="pt-5">
                    <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
                      <span className="inline-flex items-center gap-1.5">
                        <Download className="size-4" />
                        {skill.downloads}
                      </span>
                      <span className="inline-flex items-center gap-1.5">
                        <Star className="size-4" />
                        {skill.stars}
                      </span>
                      <span className="rounded-full bg-[color:var(--surface-muted)] px-2.5 py-1 text-[11px] uppercase tracking-[0.08em]">
                        {skill.category}
                      </span>
                    </div>
                  </div>
                </article>
              )
            })}
          </div>
        )}
      </div>
    </section>
  )
}
