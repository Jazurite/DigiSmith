# DGS-481 UI design: the life dashboard

Designer: `dgs-481-design`, 2026-10-16. Companion file: `mock.html` (open it in a browser; use "Mock controls" at the top right for states, theme and accent). All mock data is fake (birth date 1990-01-01, fixed "today" 2026-10-16).

Surface mode: Operate. The visitor looks at one thing and leaves. Calm and exact beats expressive.

## 1. Direction

Black and white, like the Notion Life Calendar. The grid is the whole picture. There are three box states and they differ by shape, not only by colour:

| State | Look | Meaning |
|---|---|---|
| Lived | solid ink fill | a week that is over |
| This week | solid accent fill plus a 2 px accent ring | the week that holds today |
| Ahead | 1 px outline, no fill | a week to come |

The accent colour is used for exactly one thing: this week (the box, its legend swatch, the "This week" dot in the tooltip). It is never used for buttons, links, focus rings or decoration. That keeps one small orange box findable in a grid of 4,680.

No cards, no shadows on the page, no gradients, no icons except in error panels. Structure comes from spacing and hairlines. The one shadow is the tooltip.

## 2. Tokens

Colour tokens live on `:root`. Dark mode follows the device through `prefers-color-scheme`. There is no toggle on the real page.

| Token | Light | Dark | Use |
|---|---|---|---|
| `--bg` | `#ffffff` | `#0a0a0a` | page |
| `--ink` | `#0a0a0a` | `#f2f2f2` | text, lived boxes, buttons, focus ring, tooltip background |
| `--ink-2` | `#5c5c5c` | `#a3a3a3` | labels, meta, notes (7:1 on light, 8:1 on dark) |
| `--line` | `#e6e6e6` | `#262626` | hairlines, skeleton bars |
| `--ahead` | `#8f8f8f` | `#6b6b6b` | outline of ahead boxes (3:1 or more against the page) |
| `--accent` | `#e8401c` | `#ff5a3c` | this week box |
| `--accent-text` | `#c8310f` | `#ff6a4d` | accent used as text, if ever (5:1 or more) |

Spacing: 4 px base. Page gutter 16 px on a phone, 32 px from 640 px up. The page is at most 1000 px wide. The widget is at most 920 px wide and is centred.

Radius: 1 px boxes on a phone, 2 px from 640 px up. 8 px for the tooltip and buttons, 10 px for state panels.

Motion: 120 to 160 ms ease-out on tooltip fade and button hover. One loop: the loading pulse. All motion stops under `prefers-reduced-motion`.

Colour scheme: `color-scheme: light dark`, so scrollbars, form controls and text selection follow the theme. Text selection uses the accent at 28%.

## 3. Type

One family, the system UI stack (`system-ui`, `-apple-system`, `Segoe UI`, `Roboto`). No web fonts: the page makes no font request and works on the tailnet with nothing external. All numbers use tabular figures so the three stats do not jump.

| Role | Size / weight |
|---|---|
| Stat number | 26 px phone, 36 px desktop, 650, tracking -0.02em |
| Widget title (h2) | 20 px, 650 |
| Body, state panel text | 15 px, 400 |
| Stat label, meta, legend, note, tooltip | 13 px (14 px stat label on desktop) |
| Grid labels (age, week) | 11 px |

The 11 px grid labels are small on purpose: they are a ruler, not content. Every box also has a full accessible name (section 8).

## 4. Page layout

`https://pazurite.com/` is the dashboard home.

- Header: wordmark "pazurite" at the left, today's date at the right ("Friday 16 October 2026"). One hairline under it. No navigation until a second widget exists.
- Main: a visually hidden `h1` "Dashboard", then widgets.
- With one widget, the widget is centred in the page. When more widgets come, `main` becomes a 12-column grid with a 24 px gap. The Life Calendar takes 12 columns on a phone and tablet. On a wide desktop it keeps its full width and later widgets sit below it, or beside it when they are small (stat widgets, such as the Mac verdict, DGS-466). The widget frame (title row, content, note) stays the same for every widget: a widget is a section with an h2 and a one-line meta at the right. No card border.

## 5. The Life Calendar widget

Order, top to bottom:

1. Title row: h2 "Life Calendar" at the left, meta at the right ("Updated 21:00, UTC+7", from `readAtUtc7`). The meta wraps under the title on a phone.
2. Three numbers: weeks lived, weeks left, % lived (one decimal). Number above, 13 px label below. They sit in one row at every width. Numbers get thousands separators ("1,913"). The label for the third number is just "lived", under "40.9%".
3. Legend: Lived, This week, Ahead, with the real box styles as swatches.
4. The grid.
5. One note under the grid: "Weeks count from each birthday. The last box of a year takes the extra day or two."

