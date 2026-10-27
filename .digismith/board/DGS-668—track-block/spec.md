# DGS-668 + DGS-669: Track block templates and first-write scaffold

Order: main-15. Jack approved the start and the reversal of "never scaffold the full stage list from nothing".

## Decisions (technical, mine)
- **Form.** Two ADF JSON files in `skills/jira-progress-write-back/templates/` (`track-single-market.json`, `track-multi-market.json`), each an array of two top-level nodes: the level-2 "📦 Track" heading and one expand node. Reason: `markdown-to-adf` has no table, expand or emoji support, and the skill already splices raw ADF nodes into the description (Step 6, 8). E.5 convention: templates sit beside the skill that fills them. No `localId` or `style` attrs: Jira assigns them.
- **Initial state.** Every stage is `TO DO` (neutral). Step 7 then flips Technical Development to DONE and adds the repo line, so the existing delta logic is reused as is.
- **Sub-lines.** "✅ 1x component: <component name>", "✅ Round 1", "✅ Obtain design approval" are kept as in the ticket text.
- **Per Market table.** Six columns (Market, Dev, Review, QA, Country, Deployment), a header row and one placeholder row `<MARKET>` with empty cells. The skill adds one row per market and sets the Dev cell to a `:check_mark:` emoji for the market this repo covers. Reason: a template must not claim work as done.
- **Selection.** Multi-market when the ticket names two or more markets (ticket text, an existing Materials & Links table with 2+ rows, or sibling repos). Otherwise single-market. The confirmation step shows which template was picked and why, so a wrong pick is one "revise" away.
- **No jira-client code change.** `update-description` already takes any ADF doc. Tests cover the templates' shape.

## DGS-669
Step 7 builds the Track block when no "Track" heading exists: pick template, fill placeholders, insert after Materials & Links (end of document if none), show it in Step 12, write it in Step 13. Old "skip and report why" text and the "never scaffold" line go. Heading found but unfamiliar shape: still skip (never edit a structure we do not know). `generate-comment` progress-update stays SHORT; its link line already points to the description.
