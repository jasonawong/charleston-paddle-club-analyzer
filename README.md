# Charleston Paddle Club Analyzer

A responsive GPX race replay for Charleston Paddle Club, including the men's team's October 24, 2026 Chattajack recording. The prebuilt app runs entirely in the browser and supports GitHub Pages without a backend, paid API, or API key.

Version 1.0.3 focuses on the map, timeline, playback summary, and distance splits. The Coaching, Conditions, and Moments sections have been removed. On laptops the splits appear in the right column directly below the blue playback summary. The current split highlights automatically during playback and seeking.

## Open the download

Extract the entire ZIP and open `index.html` in Chrome or another modern browser. Keep `app.bundle.js`, `styles.css`, `assets/`, and `vendor/` beside it. A classic browser bundle contains the full recording, so opening the file does not require module imports or local-file requests. Startup failures display a recovery message instead of an endless loading screen. Online map tiles require internet access.

## Publish on GitHub Pages

1. Put the contents of this directory at the repository root, including `.github/workflows/pages.yml` and `.nojekyll`.
2. Push the repository to GitHub's `main` branch. If the default branch differs, update the workflow branch filter.
3. Open repository **Settings → Pages → Build and deployment → Source → GitHub Actions**.
4. Open **Actions → Test and deploy to GitHub Pages → Run workflow** and choose `main`.
5. After success, share the URL displayed in **Settings → Pages**. Subsequent pushes to `main` automatically rebuild, test, and publish the app.

The workflow already exists; no suggested workflow template is needed. Assets use relative URLs, so both project URLs and custom domains work. Publishing makes the bundled recording publicly downloadable. GPX files loaded by visitors are parsed locally and are never uploaded by the app.

## Explore the race

- Play at 1×–300×, seek on the map, speed chart, or slider, and switch miles/kilometers.
- **Set race window** excludes staging and post-finish paddling. The original recording remains intact. Until boundaries are selected, statistics and splits describe the full recording.
- Seek to a boundary, open the window editor, and use **Use playhead as start/finish** for precise adjustments. Boundaries save per recording in this browser and are not official race timing results.
- **Select section**, then drag across the chart to choose an interval of at least five seconds. **Loop** repeats the interval, or the selected race window if no interval is chosen.
- The highlighted split follows the exact replay position, including backwards seeks, looping, and the final partial split. At a split boundary, the next split becomes current; at the finish, the last split remains highlighted.
- On laptops, the split list scrolls internally to keep the current row visible without moving the page. On smaller screens it appears below the playback summary in the stacked layout.
- Select a split's name to replay and loop it. The split table uses one-mile or one-kilometer intervals from the selected race start; the final incomplete interval is labeled separately.
- **Load GPX** accepts timed tracks from Paddle Logger and other exporters, up to 25 MB / 200,000 fixes. Untimed routes cannot be replayed. Recordings near Chattanooga use America/New_York; others use the browser's timezone.

Space toggles playback; left/right arrows seek ten seconds; Home/End jump to the selected window's boundaries. Sliders also have native keyboard controls. Playback pauses when the tab is hidden. Follow the canoe or fit the selected route with the map controls.

## Calculation details

Haversine distance and elapsed time determine speed over ground. Simultaneous fixes are merged; invalid and decreasing timestamps are skipped. Segment breaks and gaps over 30 seconds are not added as distance. Gaps over five seconds hold the last observed position and receive no smoothed speed. Short gaps can contribute straight-line distance, so totals remain estimates.

The speed display uses a centered 30-second distance/time window, shortened at selected boundaries. Overall and split averages use distance divided by elapsed time. The track's zero elevation values are not used to infer gradients or river level. Route colors show relative speed within the selected window.

## Source and dependencies

The club artwork is the supplied Charleston Paddle Club logo. The original AVIF and a PNG copy are in `assets/`.

[Leaflet 1.9.4](https://leafletjs.com/) is vendored with its license. The interactive basemap requests standard OpenStreetMap tiles with visible [attribution](https://www.openstreetmap.org/copyright). Follow the [tile usage policy](https://operations.osmfoundation.org/policies/tiles/) and change providers if traffic exceeds ordinary club use. No bulk or offline tile downloading is included. Route and timeline analysis remain available if tiles fail. Optional Google Fonts use system-font fallbacks.

Race boundaries save in browser storage, which can be cleared or unavailable in private browsing. This version does not sync state between devices. Older saved fields are preserved when boundaries are saved; the removed panels are no longer accessible in the app.

## Development and verification

The download is prebuilt. After editing `app.js`, `model.js`, or the bundled recording, regenerate the classic browser bundle with Node 20+:

    npm run build
    npm test

No package installation is needed. To preview over HTTP:

    python3 -m http.server 4173 --bind 127.0.0.1

Open http://127.0.0.1:4173. The Pages workflow rebuilds and tests automatically before deploying only runtime files.

Tests cover timestamp cleanup, missing GPS coverage, disconnected segments, interpolation, race-window totals, full and partial splits, current-split boundary semantics, backwards seeking, real GPX regressions, classic-script packaging, and startup recovery.
