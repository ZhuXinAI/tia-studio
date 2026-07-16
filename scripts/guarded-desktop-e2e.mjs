import { execFile, spawn } from 'node:child_process'
import { mkdirSync, createWriteStream } from 'node:fs'
import { join } from 'node:path'

const HELP = `Usage: npm run e2e:guarded [-- --annotate | --preview | --self-test]

Starts the desktop dev process under a bounded safety monitor. The complete
process tree is terminated when any guard trips or when the time limit expires.
Use --annotate for browser-based UI coverage before the final native pass.
Use --preview to run the already-built native app without recompiling it.

Environment overrides:
  TIA_E2E_MAX_SECONDS       default 900
  TIA_E2E_MAX_TREE_CPU      default 180 (aggregate percent)
  TIA_E2E_CPU_SAMPLES       default 5
  TIA_E2E_WINDOW_SECONDS    default 15
  TIA_E2E_MAX_CREATES       default 4
  TIA_E2E_MAX_5XX           default 3
`

if (process.argv.includes('--help')) {
  process.stdout.write(HELP)
  process.exit(0)
}

const numberFromEnv = (name, fallback) => {
  const value = Number(process.env[name] ?? fallback)
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${name} must be a positive number`)
  }
  return value
}

const limits = {
  maxSeconds: numberFromEnv('TIA_E2E_MAX_SECONDS', 900),
  maxTreeCpu: numberFromEnv('TIA_E2E_MAX_TREE_CPU', 180),
  cpuSamples: numberFromEnv('TIA_E2E_CPU_SAMPLES', 5),
  windowSeconds: numberFromEnv('TIA_E2E_WINDOW_SECONDS', 15),
  maxCreates: numberFromEnv('TIA_E2E_MAX_CREATES', 4),
  max5xx: numberFromEnv('TIA_E2E_MAX_5XX', 3)
}
const selfTest = process.argv.includes('--self-test')
const annotate = process.argv.includes('--annotate')
const preview = process.argv.includes('--preview')
const previewElectronArgs = process.env.REMOTE_DEBUGGING_PORT
  ? ['--', `--remote-debugging-port=${process.env.REMOTE_DEBUGGING_PORT}`]
  : []

const artifactDirectory = join(process.cwd(), '.artifacts', 'guarded-e2e')
mkdirSync(artifactDirectory, { recursive: true })
const logPath = join(artifactDirectory, `${new Date().toISOString().replaceAll(':', '-')}.log`)
const log = createWriteStream(logPath, { flags: 'wx' })
const startedAt = Date.now()
const createEvents = []
const serverErrorEvents = []
let highCpuSamples = 0
let stopping = false

const childCommand = selfTest
  ? [
      process.execPath,
      [
        '-e',
        "let count=0; setInterval(() => { console.error('agent-session-create-failed statusCode: 500'); count += 1 }, 50); setInterval(() => {}, 1000)"
      ]
    ]
  : [
      'pnpm',
      preview
        ? ['run', 'start', '--skipBuild', ...previewElectronArgs]
        : ['run', annotate ? 'dev:annotate' : 'dev']
    ]
const child = spawn(childCommand[0], childCommand[1], {
  cwd: process.cwd(),
  detached: true,
  env: { ...process.env, FORCE_COLOR: '0' },
  stdio: ['inherit', 'pipe', 'pipe']
})

const write = (source, chunk) => {
  const text = chunk.toString()
  process[source === 'stderr' ? 'stderr' : 'stdout'].write(text)
  log.write(`[${new Date().toISOString()}] [${source}] ${text}`)

  const now = Date.now()
  if (text.includes('agent-session-create-request')) createEvents.push(now)
  if (text.includes('agent-session-create-failed') || /statusCode[^\n]*5\d\d/.test(text)) {
    serverErrorEvents.push(now)
  }
}

child.stdout.on('data', (chunk) => write('stdout', chunk))
child.stderr.on('data', (chunk) => write('stderr', chunk))

const execFileAsync = (file, args) =>
  new Promise((resolve, reject) => {
    execFile(file, args, { maxBuffer: 4 * 1024 * 1024 }, (error, stdout) => {
      if (error) reject(error)
      else resolve(stdout)
    })
  })

const processTreeCpu = async (rootPid) => {
  const output = await execFileAsync('ps', ['-axo', 'pid=,ppid=,%cpu='])
  const rows = output
    .trim()
    .split('\n')
    .map((line) => line.trim().split(/\s+/).map(Number))
    .filter(
      ([pid, ppid, cpu]) => Number.isFinite(pid) && Number.isFinite(ppid) && Number.isFinite(cpu)
    )
  const descendants = new Set([rootPid])
  let changed = true
  while (changed) {
    changed = false
    for (const [pid, ppid] of rows) {
      if (descendants.has(ppid) && !descendants.has(pid)) {
        descendants.add(pid)
        changed = true
      }
    }
  }
  return rows.reduce((total, [pid, , cpu]) => total + (descendants.has(pid) ? cpu : 0), 0)
}

const stop = (reason, exitCode = 1) => {
  if (stopping) return
  stopping = true
  const line = `[guard] stopping: ${reason}\n`
  process.stderr.write(line)
  log.end(line)
  clearInterval(monitor)
  clearTimeout(deadline)
  try {
    process.kill(-child.pid, 'SIGTERM')
  } catch {
    // The guarded process tree may already have exited.
  }
  setTimeout(() => {
    try {
      process.kill(-child.pid, 'SIGKILL')
    } catch {
      // The graceful shutdown completed before the hard-stop deadline.
    }
    const selfTestPassed = selfTest && reason.includes('server 5xx responses')
    process.exit(selfTestPassed ? 0 : exitCode)
  }, 3000)
}

const prune = (events, cutoff) => {
  while (events.length && events[0] < cutoff) events.shift()
}

const monitor = setInterval(async () => {
  const cutoff = Date.now() - limits.windowSeconds * 1000
  prune(createEvents, cutoff)
  prune(serverErrorEvents, cutoff)
  if (createEvents.length >= limits.maxCreates) {
    stop(`${createEvents.length} session creates within ${limits.windowSeconds}s`)
    return
  }
  if (serverErrorEvents.length >= limits.max5xx) {
    stop(`${serverErrorEvents.length} server 5xx responses within ${limits.windowSeconds}s`)
    return
  }
  try {
    const cpu = await processTreeCpu(child.pid)
    highCpuSamples = cpu >= limits.maxTreeCpu ? highCpuSamples + 1 : 0
    const status = `[guard] elapsed=${Math.round((Date.now() - startedAt) / 1000)}s treeCpu=${cpu.toFixed(1)}% creates=${createEvents.length} errors5xx=${serverErrorEvents.length}\n`
    process.stdout.write(status)
    log.write(status)
    if (highCpuSamples >= limits.cpuSamples) {
      stop(`process-tree CPU stayed above ${limits.maxTreeCpu}% for ${highCpuSamples} samples`)
    }
  } catch (error) {
    stop(`monitor failed: ${error instanceof Error ? error.message : String(error)}`)
  }
}, 2000)
monitor.unref()

const deadline = setTimeout(
  () => stop(`time limit of ${limits.maxSeconds}s reached`, 0),
  limits.maxSeconds * 1000
)
deadline.unref()

child.on('exit', (code, signal) => {
  if (stopping) return
  stopping = true
  clearInterval(monitor)
  clearTimeout(deadline)
  log.end(`[guard] desktop process exited code=${code} signal=${signal}\n`)
  process.exitCode = code ?? (signal ? 1 : 0)
})

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => stop(`received ${signal}`, 0))
}

process.stdout.write(`[guard] desktop E2E pid=${child.pid} log=${logPath}\n`)
