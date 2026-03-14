import { renderToString } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import { GroupPage } from './pages/group-page'

describe('GroupPage', () => {
  it('renders the group shell and room transcript', () => {
    const html = renderToString(
      <MemoryRouter initialEntries={['/group']}>
        <GroupPage />
      </MemoryRouter>
    )

    expect(html).toContain('Groups')
    expect(html).toContain('Group Chat')
    expect(html).toContain('data-group-page-shell="true"')
    expect(html).toContain('data-group-main-chat="true"')
  })
})
