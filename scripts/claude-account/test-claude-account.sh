#!/bin/bash
# Tests for claude-account (DGS-224). Run: /bin/bash scripts/claude-account/test-claude-account.sh
# Everything runs in a TEMP HOME with FAKE secrets. The real ~/.config/claude-accounts and ~/.digismith-depot/.env are never touched.
set -u
HERE=$(cd "$(dirname "$0")" && pwd)
SCRIPT="$HERE/claude-account"
T=$(mktemp -d "${TMPDIR:-/tmp}/claude-account-test.XXXXXX")
PASS=0; FAIL=0; SERVER_PID=""
cleanup() { [ -z "$SERVER_PID" ] || kill "$SERVER_PID" 2>/dev/null || true; }
trap cleanup EXIT

ok()   { PASS=$((PASS + 1)); }
bad()  { FAIL=$((FAIL + 1)); echo "FAIL: $1"; }
check() { # description, command...
  local d="$1"; shift
  if "$@"; then ok; else bad "$d"; fi
}

export HOME="$T/home"
mkdir -p "$HOME/.local/share/claude-account" "$HOME/.digismith-depot"
A="$T/accounts"; mkdir -p "$A"; chmod 700 "$A"
export CLAUDE_ACCOUNTS_DIR="$A"
export CLAUDE_ACCOUNT_SOURCES="$T/sources.conf"
unset CLAUDE_CODE_OAUTH_TOKEN ANTHROPIC_API_KEY ANTHROPIC_BASE_URL ANTHROPIC_AUTH_TOKEN \
  ANTHROPIC_DEFAULT_OPUS_MODEL ANTHROPIC_DEFAULT_SONNET_MODEL ANTHROPIC_DEFAULT_HAIKU_MODEL

TOK_JACK="sk-ant-oat01-FAKEJACKTOKEN-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
TOK_DEV0="sk-ant-oat01-FAKEDEV0TOKEN-bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
printf '%s' "$TOK_JACK" > "$A/jack.token"
printf '%s' "$TOK_DEV0" > "$A/dev0.token"
printf '%s\n' jack > "$A/active"

# Hostile fake key: space, quotes, dollar, backticks, semicolon, command substitutions that would touch marker files.
HOSTILE="SECRETPART k e'y \"q\" \$HOME \`touch $T/marker1\`; \$(touch $T/marker2) \\ end"
ENVF="$HOME/.digismith-depot/.env"
write_env() { printf '%s' "$1" > "$ENVF"; }
write_sources() { # base_url
  cat > "$CLAUDE_ACCOUNT_SOURCES" <<S
# test sources
izanami.kind=gateway
izanami.base_url=$1
izanami.key_var=IZANAMI_API_KEY
izanami.env_file=~/.digismith-depot/.env
izanami.model.opus=claude-opus-5-5
izanami.model.sonnet=claude-sonnet-5-5
izanami.model.haiku=claude-sonnet-5-5
S
}
write_sources "https://izanami.example.test"
write_env "$(printf 'OTHER=1\nIZANAMI_API_KEY=%s\n' "$HOSTILE")"

OUT="$T/out"; ERR="$T/err"; RC=0
run() { RC=0; /bin/bash "$SCRIPT" "$@" >"$OUT" 2>"$ERR" || RC=$?; }
out() { cat "$OUT"; }

