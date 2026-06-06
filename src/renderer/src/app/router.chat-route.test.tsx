import { describe, expect, it } from 'vitest'
import { createAppMemoryRouter } from './router'

describe('chat route matching', () => {
  it('matches the dedicated new chat route before thread ids', async () => {
    const router = createAppMemoryRouter(['/chat/new'])

    await router.navigate('/chat/new')

    const leafMatch = router.state.matches.at(-1)

    expect(router.state.location.pathname).toBe('/chat/new')
    expect(leafMatch?.route.path).toBe('chat/new')
  })

  it('matches chat thread URLs with a threadId param', async () => {
    const router = createAppMemoryRouter(['/chat/thread-1'])

    await router.navigate('/chat/thread-1')

    const leafMatch = router.state.matches.at(-1)

    expect(router.state.location.pathname).toBe('/chat/thread-1')
    expect(leafMatch?.route.path).toBe('chat/:threadId')
    expect(leafMatch?.params.threadId).toBe('thread-1')
  })

  it('matches named workspace thread URLs with workspace and thread params', async () => {
    const router = createAppMemoryRouter(['/workspaces/workspace-1/threads/thread-1'])

    await router.navigate('/workspaces/workspace-1/threads/thread-1')

    const leafMatch = router.state.matches.at(-1)

    expect(router.state.location.pathname).toBe('/workspaces/workspace-1/threads/thread-1')
    expect(leafMatch?.route.path).toBe('workspaces/:workspaceId/threads/:threadId')
    expect(leafMatch?.params.workspaceId).toBe('workspace-1')
    expect(leafMatch?.params.threadId).toBe('thread-1')
  })
})
