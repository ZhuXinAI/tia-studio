import { spawn } from 'node:child_process'

export const localAcpAgentKeys = ['codex', 'claude', 'gemini', 'qwen-code', 'openclaw'] as const

export type LocalAcpAgentKey = (typeof localAcpAgentKeys)[number]

export type LocalAcpAgentDescriptor = {
  key: LocalAcpAgentKey
  label: string
  commandCandidates: string[]
}

export type InstalledLocalAcpAgentRecord = {
  key: LocalAcpAgentKey
  label: string
  resolvedCommand: string
  binaryPath: string
}

export const localAcpAgentDescriptors: LocalAcpAgentDescriptor[] = [
  {
    key: 'codex',
    label: 'Codex',
    commandCandidates: ['codex']
  },
  {
    key: 'claude',
    label: 'Claude',
    commandCandidates: ['claude']
  },
  {
    key: 'gemini',
    label: 'Gemini',
    commandCandidates: ['gemini']
  },
  {
    key: 'qwen-code',
    label: 'Qwen Code',
    commandCandidates: ['qwen-code', 'qwen']
  },
  {
    key: 'openclaw',
    label: 'OpenClaw',
    commandCandidates: ['openclaw']
  }
]

function quoteForPosixShell(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`
}

function quoteForWindowsShell(value: string): string {
  return `"${value.replace(/"/g, '""')}"`
}

function resolveLookupProcess(command: string): {
  binary: string
  args: string[]
} {
  if (process.platform === 'win32') {
    return {
      binary: process.env.ComSpec?.trim() || 'cmd.exe',
      args: ['/d', '/s', '/c', `where ${quoteForWindowsShell(command)}`]
    }
  }

  return {
    binary: process.env.SHELL?.trim() || '/bin/sh',
    args: ['-lc', `command -v ${quoteForPosixShell(command)}`]
  }
}

async function resolveBinaryPath(command: string): Promise<string | null> {
  const lookupProcess = resolveLookupProcess(command)

  return new Promise((resolve) => {
    const childProcess = spawn(lookupProcess.binary, lookupProcess.args, {
      env: process.env,
      stdio: ['ignore', 'pipe', 'ignore']
    })

    let stdout = ''

    childProcess.stdout.on('data', (chunk: Buffer | string) => {
      stdout += chunk.toString()
    })

    childProcess.on('error', () => {
      resolve(null)
    })

    childProcess.on('close', (code) => {
      if (code !== 0) {
        resolve(null)
        return
      }

      const binaryPath = stdout
        .split(/\r?\n/)
        .map((line) => line.trim())
        .find((line) => line.length > 0)

      resolve(binaryPath ?? null)
    })
  })
}

async function detectInstalledAgent(
  descriptor: LocalAcpAgentDescriptor
): Promise<InstalledLocalAcpAgentRecord | null> {
  for (const candidate of descriptor.commandCandidates) {
    const binaryPath = await resolveBinaryPath(candidate)
    if (!binaryPath) {
      continue
    }

    return {
      key: descriptor.key,
      label: descriptor.label,
      resolvedCommand: candidate,
      binaryPath
    }
  }

  return null
}

export async function detectInstalledLocalAcpAgents(): Promise<InstalledLocalAcpAgentRecord[]> {
  const detectedAgents = await Promise.all(
    localAcpAgentDescriptors.map((descriptor) => detectInstalledAgent(descriptor))
  )

  return detectedAgents.filter(
    (descriptor): descriptor is InstalledLocalAcpAgentRecord => descriptor !== null
  )
}