no_secret() { # description: neither stdout nor stderr holds a fake secret
  local s
  for s in "$TOK_JACK" "$TOK_DEV0" "FAKEJACKTOKEN" "FAKEDEV0TOKEN" "SECRETPART" "fake-key-123" "$HOSTILE"; do
    if grep -qF -- "$s" "$OUT" "$ERR"; then bad "$1: leaked '${s:0:14}...'"; return; fi
  done
  ok
}
active_is() { [ "$(tr -d '[:space:]' < "$A/active")" = "$1" ]; }
eval_in_sub() { # shell, name-args...: eval `env` output in a subshell that STARTED with the other source's variables; print vars
  local sh="$1"; shift
  CLAUDE_CODE_OAUTH_TOKEN=OLDSEAT ANTHROPIC_API_KEY=OLDAPI ANTHROPIC_BASE_URL=OLDURL ANTHROPIC_AUTH_TOKEN=OLDAUTH \
  ANTHROPIC_DEFAULT_OPUS_MODEL=OLDO ANTHROPIC_DEFAULT_SONNET_MODEL=OLDS ANTHROPIC_DEFAULT_HAIKU_MODEL=OLDH \
  CA="$SCRIPT" "$sh" -c '
    eval "$(/bin/bash "$CA" '"$*"')"
    printf "oauth=[%s]\napi=[%s]\nurl=[%s]\nauth=[%s]\nopus=[%s]\nsonnet=[%s]\nhaiku=[%s]\n" \
      "${CLAUDE_CODE_OAUTH_TOKEN-UNSET}" "${ANTHROPIC_API_KEY-UNSET}" "${ANTHROPIC_BASE_URL-UNSET}" "${ANTHROPIC_AUTH_TOKEN-UNSET}" \
      "${ANTHROPIC_DEFAULT_OPUS_MODEL-UNSET}" "${ANTHROPIC_DEFAULT_SONNET_MODEL-UNSET}" "${ANTHROPIC_DEFAULT_HAIKU_MODEL-UNSET}"'
}

# ---------- 1. gateway env ----------
run env izanami
check "gateway env exits 0" [ "$RC" = 0 ]
check "gateway env stderr empty" [ ! -s "$ERR" ]
check "gateway env: only unset/export lines" bash -c '! grep -qvE "^(unset|export) " "$0"' "$OUT"
for sh in /bin/bash zsh; do
  command -v "$sh" >/dev/null || continue
  R=$(eval_in_sub "$sh" env izanami)
  check "gateway env ($sh): key is the EXACT hostile value" bash -c '[ "$(printf "%s\n" "$1" | sed -n "s/^auth=\[//p" | sed "\$s/\]\$//")" = "$2" ]' _ "$R" "$HOSTILE"
  check "gateway env ($sh): oauth+api unset" bash -c 'printf "%s\n" "$1" | grep -q "^oauth=\[UNSET\]" && printf "%s\n" "$1" | grep -q "^api=\[UNSET\]"' _ "$R"
  check "gateway env ($sh): url + models" bash -c 'printf "%s\n" "$1" | grep -q "^url=\[https://izanami.example.test\]" && printf "%s\n" "$1" | grep -q "^opus=\[claude-opus-5-5\]" && printf "%s\n" "$1" | grep -q "^sonnet=\[claude-sonnet-5-5\]" && printf "%s\n" "$1" | grep -q "^haiku=\[claude-sonnet-5-5\]"' _ "$R"
  check "gateway env ($sh): nothing executed" [ ! -e "$T/marker1" ] && [ ! -e "$T/marker2" ]
done

# .env parsing variants (key must come out exact; .env is never sourced)
for variant in 'plain:IZANAMI_API_KEY=abc def' 'export:export IZANAMI_API_KEY=abc def' 'dq:IZANAMI_API_KEY="abc def"' 'sq:IZANAMI_API_KEY='"'"'abc def'"'"'' 'crlf:IZANAMI_API_KEY=abc def\r' 'trail:IZANAMI_API_KEY=abc def   ' 'cmt:IZANAMI_API_KEY="abc def" # note'; do
  nm="${variant%%:*}"; line="${variant#*:}"
  printf "$line\n" > "$ENVF"
  R=$(eval_in_sub /bin/bash env izanami)
  check ".env variant $nm" bash -c 'printf "%s\n" "$1" | grep -qx "auth=\[abc def\]"' _ "$R"
done
printf 'IZANAMI_API_KEY=a\rb\n' > "$ENVF"
run env izanami
check "CR inside the value refused" [ "$RC" != 0 ] && [ ! -s "$OUT" ]
no_secret "CR value error"
write_env "$(printf 'OTHER=1\nIZANAMI_API_KEY=%s\n' "$HOSTILE")"

