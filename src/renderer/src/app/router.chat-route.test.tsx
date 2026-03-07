import { describe, expect, it } from 'vitest'
import { createAppMemoryRouter } from './router'

describe('chat route matching', () => {
  it('matches assistant-only chat URLs with an assistantId param', async () => {
    const router = createAppMemoryRouter(['/chat/assistant-1'])

    await router.navigate('/chat/assistant-1')

    const leafMatch = router.state.matches.at(-1)

    expect(router.state.location.pathname).toBe('/chat/assistant-1')
    expect(leafMatch?.route.path).toBe('chat/:assistantId')
    expect(leafMatch?.params.assistantId).toBe('assistant-1')
    expect(leafMatch?.params.threadId).toBeUndefined()
  })
})
