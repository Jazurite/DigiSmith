# Soveron's own cutover to the moved ClickUp client

Soveron (`E:\MEGA\Obsidian\Knowpolis\1. Soveron`) is the source of the
ClickUp connector being moved into DigiSmith's `packages/clickup-client`
(brainstormed 2026-09-24). Once that move ships, Soveron's own consumer
packages — `finance`, `itinerary`, `cleanup`, `planning` — still import the
local `@clickup-envoy/clickup-client` copy (plus `factory.ts`'s
`createClickUpFromEnv()` and `sprint-resolver.ts`, which stay in Soveron as
domain-specific glue, not moved).

Cut these over to depend on the new DigiSmith-provisioned package (via
Depot's sparse clone, same pattern `packages/jira-client` already uses) and
retire Soveron's own duplicate copy. `factory.ts` will also need to swap its
credential source from `requireEnv()`/`@essence/vessel` to the moved
client's `~/.digismith-depot/.env` convention.

Deliberately deferred out of the connector-package brainstorm itself — that
brainstorm covers only the move + generalize step. Depends on the connector
package shipping first.
