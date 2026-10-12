# DGS-224 first use: JACK runs this in his own terminal (agents never start Claude Code through Izanami)

Installed by the worker: `~/.local/bin/claude-account` (old copy: `claude-account.before-dgs-224-20261012`), `~/.local/share/claude-account/sources.conf`.

1. `claude-account list` shows `jack seat`, `dev0 seat`, `izanami gateway`.
2. `claude-account check izanami`: prints `HTTP 200` and the model ids (no key).
3. `claude-account use izanami`, then open a NEW terminal. In it: `eval "$(claude-account env)"` (or the `~/.zshrc` line, once Jack added it), `claude-account status` says `matches`, then `claude`, `/status` shows `api.grok.coupons`.
4. `/model claude-opus-5-5`, one line. Does his group give Opus 5.5? If not, change `izanami.model.opus` in `~/.local/share/claude-account/sources.conf` (and the repo copy).
5. Prompt caching: a second turn, then the Izanami dashboard (cache read tokens). Note the ~500 extra system tokens per request (DGS-409).
6. `claude-account use jack`, a new terminal (eval again), `/status` shows the seat; `claude-account status` says `jack (seat)`.
7. Conductor dispatch: use `eval "$(claude-account env <seat>)"` per worker; it never writes the default.

Results go to DGS-409. DGS-224 is NOT set done by the worker.

Restore: `cp ~/.local/bin/claude-account.before-dgs-224-20261012 ~/.local/bin/claude-account`.
