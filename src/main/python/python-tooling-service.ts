import { execFile } from 'node:child_process'
import { readdir } from 'node:fs/promises'
import { join } from 'node:path'
import { promisify } from 'node:util'
import type {
  PythonCheckKind,
  PythonCheckResult,
  PythonInterpreter,
  PythonProjectInfo
} from '../../shared/python-tooling'

const execFileAsync = promisify(execFile)
const COMMAND_TIMEOUT_MS = 30_000
const MAX_OUTPUT_LENGTH = 80_000
const PROJECT_FILES = ['pyproject.toml', 'requirements.txt', 'setup.py', 'pytest.ini', 'tox.ini']
const PYTHON_DIRECTORIES = new Set(['.venv', 'venv', 'src', 'tests'])

type CommandResult = { stdout: string; stderr: string }

async function run(command: string, args: string[], cwd: string, timeout = COMMAND_TIMEOUT_MS): Promise<CommandResult> {
  const result = await execFileAsync(command, args, {
    cwd,
    encoding: 'utf8',
    timeout,
    maxBuffer: MAX_OUTPUT_LENGTH
  })
  return { stdout: result.stdout, stderr: result.stderr }
}

async function pythonMetadata(command: string, workspacePath: string): Promise<PythonInterpreter | null> {
  try {
    const result = await run(
      command,
      ['-c', 'import json,platform,sys; print(json.dumps({"executable":sys.executable,"version":platform.python_version()}))'],
      workspacePath,
      8_000
    )
    const parsed = JSON.parse(result.stdout.trim()) as { executable?: unknown; version?: unknown }
    if (typeof parsed.executable !== 'string' || typeof parsed.version !== 'string') return null
    return {
      command,
      executable: parsed.executable,
      version: parsed.version,
      source: 'path'
    }
  } catch {
    return null
  }
}

async function firstWorkspaceInterpreter(workspacePath: string): Promise<PythonInterpreter | null> {
  const candidates =
    process.platform === 'win32'
      ? [
          join(workspacePath, '.venv', 'Scripts', 'python.exe'),
          join(workspacePath, 'venv', 'Scripts', 'python.exe')
        ]
      : [
          join(workspacePath, '.venv', 'bin', 'python'),
          join(workspacePath, 'venv', 'bin', 'python')
        ]
  for (const candidate of candidates) {
    const interpreter = await pythonMetadata(candidate, workspacePath)
    if (interpreter) return { ...interpreter, source: 'workspace' }
  }
  return null
}

async function listProjectFiles(workspacePath: string): Promise<string[]> {
  const entries = await readdir(workspacePath, { withFileTypes: true }).catch(() => [])
  return entries
    .filter((entry) => entry.isFile() && PROJECT_FILES.includes(entry.name))
    .map((entry) => entry.name)
    .sort()
}

async function hasPythonFiles(workspacePath: string): Promise<boolean> {
  const entries = await readdir(workspacePath, { withFileTypes: true }).catch(() => [])
  for (const entry of entries) {
    if (entry.isFile() && entry.name.endsWith('.py')) return true
    if (entry.isDirectory() && PYTHON_DIRECTORIES.has(entry.name)) {
      const nested = await readdir(join(workspacePath, entry.name), { withFileTypes: true }).catch(() => [])
      if (nested.some((item) => item.isFile() && item.name.endsWith('.py'))) return true
    }
  }
  return false
}

export class PythonToolingService {
  async inspect(workspacePath: string): Promise<PythonProjectInfo> {
    const workspaceInterpreter = await firstWorkspaceInterpreter(workspacePath)
    const interpreter =
      workspaceInterpreter ??
      (await pythonMetadata(process.platform === 'win32' ? 'python' : 'python3', workspacePath)) ??
      (await pythonMetadata('python', workspacePath)) ??
      (process.platform === 'win32' ? await pythonMetadata('py', workspacePath) : null)
    const projectFiles = await listProjectFiles(workspacePath)
    const hasPython = await hasPythonFiles(workspacePath)
    return {
      workspacePath,
      interpreter,
      projectFiles,
      hasVirtualEnvironment: Boolean(workspaceInterpreter),
      recommendedChecks: hasPython || projectFiles.length ? ['compile', 'pytest'] : [],
      inspectedAt: new Date().toISOString()
    }
  }

  async runCheck(workspacePath: string, kind: PythonCheckKind): Promise<PythonCheckResult> {
    const info = await this.inspect(workspacePath)
    if (!info.interpreter) throw new Error('No Python interpreter was found for this workspace')
    const started = Date.now()
    const args = kind === 'compile' ? ['-m', 'compileall', '-q', '.'] : ['-m', 'pytest', '-q']
    try {
      const result = await run(info.interpreter.command, args, workspacePath)
      return {
        kind,
        passed: true,
        exitCode: 0,
        output: `${result.stdout}${result.stderr}`.slice(-MAX_OUTPUT_LENGTH),
        durationMs: Date.now() - started,
        completedAt: new Date().toISOString()
      }
    } catch (error) {
      const failure = error as { code?: unknown; stdout?: unknown; stderr?: unknown; killed?: unknown }
      const output = `${typeof failure.stdout === 'string' ? failure.stdout : ''}${typeof failure.stderr === 'string' ? failure.stderr : ''}${error instanceof Error ? error.message : ''}`
      return {
        kind,
        passed: false,
        exitCode: typeof failure.code === 'number' ? failure.code : null,
        output: output.slice(-MAX_OUTPUT_LENGTH),
        durationMs: Date.now() - started,
        completedAt: new Date().toISOString()
      }
    }
  }
}
