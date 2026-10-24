# Verification record · version 1.0.4

Verified October 24, 2026.

## Automated checks

All 15 tests pass. JavaScript source and browser-bundle syntax checks pass.

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

## Deployment boundary

The updated GitHub Pages workflow and publishing guide are included. No public deployment was performed. Direct file:// navigation is blocked by the browser test tool's URL policy; the classic-script/data packaging contract is verified by tests, and startup is verified over HTTP. No browser security settings were changed.
