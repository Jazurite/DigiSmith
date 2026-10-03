# Ticket-Based Naming Architecture — Brief Template Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use digismith:subagent-driven-development (recommended) or digismith:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Finish DGS-158's own deliverable — add the brief template (the one piece the approved design named but
did not yet draft) as a new section of the already-approved design document, then close out the ticket with a
report.

**Architecture:** Pure documentation. One new section added to the existing, approved
`.digismith/docs/E/E.3/worker-maestro-conventions/design.html`, generalized from the two real briefs already on
disk (`.digismith/docs/E/E.3/brief.md`, `.digismith/docs/E/E.4/brief.md`). No code, no file moves — those belong
to DGS-159, per the design's section 10.

**Tech Stack:** Markdown content inside the design document's existing HTML shell. No scripts, no tests to run.

## Global Constraints

- No code and no file moves in this ticket — DGS-159 does both (design section 8).
- The brief stays git-excluded (design section 3) — the template says so; updating `.git/info/exclude` itself is
  DGS-159's job (design section 10).
- Times written in UTC+7 first, UTC in brackets (standing repo rule).
- No AI attribution in any commit (repo rule).

---

### Task 1: Draft the brief template and add it to the design document

**Files:**
- Modify: `.digismith/docs/E/E.3/worker-maestro-conventions/design.html` (add a new `<section id="brief">`
  before the closing `</body>`, and one new `<li>` in the existing `<nav class="toc">` list)

**Interfaces:**
- Consumes: the design document as committed at `433fc92` (11 sections, TOC with 11 entries), and the two real
  brief specimens on disk (`.digismith/docs/E/E.3/brief.md`, `.digismith/docs/E/E.4/brief.md`) as the source
  material to generalize from.
- Produces: a 12th section, `#brief`, containing the full template text below, plus the matching TOC entry. Task
  2 consumes this updated file as-is.

- [ ] **Step 1: Read both specimen briefs side by side and list what they share**