### The grid

- 90 rows, 52 boxes each. Each box is a square (`aspect-ratio: 1`). Columns are `1fr`, so the grid always fills the width and never scrolls sideways.
- Left of each row: an age column, 24 px wide. It shows 0, 10, 20 ... 80 only. Other rows have no visible label (they have a hidden one for screen readers).
- Above the grid: a ruler with "Age" at the corner and "Week 1", 13, 26, 39, 52 over their columns.
- Every 10th row ends a decade, with 5 px of extra space after it. This is the only grouping. It helps the eye count years. There are no gaps between columns.
- Box gap: 1 px on a phone, 2 px from 640 px up.
- Grid width is at most 880 px.

Box size by screen (grid width is the screen width minus gutters, minus the 24 px age column):

| Screen | Grid width | Box | Gap |
|---|---|---|---|
| 320 px phone | 260 px | 4.0 px | 1 px |
| 360 px phone | 300 px | 4.8 px | 1 px |
| 390 px phone | 330 px | 5.4 px | 1 px |
| 768 px tablet | 676 px | 11.8 px | 2 px |
| 1000 px and up | 880 px | 14.4 px | 2 px |

On a phone the grid is about 90 x 5.8 px = 520 px tall plus decades, so the whole life is one screen of scrolling. A 4 to 5 px box is too small to hit with a finger. So a tap does not need to land on a box: the page finds the nearest box to the finger (within 14 px) and selects it. Nothing else on the grid is tappable, so there are no mis-taps on other targets.

### The tooltip

One element for the whole page, with `role="tooltip"`. Three lines:

```
Age 36 · Week 42 of 52         (bold)
12 Oct 2026 – 18 Oct 2026      (date range, day month year)
■ This week                    (Lived / This week / Ahead, with the box swatch)
```

- Mouse: follows the pointer, 14 px up and right. It flips to stay inside the window. It never takes pointer events, so it cannot block the box under it. It fades in over 120 ms.
- Keyboard: when a box has focus, the tooltip is anchored over that box.
- Touch (no hover): tapping a box selects it (ink ring) and shows the same text as a readout pinned to the bottom of the screen, 16 px from the edges and the bottom, at 15 px. A bottom readout is not covered by the finger. Tapping outside the grid clears it.
- Escape hides it.
- The last box of a row ends on the day before the next birthday, so its range can be 8 or 9 days. The tooltip shows what the data says. It does not hide this.

## 6. States

All states keep the page frame (header, title, stats, legend) so nothing jumps.

| State | Stats | Grid area | Notes |
|---|---|---|---|
| Loaded | real numbers | real grid | normal |
| Loading | grey bars, same size as numbers | skeleton: all 4,680 boxes as faint outlines, pulsing together (1.4 s) | the stat area is `aria-busy`; meta reads "Loading your calendar…"; no tooltip, no focus |
| Error (API down, 5xx, bad shape) | "–" | faint ghost grid (28% opacity) with one panel on top | role `alert`; panel text: "The calendar is not available right now." and a **Retry** button |
| Key unavailable | "–" | same ghost grid and panel | role `alert`; title "The calendar is locked."; text "The server cannot read its encryption key. Unlock the Keychain on the Workbox, then try again."; **Retry** |
| Empty (no profile saved) | "–" | same ghost grid and panel | role `status`; title "No calendar yet."; text "The server has no profile saved. Run the seed step on the Workbox, then reload."; **Reload** |

Retry and Reload: 44 px tall, ink fill. Press shows "Retrying…" and disables the button while the request runs. On success the panel goes away and the real grid appears. On failure the panel stays and the button comes back.

Two edge cases are not errors and use the normal layout:

- Before the birth date (`current` is null, lived 0): all boxes are outlines, no accent box, stats "0 / 4,680 / 0.0%".
- Past the last row (`current` is null, weeks left 0): all boxes are filled, no accent box, "4,680 / 0 / 100.0%".

A grid with no accent box is correct in those two cases. The legend still shows "This week".

The panel never shows a code, a stack, a key name or a path. "Keychain" and "seed step" appear only in the two states where the next step is Jack's.

## 7. Responsive rules

