export type McpServerHealth = {
  state: 'connected' | 'error' | 'unsupported'
  updatedAt: string
  toolCount?: number
}

export class McpServerHealthRegistry {
  private readonly values = new Map<string, McpServerHealth>()

  connected(serverId: string, toolCount?: number): void {
    const previous = this.values.get(serverId)
    this.values.set(serverId, {
      state: 'connected',
      updatedAt: new Date().toISOString(),
      ...(toolCount === undefined && previous?.toolCount !== undefined
        ? { toolCount: previous.toolCount }
        : toolCount === undefined
          ? {}
          : { toolCount })
    })
  }

  failed(serverId: string): void {
    this.values.set(serverId, { state: 'error', updatedAt: new Date().toISOString() })
  }

  unsupported(serverId: string): void {
    this.values.set(serverId, { state: 'unsupported', updatedAt: new Date().toISOString() })
  }

  retain(serverIds: Iterable<string>): void {
    const known = new Set(serverIds)
    for (const serverId of this.values.keys()) {
      if (!known.has(serverId)) this.values.delete(serverId)
    }
  }

  list(): Record<string, McpServerHealth> {
    return Object.fromEntries(this.values)
  }
}
