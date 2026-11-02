#!/bin/bash
# Test double for herdr (DGS-683 T14, T15). State lives in $FAKE_DIR:
#   <session>.ws      lines "wN label"
#   <session>.tabs    lines "wN:tN label"
#   <session>.panes   lines "wN:pN wN:tN"
#   <session>.agents  lines "name pane status"
#   <session>.prompts text of every prompt sent (agent read prints it)
#   calls.log         one line per call: the full argv
set -u
: "${FAKE_DIR:?FAKE_DIR is required}"
mkdir -p "$FAKE_DIR"
echo "$*" >> "$FAKE_DIR/calls.log"
S=default
if [ "${1:-}" = "--session" ]; then S=$2; shift 2; fi
WS="$FAKE_DIR/$S.ws"; TABS="$FAKE_DIR/$S.tabs"; PANES="$FAKE_DIR/$S.panes"; AG="$FAKE_DIR/$S.agents"; PR="$FAKE_DIR/$S.prompts"
touch "$WS" "$TABS" "$PANES" "$AG" "$PR"
next(){ local f="$FAKE_DIR/$S.next" n; n=$(cat "$f" 2>/dev/null || echo 2); echo $((n+1)) > "$f"; echo "$n"; }
opt(){ # opt NAME args... -> value after --NAME
  local k=$1; shift
  while [ $# -gt 0 ]; do [ "$1" = "--$k" ] && { echo "${2:-}"; return; }; shift; done
}
G=${1:-}; V=${2:-}; [ $# -ge 2 ] && shift 2 || shift $#
case "$G $V" in
  "status server") echo "status: up";;
  "workspace list")
    printf '{"result":{"workspaces":['; sep=""
    while read -r id label; do [ -n "$id" ] && { printf '%s{"workspace_id":"%s","label":"%s"}' "$sep" "$id" "$label"; sep=","; }; done < "$WS"
    printf ']}}\n';;
  "workspace create")
    label=$(opt label "$@"); n=$(next); id="w$n"
    echo "$id $label" >> "$WS"; echo "$id:t1 " >> "$TABS"; echo "$id:p1 $id:t1" >> "$PANES"
    printf '{"result":{"workspace":{"workspace_id":"%s"}}}\n' "$id";;
  "workspace close") grep -v "^$1 " "$WS" > "$WS.n"; mv "$WS.n" "$WS";;
  "tab list")
    w=$(opt workspace "$@"); printf '{"result":{"tabs":['; sep=""
    while read -r id label; do case "$id" in "$w":*) printf '%s{"tab_id":"%s","label":"%s"}' "$sep" "$id" "$label"; sep=",";; esac; done < "$TABS"
    printf ']}}\n';;
  "tab create")
    w=$(opt workspace "$@"); label=$(opt label "$@"); n=$(next)
    echo "$w:t$n $label" >> "$TABS"; echo "$w:p$n $w:t$n" >> "$PANES"
    printf '{"result":{"tab":{"tab_id":"%s:t%s"}}}\n' "$w" "$n";;
  "tab rename")
    id=$1; shift; label="$*"; grep -v "^$id " "$TABS" > "$TABS.n"; echo "$id $label" >> "$TABS.n"; mv "$TABS.n" "$TABS";;
  "pane list")
    w=$(opt workspace "$@"); printf '{"result":{"panes":['; sep=""
    while read -r id tab; do case "$id" in "$w":*) printf '%s{"pane_id":"%s","tab_id":"%s"}' "$sep" "$id" "$tab"; sep=",";; esac; done < "$PANES"
    printf ']}}\n';;
  "pane run") :;;
  "agent get")
    line=$(grep "^$1 " "$AG" | head -1)
    if [ -z "$line" ]; then echo '{"error":{"code":"agent_not_found"}}'; exit 1; fi
    set -- $line
    sid="sid-$1"; [ -n "${FAKE_NO_SID:-}" ] && sid=""   # FAKE_NO_SID=1: an agent that reports no session id
    printf '{"result":{"agent":{"name":"%s","pane_id":"%s","agent_status":"%s","agent_session":{"value":"%s"}}}}\n' "$1" "$2" "$3" "$sid";;
  "agent list")
    printf '{"result":{"agents":['; sep=""
    while read -r name pane status; do [ -n "$name" ] && { printf '%s{"name":"%s","pane_id":"%s","agent_status":"%s"}' "$sep" "$name" "$pane" "$status"; sep=","; }; done < "$AG"
    printf ']}}\n';;
  "agent start")
    name=$1; pane=$(opt pane "$@")
    echo "$name $pane idle" >> "$AG"; echo '{"result":{}}';;
  "agent prompt") name=$1; shift; echo "$*" >> "$PR"; echo '{"result":{}}';;
  "agent read") cat "$PR";;
  *) echo "fake-herdr: unsupported: $G $V" >&2; exit 2;;
esac
