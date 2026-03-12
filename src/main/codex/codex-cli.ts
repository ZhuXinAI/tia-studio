import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

export type CodexCliStatus = {
  available: boolean
  version: string | null
  errorMessage: string | null
}

type CommandResult = {
  stdout: string
  stderr: string
}

type RunCommand = (command: string, args: string[]) => Promise<CommandResult>

const execFileAsync = promisify(execFile)

function normalizeVersionOutput(output: string): string | null {
  const normalized = output
    .split('\n')
    .map((line) => line.trim())
    .find((line) => line.length > 0)

  return normalized ?? null
}

function toErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    const message = error.message.trim()
    if (message.length > 0) {
      return message
    }
  }

  return 'Unable to run Codex CLI.'
}

function isCommandMissing(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === 'ENOENT'
  )
}

async function defaultRunCommand(command: string, args: string[]): Promise<CommandResult> {
  const result = await execFileAsync(command, args, { encoding: 'utf8' })
  return {
    stdout: result.stdout,
    stderr: result.stderr
  }
}

export async function getCodexCliStatus(
  runCommand: RunCommand = defaultRunCommand
): Promise<CodexCliStatus> {
  try {
    const { stdout, stderr } = await runCommand('codex', ['--version'])
    return {
      available: true,
      version: normalizeVersionOutput(stdout) ?? normalizeVersionOutput(stderr),
      errorMessage: null
    }
  } catch (error) {
    if (isCommandMissing(error)) {
      return {
        available: false,
        version: null,
        errorMessage: 'Codex CLI is not installed or not available on PATH.'
      }
    }

    return {
      available: false,
      version: null,
      errorMessage: toErrorMessage(error)
    }
  }
}
