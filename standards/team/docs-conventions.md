# Docs Conventions

Documentation structure and gitignore policy:

- Specs: `docs/<feature>/specs/YYYY-MM-DD-design.md`
- Plans: `docs/<feature>/plans/YYYY-MM-DD-plan.md`
- Progress reports: `docs/<feature>/report.md`
- Tickets: `.digismith/docs/<feature-slug>/ticket.md` (written by
  `digismith:jira-intake`)
- Specs, plans, and progress reports are gitignored and never committed.
  Tickets are not: commit-vs-gitignore for `.digismith/` is an explicit
  per-repo choice, asked once and then remembered (see
  `digismith:jira-intake`)
- Progress reports are copied into Jira manually instead of being pushed
