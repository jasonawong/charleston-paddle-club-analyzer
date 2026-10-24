# Verification record · version 1.0.3

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
- Phone layouts stack the blue playback summary above the full split list, with playback controls fixed at the bottom.
- No horizontal page overflow at the verified widths. No browser console errors or warnings were observed.
- The club logo, blue theme, GPX loading, map, timeline, race-window controls, and direct-file-compatible browser bundle remain in place.

## Deployment boundary

The updated GitHub Pages workflow and publishing guide are included. No public deployment was performed. Direct file:// navigation is blocked by the browser test tool's URL policy; the classic-script/data packaging contract is verified by tests, and startup is verified over HTTP. No browser security settings were changed.
