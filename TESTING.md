# Verification record · version 1.2.0

Verified October 25, 2026.

## Automated checks

All 26 tests pass. JavaScript source and browser-bundle syntax checks pass.

Coverage includes duplicate/out-of-order timestamps, invalid track data, interpolation, missing GPS coverage, disconnected segments, rebased race windows, full/partial distance splits, exact current-split boundaries, backwards seeking, final-finish handling, actual Chattajack regression checks, classic-script packaging, embedded race data, and startup error recovery.

## Browser checks

Verified in the in-app browser at 1280-pixel laptop, 390-pixel phone, and 320-pixel narrow-phone widths. These are responsive browser checks, not physical-phone tests.

- The Coaching, Conditions, and Moments panels, their tabs, the Add moment controls, and their editor were removed.
- The laptop split list sits in the right column immediately below the blue playback summary.
- Exactly one split is highlighted at the replay position.
- Seeking moved the highlight from Mile 1 to Mile 4; live playback at 300× advanced it to Mile 23. The split list scrolled internally to keep that row visible.
- The finish keeps the final partial split highlighted. Backwards seeking restores the earlier current row.
- Kilometer mode rebuilds the list and selects the correct current kilometer.
- A trimmed race window rebases the list and elapsed time; the original full-recording window was restored after the test.
- Selecting Mile 2 highlights, replays, and loops that split.
- Phone layouts stack the blue playback summary above the full split list. Playback controls now sit above the map and remain near the top while scrolling.
- No horizontal page overflow at the verified widths. No browser console errors or warnings were observed.
- The club logo, blue theme, GPX loading, map, timeline, race-window controls, and direct-file-compatible browser bundle remain in place.

## Playback visibility regression

The labeled Play/Pause button and seek slider were moved ahead of the summary statistics and map on both layouts. The fixed bottom player was removed. The toolbar is sticky near the top, uses safe-area-aware spacing, and wraps its secondary controls on narrow phones. Styles and the browser script have versioned URLs so a refreshed page retrieves the updated assets.

Verified in portrait viewports of 320×568 and 390×650, plus a 1280×800 laptop viewport. On initial phone layout Play was around 260 pixels from the top and fully visible and clickable. After scrolling to splits it remained visible near the top. Play changed its visible label to Pause during playback and back to Play after pausing. No horizontal overflow occurred while paused or playing. On the laptop, Play was around 253 pixels from the top, above the map. No browser console errors or warnings were observed. These checks do not constitute physical iPhone/Safari hardware testing.

## Palmetto marker verification

Version 1.0.5 replaces the canoe drawing with a 40-pixel, club-blue palmetto tree on a white circular badge. In the browser, playback advanced the marker along the route while the tree stayed upright; pausing and changing playback speed continued to work. No browser warnings or errors were observed. All 15 existing tests and JavaScript syntax checks pass.

## Head-to-Head verification · 1.1.0

- Both embedded GPX recordings load without local-file fetches or module imports. A shared parser handles the Paddle Logger and Garmin formats.
- Actual clock time starts at the women’s earlier timestamp and shows the men waiting until their start. The comparison model checks the UTC offset and independent trimmed windows.
- Both 28-pixel palmettos render in blue and red. Overlapping badges separate with short connectors; playback moves both positions and keeps trees upright.
- The speed and distance charts each contain two series. Clicking the speed chart seeks both tracks. Playback, pause, unit changes, and independent split highlights work.
- At the final playhead, both teams are marked complete, positions hold, and the last split for each team remains highlighted. Unequal partials have no time delta.
- Invalid race windows show an inline error. Editing the women’s start changed only her window, survived reload, and reset correctly to the full recording.
- Replacing the blue track with the women’s GPX updated its statistics and comparison subtitle. A malformed replacement GPX showed an error while preserving both existing tracks. Reload restored the two default recordings.
- Navigation to the original Race Replay page loads its track and smaller marker successfully.
- Responsive checks at 1280×900, 390×844, and 320×568: no horizontal page overflow. At both portrait widths, Play appears at about 294 pixels from the top on initial navigation and remains at the top while scrolling. Both team highlights and the full table fit the narrow layout. These are browser viewport checks, not physical iPhone tests.
- The women’s 3,647-point track spans 16,181 seconds and approximately 32.17151 miles. The 15-second comparison gap threshold allows its normal Garmin sampling intervals to produce speed estimates; actual larger gaps remain blank. The original single-track gap behavior passes its existing regression tests.

## Clock-only comparison · 1.1.1

The Head-to-Head Analyzer now uses UTC timestamps exclusively for its replay domain, chart coordinates, and split seeking. The alignment selector and saved-mode preference have been removed. The shared playhead shows date, clock time, and timezone; the seek toolbar shows clock time; trim labels show clock time without elapsed offsets. Team live readouts show distance. Window durations and split durations remain performance statistics. Automated tests cover absolute-clock defaults, independent trims, waiting and finished teams, removal of the old selection and preference, and fractional-timestamp precision at split boundaries.

Browser checks at 1280×900 and 320×568 confirm clock-time toolbar labels and chart axes, no synchronization selector, no horizontal overflow, correct waiting/active/complete states, clock-preserving unit changes, and correct highlighting when seeking directly to a split. No new browser console warnings or errors were observed.

## Landing page and replay teams · 1.2.0

Head-to-Head Analyzer is served directly at `index.html`; it is first in the navigation on both pages. Race Replay moved to `race-replay.html`. The former `head-to-head.html` address forwards to the home page while preserving its query and fragment. Both runtime entries and the compatibility redirect are included in the Pages workflow and ZIP.

Race Replay embeds both complete GPX tracks. Selecting the women’s team loaded 32.17 miles, 4:29:41, 3,647 points, a red palmetto, and the correct team subtitle. Her Garmin recording uses a 15-second interpolation threshold, allowing normal sparse observations to produce speed. Selecting the men’s team restored 31.98 miles, 4:28:01, and a blue palmetto. Changing teams during playback paused and reset the replay. A two-second trim applied only to the women’s window; switching away and back, then reloading, preserved that window and the selected team. The full recording was restored after verification. Loading a separate GPX selected the Loaded GPX placeholder, and choosing a bundled team hid that placeholder again. The old comparison address redirected to index.html with its version query intact.

Browser checks at 1280×900, 390×844, and 320×568 confirm the selector fits without horizontal overflow, with Play fully visible near 359 pixels from the top on the narrow phone. The home page remains synchronized by actual clock time. New tests cover the landing page, legacy redirect, selector options, deployment packaging, and both embedded tracks.

## Deployment boundary

The GitHub Pages workflow and publishing guide are included. Pushing to main triggers the tested Pages deployment. Direct file:// navigation is blocked by the browser test tool's URL policy; the classic-script/data packaging contract is verified by tests, and startup is verified over HTTP. No browser security settings were changed.