# ---------- 2. seat env ----------
run env jack
check "seat env exits 0" [ "$RC" = 0 ]
R=$(eval_in_sub /bin/bash env jack)
check "seat env: every gateway var unset" bash -c 'for k in url auth opus sonnet haiku; do printf "%s\n" "$1" | grep -q "^$k=\[UNSET\]" || exit 1; done' _ "$R"
check "seat env: token exported exactly" bash -c 'printf "%s\n" "$1" | grep -qxF "oauth=[$2]"' _ "$R" "$TOK_JACK"
check "seat env: only unset/export lines" bash -c '! grep -qvE "^(unset|export) " "$0"' "$OUT"
check "seat env keeps the old export line" grep -q '^export CLAUDE_CODE_OAUTH_TOKEN=' "$OUT"

# ---------- 3. env <name> does not touch the active file; env with no name uses active ----------
printf '%s\n' izanami > "$A/active"
run env jack
check "env jack while active=izanami: seat exports" grep -q '^export CLAUDE_CODE_OAUTH_TOKEN=' "$OUT"
check "env jack while active=izanami: gateway unsets" grep -q '^unset .*ANTHROPIC_BASE_URL' "$OUT"
check "env jack leaves active file unchanged" active_is izanami
run env
check "env (no name) uses active=izanami" grep -q '^export ANTHROPIC_BASE_URL=' "$OUT"
check "env (no name, active izanami): exports DIGISMITH_SEAT=izanami" grep -q '^export DIGISMITH_SEAT=izanami$' "$OUT"
run env jack
check "env jack: exports DIGISMITH_SEAT=jack" grep -q '^export DIGISMITH_SEAT=jack$' "$OUT"
check "env: the DIGISMITH_SEAT line holds no secret" bash -c '! grep "^export DIGISMITH_SEAT" "$0" | grep -q "FAKE"' "$OUT"
run env izanami
check "env izanami: exports DIGISMITH_SEAT=izanami" grep -q '^export DIGISMITH_SEAT=izanami$' "$OUT"
run env nosuch
check "env unknown name: exit 1, stdout empty" [ "$RC" = 1 ] && [ ! -s "$OUT" ]
check "env unknown name: clear error" grep -q "claude-account:" "$ERR"
run env 'Bad Name'
check "env bad name: exit 1, stdout empty" [ "$RC" = 1 ] && [ ! -s "$OUT" ]
printf '%s\n' jack > "$A/active"

# ---------- 4. missing key ----------
for case_ in nofile novar empty; do
  case "$case_" in
    nofile) rm_target="$ENVF"; mv "$ENVF" "$ENVF.keep" ;;
    novar)  printf 'OTHER=1\n' > "$ENVF" ;;
    empty)  printf 'IZANAMI_API_KEY=\n' > "$ENVF" ;;
  esac
  run env izanami
  check "missing key ($case_): exit 1" [ "$RC" = 1 ]
  check "missing key ($case_): stdout empty" [ ! -s "$OUT" ]
  check "missing key ($case_): clear error names the variable" grep -q "IZANAMI_API_KEY" "$ERR"
  no_secret "missing key ($case_)"
  [ "$case_" != nofile ] || mv "$ENVF.keep" "$ENVF"
done
write_env "$(printf 'OTHER=1\nIZANAMI_API_KEY=%s\n' "$HOSTILE")"
printf '%s\n' izanami > "$A/active"; mv "$ENVF" "$ENVF.keep"
run env
check "active gateway with missing key: exit 1, stdout empty" [ "$RC" = 1 ] && [ ! -s "$OUT" ]
mv "$ENVF.keep" "$ENVF"
printf '%s\n' jack > "$A/active"
: > "$A/active"; run env
check "no active account: nothing, exit 0" [ "$RC" = 0 ] && [ ! -s "$OUT" ]
printf '%s\n' jack > "$A/active"

