import { renderToString } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { TeamPage } from './pages/team-page'
import { MemoryRouter } from 'react-router-dom'

describe('TeamPage', () => {
  it('matches the Home shell and removes the in-page status drawer', () => {
    const html = renderToString(
      <MemoryRouter initialEntries={['/team']}>
        <TeamPage />
      </MemoryRouter>
    )

    expect(html).toContain('Team Threads')
    expect(html).toContain('Team Chat')
    expect(html).toContain('data-team-page-shell="true"')
    expect(html).toContain('h-[calc(100vh-3.5rem)]')
    expect(html).toContain('min-h-[650px]')
    expect(html).toContain('overflow-hidden')
    expect(html).toContain('border border-border/80 bg-background/50')
    expect(html).toContain('data-slot="sidebar-inset"')
    expect(html).toContain('data-team-main-chat="true"')
    expect(html).toContain('data-team-status-dialog="true"')
    expect(html).not.toContain('data-team-status-drawer=')
  })
})
