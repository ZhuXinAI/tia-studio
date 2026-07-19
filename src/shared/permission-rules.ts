export type PermissionRuleDecision = 'allow' | 'ask' | 'deny'
export type PermissionRuleOrigin = 'user-approval' | 'user-config' | 'built-in'

export type PermissionRule = {
  id: string
  workspacePath: string
  tool: 'bash'
  decision: PermissionRuleDecision
  argvPrefix: string[]
  rationale: string
  origin: PermissionRuleOrigin
  createdAt: string
  updatedAt: string
  lastUsedAt?: string
}

export type PermissionRuleProposal = {
  tool: 'bash'
  argvPrefix: string[]
  display: string
}

export type PermissionCommandAnalysis = {
  command: string
  reusable: boolean
  reason?: string
  segments: string[][]
  proposals: PermissionRuleProposal[]
}

const unsafeReusableExecutables = new Set([
  'bash',
  'bun',
  'cmd',
  'deno',
  'env',
  'fish',
  'node',
  'npm',
  'npx',
  'perl',
  'php',
  'pip',
  'pip3',
  'pnpm',
  'powershell',
  'pwsh',
  'python',
  'python3',
  'ruby',
  'sh',
  'sudo',
  'xargs',
  'yarn',
  'zsh'
])

const destructiveExecutables = new Set(['dd', 'mkfs', 'reboot', 'shutdown'])
const shellControlWords = new Set([
  'case',
  'do',
  'done',
  'elif',
  'else',
  'esac',
  'fi',
  'for',
  'function',
  'if',
  'in',
  'select',
  'then',
  'until',
  'while'
])

function displayArgv(argv: string[]): string {
  return argv
    .map((argument) =>
      /^[A-Za-z0-9_./:@%+=,-]+$/.test(argument)
        ? argument
        : `'${argument.replaceAll("'", "'\\''")}'`
    )
    .join(' ')
}

function parseSimpleCommand(command: string): { segments: string[][]; reason?: string } {
  if (!command.trim()) return { segments: [], reason: 'The command is empty.' }
  if (/\r|\n|`|\$|[<>*?{}()[\]#!]/.test(command)) {
    return { segments: [], reason: 'Shell expansion, redirection, or control syntax is present.' }
  }

  const segments: string[][] = []
  let argv: string[] = []
  let token = ''
  let tokenStarted = false
  let quote: "'" | '"' | null = null
  let escaped = false

  const pushToken = (): void => {
    if (tokenStarted) argv.push(token)
    token = ''
    tokenStarted = false
  }
  const pushSegment = (): boolean => {
    pushToken()
    if (argv.length === 0) return false
    segments.push(argv)
    argv = []
    return true
  }

  for (let index = 0; index < command.length; index += 1) {
    const character = command[index]
    if (escaped) {
      token += character
      tokenStarted = true
      escaped = false
      continue
    }
    if (character === '\\' && quote !== "'") {
      escaped = true
      tokenStarted = true
      continue
    }
    if (quote) {
      if (character === quote) quote = null
      else {
        token += character
        tokenStarted = true
      }
      continue
    }
    if (character === "'" || character === '"') {
      quote = character
      tokenStarted = true
      continue
    }
    if (/\s/.test(character)) {
      pushToken()
      continue
    }
    if (character === ';') {
      if (!pushSegment()) return { segments: [], reason: 'The command chain is malformed.' }
      continue
    }
    if (character === '&' || character === '|') {
      if (command[index + 1] !== character) {
        return { segments: [], reason: 'Pipes and background execution are not reusable.' }
      }
      if (!pushSegment()) return { segments: [], reason: 'The command chain is malformed.' }
      index += 1
      continue
    }
    token += character
    tokenStarted = true
  }

  if (escaped || quote) return { segments: [], reason: 'The command has incomplete quoting.' }
  if (!pushSegment()) return { segments: [], reason: 'The command chain is malformed.' }
  return { segments }
}

function canPropose(argv: string[]): boolean {
  const executable = (argv[0] ?? '').toLowerCase()
  if (
    !executable ||
    unsafeReusableExecutables.has(executable) ||
    destructiveExecutables.has(executable) ||
    shellControlWords.has(executable)
  ) {
    return false
  }
  if (executable === 'rm' || executable === 'rmdir') return false
  if (executable === 'git' && argv[1] === 'clean') return false
  if (executable === 'git' && argv[1] === 'reset') return false
  if (
    executable === 'git' &&
    argv[1] === 'push' &&
    argv.some((item) => item.startsWith('--force'))
  ) {
    return false
  }
  return true
}

export function analyzePermissionCommand(command: string): PermissionCommandAnalysis {
  const parsed = parseSimpleCommand(command)
  if (parsed.reason) {
    return {
      command,
      reusable: false,
      reason: parsed.reason,
      segments: [],
      proposals: []
    }
  }
  if (!parsed.segments.every(canPropose)) {
    return {
      command,
      reusable: false,
      reason: 'This command is too powerful or broad for an automatically remembered rule.',
      segments: parsed.segments,
      proposals: []
    }
  }
  return {
    command,
    reusable: true,
    segments: parsed.segments,
    proposals: parsed.segments.map((argvPrefix) => ({
      tool: 'bash',
      argvPrefix,
      display: displayArgv(argvPrefix)
    }))
  }
}

export function permissionRuleMatches(rule: PermissionRule, argv: string[]): boolean {
  return (
    rule.tool === 'bash' &&
    rule.argvPrefix.length > 0 &&
    rule.argvPrefix.every((part, index) => argv[index] === part)
  )
}

const decisionRank: Record<PermissionRuleDecision, number> = { allow: 0, ask: 1, deny: 2 }

export function evaluatePermissionRules(
  analysis: PermissionCommandAnalysis,
  rules: PermissionRule[]
): { decision: PermissionRuleDecision; matchedRuleIds: string[] } {
  if (!analysis.reusable || analysis.segments.length === 0) {
    return { decision: 'ask', matchedRuleIds: [] }
  }
  let decision: PermissionRuleDecision = 'allow'
  const matchedRuleIds: string[] = []
  for (const argv of analysis.segments) {
    const matches = rules.filter((rule) => permissionRuleMatches(rule, argv))
    if (matches.length === 0) {
      decision = decisionRank.ask > decisionRank[decision] ? 'ask' : decision
      continue
    }
    for (const rule of matches) {
      matchedRuleIds.push(rule.id)
      if (decisionRank[rule.decision] > decisionRank[decision]) decision = rule.decision
    }
  }
  return { decision, matchedRuleIds: [...new Set(matchedRuleIds)] }
}
