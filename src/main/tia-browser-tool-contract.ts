export const TIA_BROWSER_TOOL_HANDOFF_DONE_MARKER = '__TIA_BROWSER_TOOL_HANDOFF_DONE__'

export type TiaBrowserToolSnapshotCommand = {
  action: 'snapshot'
  interactive?: boolean
  compact?: boolean
  depth?: number
  selector?: string
}

export type TiaBrowserToolGetKind =
  | 'text'
  | 'html'
  | 'value'
  | 'attr'
  | 'title'
  | 'url'
  | 'count'
  | 'box'
  | 'styles'

export type TiaBrowserToolWaitLoadState = 'load' | 'domcontentloaded' | 'networkidle'

export type TiaBrowserToolAutomationCommand =
  | { action: 'open'; url: string }
  | { action: 'close' }
  | TiaBrowserToolSnapshotCommand
  | { action: 'click'; ref: string; newTab?: boolean }
  | { action: 'dblclick'; ref: string }
  | { action: 'focus'; ref: string }
  | { action: 'fill'; ref: string; text: string }
  | { action: 'type'; ref: string; text: string }
  | { action: 'press'; key: string }
  | { action: 'keydown'; key: string }
  | { action: 'keyup'; key: string }
  | { action: 'hover'; ref: string }
  | { action: 'check'; ref: string }
  | { action: 'uncheck'; ref: string }
  | { action: 'select'; ref: string; values: string[] }
  | { action: 'scroll'; direction?: 'up' | 'down' | 'left' | 'right'; amount?: number }
  | { action: 'scrollintoview'; ref: string }
  | { action: 'drag'; sourceRef: string; targetRef: string }
  | { action: 'upload'; ref: string; filePaths: string[] }
  | { action: 'get'; kind: TiaBrowserToolGetKind; ref?: string; selector?: string; name?: string }
  | {
      action: 'wait'
      ref?: string
      milliseconds?: number
      text?: string
      urlPattern?: string
      loadState?: TiaBrowserToolWaitLoadState
      expression?: string
      timeoutMs?: number
    }

export type TiaBrowserToolBox = {
  x: number
  y: number
  width: number
  height: number
}

export type TiaBrowserToolAutomationResult = {
  action: TiaBrowserToolAutomationCommand['action']
  currentUrl: string | null
  title?: string
  snapshot?: string
  text?: string
  value?: string | null
  attribute?: string | null
  count?: number
  box?: TiaBrowserToolBox | null
  styles?: Record<string, string>
  waitedFor?: string
  message?: string
}

export function buildTiaBrowserToolGuidance(options?: {
  handoffToolAvailable?: boolean
}): string {
  const handoffGuidance = options?.handoffToolAvailable
    ? '- When a site needs manual login, MFA, CAPTCHA, consent, or other human-only interaction, after you have explained the task to the user, use the request-browser-human-handoff tool to bring the tia-browser-tool window forward and wait until the user clicks "Done, continue".'
    : '- When a site needs manual login, MFA, CAPTCHA, consent, or other human-only interaction, ask the user to temporarily take over in the visible tia-browser-tool window and continue once they are done.'

  return [
    'TIA browser tool guidance:',
    '- TIA also provides a lighter-weight in-app browser tool for common browser actions without requiring agent-browser or Playwright to be installed.',
    '- The tia-browser-tool runs against a BrowserWindow in the existing Electron main process.',
    '- Prefer tia-browser-tool for common open, snapshot, click, fill, type, wait, and extraction workflows when the user selected this mode.',
    '- If the user explicitly wants external agent-browser or Playwright attached over CDP, switch to Built-in Browser mode instead.',
    '- Do not rely on hidden tool-call UI to explain a human-in-the-loop step. Always send a normal assistant message that tells the user what happened, what page they are looking at, and what action they need to complete.',
    handoffGuidance
  ].join('\n')
}
