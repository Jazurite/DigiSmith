#!/usr/bin/env python3
"""Offload a mechanical text-generation prompt to a configured third-party
model provider. Prints generated content to stdout and exits 0 on success;
prints nothing to stdout and exits 1 on any failure. A one-line status
always goes to stderr. Callers fall back to generating the content
themselves on a non-zero exit.

Constraint: offload only activates when this script is invoked with
DigiSmith's own repo as the current working directory. The profile field
that enables it lives in `profiles/<name>.yml` inside that repo, and a
non-interactive script has no way to ask for DigiSmith's repo path the way
a conversational skill can. Run from anywhere else and the offload is
skipped, with the caller falling back to in-session generation.
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


def is_digismith_repo():
    """True when the current working directory is DigiSmith's own repo."""
    plugin_json_path = os.path.join(os.getcwd(), ".claude-plugin", "plugin.json")
    if not os.path.isfile(plugin_json_path):
        return False
    try:
        with open(plugin_json_path, "r", encoding="utf-8") as f:
            plugin_config = json.load(f)
    except (OSError, UnicodeDecodeError, json.JSONDecodeError):
        return False
    return plugin_config.get("name") == "digismith"


def parse_field_value(line):
    """Extract a scalar YAML value: strip inline comments and wrapping quotes."""
    return line.split(":", 1)[1].split("#", 1)[0].strip().strip("\"'")


def read_profile_provider(profile_path):
    # Step 1: Read the pointer file to get profile name
    if not os.path.isfile(profile_path):
        return None

    try:
        with open(profile_path, "r", encoding="utf-8") as f:
            profile_name = f.read().strip()
    except (OSError, UnicodeDecodeError):
        return None

    if not profile_name:
        return None

    # Step 2: Locate DigiSmith's repo by checking for .claude-plugin/plugin.json
    if not is_digismith_repo():
        return None

    # Step 3: Read profiles/<name>.yml and extract model_offload_provider field
    profiles_file = os.path.join(os.getcwd(), "profiles", f"{profile_name}.yml")
    if not os.path.isfile(profiles_file):
        return None

    try:
        with open(profiles_file, "r", encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if line.startswith("model_offload_provider:"):
                    return parse_field_value(line)
    except (OSError, UnicodeDecodeError):
        return None

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


def has_expected_html_shape(content):
    """Roughly validate the model returned a bare, fully-substituted HTML doc."""
    text = content.strip()
    if not text.lower().startswith("<!doctype html"):
        return False
    if not text.endswith("</html>"):
        return False
    if "{{" in text:
        return False
    if "```" in text:
        return False
    return True


def offload(prompt, profile_path):
    provider = read_profile_provider(profile_path)
    if provider != "chutes":
        if not is_digismith_repo():
            return None, "offload: skipped (not DigiSmith's own repo — offload only runs there)"
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
    except (
        KeyError,
        IndexError,
        TypeError,
        AttributeError,
        UnicodeDecodeError,
        json.JSONDecodeError,
    ) as e:
        return None, f"offload: failed (malformed response: {e})"
    except OSError as e:
        return None, f"offload: failed (connection error: {e})"

    if not isinstance(content, str) or not content.strip():
        return None, "offload: failed (empty response)"

    if not has_expected_html_shape(content):
        return None, "offload: failed (malformed HTML shape)"

    return content, f"offload: success (chutes/{CHUTES_MODEL})"


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--prompt-file", required=True)
    parser.add_argument("--profile-path", default=".digismith/profile")
    args = parser.parse_args()

    try:
        with open(args.prompt_file, "r", encoding="utf-8") as f:
            prompt = f.read()
    except OSError as e:
        print(f"offload: failed (cannot read prompt file: {e})", file=sys.stderr)
        sys.exit(1)

    content, status = offload(prompt, args.profile_path)
    print(status, file=sys.stderr)

    if content is None:
        sys.exit(1)

    print(content)
    sys.exit(0)


if __name__ == "__main__":
    main()
