async function assertManagedRuntimeBridge(): Promise<void> {
  const status = await window.tiaDesktop.getManagedRuntimeStatus?.()
  const latest = await window.tiaDesktop.checkManagedRuntimeLatest?.('bun')
  const installed = await window.tiaDesktop.installManagedRuntime?.('uv')
  const picked = await window.tiaDesktop.pickCustomRuntime?.('bun')
  const cleared = await window.tiaDesktop.clearManagedRuntime?.('uv')

  void status?.bun.status
  void latest?.uv.releaseUrl
  void installed?.uv.version
  void picked?.bun.binaryPath
  void cleared?.bun.errorMessage
}

void assertManagedRuntimeBridge
