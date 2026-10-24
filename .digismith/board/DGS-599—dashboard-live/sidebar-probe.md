# Side bar probe (DGS-599, Task 1)

Date: 2026-10-24 (UTC+7), Chromium (Playwright 1.64.1) against the stub server and the generated site, before the fix.
WebKit is dropped (it cannot run in the build sandbox; Maestro ruling 2026-10-24). Jack's view is Chrome at 110% zoom, window about 1860 px wide.

Left edge of the text (CSS px) for brand, "WATCH" label (h2), first link:

| Case | brand | label | first link |
|---|---|---|---|
| 110% zoom, window 1860 (viewport 1691 CSS px, deviceScaleFactor 1.1) | 18 | 18 | 18 |
| 1860 px viewport with `document.documentElement.style.zoom = 1.1` | 19.8 | 19.8 | 19.8 |
| 1440x900 | 18 | 18 | 18 |
| 1024x768 | 18 | 18 | 18 |
| 390x844 (phone row; brand and label hidden) | 0 (hidden) | 0 (hidden) | 14 |

Zoom repro: the first method (viewport 1691 with deviceScaleFactor 1.1, how browser zoom works) shows the text at 18 CSS px, about 20 device px. Nothing clips; the text is just close to the edge. The second method gives the same inset scaled by 1.1.

Cause: the 18 px inset, the smallest on the page (`.nw-nav` 10 px + 8 px inner padding; the phone row is 6 px + 8 px = 14 px). The main column and top bar sit at 24 px. No other cause found.
