# Standard: the repo holds the source, the depot runs it (machine-wide runtime lives in ~/.digismith-depot)

**Status:** Idea, Jack (2026-10-10 ~18:0x UTC+7 [11:0xZ]). ClickUp: **DGS-265** (D.0: Foundation, Depot clan, task id `14zcebrvctw`). No design yet.

## The rule (Jack)

"The DigiSmith repo holds the scaffolding, the template, the source. When we actually use it, we go to the depot to run it."

- Anything that runs outside a single repo lives under `~/.digismith-depot/`: servers, proxies, wrapper scripts (`herdr-ws`), their config,
  logs and secrets.
- Repos hold only source and templates.
- An **install step** copies source into the depot. A merge reaches a live service only when it is installed, never by running from a checkout.

## Why now

The rule exists only in the depot skill's description (`skills/depot/SKILL.md`, map item V: "machine-wide runtime resources ... independent
of any single repo, ticket, or plan"). It is not in `standards/`, so nothing enforced it: the shared OpenCode maestro server (DGS-223) ran from
the DigiSmith main checkout with its config inside the repo. Its server root is now decided as `~/.digismith-depot/opencode/`.

## To do

- Write the standard with `digismith:add-standards` (indexed, so `inject-standards` brings it into builds and plans).
- Audit what runs today against it: the maestro server (DGS-223, runs from the repo, moving), the offload OpenCode server and the Agentic
  Bridge (depot), `herdr-ws` (depot/bin), `herdr-boot.sh` and `herdr-bootstrap.sh` (`~/.local/bin`), the usage probe (depot), the LaunchAgent
  paths.
- Define the install step pattern once (`dg depot <resource> install`?), so each resource is installed the same way.

## Related

DGS-223 ([shared-opencode-server.md](shared-opencode-server.md)), DGS-226 ([opencode-safety-layer.md](opencode-safety-layer.md)),
`skills/depot/SKILL.md`.
