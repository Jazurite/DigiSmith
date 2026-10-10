# Ticket-level ClickUp write-back (I.1/JIRA analog)

**ClickUp:** **DGS-21** (D.3: ClickUp Channel, backlog); key written back by the DGS-165 sweep, 2026-10-10.

JIRA write-back (map item **I.1**) posts progress/investigation comments
back to a JIRA ticket for consuming-repo ticket work. Once the ClickUp
connector package exists (brainstormed 2026-09-24, expected under the **V**
lineage), build the equivalent write-back path for repos that track tickets
in ClickUp instead of JIRA — same `generate-comment` (**Q.1**) template
mechanism, new ClickUp-flavored consumer alongside I.1.

Deliberately deferred out of the connector-package brainstorm itself — that
brainstorm covers only the connector + its `dg clickup` CLI surface, not this
consumer integration. Depends on the connector package shipping first.
