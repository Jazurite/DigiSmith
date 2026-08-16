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
