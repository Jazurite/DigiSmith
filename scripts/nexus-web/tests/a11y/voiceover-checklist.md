# VoiceOver pass for the life dashboard (DGS-481, DGS-523)

Open `https://pazurite.com/`. The iPhone must be on Tailscale. Part A runs on the Mac (Safari or Chrome, VoiceOver on with Cmd+F5 (Cmd+Fn+F5 on a MacBook, or hold Cmd and press Touch ID three times)). Part B runs on the iPhone (VoiceOver on in Settings, Accessibility, or triple-click the side button if set up). Part C is your decision on the two recorded exceptions.

Tick each line. If a line fails, write the line text and what was wrong under it.
Never write a birth date, an age count or the stat numbers you heard. The page shows your real data. Write "the number was read twice", not the number.

Everything here is a step for Jack. No agent runs these steps, and no agent stops or starts the live API.

## Stopping the API (only for the optional live checks in the Alert and Retry lines)

The story names come from `app/components/StatePanel.stories.ts`. The safe way to hear the alert is the Storybook stories "Components > State panel > Error Panel" and "Components > State panel > Locked Panel" at `https://pazurite.com/storybook/`. Use them for the alert lines. The live-API stop below is one optional check.

While the API is stopped, Oculus and Nightwatch go down too (they share it). Stop it for as short a time as you can.

The API is a LaunchAgent with KeepAlive on, so a plain kill is restarted within seconds. Only `bootout` keeps it stopped.

Run the two launchctl commands on the Workbox (in a Terminal there, or over SSH as `workbox`). On a MacBook, bootout fails with "No such process" and the API stays up.

```sh
# stop (stays stopped)
launchctl bootout gui/$(id -u)/com.jazurite.digismith.nexus-api
# start again (plist: ~/Library/LaunchAgents/com.jazurite.digismith.nexus-api.plist)
launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.jazurite.digismith.nexus-api.plist
```

Check: `launchctl print gui/$(id -u)/com.jazurite.digismith.nexus-api | head -3` shows the service after the start, and an error after the stop.

## Part A: Mac

- [ ] "Skip to the calendar" is the first stop, and Return on it jumps to the calendar.
- [ ] After the page loads you hear "Calendar loaded." with the weeks lived, weeks left and the percent.
- [ ] The three stats are read as a label with its value: "weeks lived", "weeks left", "lived".
- [ ] Quick Nav is off (press Left and Right arrow together until VoiceOver says "Quick Nav off"). Tab to the grid. You hear a grid with a name that tells you to use the arrow keys.
- [ ] An arrow key moves one week. Each box reads "Age N, week W of 52, D Month YYYY to D Month YYYY", then lived, this week or ahead.
- [ ] Row headers read "Age N", and the corner header over the row headers reads "Age". Column headers read "Week 1", "Week 13", "Week 26", "Week 39", "Week 52".
- [ ] Fn+Left and Fn+Right (Home and End) go to the first and last week of the row. Cmd+Fn+Left and Cmd+Fn+Right (first and last box) go to the first and last box. Fn+Up and Fn+Down (Page Up and Page Down) move ten years. On a full keyboard, Home, End, Ctrl+Home, Ctrl+End, Page Up and Page Down do the same.
- [ ] The tooltip shows over the focused box and Escape hides it.
- [ ] The tooltip text is not read a second time after the box name.
- [ ] Alert: open the "Components > State panel > Error Panel" story (or, optional, stop the API as above and reload). The panel is announced as an alert. Retry is reachable with Tab.
- [ ] Retry: on the "Components > State panel > Retrying Panel" story you hear "Retrying…". On the live page (after you start the API again), after the retry works, focus is on the grid; if you did not stop the API, mark the live part "not run". Note: on the live path the "Retrying…" line may be too short to hear.

## Part B: iPhone

- [ ] "Skip to the calendar" is the first stop (swipe right from the top), and double-tap jumps to the calendar.
- [ ] The three stats are read as a label with its value.
- [ ] Touching a box reads "Age N, week W of 52, D Month YYYY to D Month YYYY", then lived, this week or ahead.
- [ ] Swipe right from a box moves to the next box and reads it.
- [ ] The "Components > State panel > Error Panel" story (or, optional, the live page with the API stopped) is announced as an alert, and double-tap on Retry works.

## Part C: the two recorded exceptions

Read `tests/a11y/EXCEPTIONS.md`. Mark each one accept or reject. A rejection becomes a new ticket (tell the Maestro which one).

- [ ] Accept  [ ] Reject: WCAG 2.5.8 target size on the grid boxes (see EXCEPTIONS.md item 1).
- [ ] Accept  [ ] Reject: WCAG 1.4.13 "hoverable" for the tooltip (see EXCEPTIONS.md item 2).

Sign-off: ______ (name, date)
