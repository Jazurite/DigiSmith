### Spec Compliance

- ✅ Spec compliant with 7.1 item 4 as written. In Suite, `tab close` reads the label with `tab get` (herdr-ws:111-113), `agent stop` checks the agent name (a pane-id target is resolved through `agent list`, herdr-ws:114), `pane close` resolves the pane to its agent (herdr-ws:115); only `tc-`/`nw-` pass (herdr-ws:116). An unknown label or pane gives `""` and is refused (fail closed). The `:t1` rule now sits in the `elif` for every non-Suite session (herdr-ws:117). The T10 workspace membership check still runs first (herdr-ws:96-98), so a Suite close outside the caller's Suite workspace is refused.
- Judgement call (pane close through the owning agent): accepted. I ran `herdr pane --help`: a pane has no label, so the agent name is the only label available. A pane with no agent is refused, which is the safe side.
- ⚠️ Cannot verify from the diff: spec says "workspace of the caller's Suite" — the wrapper only knows the scope's Suite workspaces, which the bootstrap sets to the caller's own. Check this in the bootstrap tasks (7.2), not here.

### Strengths

- Fail-closed by construction: `label = ""` on any parse error, `agent_of_pane` returns `""` on any error.
- The close check runs after the membership check and before `run(cmd)`; the refused tab-close test also asserts no `tab close` reached herdr (herdr-ws.test.ts:190).
- I checked the real `herdr tab get` output shape: `result.tab.label` exists, so the `find(..., "label")` read matches live herdr.
- Tests cover default keeping the old `:t1` rule for every scope workspace, and Suite protecting by label, not position (`w7:t4` refused, `w7:t3` allowed).

### Issues

#### Critical (Must Fix)
None.

#### Important (Should Fix)
- F1, `scripts/opencode-boot/herdr-ws:109-117`: the Suite close rule is a label rule, but the label can be changed through verbs this wrapper still allows. `herdr tab rename`, `agent rename` and `pane rename` are all in the allowed groups (`herdr tab --help` lists `rename`; `herdr agent --help` lists `rename`). A ticket conductor (a `tc-` tab in the same Suite workspace as the project conductor) can run `--session Suite tab rename w7:t1 tc-x` and then `tab close w7:t1`: both calls pass. The rule exists to protect a non-ticket conductor from a sibling in the same workspace, and this is a two-call bypass. Fix: in Suite, refuse `rename` when the current label/name is not `tc-`/`nw-` (same read as close), and refuse a new name without the prefix.

#### Minor (Nice to Have)
- F2, `scripts/opencode-boot/herdr-ws.test.ts:182-220`: no test shows the fail-closed paths. The fake `tab get` always returns a label, so a failing or unparseable `tab get` is never exercised; `agent stop` with a pane-id target (herdr-ws:114) has no test either. Add a fake case that prints non-JSON for one tab and one `agent stop w7:p1` / `agent stop w7:p2` pair.
- F3, `scripts/opencode-boot/herdr-ws:114`: `herdr agent --help` lists no `stop` verb, so the `agent stop` branch cannot run against today's herdr (the call would be refused by herdr itself). The spec names it, so keeping it is fine; say so in a comment so a reader does not think `agent stop` is a real verb.

### Assessment

**Task quality:** Needs fixes

**Reasoning:** The T11 text is implemented correctly and fails closed. The label rule can be defeated with an allowed rename, which is the exact sibling case the rule was written for; fix F1 before it ships.

```json findings
[
  {
    "id": "F1",
    "path": "scripts/opencode-boot/herdr-ws",
    "line": 109,
    "severity": "Important",
    "what": "The Suite close rule trusts a label that tab, agent and pane rename (still allowed) can change.",
    "scenario": "A tc- conductor in Suite:w7 runs 'tab rename w7:t1 tc-x' then 'tab close w7:t1'; the project conductor's tab closes."
  },
  {
    "id": "F2",
    "path": "scripts/opencode-boot/herdr-ws.test.ts",
    "line": 182,
    "severity": "Minor",
    "what": "The fail-closed paths (tab get failure, agent stop with a pane-id target) have no test.",
    "scenario": "A change that lets an empty label pass, or breaks the pane-id branch of agent stop, still gives 24/24."
  },
  {
    "id": "F3",
    "path": "scripts/opencode-boot/herdr-ws",
    "line": 114,
    "severity": "Minor",
    "what": "herdr has no 'agent stop' verb, so this branch is dead against the real binary and nothing in the code says so.",
    "scenario": "A reader assumes agent stop is a protected live verb and skips checking the real way an agent is stopped (pane close)."
  }
]
```
