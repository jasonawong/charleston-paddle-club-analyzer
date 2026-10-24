# Verification record

Verified October 24, 2026.

## Automated checks

`npm test`: **15 passing tests** against the real Chattajack recording, synthetic edge cases, and startup failure paths. JavaScript syntax checks pass. All local asset references in the HTML resolve.

Covered: duplicate and out-of-order timestamps, malformed track data, interpolation, missing GPS coverage, disconnected segments, trimmed statistics, complete/partial splits, coaching boundaries, withholding comparisons over missing coverage, and actual recording regression checks.

## Browser checks

Verified in the Codex in-app browser with a 1280-pixel laptop viewport and 390- and 320-pixel phone viewports. No horizontal page overflow at those widths. This is responsive browser verification, not testing on physical phones.

- The actual GPX loads; map tiles, route, canoe, and speed graph render.
- Playback advances, pauses, and seeks with the slider/keyboard.
- Dragging the timeline selects an interval and highlights its map section.
- Coaching replay selects and loops a 60-second interval at 300×.
- Start/finish edits rebase statistics and coaching; boundaries survive reload.
- Restoring the full recording removes the test boundaries; no official start/finish has been assumed.
- Units switch between miles/mph and kilometers/km/h.
- A test moment saves with a location/time, survives reload, and exports to JSON. The test moment was removed afterward.
- Invalid GPX XML shows an error and preserves the previous race.
- A separate timed GPX loads successfully; Chattajack weather is not applied to that other date/location.
- The historical weather snapshot appears near matching replay times. Later race times show unavailable coverage rather than carrying stale observations forward.
- Water temperature forecasts and missing river measurements are labeled explicitly.
- No application errors or warnings were observed in the browser console.

## Version 1.0.1 startup repair

The first release depended on a module entry point and local file fetches, which cannot start reliably when index.html is opened as a file:// page. The prebuilt browser entry is now a classic script with the complete GPX and conditions embedded. Opening the download does not require a module loader or race-data fetch. The source remains split into app.js/model.js; build.mjs regenerates the browser bundle and the Pages workflow includes it.

Additional tests verify classic-script packaging, exact embedded race/conditions data, timeout recovery, early script errors, and watchdog cancellation after success. The local HTTP browser preview loaded the 31.98-mile recording with the loading screen hidden and no startup error. Direct file:// browser navigation is blocked by the automation tool's URL policy, so this specific Chrome UI path could not be rechecked automatically. No browser security setting was changed.

## Version 1.0.2 club branding

Replaced the placeholder mark with the supplied Charleston Paddle Club artwork in the header, loading screen, and favicon. Kept the original AVIF and a lossless PNG copy. Updated the interface, speed chart, route legend, route segments, canoe, and map markers to navy/ocean blue.

All 15 tests and the browser bundle syntax check pass. Browser verification confirmed the logo loads, the navy panel and blue primary colors are applied, and the page has no horizontal overflow at 1280, 390, or 320 pixels. At 320 pixels the logo/title and header actions do not overlap. No browser errors or warnings were observed. The direct-file startup repair is retained.

## Deployment boundary

The static GitHub Pages workflow and deployment instructions are included. No repository has been created and no public deployment has been performed. Online map tiles and optional web fonts require internet access; the GPX analysis itself runs locally in the browser.
