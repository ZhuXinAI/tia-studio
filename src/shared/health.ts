export type HealthSignalState =
  | 'healthy'
  | 'configured'
  | 'degraded'
  | 'not-configured'
  | 'unknown'

export type HealthDependencySignal = {
  state: HealthSignalState
  configuredCount: number
  healthyCount: number
  errorCount: number
}

export type HealthDependencies = {
  providers: HealthDependencySignal
  mcp: HealthDependencySignal
  channels: HealthDependencySignal
}

export type HealthSnapshot = {
  ok: true
  status: 'ok'
  checkedAt: string
  uptimeSeconds: number
  nodeVersion: string
  platform: string
  memory: {
    rssBytes: number
    heapUsedBytes: number
    heapTotalBytes: number
  }
  dependencies?: HealthDependencies
}
