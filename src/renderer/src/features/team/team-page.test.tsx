import { renderToString } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { TeamPage } from './pages/team-page'
import { MemoryRouter } from 'react-router-dom'

describe('TeamPage', () => {
  it('renders the three-column team shell', () => {
    const html = renderToString(
      <MemoryRouter initialEntries={['/team']}>
        <TeamPage />
      </MemoryRouter>
    )

    expect(html).toContain('Team Workspaces')
    expect(html).toContain('Team Chat')
    expect(html).toContain('Team Status')
  })
})
