# A standard and a process for writing articles (tutorials and write-ups)

**Status:** Idea, Jack (2026-10-10 16:30 UTC+7 [09:30Z]). ClickUp: **DGS-229** (task id `14zcebrvcq9`; list **H.3: Public article voice** of clan `H: TBD` since 2026-10-10 ~18:1x UTC+7, moved from E.1:
Standards on Jack's yes: the article standard is the public article voice). No design yet.

## Why

On 2026-10-10 Jack asked for a tutorial article about running Tailscale beside the Proton VPN app on Windows, built
from the day's debugging and two outside articles. Then: "I don't think we have a standard or the process of how we
write a doc, right? That's another backlog." There is none. The first article was written ad hoc:

- An HTML master file with inline CSS (light and dark), a short answer first, then setup, causes, steps, verification,
  the test runs, troubleshooting, limits, appendices with the full script and every raw log, a pre-publication
  checklist and references.
- Kept out of the repo, because the repo is public and the logs held public IPs, a tailnet name and device names.
- First put in the description of its ClickUp ticket (Jack: "the description is in Markdown, but the article is in
  HTML"), not in an update or a comment. Then, Jack's better idea the same day, "similar to how Jira does it": the HTML
  file is an attachment on the ticket, and the Markdown description summarizes and points to it.
- Note: a ClickUp attachment URL opened without login (HTTP 200) and is served as a download, not a page. Anyone with the
  link can fetch the file, so the link must not be shared before redaction.
- Private until Jack decides to publish.

## What to decide

- **Format.** HTML master (as the first article), Markdown, or both. How it reaches ClickUp: today `dg clickup` sends
  only the plain `description`, so Markdown is not rendered (see the `--markdown-description` item in D.3).
- **Where drafts live.** A ClickUp attachment referenced from the description (the current answer), a private repo, a
  git-excluded folder, or a private Artifact page. The public DigiSmith repo is out for anything with private details.
- **Structure template.** Which sections are required (short answer, setup, causes, steps, verify, journey,
  troubleshooting, limits, appendices, checklist, references) and which are optional.
- **Voice.** How it relates to the T lineage (technical voice, ASD-STE100) and audience filtering (T.6). A tutorial
  for the public reads differently from an internal report.
- **Evidence.** How logs, scripts and screenshots are embedded (verbatim, escaped), and how sources are cited.
- **Privacy.** A redaction checklist (public IPs, tailnet names, device and user names, tokens) that runs before any
  publish.
- **Publishing.** Who decides, where it goes (blog, community forums), and how the published copy links back to the
  ticket.

## Related

- [ste100-writing-standard-t.md](ste100-writing-standard-t.md) (T lineage, Voice) and
  [audience-filtering-voice-t6.md](audience-filtering-voice-t6.md) (T.6).
- [backlog-item-gets-clickup-task.md](backlog-item-gets-clickup-task.md) (DGS-163): the ticket and sync rule.
- DGS-230, the `--markdown-description` item in D.3: [dg-clickup-markdown-description.md](dg-clickup-markdown-description.md).
