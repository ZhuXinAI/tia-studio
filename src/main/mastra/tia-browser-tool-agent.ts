import { Agent } from '@mastra/core/agent'
import type { Memory } from '@mastra/memory'

type CreateTiaBrowserToolAgentInput = {
  assistantId: string
  assistantName: string
  memory: Memory
  model: unknown
  tools: Record<string, unknown>
}

function buildBrowserAgentDescription(input: { assistantName: string }): string {
  return [
    `Dedicated browser specialist for ${input.assistantName}.`,
    'Handles website navigation, DOM snapshots, form filling, clicking, waiting, and extracting page data with the TIA browser tool.'
  ].join(' ')
}

export function createTiaBrowserToolAgent(input: CreateTiaBrowserToolAgentInput): Agent {
  return new Agent({
    id: `${input.assistantId}:tia-browser-tool`,
    name: `${input.assistantName} TIA Browser Tool Agent`,
    description: buildBrowserAgentDescription({
      assistantName: input.assistantName
    }),
    instructions: [
      'You are the dedicated browser automation specialist for this assistant.',
      'Use the tia-browser-tool-action tool for all browser work.',
      'For page understanding, prefer snapshot with interactive=true unless you specifically need a fuller tree.',
      'After actions that may change the page or DOM, wait if needed and then run snapshot again before the next interaction.',
      'Use refs from snapshot output like [ref=e1] as @e1 in later tool calls.',
      'When a site needs login, MFA, CAPTCHA, consent, or any human-only step, first explain the situation in normal language and then use request-browser-human-handoff.',
      'Keep progress updates short, practical, and focused on what changed in the browser.'
    ].join(' '),
    model: input.model as never,
    memory: input.memory as never,
    tools: input.tools as never
  })
}
