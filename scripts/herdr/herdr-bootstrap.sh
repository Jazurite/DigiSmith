#!/bin/bash
# DGS-683 proposal: the new text of ~/.local/bin/herdr-bootstrap.sh (the conductor installs it by hand; nothing here installs anything).
# Sets the layout up in BOTH herdr sessions once the servers are up. Safe to run again (idempotent).
#   HERDR_BIN (default $HOME/.local/bin/herdr)
#   HERDR_FLOOR_SESSION (default default), HERDR_CASTLE_SESSION (default Castle)
#   DIGISMITH_DEPOT_DIR (default $HOME/.digismith-depot): conductors.json is the conductor list
#   DRY_RUN=1: every call that changes something is only logged as "dry-run: <argv>"
#   FLOOR_CONDUCTORS=1 (default until the migration ends): registry entries with no session still get the old Floor conductor (tab 1 of the project workspace)
#   PGREP (default pgrep): how to tell a conductor with its flags from a plain restored resume
#   DG_DIR, EMMA_DIR, EMMA_MAESTRO_DIR, SOV_DIR: project folders (override only to test with dummies)
# Castle: one workspace per project (Factory, DigiSmith, Emma, Soveron); one tab per conductor, tab label = agent name.
# A conductor entry (kind project|factory|standing, session Castle, not closed) is started with HERDR_SCOPE (its own Castle workspace plus every Floor workspace of the registry).
# A ticket conductor entry that is open is only relaunched (same session id), never created: start one with dg conductor start-ticket.
# On a server restart herdr restores an agent as plain `claude --resume <id>` (flags lost): the conductor is relaunched with the same session id and the flags. Nothing is created twice.
set -u
HERDR_BIN="${HERDR_BIN:-$HOME/.local/bin/herdr}"
FLOOR_S="${HERDR_FLOOR_SESSION:-default}"
CASTLE_S="${HERDR_CASTLE_SESSION:-Castle}"
DEPOT="${DIGISMITH_DEPOT_DIR:-$HOME/.digismith-depot}"
REG="$DEPOT/conductors.json"
DRY_RUN="${DRY_RUN:-0}"
FLOOR_CONDUCTORS="${FLOOR_CONDUCTORS:-1}"
PGREP="${PGREP:-pgrep}"
DG_DIR="${DG_DIR:-$HOME/Workspace/Jazurite/DigiSmith}"
EMMA_DIR="${EMMA_DIR:-$HOME/Workspace/Emma}"                          # the workspace folder
EMMA_MAESTRO_DIR="${EMMA_MAESTRO_DIR:-$HOME/Workspace/Emma/shopify-hub}" # where the Emma conductor runs: its note and Claude memory live here
SOV_DIR="${SOV_DIR:-$HOME/Obsidian/Knowpolis/1. Soveron}"
WS_BIN="$HOME/.digismith-depot/bin/herdr-ws"
exec 3>&2   # fd 3 keeps the log visible when a call redirects stderr
log(){ echo "bootstrap: $*" >&3; }

hx(){ local s=$1; shift; "$HERDR_BIN" --session "$s" "$@"; }                      # read or write
hm(){ local s=$1; shift; if [ "$DRY_RUN" = 1 ]; then log "dry-run: --session $s $*"; return 0; fi; hx "$s" "$@"; }  # changes something

for s in "$FLOOR_S" "$CASTLE_S"; do
  for i in $(seq 1 30); do hx "$s" workspace list >/dev/null 2>&1 && break; sleep 1; done
  hx "$s" workspace list >/dev/null 2>&1 || { log "server $s not reachable"; exit 1; }
done

ws_id(){ hx "$1" workspace list | jq -r --arg l "$2" '.result.workspaces[]|select(.label==$l)|.workspace_id' | head -1; }
ensure_ws(){ # session label cwd -> id
  local id; id=$(ws_id "$1" "$2")
  if [ -z "$id" ]; then
    if [ "$DRY_RUN" = 1 ]; then log "dry-run: --session $1 workspace create --cwd $3 --label $2 --no-focus"; id="w-dry-$2"
    else id=$(hx "$1" workspace create --cwd "$3" --label "$2" --no-focus | jq -r '.result.workspace.workspace_id'); log "created workspace $2 = $id in $1"; fi
  else log "workspace $2 exists = $id in $1"; fi
  echo "$id"
}

