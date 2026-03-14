export const BUILT_IN_BROWSER_REMOTE_DEBUGGING_PORT = 10531
export const BUILT_IN_BROWSER_HANDOFF_DONE_MARKER = '__TIA_BUILT_IN_BROWSER_HANDOFF_DONE__'

export type BuiltInBrowserControlMessage =
  | { type: 'show-window' }
  | { type: 'hide-window' }
  | {
      type: 'request-human-handoff'
      requestId: string
      message: string
      buttonLabel: string
    }
  | {
      type: 'clear-human-handoff'
      requestId?: string
    }
  | { type: 'quit' }

export type BuiltInBrowserEventMessage =
  | {
      type: 'ready'
      remoteDebuggingPort: number
      visible: boolean
      currentUrl: string
    }
  | {
      type: 'window-state'
      visible: boolean
      currentUrl: string
    }
  | {
      type: 'human-handoff-opened'
      requestId: string
      currentUrl: string
    }
  | {
      type: 'human-handoff-completed'
      requestId: string
      currentUrl: string
    }
  | {
      type: 'error'
      code: 'handoff-failed'
      message: string
      requestId?: string
    }

export function buildBuiltInBrowserGuidance(options?: {
  handoffToolAvailable?: boolean
}): string {
  const handoffGuidance = options?.handoffToolAvailable
    ? '- When a site needs manual login, MFA, CAPTCHA, consent, or other human-only interaction, after you have explained the task to the user, use the request-browser-human-handoff tool to bring the browser window forward and wait until the user clicks "Done, continue".'
    : '- When a site needs manual login, MFA, CAPTCHA, consent, or other human-only interaction, ask the user to temporarily take over in the visible built-in browser and continue once they are done.'

  return [
    'Built-in browser guidance:',
    `- TIA provides a built-in Electron browser that browser automation tools can attach to on remote debugging port ${BUILT_IN_BROWSER_REMOTE_DEBUGGING_PORT}.`,
    `- When you use built-in browser, Never tries to open another Chrome instance with open Chrome as we have already launched one for you.`,
    `- When you attach with agent-browser, prefer a stable session such as \`agent-browser --session-name tia-built-in-browser --cdp ${BUILT_IN_BROWSER_REMOTE_DEBUGGING_PORT} ...\` so the CLI keeps reconnecting to the same built-in browser context.`,
    '- The built-in browser keeps its active profile on disk, so login sessions should survive normal app restarts unless TIA explicitly rotates to a fresh recovery profile after detecting a broken browser instance.',
    '- For complex page interaction or multi-step website workflows, prefer connecting an installed browser tool such as agent-browser to that built-in browser.',
    '- If browser tooling is not installed yet, tell the user that TIA already has a built-in browser available and recommend installing agent-browser for complicated browser tasks.',
    '- Do not rely on hidden tool-call UI to explain a human-in-the-loop step. Always send a normal assistant message that tells the user what happened, what page they are looking at, and what action they need to complete.',
    '- If you can capture a screenshot and the current channel can display images, send the screenshot to the user first, then ask them to intervene so mobile and channel users can understand the state immediately.',
    handoffGuidance
  ].join('\n')
}
