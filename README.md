# Charleston Paddle Club Analyzer

A responsive GPX race replay for Charleston Paddle Club, including the men’s and women’s October 24, 2026 Chattajack recordings. The prebuilt app runs entirely in the browser and supports GitHub Pages without a backend, paid API, or API key.

Version 1.2.0 opens **Head-to-Head Analyzer** as the home page, using actual clock time for synchronized comparisons. **Race Replay** has a team selector for the men’s and women’s bundled tracks and remembers the last selected team. Each recording keeps its own race window. Both pages use smaller upright palmettos: blue for men and red for women. Play/Pause and the seek slider stay above the map and near the top while scrolling. The single-track view includes its map, speed chart, playback summary, and highlighted splits.

## Open the download

Extract the entire ZIP and open `index.html` in Chrome or another modern browser. Keep all HTML files, both browser bundles, `styles.css`, `assets/`, and `vendor/` together. The home page opens Head-to-Head Analyzer. Use Race Replay in the navigation to open `race-replay.html`. The old `head-to-head.html` address forwards to the home page. A classic browser bundle contains the full recording, so opening the file does not require module imports or local-file requests. Startup failures display a recovery message instead of an endless loading screen. Online map tiles require internet access.

## Publish on GitHub Pages

1. Put the contents of this directory at the repository root, including `.github/workflows/pages.yml` and `.nojekyll`.
2. Push the repository to GitHub's `main` branch. If the default branch differs, update the workflow branch filter.
3. Open repository **Settings → Pages → Build and deployment → Source → GitHub Actions**.
4. Open **Actions → Test and deploy to GitHub Pages → Run workflow** and choose `main`.
5. After success, share the URL displayed in **Settings → Pages**. Subsequent pushes to `main` automatically rebuild, test, and publish the app.

The workflow already exists; no suggested workflow template is needed. Assets use relative URLs, so both project URLs and custom domains work. Publishing makes both bundled recordings publicly downloadable. The women’s public example retains replay coordinates and timestamps; unused heart-rate extensions are omitted. GPX files loaded by visitors are parsed locally and are never uploaded by the app.

## Explore the race

Open **Race Replay**, then choose **Men’s team** or **Women’s team** in the Team selector. Switching updates the map, palmetto color, speed chart, statistics, and splits; it pauses playback and restores that recording’s saved race window. Both tracks are embedded in the browser bundle. If you load a different file, the selector shows **Loaded GPX**.

- Use the labeled Play/Pause button above the map. Playback controls stay near the top while scrolling on laptops and phones.
- Play at 1×–300×, seek on the map, speed chart, or slider, and switch miles/kilometers.
- **Set race window** excludes staging and post-finish paddling. The original recording remains intact. Until boundaries are selected, statistics and splits describe the full recording.
- Seek to a boundary, open the window editor, and use **Use playhead as start/finish** for precise adjustments. Boundaries save per recording in this browser and are not official race timing results.
- **Select section**, then drag across the chart to choose an interval of at least five seconds. **Loop** repeats the interval, or the selected race window if no interval is chosen.
- The highlighted split follows the exact replay position, including backwards seeks, looping, and the final partial split. At a split boundary, the next split becomes current; at the finish, the last split remains highlighted.
- On laptops, the split list scrolls internally to keep the current row visible without moving the page. On smaller screens it appears below the playback summary in the stacked layout.
- Select a split's name to replay and loop it. The split table uses one-mile or one-kilometer intervals from the selected race start; the final incomplete interval is labeled separately.
- **Load GPX** accepts timed tracks from Paddle Logger and other exporters, up to 25 MB / 200,000 fixes. Untimed routes cannot be replayed. Recordings near Chattanooga use America/New_York; others use the browser's timezone.

Space toggles playback; left/right arrows seek ten seconds; Home/End jump to the selected window's boundaries. Sliders also have native keyboard controls. Playback pauses when the tab is hidden. Follow the canoe or fit the selected route with the map controls.

## Head-to-Head Analyzer

Open `index.html` (the home page), or use the Head-to-Head Analyzer link above either page. The two club tracks load automatically.

- Blue solid route and blue palmetto: men’s team. Red dashed route and red palmetto: women’s team. Small badges separate with short connectors when their map positions overlap.
- **Actual clock time** preserves the original GPS timestamps for shared playback, chart axes, and seeking. The synchronization selector has been removed; older alignment preferences are ignored. These recordings started about 31 seconds apart. Teams wait before their selected start and hold their last position after their selected finish.
- Each team has its own **Set race window** and **Load GPX** controls. Name fields are editable. Trim staging and post-finish paddling before drawing race-performance conclusions.
- Shared playback, speed controls, looping, and seeking update both markers, live readouts, speed and distance charts, and each team’s current split. Tap a route, drag either chart, or select a team’s split time to explore.
- The table pairs one-mile or one-kilometer intervals measured from each selected start. It includes split duration and average speed. The time difference is red minus blue; unequal partial distances are not compared.
- Distance difference compares distance along each separate track; it is not an official course gap. Full-recording durations are not official race results.
- The women’s Garmin export uses variable 1–11 second recording intervals. The comparison page interpolates observations up to 15 seconds apart; larger gaps hold the last position and receive no speed. Race Replay uses the same 15-second policy for the bundled women’s Garmin track; the men’s track and custom uploads retain the five-second policy. Both use 30-second smoothed ground speed.
- Loaded files stay in browser memory and reset on reload. Names and race windows save per recording in this browser, separately from Race Replay’s saved windows.

## Calculation details

Haversine distance and elapsed time determine speed over ground. Simultaneous fixes are merged; invalid and decreasing timestamps are skipped. Segment breaks and gaps over 30 seconds are not added as distance. Gaps over five seconds hold the last observed position and receive no smoothed speed. Short gaps can contribute straight-line distance, so totals remain estimates.

The speed display uses a centered 30-second distance/time window, shortened at selected boundaries. Overall and split averages use distance divided by elapsed time. The track's zero elevation values are not used to infer gradients or river level. Route colors show relative speed within the selected window.

## Source and dependencies

The club artwork is the supplied Charleston Paddle Club logo. The original AVIF and a PNG copy are in `assets/`.

[Leaflet 1.9.4](https://leafletjs.com/) is vendored with its license. The interactive basemap requests standard OpenStreetMap tiles with visible [attribution](https://www.openstreetmap.org/copyright). Follow the [tile usage policy](https://operations.osmfoundation.org/policies/tiles/) and change providers if traffic exceeds ordinary club use. No bulk or offline tile downloading is included. Route and timeline analysis remain available if tiles fail. Optional Google Fonts use system-font fallbacks.

Race boundaries save in browser storage, which can be cleared or unavailable in private browsing. This version does not sync state between devices. Older saved fields are preserved when boundaries are saved; the removed panels are no longer accessible in the app.

## Development and verification

The download is prebuilt. After editing either page’s JavaScript sources or the bundled recordings, regenerate both classic browser bundles with Node 20+:

    npm run build
    npm test

No package installation is needed. To preview over HTTP:

    python3 -m http.server 4173 --bind 127.0.0.1

Open http://127.0.0.1:4173. The Pages workflow rebuilds and tests automatically before deploying only runtime files.

Tests cover timestamp cleanup, missing GPS coverage, disconnected segments, interpolation, race-window totals, full and partial splits, current-split boundary semantics, backwards seeking, real GPX regressions, classic-script packaging, default-page navigation and redirect compatibility, both embedded replay teams, startup recovery, UTC comparison alignment, waiting and finished teams, matched split comparisons, variable recording intervals, and the real women’s recording.
