import {
  launchTiaBrowserTool,
  hideTiaBrowserToolWindow,
  requestTiaBrowserToolHumanHandoff,
  runTiaBrowserToolAutomationCommand,
  setTiaBrowserToolRuntimeOptions,
  showTiaBrowserToolWindow,
  shutdownTiaBrowserTool,
  type TiaBrowserToolRuntimeOptions
} from './tia-browser-tool'
import { tiaBrowserToolLog } from './tia-browser-tool-logger'
import type {
  TiaBrowserToolAutomationCommand,
  TiaBrowserToolAutomationResult
} from './tia-browser-tool-contract'

const DEFAULT_HANDOFF_TIMEOUT_MS = 15 * 60 * 1000

export type TiaBrowserToolHumanHandoffRequest = {
  message: string
  buttonLabel?: string
  timeoutMs?: number
}

export type TiaBrowserToolHumanHandoffResult = {
  status: 'completed' | 'timed_out'
  currentUrl: string | null
}

export type TiaBrowserToolController = {
  requestHumanHandoff(
    input: TiaBrowserToolHumanHandoffRequest
  ): Promise<TiaBrowserToolHumanHandoffResult>
  runAutomationCommand(
    input: TiaBrowserToolAutomationCommand
  ): Promise<TiaBrowserToolAutomationResult>
}

export type TiaBrowserToolManagerOptions = TiaBrowserToolRuntimeOptions

export class TiaBrowserToolManager implements TiaBrowserToolController {
  private launched = false
  private launchPromise: Promise<void> | null = null

  constructor(private options: TiaBrowserToolManagerOptions = {}) {}

  isLaunched(): boolean {
    return this.launched || this.launchPromise !== null
  }

  setRuntimeOptions(options: Partial<TiaBrowserToolManagerOptions>): void {
    this.options = {
      ...this.options,
      ...options
    }
    setTiaBrowserToolRuntimeOptions(this.options)
    tiaBrowserToolLog('TiaBrowserToolManager', 'updated runtime options', {
      partition: this.options.partition ?? null,
      show: this.options.show ?? false
    })
  }

  async launch(): Promise<void> {
    if (this.launched) {
      tiaBrowserToolLog('TiaBrowserToolManager', 'launch skipped because runtime is already ready')
      return
    }

    if (!this.launchPromise) {
      tiaBrowserToolLog('TiaBrowserToolManager', 'launching runtime', {
        partition: this.options.partition ?? null,
        show: this.options.show ?? false
      })
      this.launchPromise = launchTiaBrowserTool(this.options)
        .then(() => {
          this.launched = true
          tiaBrowserToolLog('TiaBrowserToolManager', 'runtime launch completed')
        })
        .catch((error) => {
          this.launched = false
          tiaBrowserToolLog('TiaBrowserToolManager', 'runtime launch failed', error)
          throw error
        })
        .finally(() => {
          this.launchPromise = null
        })
    }

    await this.launchPromise
  }

  async showWindow(): Promise<void> {
    await this.launch()
    tiaBrowserToolLog('TiaBrowserToolManager', 'showing browser window')
    await showTiaBrowserToolWindow()
  }

  async hideWindow(): Promise<void> {
    await this.launch()
    tiaBrowserToolLog('TiaBrowserToolManager', 'hiding browser window')
    await hideTiaBrowserToolWindow()
  }

  async requestHumanHandoff(
    input: TiaBrowserToolHumanHandoffRequest
  ): Promise<TiaBrowserToolHumanHandoffResult> {
    const message = input.message.trim()
    if (message.length === 0) {
      throw new Error('Human handoff message must not be empty.')
    }

    await this.launch()
    const timeoutMs = input.timeoutMs ?? DEFAULT_HANDOFF_TIMEOUT_MS
    tiaBrowserToolLog('TiaBrowserToolManager', 'requesting human handoff', {
      timeoutMs,
      hasCustomButtonLabel:
        typeof input.buttonLabel === 'string' && input.buttonLabel.trim().length > 0,
      message
    })

    const result = await requestTiaBrowserToolHumanHandoff({
      message,
      buttonLabel: input.buttonLabel?.trim() || 'Done, continue',
      timeoutMs
    })
    tiaBrowserToolLog('TiaBrowserToolManager', 'human handoff resolved', result)
    return result
  }

  async runAutomationCommand(
    input: TiaBrowserToolAutomationCommand
  ): Promise<TiaBrowserToolAutomationResult> {
    await this.launch()
    tiaBrowserToolLog('TiaBrowserToolManager', 'dispatching automation command', {
      action: input.action
    })
    const result = await runTiaBrowserToolAutomationCommand(input)
    tiaBrowserToolLog('TiaBrowserToolManager', 'automation command resolved', {
      action: input.action,
      currentUrl: result.currentUrl ?? null
    })
    return result
  }

  shutdown(): void {
    tiaBrowserToolLog('TiaBrowserToolManager', 'shutting down runtime')
    shutdownTiaBrowserTool()
    this.launched = false
    this.launchPromise = null
  }
}
