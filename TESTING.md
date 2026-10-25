# Verification record · version 1.1.0

Verified October 25, 2026.

## Automated checks

All 22 tests pass. JavaScript source and browser-bundle syntax checks pass.

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
- Elapsed mode aligns selected starts. Clock mode starts at the women’s earlier timestamp and shows the men waiting until their start. The comparison model checks the UTC offset and independent trimmed windows.
- Both 28-pixel palmettos render in blue and red. Overlapping badges separate with short connectors; playback moves both positions and keeps trees upright.
- The speed and distance charts each contain two series. Clicking the speed chart seeks both tracks. Playback, pause, unit changes, and independent split highlights work.
- At the final playhead, both teams are marked complete, positions hold, and the last split for each team remains highlighted. Unequal partials have no time delta.
- Invalid race windows show an inline error. Editing the women’s start changed only her window, survived reload, and reset correctly to the full recording.
- Replacing the blue track with the women’s GPX updated its statistics and comparison subtitle. A malformed replacement GPX showed an error while preserving both existing tracks. Reload restored the two default recordings.
- Navigation to the original Race Replay page loads its track and smaller marker successfully.
- Responsive checks at 1280×900, 390×844, and 320×568: no horizontal page overflow. At both portrait widths, Play appears at about 294 pixels from the top on initial navigation and remains at the top while scrolling. Both team highlights and the full table fit the narrow layout. These are browser viewport checks, not physical iPhone tests.
- The women’s 3,647-point track spans 16,181 seconds and approximately 32.17151 miles. The 15-second comparison gap threshold allows its normal Garmin sampling intervals to produce speed estimates; actual larger gaps remain blank. The original single-track gap behavior passes its existing regression tests.

## Deployment boundary

The GitHub Pages workflow and publishing guide are included. Pushing to main triggers the tested Pages deployment. Direct file:// navigation is blocked by the browser test tool's URL policy; the classic-script/data packaging contract is verified by tests, and startup is verified over HTTP. No browser security settings were changed.
