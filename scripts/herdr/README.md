# Castle boot files (DGS-683)

These files are proposals. Nothing here is installed by an agent. The conductor (or Jack) installs them.

| File | Install path |
|---|---|
| `herdr-boot-castle.sh` | `~/.local/bin/herdr-boot-castle.sh` |
| `com.jazurite.herdr-castle.plist` | `/Library/LaunchDaemons/com.jazurite.herdr-castle.plist` |
| `herdr-bootstrap.sh` | `~/.local/bin/herdr-bootstrap.sh` |
| `conductor-watch` | `~/.digismith-depot/bin/conductor-watch` |
| `RUNBOOK-CASTLE.md` | text for the runbook sections (the runbook file itself is edited by the conductor) |

## Manual install of the Castle daemon

Jack types the `sudo` lines. An agent never runs them.

```
cp scripts/herdr/herdr-boot-castle.sh ~/.local/bin/herdr-boot-castle.sh
chmod +x ~/.local/bin/herdr-boot-castle.sh
sudo cp scripts/herdr/com.jazurite.herdr-castle.plist /Library/LaunchDaemons/com.jazurite.herdr-castle.plist
sudo launchctl bootstrap system /Library/LaunchDaemons/com.jazurite.herdr-castle.plist
```

Check: `herdr --session Castle status server`.
