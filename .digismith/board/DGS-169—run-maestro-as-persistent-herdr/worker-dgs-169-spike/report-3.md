# DGS-169 spike: rerun of the model test (2026-10-10 09:26 to 09:40 UTC+7 [02:26 to 02:40Z]): still 401, stopped (option B)

Cost to TokenReply: **$0**. No model arm ran.

## 10-line summary
1. Jack's go: rerun only the model test. The spike config already adds only the two models under `provider.tokenreply.models` and defines no options, baseURL or apiKey (checked in the file: it never did).
2. Merge works: `opencode models tokenreply` in the spike dir lists `claude-sonnet-5-5` and `gpt-5.6-luna` next to the global `gpt-5.6-sol` and `kimi-k2.7`; in a dir without the spike config it lists only the global two.
3. Smoke calls through a fresh server on 127.0.0.1:4198: `gpt-5.6-luna` 401, `claude-sonnet-5-5` 401, and **`gpt-5.6-sol` (declared only in the global config) 401 too**. Error: `Token not provided` from `api.tokenreply.com/v1/chat/completions`.
4. So the 401 is not caused by the spike config. The global provider's key does not resolve in this server's environment: the pane has no `TOKENREPLY*` or `OPENCODE*` variable (names checked, no values), `opencode providers list` shows 0 credentials, and I did not read the global config or `.env`.
5. Likely cause: the global config points at an environment variable (probably `TOKENREPLY_API_KEY`, as the repo's offload notes use) that Jack's shell has and the herdr pane does not. Not proven; proving it needs reading the config, which is off limits.
6. Per the order I stopped (option B). No luna or sonnet arm ran, no cost, no new verdict. The 2026-10-09 results (server, two clients, restart persistence, guardrail slips, skills, memory) stand: `report-2.md`.
7. **To unblock (option B):** Jack starts the spike server himself from a shell that has the key: `cd ~/.digismith-depot/spikes/dgs-169/work && export OPENCODE_SERVER_PASSWORD="$(cat ../.server-password)" && opencode serve --hostname 127.0.0.1 --port 4198`. Or tells the maestro which variable name the global config uses and sets it in a way the worker may use without reading it.
8. Then the worker reruns the arms: the driver is ready (`~/.digismith-depot/spikes/dgs-169/lib.py`: run, find session, tokens and cost per model); the estimate stays about $0.41, cap $1.
9. Cleanup done: server stopped by PID, tab `dgs169-server` closed, no OpenCode process left. Port 4198 free. Nothing committed or pushed. No global config edited or printed.
10. Recommendation unchanged: no adoption decision until the model test runs.