COMMON_RULES="You are a NEW instance with no chat history, and you are on STANDBY: the Desktop session for this project is still the maestro today. Do NOT drive anything: no herdr changes, no dispatching workers, no file edits, no git writes. No pushes, merges, or external posts (ClickUp, JIRA, Teams, Grafana). Never read or print a token, key or .env. Touch herdr only through $WS_BIN (groups agent, pane, tab; only your own workspace). Plain herdr is denied to you, but the real binary can still be reached by path: that gap is open and not approved to close, so never use it. Read ONLY the files named below (plus your auto-loaded Claude memory). Then reply in at most 12 lines: who you are, what you understood, what you would NOT touch, which files were missing or unclear. Then wait for Jack's first order."

DG_PROMPT_BODY="Read ONLY: .digismith/sessions/DigiSmith/note.md, .digismith/sessions/DigiSmith/master-check.md, .digismith/sessions/workbox.md."
EMMA_PROMPT_BODY="Read ONLY: .digismith/sessions/Emma/note.md (your maestro note) and .digismith/sessions/emkt-810/brief.md. No Emma-specific runbook was found: if you need one, say so as a gap. Emma rules: use the SSH Host github-emma (key ~/.ssh/emma, GitHub account hieu-huynh-emma) for emma-sleep repos; Emma folders can arrive without .git; each repo's main checkout is always a clean origin/main and ticket work happens only in .worktrees/; commits are title-only with no AI attribution; Jack reviews every JIRA, Teams and Grafana draft before anything is posted; times in UTC+7 first."
SOV_PROMPT_BODY="Read ONLY: CLAUDE.md (the vault rules), '0. Grotto/Quick Notes/Session Handoff — 2026-09-30.md', and the markdown files under System/ outside node_modules (the fixture .md files)."
FACTORY_PROMPT_BODY="Read ONLY: .digismith/sessions/workbox.md and your conductor note in the depot (~/.digismith-depot/sessions/DigiSmith/<your name>/note.md)."

# project part of an entry key -> folder, role text, prompt body
cwd_of(){ case "$1" in Factory|DigiSmith) echo "$DG_DIR";; Emma) echo "$EMMA_MAESTRO_DIR";; Soveron) echo "$SOV_DIR";; *) echo "$DG_DIR";; esac; }
body_of(){ case "$1" in DigiSmith) echo "$DG_PROMPT_BODY";; Emma) echo "$EMMA_PROMPT_BODY";; Soveron) echo "$SOV_PROMPT_BODY";; *) echo "$FACTORY_PROMPT_BODY";; esac; }

