// scripts/nexus-web/app/utils/agent-changes.ts
import type { Live, LiveAgent } from '#oculus-schema'

const key = (a: LiveAgent): string => a.name ?? a.pane
/** The polite announcement for one poll: the connection change, then sets of names. Empty when nothing changed or on the first answer. */
export function agentChanges(prev: Live | null, next: Live): string {
  if (!prev) return ''
  if (prev.herdr.state !== next.herdr.state) return next.herdr.state === 'connected' ? 'Connected to herdr.' : 'Disconnected from herdr.'
  if (next.herdr.state === 'disconnected') return ''
  const p = new Map(prev.agents.map((a) => [key(a), a]))
  const n = new Map(next.agents.map((a) => [key(a), a]))
  // a new agent that arrives blocked is named under "New" only
  const blocked = next.agents.filter((a) => a.status === 'blocked' && p.has(key(a)) && p.get(key(a))!.status !== 'blocked').map(key)
  const added = [...n.keys()].filter((k) => !p.has(k))
  const gone = [...p.keys()].filter((k) => !n.has(k))
  const sets: [string, string[]][] = [['Blocked', blocked], ['New', added], ['Gone', gone]]
  return sets.filter(([, l]) => l.length > 0).map(([t, l]) => `${t}: ${l.join(', ')}.`).join(' ')
}
