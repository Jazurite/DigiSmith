# Accessibility exceptions (DGS-481)

1. **WCAG 2.5.8 Target Size (Minimum), only on the grid boxes** (`#calendar-grid [role="gridcell"]`).
   Reason: "essential" exception. A life in weeks is 4,680 boxes that must fit one screen; the boxes are 4 to 15 px. Keyboard navigation (one tab stop, arrow keys, Home, End, Page Up, Page Down) and the touch nearest-box rule (14 px radius) give every box a usable way in. The 44 px buttons meet the rule.
2. **WCAG 1.4.13 Content on Hover or Focus: "hoverable"** for the tooltip. axe does not test it.
   Reason: the tooltip is non-interactive by the Designer's decision (it follows the pointer and never takes pointer events). It is dismissible (Escape) and persistent. All its text is also the box's accessible name, so no information is available only on hover.

Both need Jack's sign-off (ticket: "Screen-reader pass and accessibility sign-off").