Already done during brainstorming (both were read in full earlier this session). Shared shape, in order: title
line, one intro paragraph (sender, date/time, worker identity, herdr agent, session, account, docs/board folder),
a "You have a maestro" standing-rules block (near-identical wording in both), a "Goal" section, a variable
context block (named differently each time — "Decided: do not reopen," "Not decided: do not assume," "Vocabulary
Jack decided," "Interim rules"), "Sources to read first," "Checkpoints," and (only in the E.3 specimen) a
"Standing limits" closing section. E.4's closing section ("When you stop") points at `digismith:handoff`, which
no longer applies to a worker under this design (section 3: a worker never writes a handoff note) — the template
replaces it with a "Report" section instead.

- [ ] **Step 2: Insert the new TOC entry**

In the existing `<nav class="toc"><ol>` list (currently ending with item 11, "Open items"), add:

```html
<li><a href="#brief">12. The brief template</a></li>
```

- [ ] **Step 3: Write the new section, in full, with no placeholders**

Insert this `<section>`, verbatim, directly before the closing `</body>` tag (after the existing
`<section id="open">...</section>` block and before the `<footer>`):

```html
<section id="brief">
  <h2>12. The brief template</h2>
  <p>Generalized from the two real specimens on disk: <code>.digismith/docs/E/E.3/brief.md</code> and
  <code>.digismith/docs/E/E.4/brief.md</code>. The maestro always writes the brief; a worker never writes its
  own. It lives at <code>.digismith/sessions/&lt;agent-name&gt;/brief.md</code> (section 3) and stays
  git-excluded, same treatment as today's <code>handoff.md</code> pattern.</p>
  <p>Required sections, in order, with no section skipped:</p>
  <ol>
    <li><strong>Title and intro.</strong> <code># Brief: &lt;TICKET-KEY&gt; &lt;short name&gt;</code>, then one
      paragraph: who sent it (the maestro, naming its own Desktop session), when (UTC+7, UTC in brackets), the
      worker's identity (its ticket key), its herdr agent name, its herdr session, its account, and its board
      folder path. When the ticket runs two or more workers (section 5), the intro also names this worker's own
      nested folder, <code>worker-&lt;agent-name&gt;/</code>.</li>
    <li><strong>"You have a maestro"</strong> — standing collaboration rules, copied verbatim every time, never
      paraphrased:
      <pre><code>- A maestro supervises you. It answers routine questions. Jack answers the design questions,
  in your pane or through the maestro.
- Ask your questions as plain text at the end of your turn, one at a time. Do not use
  AskUserQuestion forms: the maestro reads your pane, and a form is hard to read and answer
  from outside.
- Stop at every checkpoint below. Wait for "approved" before you continue.
- Never post externally: no ClickUp, JIRA or Teams writes. The maestro does those.
- Never push or merge until the maestro sends "approved: push".
- Never delete a file permanently. Move it aside and report the path.
- Never read or print a token. Work in a worktree under .worktrees/, not in the main checkout.
- You keep no state across tickets: no handoff note, no resume. When you stop, report to the
  maestro (see Report, below) and wait. The maestro closes you.
- Write short, plain sentences (the repo's technical voice).</code></pre>
    </li>
    <li><strong>Goal.</strong> The ticket id and ClickUp list, the exact command to read it, and the scope —
      ticket-specific.</li>
    <li><strong>Context</strong> (optional, included only when there is one). Whatever the maestro already
      decided, or explicitly has not, so the worker does not re-litigate or assume — named to fit the ticket
      ("Decided so far," "Vocabulary," "Interim rules"), not a fixed heading.</li>
    <li><strong>Sources to read first.</strong> A ticket-specific reading list.</li>
    <li><strong>Checkpoints.</strong> A numbered list. "After the sources: tell the maestro what you read, what
      is unclear, and your first question" is always the first one.</li>
    <li><strong>Report.</strong> What the worker owes the maestro when it stops — at a checkpoint, or at the
      end of the ticket — since the worker keeps no state once its workspace closes:
      <pre><code>- Result: what you did, in one or two sentences.
- Commit(s): the short hash and message of anything you committed.
- Comment ids: any ClickUp/JIRA comment ids you asked the maestro to post (you never post
  them yourself).
- Files: what you wrote or changed, as paths.
- Open questions: anything still unresolved, so the maestro can carry it forward. If it is
  not in this report, it does not exist once your workspace closes.</code></pre>
    </li>
    <li><strong>Standing limits.</strong> Copied verbatim every time:
      <pre><code>- If a call is blocked, stop and tell the maestro what was blocked. Do not rename the call,
  split it, or send it to another agent to get around the block.
- Memory is tight: check free -h before assuming headroom for another worker.
- Times in UTC+7 first, UTC in brackets. Read date before you write a time.</code></pre>
    </li>
  </ol>
  <p>This closes the long-standing "what does a worker report back" question: the Report section above is the
  answer, baked into every brief from here on rather than re-asked per ticket.</p>
</section>
```

- [ ] **Step 4: Verify the file is well-formed**

Run: `python3 -c "import xml.dom.minidom as m; m.parse(open('.digismith/docs/E/E.3/worker-maestro-conventions/design.html'))" 2>&1 || true`

HTML is not strict XML, so this check is advisory only — a parse failure here flags a likely unclosed tag
worth a manual look, not a hard gate. Confirm by eye that every tag opened in Step 3 is closed, and that the new
TOC entry's `href="#brief"` matches the new section's `id="brief"`.

- [ ] **Step 5: Commit**

```bash
git add .digismith/docs/E/E.3/worker-maestro-conventions/design.html
git commit -m "docs(methodology): add the brief template to the naming architecture design"
```

---

### Task 2: Final consistency pass and close out with a report

**Files:**
- Modify: `.digismith/docs/E/E.3/worker-maestro-conventions/design.html` (fixes only, if Step 1 below finds any)
- Create: `.digismith/docs/E/E.3/worker-maestro-conventions/report.html`

**Interfaces:**
- Consumes: the 12-section design document Task 1 produced.
- Produces: a closed-out ticket — a consistent design document and a report summarizing it, both committed.

- [ ] **Step 1: Re-read the whole document and check it against itself**

Read the full file. Check, specifically:
- Section 8 ("This ticket's own deliverable") still accurately describes what this ticket produced, now that
  section 12 exists — it should, since section 8 never claimed the template would be elsewhere.
- Section 11 ("Open items") still lists exactly two open items, unchanged by Task 1 (the gitignored-profile
  removal-safety gap, and who writes the new `MEMORY.md` Conventions bullet) — Task 1 does not resolve either.
- No section number collides with the new section 12, and the footer's path still matches the file's own
  mechanical location.
- No "TBD," "TODO," or placeholder text anywhere in the file.

Fix anything Step 1 finds directly in the file; no separate step needed for a fix this small.

- [ ] **Step 2: Write `report.html`**

Run `date` first and use its output for the date below — the shipped file must contain the real date as plain
text, never a comment or a placeholder. Use the same HTML shell as `design.html` (same `<style>` block,
byte-for-byte), with this body content:

```html
<header class="doc-head">
  <span class="badge">shipped</span>
  <h1>Ticket-Based Naming Architecture — Report</h1>
  <div class="meta">
    <span>Date: 2026-10-03</span>
    <span>Ticket: DGS-158</span>
  </div>
</header>

<section>
  <h2>What this ticket delivered</h2>
  <p>The naming convention itself: the ticket as the unit, <code>.digismith/board/&lt;KEY&gt;—&lt;slug&gt;/</code>
  for a ticket's work, <code>.digismith/sessions/&lt;session-name&gt;/{note,brief}.md</code> for session state,
  the worker and maestro naming rules, the splitting-a-ticket rules, and the brief template — all in
  <code>.digismith/docs/E/E.3/worker-maestro-conventions/design.html</code>. No code and no file moves: DGS-159
  carries those out against this document as its spec (design section 10).</p>
</section>

<section>
  <h2>Open items carried forward</h2>
  <p>Two, both flagged in the design's section 11 and still awaiting Jack's word: the gitignored-profile
  nested-folder-removal safety gap, and whether DGS-158 or DGS-159 writes the new <code>MEMORY.md</code>
  Conventions bullet.</p>
</section>

<section>
  <h2>Follow-up</h2>
  <p>DGS-159, "Ticket-based naming: modify the code and move the files," takes the full input list in the
  design's section 10.</p>
</section>

<footer>DigiSmith · .digismith/docs/E/E.3/worker-maestro-conventions/report.html</footer>
```

- [ ] **Step 3: Commit**

```bash
git add .digismith/docs/E/E.3/worker-maestro-conventions/design.html .digismith/docs/E/E.3/worker-maestro-conventions/report.html
git commit -m "docs(methodology): close out the naming architecture ticket with a report"
```

- [ ] **Step 4: Report to the maestro**

State: both commits (hash and message), the two files touched, the two open items carried forward unresolved,
and that DGS-158 is done pending Jack's plan approval and any push instruction. Do not push: wait for
"approved: push" (standing brief rule).