- One column at every width. Breakpoint: 640 px (gutter, gap, radius, stat size).
- No horizontal scroll at 320 px and up. The 52 boxes always fit because columns are `1fr`.
- Touch targets: buttons are 44 px. The grid uses nearest-box selection (section 5).
- The legend wraps. The header never wraps (wordmark and date are short).
- Landscape phone: the same layout; the readout stays at the bottom.

## 8. Accessibility

- Contrast: text 4.5:1 or more in both themes. Ahead outlines 3:1 or more. The accent box is 3:1 or more against both page colours.
- Meaning is never colour alone: lived is filled, ahead is an outline, this week is a ring and the legend and the tooltip say it in words.
- The grid is `role="grid"` with `role="row"` rows, a `role="rowheader"` per row ("Age 36") and `role="gridcell"` boxes. The grid has a name that explains the keys.
- Each box has an accessible name: "Age 36, week 42 of 52, 12 October 2026 to 18 October 2026, this week". A screen reader user gets the full information without the tooltip.
- Keyboard: the grid is one tab stop (roving `tabindex`). It starts on this week (or the first box when there is none).

  | Key | Action |
  |---|---|
  | Left / Right | previous / next week |
  | Up / Down | same week, previous / next year |
  | Home / End | first / last week of the row |
  | Ctrl+Home / Ctrl+End | first box / last box |
  | Page Up / Page Down | 10 years up / down |
  | Escape | hide the tooltip |

- Focus ring: 2 px ink, 2 px offset (3 px on this week, so the accent ring stays visible). The ring is ink, never accent.
- A "Skip to the calendar" link is the first tab stop.
- The three numbers are a description list (`dl`). The stat area is a polite live region, so a refresh at midnight is announced.
- Loading: `aria-busy` on the stats. The skeleton boxes are `aria-hidden`.
- Errors: `role="alert"` for error and locked, `role="status"` for empty. After Retry succeeds, focus moves to the grid.
- Forced colours: lived uses `CanvasText`, ahead uses a `GrayText` border, this week uses `Highlight`.
- Reduced motion: the pulse and the fades stop.

## 9. Components

1. Page header (wordmark, date).
2. Widget frame (h2, meta, note). Reused by every later widget.
3. Stat (label + number). Three in a row. Has a skeleton form.
4. Legend (three swatch + word pairs).
5. Calendar grid: ruler, age column, box, decade spacing.
6. Box (lived, this week, ahead; hover, focus, selected).
7. Tooltip / touch readout (one element, two placements).
8. State panel (icon, title, optional text, button): error, key unavailable, empty.
9. Button (primary, ink fill; hover, active, disabled and busy states).
10. Skeleton and ghost grid (same markup as the real grid, no labels).

## 10. Notes for the build (these touch the spec, I changed nothing)

1. **Key unavailable and empty need the error code on the page.** Spec section 10 says the page shows one plain sentence for any 5xx. For "The calendar is locked." and "No calendar yet." the page must read the `error` code from the 503 body (`key_unavailable`, `profile_missing`) and map it to a panel. If the Maestro prefers one sentence for all failures, the two extra panels fall back to the plain error panel. The body carries a code only, so nothing sensitive reaches the page. Decision for the Maestro and the Refiner.
2. **The tooltip needs dates for box 51 from the data.** The page already adds `start + 7j` to `start + 7j + 6`, and box 51 ends on `end`. The mock does the same.
3. **Date format:** the tooltip uses "12 Oct 2026" and the accessible name uses "12 October 2026". Fixed English, no locale detection.
4. **Cost:** 4,680 boxes each with a name attribute is about 1 MB of DOM text. The mock builds it in one string and is fast. If Playwright shows a problem, the names can be set on focus instead. Not expected.
5. **Checked in the mock, not in a real browser:** the pipeline here has no browser installed, so I checked the markup, the script syntax and the counting numbers (1,913 lived, 2,766 left, 40.9%, this week at row 36 box 41) but did not take screenshots. Jack's look at the mock is the first visual check.

## 11. Questions for Jack (taste)

1. **Accent colour.** My recommendation: vermilion (`#e8401c`, dark mode `#ff5a3c`). It is warm against pure black and white, it is the clearest single box in a grid of grey, and it reads as "now". The mock has four to compare: vermilion, blue, green, magenta (Mock controls, Accent).
2. **Row labels every 10 years, with a gap after each decade.** My recommendation: keep it. It makes years countable. The alternative is a continuous grid with labels only (cleaner, harder to count). Mock shows the first.
3. **Wording of the stat labels.** My recommendation: "weeks lived", "weeks left", "lived" (under the percent). Alternative: "% of life lived".