# Floor workspaces of the registry: every `floor` field, and the workspace of every entry in the default session (same rule as scopeFor in registry.ts)
floors(){
  jq -r '[to_entries[]|.value|select(type=="object")|select((.session // "default")=="default" or .floor != null)
          |(.floor // (if (.session // "default")=="default" then .workspace else null end))|select(. != null)]
         |unique|sort_by(.[1:]|tonumber)|.[]' "$REG" 2>/dev/null
}
scope_for(){ # castle-workspace-id -> HERDR_SCOPE
  local out="$CASTLE_S:$1" f; for f in $(floors); do out="$out,$FLOOR_S:$f"; done; echo "$out"
}

pane_of_tab(){ # session workspace tab-id -> pane id
  hx "$1" pane list --workspace "$2" | jq -r --arg t "$3" '.result.panes[]|select(.tab_id==$t)|.pane_id' | head -1
}
ensure_tab(){ # session workspace label cwd mode -> tab id (created when missing, unless mode is relaunch)
  local t; t=$(hx "$1" tab list --workspace "$2" | jq -r --arg l "$3" '.result.tabs[]|select(.label==$l)|.tab_id' | head -1)
  if [ -z "$t" ] && [ "${5:-create}" = create ]; then
    if [ "$DRY_RUN" = 1 ]; then log "dry-run: --session $1 tab create --workspace $2 --label $3"; t="t-dry"
    else t=$(hx "$1" tab create --workspace "$2" --cwd "$4" --label "$3" | jq -r '.result.tab.tab_id'); fi
  fi
  echo "$t"
}

# Start, brief or relaunch one conductor. mode: create (start when missing) | relaunch (never create)
ensure_agent(){ # session name pane cwd env-text role body mode
  local s=$1 name=$2 pane=$3 cwd=$4 envtext=$5 role=$6 body=$7 mode=$8
  local sid status prompt flags
  flags=(--name "$name" --disallowedTools "Bash(herdr *)" --allowedTools "Bash(herdr-ws *)" "Bash($WS_BIN *)")
  prompt="You are $name, the $role conductor inside herdr session $s, pane $pane. $COMMON_RULES $body"
  sid=$(hx "$s" agent get "$name" 2>/dev/null | jq -r '.result.agent.agent_session.value // empty')
  status=$(hx "$s" agent get "$name" 2>/dev/null | jq -r '.result.agent.agent_status // empty')
  if [ -z "$status" ]; then
    if [ "$mode" = relaunch ]; then log "ticket conductor $name not running, start it with dg conductor start-ticket"; return; fi
    hm "$s" pane run "$pane" "cd '$cwd' && export $envtext" >/dev/null
    if hm "$s" agent start "$name" --kind claude --pane "$pane" --timeout 90000 -- "${flags[@]}" >/dev/null 2>&1; then
      hm "$s" agent prompt "$name" "$prompt" --wait >/dev/null 2>&1 && log "$name started and briefed (standby)"
    else
      log "$name BLOCKED at start (probably 'trust this folder'): answer it in pane $pane (down arrow, Enter), then run this script again"
    fi
    return
  fi
  if [ "$status" = blocked ]; then log "$name is blocked: answer its question in pane $pane, then run this script again"; return; fi
  if [ "$mode" = create ] && ! hx "$s" agent read "$name" --source recent --lines 400 2>/dev/null | grep -q "STANDBY"; then
    hm "$s" agent prompt "$name" "$prompt" --wait >/dev/null 2>&1 && log "$name was up but not briefed: briefed now (standby)"
    return
  fi
  if $PGREP -f "claude.*--name $name --disallowedTools" >/dev/null; then log "$name already runs with its flags: nothing to do"; return; fi
  # restored by herdr as plain `claude --resume <id>`: relaunch with the same session id and the flags
  log "$name restored as resume ${sid:-?}: relaunching with flags"
  hm "$s" agent prompt "$name" "/exit" >/dev/null 2>&1; [ "$DRY_RUN" = 1 ] || sleep 4
  hm "$s" pane run "$pane" "cd '$cwd' && export $envtext" >/dev/null
  hm "$s" agent start "$name" --kind claude --pane "$pane" --timeout 90000 -- --resume "$sid" "${flags[@]}" >/dev/null 2>&1 && log "$name relaunched with flags" || log "$name relaunch failed: check pane $pane"
}

# The old Floor conductor: tab 1 of the project workspace, HERDR_WS only (kept until the migration ends)
ensure_maestro(){ # name workspace-id cwd role body
  local name=$1 ws=$2 cwd=$3 role=$4 body=$5
  hm "$FLOOR_S" tab rename "$ws:t1" conductor >/dev/null 2>&1
  ensure_agent "$FLOOR_S" "$name" "$ws:p1" "$cwd" "HERDR_WS=$ws" "$role" "$body" create
}

# the Castle conductor: its own tab (label = name), HERDR_SCOPE, HERDR_WS = its Floor workspace (none for the factory)
ensure_conductor(){ # name castle-ws cwd role body mode floor kinds
  local name=$1 ws=$2 cwd=$3 role=$4 body=$5 mode=$6 floor=$7 kinds=$8
  local tab pane envtext
  tab=$(ensure_tab "$CASTLE_S" "$ws" "$name" "$cwd" "$mode")
  if [ -z "$tab" ]; then log "ticket conductor $name not running, start it with dg conductor start-ticket"; return; fi
  pane=$(pane_of_tab "$CASTLE_S" "$ws" "$tab"); [ -n "$pane" ] || pane="$ws:p1"
  envtext="HERDR_SCOPE=$(scope_for "$ws") DIGISMITH_NAME=$name"
  case ",$kinds," in *,factory,*) ;; *) [ -n "$floor" ] && envtext="$envtext HERDR_WS=$floor";; esac
  ensure_agent "$CASTLE_S" "$name" "$pane" "$cwd" "$envtext" "$role" "$body" "$mode"
}

