// scripts/nexus-web/app/utils/agent-filter.ts
import type { LiveAgent } from '#oculus-schema'

export interface AgentFilter { status: string; role: string; project: string; workspace: string }
export const filterAgents = (agents: LiveAgent[], f: AgentFilter): LiveAgent[] =>
  agents.filter((a) => (!f.status || a.status === f.status) && (!f.role || a.role === f.role) && (!f.project || a.project === f.project) && (!f.workspace || a.workspace === f.workspace))