# ---------- 5. list, status, use: kinds shown, no secrets ----------
run list
check "list shows seats" grep -qE '^\* +jack +seat$' "$OUT" && grep -qE '^  +dev0 +seat$' "$OUT"
check "list shows the gateway" grep -qE '^  +izanami +gateway$' "$OUT"
no_secret "list"
run status
check "status (seat) shows kind" grep -q 'jack (seat)' "$OUT"
no_secret "status seat"
CLAUDE_CODE_OAUTH_TOKEN="$TOK_JACK" run status
no_secret "status seat, shell holds token"
run use izanami
check "use izanami ok" [ "$RC" = 0 ] && active_is izanami
no_secret "use izanami"
run status
check "status (gateway) shows kind" grep -q 'izanami (gateway)' "$OUT"
check "status (gateway): shell has no gateway vars" grep -qi 'no gateway variables' "$OUT"
no_secret "status gateway, plain shell"
ANTHROPIC_BASE_URL="https://izanami.example.test" ANTHROPIC_AUTH_TOKEN="$HOSTILE" run status
check "status (gateway): matches" grep -q 'matches' "$OUT"
no_secret "status gateway, matching shell"
ANTHROPIC_BASE_URL="https://other.example.test" ANTHROPIC_AUTH_TOKEN="SECRETPART-other" run status
check "status (gateway): differs" grep -q 'differs' "$OUT"
no_secret "status gateway, differing shell"
run use dev0
check "use seat ok" [ "$RC" = 0 ] && active_is dev0
run use nosuch
check "use unknown: exit 1, active unchanged" [ "$RC" = 1 ] && active_is dev0
no_secret "use unknown"
# gateway entry incomplete
cp "$CLAUDE_ACCOUNT_SOURCES" "$T/sources.bak"; grep -v 'izanami.model.haiku' "$T/sources.bak" > "$CLAUDE_ACCOUNT_SOURCES"
run use izanami
check "use incomplete gateway: exit 1" [ "$RC" = 1 ] && active_is dev0
cp "$T/sources.bak" "$CLAUDE_ACCOUNT_SOURCES"
# gateway use warns when the key is missing but still switches
mv "$ENVF" "$ENVF.keep"; run use izanami
check "use gateway with missing key: switches and warns" [ "$RC" = 0 ] && active_is izanami && grep -q 'IZANAMI_API_KEY' "$ERR" "$OUT"
no_secret "use gateway missing key"
mv "$ENVF.keep" "$ENVF"
# name clash
printf 'x' > "$A/izanami.token"
run use izanami
check "name clash seat/gateway: exit 1" [ "$RC" = 1 ]
run list
check "list on a clash: exit 1" [ "$RC" = 1 ]
mv "$A/izanami.token" "$T/izanami.token.aside"
printf '%s\n' jack > "$A/active"

# review fixes: stale active, add onto a gateway name
printf '%s\n' ghost > "$A/active"; run status
check "status with a stale active name says not found" grep -q 'not found' "$OUT" && ! grep -q '(seat)' "$OUT"
printf '%s\n' jack > "$A/active"
run add izanami "$TOK_JACK"
check "add refuses a gateway name" [ "$RC" = 1 ] && [ ! -f "$A/izanami.token" ]
no_secret "add onto gateway name"

# ---------- 6. next skips gateways; rename refuses a gateway ----------
run next
check "next goes to the next seat" active_is dev0
run next
check "next wraps over seats only" active_is jack
printf '%s\n' izanami > "$A/active"; run next
check "next from a gateway lands on a seat" [ "$RC" = 0 ] && { active_is jack || active_is dev0; }
run rename izanami x1
check "rename refuses a gateway" [ "$RC" = 1 ]
run rename jack izanami
check "rename onto a gateway name refused" [ "$RC" = 1 ] && [ -f "$A/jack.token" ]
printf '%s\n' jack > "$A/active"

# ---------- 7. check against a local fake HTTP server ----------
cat > "$T/server.py" <<'PY'
import http.server, sys, json
portfile, hdrfile, expected = sys.argv[1], sys.argv[2], sys.argv[3]
class H(http.server.BaseHTTPRequestHandler):
    def do_GET(self):
        open(hdrfile, "a").write(self.path + "|" + (self.headers.get("Authorization") or "") + "\n")
        ok = self.path == "/v1/models" and self.headers.get("Authorization") == "Bearer " + expected
        body = json.dumps({"data": [{"id": "claude-fake-1"}, {"id": "claude-fake-2"}]} if ok else {"error": {"code": "API_KEY_REQUIRED", "echo": expected if False else ""}}).encode()
        self.send_response(200 if ok else 401)
        self.send_header("Content-Type", "application/json"); self.send_header("Content-Length", str(len(body)))
        self.end_headers(); self.wfile.write(body)
    def log_message(self, *a): pass
