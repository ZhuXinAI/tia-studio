import { renderToString } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import { StudioSidebar } from './studio-sidebar'

describe('StudioSidebar', () => {
  it('uses flex column gap layout for nav link stacks', () => {
    const html = renderToString(
      <MemoryRouter>
        <StudioSidebar />
      </MemoryRouter>
    )

    expect(html).toContain('flex flex-col gap-1')
  })
})
