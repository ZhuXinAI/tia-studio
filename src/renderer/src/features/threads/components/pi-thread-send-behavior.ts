import type { AgentSendBehavior, AgentSessionStatus } from '../../../../../shared/agent-runtime'

export function resolveActiveSendBehavior(
  status: AgentSessionStatus,
  requested: AgentSendBehavior
): AgentSendBehavior {
  if (status !== 'running') return 'normal'
  return requested === 'steer' ? 'steer' : 'follow-up'
}
