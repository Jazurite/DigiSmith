# Diagramming tool integration (G.2.1)

## Status
Raw idea, not brainstormed. Jack's own placement call (2026-09-19): a child of **G.2**
(Toolchain), not a standalone letter — filed here as the entry point.

## What prompted it
Came up while diagramming the herdr/offload-stack architecture (see
`backlog/mcp-orchestration-architecture-xvk.md`) using ad-hoc inline SVG inside a published
Artifact. Jack wants a real diagramming tool available to Claude Code instead of that per-session,
hand-authored-SVG default — referred to in conversation as replacing "GoLocalDefaultDiagram," the
working name for the current inline-SVG-in-Artifact approach.

## Two separable pieces
1. **The connector itself.** Building or installing whatever lets Claude Code actually talk to
   the chosen diagramming tool — an MCP server, an API integration, or similar. This is general
   Claude Code tooling, not a DigiSmith-pipeline feature — it doesn't touch tickets, specs, plans,
   or builds, and any Claude Code session would use it the same way whether or not DigiSmith is
   installed. No map letter owns this half; it's infrastructure set up once, same category as any
   other MCP server (Context7, etc.).
2. **Recording it as a standing default, once the connector exists.** A new `toolchain.yml`
   domain (e.g. `diagramming: <tool>`), consulted by `digismith:brainstorming` the same way
   test-runner/styling/package-manager choices already are — this is the actual G.2.1 work, and
   is trivial once (1) exists.

## Open, not yet decided
- Which diagramming tool. Not chosen yet — Excalidraw was floated as an example, nothing settled.
- Whether/how DigiSmith's own generated docs (`design.html`/`report.html` per the Unified Docs
  Convention) should actually start calling this tool instead of inline SVG — that's **F**
  (Design review)'s territory, not G.2.1's. F remains fully unscoped (Tier 6, zero code, "shape
  undecided" per `MEMORY.md`'s own Open Questions). Don't fold F's scope into this item.

## How to apply
Don't start here with a brainstorm for "build a diagramming MCP server" — that's tooling setup,
not a DigiSmith feature. Once a connector exists (by whatever means), the actual G.2.1 work is a
small addition to `digismith:toolchain`/`toolchain.yml`, same shape as any other domain.
