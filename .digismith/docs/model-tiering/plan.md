# Model Tiering (K.1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Offload two of DigiSmith's own mechanical HTML-generation steps — `enforcer`'s rewrap correction and `report-implementation`'s template render — to a Chutes-hosted open-weight model, with silent fallback to today's in-session generation whenever offload isn't configured, unavailable, or fails.

**Architecture:** A single shared script (`scripts/model_offload.py`) reads a new `model_offload_provider` profile field, fetches the Chutes API key from the credential store `chutes-ai` already manages, POSTs a prompt to Chutes' chat/completions endpoint, and returns the result over a simple exit-code contract. `enforcer` and `report-implementation` each call it at one specific point in their existing process, falling back to their current in-session behavior on any non-zero exit.

**Tech Stack:** Python 3 standard library only (`urllib`, `subprocess`, `json`, `argparse`) — no new pip dependency. `unittest` for tests (no `pytest` dependency exists in this repo today).

## Global Constraints

- No new external Python packages. Use `urllib.request`, not `requests` — avoids introducing a dependency file into a repo that doesn't have one today.
- Chutes model is fixed at `google/gemma-4-31B-turbo-TEE` (cheap-fast, formatting-suited, not a reasoning model) — a swappable implementation detail per the spec's Open Questions, not something to make configurable in this plan.
- Chutes credential script path is fixed at `os.path.expanduser("~/.claude/skills/chutes-ai/scripts/manage_credentials.py")` — verified present and working in this session. Never store a separate DigiSmith-specific Chutes credential.
- Chutes inference endpoint: `https://llm.chutes.ai/v1/chat/completions`, `Authorization: Bearer <key>` header (per `chutes-ai` skill's own verified findings — `X-API-Key` does not work on this endpoint).
- The script's contract: exit 0 + generated content on stdout = success; exit 1 + nothing on stdout (a one-line reason always goes to stderr) = failure, caller must fall back. No retries.
- Spec reference: `.digismith/docs/model-tiering/design.html`.

---

### Task 1: Shared offload script + profile field

**Files:**
- Create: `scripts/model_offload.py`
- Create: `scripts/test_model_offload.py`
- Modify: `profiles/digismith.yml`

**Interfaces:**
- Produces (importable functions in `model_offload.py`):
  - `read_profile_provider(profile_path: str) -> str | None`
  - `get_chutes_api_key() -> str | None`
  - `call_chutes(prompt: str, api_key: str) -> str` (raises `urllib.error.URLError`/`urllib.error.HTTPError` on transport failure, `KeyError`/`IndexError`/`json.JSONDecodeError` on malformed response)
  - `offload(prompt: str, profile_path: str) -> tuple[str | None, str]` — `(content, status_message)`; `content` is `None` on any failure, `status_message` always describes what happened
- Produces (CLI, consumed by Tasks 2-3):
  `python scripts/model_offload.py --prompt-file <path> --profile-path <path>` — exit 0 with generated content on stdout, or exit 1 with nothing on stdout. A one-line status always goes to stderr (`offload: success (...)` / `offload: skipped (...)` / `offload: failed (...)`).

- [ ] **Step 1: Add the profile field**

Modify `profiles/digismith.yml` — append one line so the file reads:

```yaml
name: digismith
standards: [global]
ticket: false
ephemeral: false
reporting: true
publish_artifact: true
logging: true
model_offload_provider: chutes
```

- [ ] **Step 2: Write the failing tests**

Create `scripts/test_model_offload.py`:

```python
import os
import tempfile
import unittest
import urllib.error
from unittest.mock import patch

import model_offload


class TestReadProfileProvider(unittest.TestCase):
    def test_missing_file_returns_none(self):
        self.assertIsNone(
            model_offload.read_profile_provider("/nonexistent/path/profile")
        )

    def test_present_field_returns_value(self):
        with tempfile.NamedTemporaryFile(mode="w", suffix=".profile", delete=False) as f:
            f.write("name: digismith\nmodel_offload_provider: chutes\n")
            path = f.name
        try:
            self.assertEqual(model_offload.read_profile_provider(path), "chutes")
        finally:
            os.unlink(path)

    def test_absent_field_returns_none(self):
        with tempfile.NamedTemporaryFile(mode="w", suffix=".profile", delete=False) as f:
            f.write("name: digismith\n")
            path = f.name
        try:
            self.assertIsNone(model_offload.read_profile_provider(path))
        finally:
            os.unlink(path)


class TestOffload(unittest.TestCase):
    def setUp(self):
        with tempfile.NamedTemporaryFile(mode="w", suffix=".profile", delete=False) as f:
            f.write("name: digismith\nmodel_offload_provider: chutes\n")
            self.profile_path = f.name

    def tearDown(self):
        os.unlink(self.profile_path)

    def test_skips_when_provider_not_chutes(self):
        with tempfile.NamedTemporaryFile(mode="w", suffix=".profile", delete=False) as f:
            f.write("name: personal\n")
            other_path = f.name
        try:
            content, status = model_offload.offload("hello", other_path)
            self.assertIsNone(content)
            self.assertIn("skipped", status)
        finally:
            os.unlink(other_path)

    @patch("model_offload.get_chutes_api_key", return_value=None)
    def test_skips_when_no_credentials(self, _mock):
        content, status = model_offload.offload("hello", self.profile_path)
        self.assertIsNone(content)
        self.assertIn("no chutes credentials", status)

    @patch("model_offload.call_chutes", return_value="generated text")
    @patch("model_offload.get_chutes_api_key", return_value="cpk_fake")
    def test_success(self, _mock_key, _mock_call):
        content, status = model_offload.offload("hello", self.profile_path)
        self.assertEqual(content, "generated text")
        self.assertIn("success", status)

    @patch(
        "model_offload.call_chutes",
        side_effect=urllib.error.HTTPError(
            url="x", code=429, msg="rate limited", hdrs=None, fp=None
        ),
    )
    @patch("model_offload.get_chutes_api_key", return_value="cpk_fake")
    def test_failure_on_http_error(self, _mock_key, _mock_call):
        content, status = model_offload.offload("hello", self.profile_path)
        self.assertIsNone(content)
        self.assertIn("failed", status)

    @patch("model_offload.call_chutes", return_value="   ")
    @patch("model_offload.get_chutes_api_key", return_value="cpk_fake")
    def test_failure_on_empty_response(self, _mock_key, _mock_call):
        content, status = model_offload.offload("hello", self.profile_path)
        self.assertIsNone(content)
        self.assertIn("empty", status)


if __name__ == "__main__":
    unittest.main()
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `python scripts/test_model_offload.py -v` (from the repo root, with `scripts/` on the path — run as `python -m unittest scripts.test_model_offload -v` if a plain run can't import `model_offload`)
Expected: FAIL / ModuleNotFoundError — `model_offload.py` doesn't exist yet.

- [ ] **Step 4: Write the implementation**

Create `scripts/model_offload.py`:

```python
#!/usr/bin/env python3
"""Offload a mechanical text-generation prompt to a configured third-party
model provider. Prints generated content to stdout and exits 0 on success;
prints nothing to stdout and exits 1 on any failure. A one-line status
always goes to stderr. Callers fall back to generating the content
themselves on a non-zero exit.
"""
import argparse
import json
import os
import subprocess
import sys
import urllib.error
import urllib.request

CHUTES_CREDENTIALS_SCRIPT = os.path.expanduser(
    "~/.claude/skills/chutes-ai/scripts/manage_credentials.py"
)
CHUTES_MODEL = "google/gemma-4-31B-turbo-TEE"
CHUTES_URL = "https://llm.chutes.ai/v1/chat/completions"
TIMEOUT_SECONDS = 60


def read_profile_provider(profile_path):
    if not os.path.isfile(profile_path):
        return None
    with open(profile_path, "r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if line.startswith("model_offload_provider:"):
                return line.split(":", 1)[1].strip()
    return None


def get_chutes_api_key():
    if not os.path.isfile(CHUTES_CREDENTIALS_SCRIPT):
        return None
    try:
        result = subprocess.run(
            [sys.executable, CHUTES_CREDENTIALS_SCRIPT, "get", "--field", "api_key"],
            capture_output=True,
            text=True,
            timeout=10,
        )
    except (subprocess.SubprocessError, OSError):
        return None
    if result.returncode != 0:
        return None
    key = result.stdout.strip()
    return key or None


def call_chutes(prompt, api_key):
    body = json.dumps(
        {
            "model": CHUTES_MODEL,
            "messages": [{"role": "user", "content": prompt}],
        }
    ).encode("utf-8")
    req = urllib.request.Request(
        CHUTES_URL,
        data=body,
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        },
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=TIMEOUT_SECONDS) as resp:
        payload = json.loads(resp.read().decode("utf-8"))
    return payload["choices"][0]["message"]["content"]


def offload(prompt, profile_path):
    provider = read_profile_provider(profile_path)
    if provider != "chutes":
        return None, f"offload: skipped (model_offload_provider={provider!r}, only 'chutes' is implemented)"

    api_key = get_chutes_api_key()
    if not api_key:
        return None, "offload: skipped (no chutes credentials found)"

    try:
        content = call_chutes(prompt, api_key)
    except urllib.error.HTTPError as e:
        return None, f"offload: failed (HTTP {e.code})"
    except urllib.error.URLError as e:
        return None, f"offload: failed (network error: {e})"
    except (KeyError, IndexError, json.JSONDecodeError) as e:
        return None, f"offload: failed (malformed response: {e})"

    if not content or not content.strip():
        return None, "offload: failed (empty response)"

    return content, f"offload: success (chutes/{CHUTES_MODEL})"


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--prompt-file", required=True)
    parser.add_argument("--profile-path", default=".digismith/profile")
    args = parser.parse_args()

    with open(args.prompt_file, "r", encoding="utf-8") as f:
        prompt = f.read()

    content, status = offload(prompt, args.profile_path)
    print(status, file=sys.stderr)

    if content is None:
        sys.exit(1)

    print(content)
    sys.exit(0)


if __name__ == "__main__":
    main()
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `python scripts/test_model_offload.py -v`
Expected: PASS, all 8 tests green.

- [ ] **Step 6: Commit**

```bash
git add profiles/digismith.yml scripts/model_offload.py scripts/test_model_offload.py
git commit -m "feat(model-tiering): add shared Chutes offload script and profile field"
```

---

### Task 2: Wire enforcer's rewrap step to the offload script

**Files:**
- Modify: `skills/enforcer/SKILL.md` (Step 2 — the "Doesn't match, or wrong format" bullet)

**Interfaces:**
- Consumes: Task 1's CLI contract (`python scripts/model_offload.py --prompt-file <path> --profile-path <path>`, exit 0/stdout on success, exit 1 on failure).

- [ ] **Step 1: Locate the exact text to replace**

In `skills/enforcer/SKILL.md`, find this bullet inside "### Step 2: Verified — After `superpowers:brainstorming` Reports Completion":

```
- **Doesn't match, or wrong format** → read the file `brainstorming`
  actually wrote (its reported path). Rewrap its content into the Step
  1 HTML shell — the body content it already wrote becomes
  `{{BODY_SECTIONS}}` — and write the result to
  `.digismith/docs/<slug>/design.html`, creating the folder if needed.
  Report what was corrected: "Enforcer: brainstorming wrote to
  `<old-path>` — moved and reformatted to
  `.digismith/docs/<slug>/design.html`."
```

- [ ] **Step 2: Replace it**

Replace the block found in Step 1 with:

```
- **Doesn't match, or wrong format** → read the file `brainstorming`
  actually wrote (its reported path). Before rewrapping it yourself, try
  offloading the rewrap: write a prompt file containing (1) the exact
  Step 1 HTML shell with `{{TITLE}}`, `{{DATE}}`, `{{MAP_ITEM}}` already
  filled in and `{{TOC_ITEMS}}`/`{{BODY_SECTIONS}}` left as literal
  placeholders, (2) the misplaced file's full content, and (3) one
  instruction line: "Fill `{{TOC_ITEMS}}` and `{{BODY_SECTIONS}}` from
  the content above, preserving all of its information; return only the
  complete HTML document, nothing else." Run:
  `python scripts/model_offload.py --prompt-file <prompt-file>
  --profile-path .digismith/profile`. On exit 0, use its stdout as the
  file content verbatim. On any non-zero exit (offload unavailable,
  off, or failed — the stderr line names which), rewrap it yourself
  exactly as before: the body content it already wrote becomes
  `{{BODY_SECTIONS}}`. Either way, write the result to
  `.digismith/docs/<slug>/design.html`, creating the folder if needed,
  and report what was corrected: "Enforcer: brainstorming wrote to
  `<old-path>` — moved and reformatted (<via Chutes|in-session>) to
  `.digismith/docs/<slug>/design.html`."
```

- [ ] **Step 3: Verify the file still parses as valid Markdown/prose**

Run: `python -c "import pathlib; print(len(pathlib.Path('skills/enforcer/SKILL.md').read_text(encoding='utf-8')))"`
Expected: prints a byte count with no error (confirms the edit didn't corrupt file encoding/structure — this is a prose instruction file, not executable code, so there is no compiler/linter to run against it).

- [ ] **Step 4: Commit**

```bash
git add skills/enforcer/SKILL.md
git commit -m "feat(model-tiering): wire enforcer's rewrap step to the offload script"
```

---

### Task 3: Wire report-implementation's render step to the offload script

**Files:**
- Modify: `skills/report-implementation/SKILL.md` (start of "### Step 3: Render the HTML")

**Interfaces:**
- Consumes: Task 1's CLI contract (same as Task 2).

- [ ] **Step 1: Locate the exact text to replace**

In `skills/report-implementation/SKILL.md`, find:

```
### Step 3: Render the HTML

Use this exact template, replacing each `{{PLACEHOLDER}}`. Keep the
`<style>` block byte-for-byte — it's the same one every DigiSmith
spec/report already uses:
```

- [ ] **Step 2: Replace it**

Replace the block found in Step 1 with:

```
### Step 3: Render the HTML

Before rendering it yourself, try offloading this step: write a prompt
file containing (1) every placeholder value derived in Step 2 (2a-2f),
clearly labeled by name, and (2) the exact template below plus one
instruction line: "Substitute each `{{PLACEHOLDER}}` with the labeled
value above exactly — escaping is already applied, don't re-escape;
return only the complete HTML document, nothing else." Run:
`python scripts/model_offload.py --prompt-file <prompt-file>
--profile-path .digismith/profile`. On exit 0, use its stdout as
`report.html`'s content verbatim and skip the manual substitution below
— continue straight to Step 4. On any non-zero exit (offload
unavailable, off, or failed — the stderr line names which), render it
yourself exactly as described below.

Use this exact template, replacing each `{{PLACEHOLDER}}`. Keep the
`<style>` block byte-for-byte — it's the same one every DigiSmith
spec/report already uses:
```

- [ ] **Step 3: Verify the file still parses as valid Markdown/prose**

Run: `python -c "import pathlib; print(len(pathlib.Path('skills/report-implementation/SKILL.md').read_text(encoding='utf-8')))"`
Expected: prints a byte count with no error.

- [ ] **Step 4: Commit**

```bash
git add skills/report-implementation/SKILL.md
git commit -m "feat(model-tiering): wire report-implementation's render step to the offload script"
```

---

### Task 4: Manual end-to-end verification

**Files:** none — this task changes no files, it exercises Tasks 1-3 against the real Chutes API.

**Interfaces:**
- Consumes: everything produced by Tasks 1-3.

- [ ] **Step 1: Verify the script against the real API**

Run:
```bash
echo "Say the word BANANA and nothing else." > /tmp/offload-test-prompt.txt
python scripts/model_offload.py --prompt-file /tmp/offload-test-prompt.txt --profile-path .digismith/profile
```
Expected: exit 0, stdout contains "BANANA" or similar, stderr shows `offload: success (chutes/google/gemma-4-31B-turbo-TEE)`.

- [ ] **Step 2: Verify the fallback path**

Run:
```bash
mv profiles/digismith.yml /tmp/digismith.yml.bak
printf 'name: digismith\n' > profiles/digismith.yml
python scripts/model_offload.py --prompt-file /tmp/offload-test-prompt.txt --profile-path <(printf 'model_offload_provider: bogus\n')
mv /tmp/digismith.yml.bak profiles/digismith.yml
```
Expected: exit 1, empty stdout, stderr shows `offload: skipped (model_offload_provider='bogus', only 'chutes' is implemented)`.

- [ ] **Step 3: Verify enforcer's rewrap path end to end**

Manually simulate the scenario Step 2 of `enforcer` handles: create a small Markdown file with a few sections of body content at a scratch path, follow Task 2's new instructions by hand (build the prompt file with the shell + content + instruction, run the script, use its output). Confirm the resulting HTML is well-formed, preserves the original content's information, and that the reported message says "via Chutes."

- [ ] **Step 4: Verify report-implementation's render path end to end**

Manually construct a small synthetic set of Step 2 placeholder values (a fake feature title, date, map item, one task row, one commit) and follow Task 3's new instructions by hand. Confirm the resulting HTML matches the template's structure and that the reported message says "via Chutes."

- [ ] **Step 5: Report findings**

Summarize pass/fail for Steps 1-4 to the user. No commit — this task produces no file changes, only confirmation that the mechanism works end to end against the real API and falls back correctly when it doesn't.
