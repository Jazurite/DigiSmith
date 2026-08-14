# Commit Style

Title only — one line, no body: `type(scope): summary`.

- Types: `feat`, `fix`, `chore`, `style`, `refactor`, `docs`, `test`
- Never reference AI tools or assistants — no "Generated with Claude", no
  `Co-Authored-By: Claude`, no mention of AI assistance anywhere in the message

**Why:** a PR (emma-sleep/shopify-hub#63) was closed after being flagged as
AI-generated — multi-line commit bodies plus a templated PR description both
read as AI tells.
