# Charleston Paddle Club Analyzer

A responsive GPX race replay for Charleston Paddle Club. Includes the men's team's October 24, 2026 Chattajack recording. All application behavior runs in the browser; there is no backend, paid API, or API key. The download is prebuilt and ready to open.

Version 1.0.2 uses the supplied Charleston Paddle Club logo and a navy/ocean-blue interface, route palette, and speed chart. The original AVIF is retained in assets; the page uses a PNG copy of the same artwork for broad browser and favicon support.

## Open directly in Chrome

Extract the **entire ZIP**, then double-click `index.html`. Keep `app.bundle.js`, `styles.css`, and the `assets/` and `vendor/` folders beside it. Version 1.0.1 embeds the race data in a classic browser script, so file opening no longer depends on JavaScript module imports or fetching local files. Online map tiles still need internet access.

If you used the first download and saw an endless loading screen, replace the entire extracted folder with the new version. Startup failures now dismiss that screen and show a recovery message.

## Run locally

From this directory:

```sh
python3 -m http.server 4173 --bind 127.0.0.1
```

Open http://127.0.0.1:4173. A web server is optional for the prebuilt download and useful while developing.

## Publish on GitHub Pages

1. Create a GitHub repository and put **the contents of this directory at the repository root**, including `.github/workflows/pages.yml` and `.nojekyll`.
2. Push to the `main` branch. If your default branch has a different name, update the branch filter in the workflow.
3. In the repository, open **Settings → Pages → Build and deployment → Source → GitHub Actions**.
4. Open **Actions → Test and deploy to GitHub Pages** and run the workflow, or push another commit to `main`.
5. Once deployment succeeds, GitHub shows the Pages URL. Both a project URL such as `https://OWNER.github.io/REPOSITORY/` and a custom domain work because application assets use relative URLs.

Alternatively, use **Deploy from a branch**, select `main` and `/ (root)`, and disable/delete the supplied Actions workflow. The source directory itself is already a complete static site.

Publishing publicly makes the bundled GPX publicly downloadable. Uploaded recordings are never sent to the app's server and do not replace the public bundled recording.

## Explore a race

- Play at 1×–300×, seek with the slider, select the route or speed graph, and switch miles/kilometers.
- Choose **Set race window** to remove staging and post-finish paddling. The original recording remains intact. Until then, statistics and coaching describe the full recording.
- To locate exact boundaries, seek on the timeline, open the race window editor, and use **Use playhead as start/finish**. Apply the window to rebase elapsed time, distance, splits, and coaching.
- Use **Select section**, then drag horizontally across the chart. Press **Loop** to repeat it. A five-second minimum avoids accidental empty selections. Keyboard and phone users can also select complete sections using split/insight replay buttons.
- Expand **Distance splits** to replay an individual split. The final incomplete split is explicitly labeled.
- **Coaching** links observations to the underlying sections. Comparison cards alternate between the earlier and later sections.
- **Conditions** follows the replay clock and identifies station location, reading age, and coverage gaps.
- **Moments** stores crew observations with the exact location and time. Notes and race boundaries persist per GPX in browser storage. Use **Export debrief notes** for a JSON copy; note import/cloud sharing are not included in this version.
- **Load GPX** accepts timed GPX tracks from Paddle Logger and other exporters, up to 25 MB / 200,000 fixes. GPX routes without timestamps are not replayable. Other recordings use the browser's timezone, except tracks near Chattanooga use America/New_York.

Space toggles playback; left/right arrows seek ten seconds; Home/End jump to the selected window's boundaries. Shortcuts do not intercept text-entry fields. Playback pauses when the browser tab is hidden. The map can follow the canoe or fit the full selected route.

## Calculation details

Coordinates and timestamps are used to calculate Haversine distance and speed over ground. Simultaneous fixes are merged, invalid fixes and decreasing timestamps are skipped, and segment breaks or gaps over 30 seconds are not added as distance. Gaps over five seconds hold the last observed position in replay and do not receive smoothed speed. A short gap can contribute straight-line distance, so all totals remain estimates.

The speed display uses a centered 30-second distance/time window, shortened at the selected boundaries; split and overall speeds use total distance / elapsed time. The GPX's zero elevation values are not used to infer gradients or river level.

Coaching is recalculated for the selected window:

- Pacing compares equal-distance sections at 15–35% and 70–90% of selected distance.
- A slower-minute prompt finds the slowest 60-second section, sampled every ten seconds, outside the first 10% and last 5% of selected elapsed time.
- Recovery compares consecutive full mile splits (500 m splits for short recordings), excluding the opening splits.

GPS cannot establish fatigue, technique, stroke rate, exertion, drafting, or speed through the water. Conditions and crew notes add context without claiming causal explanations. Selected boundaries are user-defined, not official timing results.

## Conditions and sources

`assets/conditions.json` contains a **fixed partial historical snapshot**, captured October 24, 2026, from [NWS Chattanooga / Lovell Field](https://forecast.weather.gov/data/obhistory/KCHA.html). It includes observations at 07:53, 08:53, 09:53, and 10:53 EDT. This source page rolls forward; the bundled snapshot remains unchanged.

Only an observation at or before the replay clock is considered. Readings older than 65 minutes are marked unavailable; future observations and later-race forecasts are never substituted. The snapshot is applied only to October 24, 2026 recordings starting within 30 km of the Chattajack start. Airport readings describe the station, not every part of the gorge. Current visibility/age values are not continuously measured at the canoe. The station can be located on the map.

The [organizer's anticipated water temperature](https://www.chattajack.com/forecasted-conditions) is labeled a forecast. No measured race-hour water temperature, river level, discharge, local current speed, or wave/chop record is bundled. [TVA's levels and releases](https://www.tva.com/environment/lake-levels) is linked as a research source. Add verified historical observations to the data file in future work; do not replace them with today's weather.

## Dependencies and privacy

- [Leaflet 1.9.4](https://leafletjs.com/), vendored with its BSD license in `vendor/`. No package installation is needed to run the app.
- Standard OpenStreetMap tiles are requested only for the visible interactive map; [attribution](https://www.openstreetmap.org/copyright) remains visible. Tile availability is best effort. The route/timeline still work if tiles fail. Follow the [tile usage policy](https://operations.osmfoundation.org/policies/tiles/) and switch providers if traffic grows beyond ordinary club use. No offline tile downloading is included.
- Optional Google Fonts have system-font fallbacks.
- Browser storage can be cleared or unavailable in private browsing. Export notes for a separate copy. This version does not sync notes across laptops and phones.

## Verification

When editing `app.js`, `model.js`, or the bundled data, run `node build.mjs` to regenerate `app.bundle.js`. The checked-in bundle lets the app open without installing Node. The Pages workflow regenerates the bundle before publishing.

Node 20+ is sufficient; no dependency installation is needed:

```sh
npm test
node --check app.js
```

Tests cover timestamp cleanup, invalid inputs, track gaps, disconnected segments, interpolation, race-window rebasing, partial splits, coaching boundaries, regression checks against the actual GPX, the classic browser entry point, embedded data completeness, and loading-screen failure recovery. The Pages workflow runs these tests before publishing only the runtime files.
