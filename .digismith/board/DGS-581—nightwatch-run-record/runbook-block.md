```
Worker start, new step before the worker is started (DGS-581):
  RUN_ID=$(dg run start --ticket <KEY> --role <builder|reviewer|scout> --order <order path> \
           --seat <seat> --model <model> --worktree <worktree dir> --workspace <w> --tab "<tab label>" --pane <pane>)
--order is required: a Scout without an order file passes the path of its brief.
Start the worker with DIGISMITH_RUN_ID=$RUN_ID in its environment (with DIGISMITH_REVIEW_MODE=role for a Builder).
A retry, a new Reviewer or a new Scout runs dg run start again and gets a new id. Never reuse an id.
After the start, check: dg run show $RUN_ID. Events appear as the worker works: started, tool, blocked, turn_end, ended.
The conductor writes the lifecycle events no hook can see: dg run event $RUN_ID review_ready|merged|pushed|lost [--data '{...}'].
The conductor also marks the phase: dg run event $RUN_ID phase --data '{"phase":"building|review|merge"}'.
File order is the authority for events. Readers must not rely on seq being unique.
First use after the merge and plugin update: start a throwaway worker this way, trigger one prompt and one permission
prompt, close it, then dg run show must list started, tool, blocked, turn_end, ended in seq order.
```