# 1. workspaces
DG=$(ensure_ws "$FLOOR_S" DigiSmith "$DG_DIR")
EM=$(ensure_ws "$FLOOR_S" Emma "$EMMA_DIR")
SV=$(ensure_ws "$FLOOR_S" Soveron "$SOV_DIR")
# no associative arrays: macOS ships bash 3.2
CW_Factory=$(ensure_ws "$CASTLE_S" Factory "$(cwd_of Factory)")
CW_DigiSmith=$(ensure_ws "$CASTLE_S" DigiSmith "$(cwd_of DigiSmith)")
CW_Emma=$(ensure_ws "$CASTLE_S" Emma "$(cwd_of Emma)")
CW_Soveron=$(ensure_ws "$CASTLE_S" Soveron "$(cwd_of Soveron)")
castle_ws_of(){ case "$1" in Factory) echo "$CW_Factory";; DigiSmith) echo "$CW_DigiSmith";; Emma) echo "$CW_Emma";; Soveron) echo "$CW_Soveron";; esac; }

# a fresh server may start with a plain shell workspace labelled "~": remove it once the others exist
for s in "$FLOOR_S" "$CASTLE_S"; do
  OLD=$(ws_id "$s" "~"); [ -n "$OLD" ] && hm "$s" workspace close "$OLD" >/dev/null 2>&1 && log "closed plain workspace ~ in $s"
done

# 2. the Castle conductors, from conductors.json
if [ -f "$REG" ]; then
  while IFS=$'\t' read -r key kinds floor status; do
    project=${key%%/*}; name=${key#*/}
    ws=$(castle_ws_of "$project")
    [ -n "$ws" ] || { log "no Castle workspace for project $project (entry $key): add one ensure_ws line"; continue; }
    [ "$status" = closed ] && continue
    case ",$kinds," in
      *,ticket,*) ensure_conductor "$name" "$ws" "$(cwd_of "$project")" "$project ticket" "$(body_of "$project")" relaunch "$floor" "$kinds";;
      *,project,*|*,factory,*|*,standing,*) ensure_conductor "$name" "$ws" "$(cwd_of "$project")" "$project" "$(body_of "$project")" create "$floor" "$kinds";;
    esac
  done < <(jq -r --arg c "$CASTLE_S" 'to_entries[]|select(.value|type=="object")|select(.value.session==$c)
                 |[.key, (((.value.kind // "project")|if type=="array" then . else [.] end)|join(",")), (.value.floor // ""), (.value.status // "open")]|@tsv' "$REG")

  # 3. write the resolved Castle workspace ids back (only the workspace field), atomic
  if [ "$DRY_RUN" != 1 ]; then
    for p in Factory DigiSmith Emma Soveron; do
      jq --arg c "$CASTLE_S" --arg p "$p" --arg id "$(castle_ws_of "$p")" \
        'with_entries(if (.value|type=="object") and .value.session==$c and (.key|startswith($p+"/")) then .value.workspace=$id else . end)' "$REG" > "$REG.tmp.$$" \
        && mv "$REG.tmp.$$" "$REG" || rm -f "$REG.tmp.$$"
    done
  fi

  # 4. the old Floor conductors: entries with no session (until the migration ends)
  if [ "$FLOOR_CONDUCTORS" = 1 ]; then
    while IFS=$'\t' read -r key kinds status; do
      project=${key%%/*}; name=${key#*/}
      [ "$status" = closed ] && continue
      case "$project" in DigiSmith) fws=$DG;; Emma) fws=$EM;; Soveron) fws=$SV;; *) continue;; esac
      ensure_maestro "$name" "$fws" "$(cwd_of "$project")" "$project" "$(body_of "$project")"
    done < <(jq -r 'to_entries[]|select(.value|type=="object")|select((.value.session // "default")=="default")
                   |select(((.value.kind // "project")|if type=="array" then . else [.] end)|index("project"))
                   |[.key, "project", (.value.status // "open")]|@tsv' "$REG")
  fi
else
  log "no $REG: no conductors to start"
fi
log "done"