s = http.server.HTTPServer(("127.0.0.1", 0), H)
open(portfile, "w").write(str(s.server_address[1]))
s.serve_forever()
PY
python3 -I "$T/server.py" "$T/port" "$T/headers" 'fake-key-123' &
SERVER_PID=$!
i=0; while [ ! -s "$T/port" ] && [ "$i" -lt 50 ]; do sleep 0.1; i=$((i + 1)); done
PORT=$(cat "$T/port")
write_sources "http://127.0.0.1:$PORT/"
write_env "IZANAMI_API_KEY=fake-key-123"
run check izanami
check "check exits 0" [ "$RC" = 0 ]
check "check prints the model ids" grep -q 'claude-fake-1' "$OUT" && grep -q 'claude-fake-2' "$OUT"
check "check prints the HTTP code" grep -q 'HTTP 200' "$OUT"
check "check sent GET /v1/models with the Bearer key" grep -qxF '/v1/models|Bearer fake-key-123' "$T/headers"
no_secret "check ok"
write_env "IZANAMI_API_KEY=wrong-key-999"
run check izanami
check "check with a rejected key: exit 1 and code shown" [ "$RC" != 0 ] && grep -q 'HTTP 401' "$OUT" "$ERR"
no_secret "check 401"
check "check 401 does not print the wrong key" bash -c '! grep -qF wrong-key-999 "$0" "$1"' "$OUT" "$ERR"
write_env "IZANAMI_API_KEY=fake-key-123"
write_sources "http://127.0.0.1:1"
run check izanami
check "check unreachable server: exit 1, no secret" [ "$RC" != 0 ]
no_secret "check unreachable"
run check nosuch
check "check unknown name: exit 1" [ "$RC" = 1 ]

# ---------- 8. install.sh into a temp HOME ----------
IH="$T/installhome"; mkdir -p "$IH/.local/bin"
printf 'OLD' > "$IH/.local/bin/claude-account"
HOME="$IH" sh "$HERE/install.sh" >"$OUT" 2>"$ERR"; RC=$?
check "install exits 0" [ "$RC" = 0 ]
check "install backed up the old file" [ "$(cat "$IH/.local/bin/claude-account.before-dgs-224-20261012")" = OLD ]
check "install copied the script" cmp -s "$SCRIPT" "$IH/.local/bin/claude-account" && [ -x "$IH/.local/bin/claude-account" ]
check "install copied sources.conf" cmp -s "$HERE/sources.conf" "$IH/.local/share/claude-account/sources.conf"
HOME="$IH" sh "$HERE/install.sh" >/dev/null 2>&1
check "second install keeps the first backup" [ "$(cat "$IH/.local/bin/claude-account.before-dgs-224-20261012")" = OLD ]
printf 'local edit\n' > "$IH/.local/share/claude-account/sources.conf"; HOME="$IH" sh "$HERE/install.sh" >/dev/null 2>&1
check "install keeps a locally edited sources.conf as a backup" [ "$(cat "$IH/.local/share/claude-account/sources.conf.before-dgs-224-20261012")" = "local edit" ] && cmp -s "$HERE/sources.conf" "$IH/.local/share/claude-account/sources.conf"
rm_aside="$IH/.local/share/claude-account/sources.conf.before-dgs-224-20261012"; mv "$rm_aside" "$T/sources.backup.aside"
check "install touched nothing else in HOME" [ "$(cd "$IH" && find . -type f | sort | tr '\n' ' ')" = "./.local/bin/claude-account ./.local/bin/claude-account.before-dgs-224-20261012 ./.local/share/claude-account/sources.conf " ]
check "install wrote no Claude config" [ ! -e "$IH/.claude" ] && [ ! -e "$IH/.zshrc" ]

# ---------- 9. shipped sources.conf ----------
check "shipped Izanami entry is complete" bash -c 'for f in kind base_url key_var env_file model.opus model.sonnet model.haiku; do grep -q "^izanami\.$f=" "$0" || exit 1; done; ! grep -qE "(sk-|Bearer)" "$0"' "$HERE/sources.conf"

echo "claude-account tests: $PASS passed, $FAIL failed (bash ${BASH_VERSION})"
[ "$FAIL" = 0 ]
