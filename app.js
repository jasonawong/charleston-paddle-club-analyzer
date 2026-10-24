import { MILE, clamp, haversine, prepareTrack, sample, speedAt, timeAtDistance, segmentStats, splits, activeSplitIndex, formatDuration, distanceValue, speedValue } from './model.js';

const $ = id => document.getElementById(id);
const state = { track: null, time: 0, start: 0, end: 1, confirmed: false, playing: false, rate: 60, unit: 'mi', follow: false, loop: false, selection: null, selectMode: false, timeZone: 'America/New_York', regional: false };
let map, routeLayer, progressLine, canoe, boundaryLayer, selectionLayer;
let clockFrame = 0, lastFrame = 0, lastDraw = 0, toastTimer, chartGeometry, drag = null, importGeneration = 0;
let splitRows = [], activeSplit = -1;
const chartSamples = [];
const speedUnit = () => state.unit === 'mi' ? 'mph' : 'km/h';
const dist = (d, digits = 2) => distanceValue(d, state.unit).toFixed(digits) + ' ' + state.unit;
const velocity = v => v == null ? '—' : speedValue(v, state.unit).toFixed(2) + ' ' + speedUnit();
const localClock = (t, seconds = false) => new Intl.DateTimeFormat('en-US', { timeZone: state.timeZone, hour: 'numeric', minute: '2-digit', ...(seconds ? { second: '2-digit' } : {}), timeZoneName: 'short' }).format(new Date(state.track.epoch + t * 1000));
const selectedStats = () => segmentStats(state.track, state.start, state.end);

function toast(message, error = false) {
  $('toast').textContent = message; $('toast').classList.toggle('error', error); $('toast').hidden = false;
  clearTimeout(toastTimer); toastTimer = setTimeout(() => { $('toast').hidden = true; }, 4200);
}
function persist() {
  if (!state.track) return;
  try {
    const key = 'cpc:' + state.track.key;
    let previous = {};
    try { const value = JSON.parse(localStorage.getItem(key) || '{}'); if (value && typeof value === 'object' && !Array.isArray(value)) previous = value; } catch {}
    // Preserve older saved fields without exposing removed features or erasing their data.
    localStorage.setItem(key, JSON.stringify({ ...previous, start: state.start, end: state.end, confirmed: state.confirmed }));
    localStorage.setItem('cpc:preferences', JSON.stringify({ unit: state.unit, rate: state.rate }));
  }
  catch { toast('Browser storage is unavailable. Race boundaries will not be saved.', true); }
}
function restore() {
  state.start = 0; state.end = state.track.duration; state.confirmed = false;
  try {
    const prefs = JSON.parse(localStorage.getItem('cpc:preferences') || '{}');
    if (['mi', 'km'].includes(prefs.unit)) state.unit = prefs.unit;
    if ([1, 10, 30, 60, 120, 300].includes(prefs.rate)) state.rate = prefs.rate;
    const saved = JSON.parse(localStorage.getItem('cpc:' + state.track.key) || '{}');
    if (Number.isFinite(saved.start) && Number.isFinite(saved.end) && saved.end - saved.start >= 5 && saved.start >= 0 && saved.end <= state.track.duration) {
      state.start = saved.start; state.end = saved.end; state.confirmed = saved.confirmed === true;
    }
  } catch { /* A damaged or disabled browser store must not prevent replay. */ }
}
function parseGPX(xml) {
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  if (doc.querySelector('parsererror') || doc.documentElement.localName !== 'gpx') throw new Error('That file is not valid GPX XML. Choose a GPX export with coordinates and timestamps.');
  const raw = [], segments = [...doc.getElementsByTagNameNS('*', 'trkseg')];
  if (!segments.length) throw new Error('No track segments found. Export a recorded track with timestamps from Paddle Logger.');
  segments.forEach((segment, index) => {
    for (const node of segment.getElementsByTagNameNS('*', 'trkpt')) {
      const time = node.getElementsByTagNameNS('*', 'time')[0]?.textContent;
      const lat = node.getAttribute('lat'), lon = node.getAttribute('lon');
      raw.push({ lat: lat === null ? NaN : Number(lat), lon: lon === null ? NaN : Number(lon), time: Date.parse(time), segment: index });
    }
  });
  if (raw.length > 200000) throw new Error('This first version supports up to 200,000 GPS points per recording.');
  return prepareTrack(raw, doc.getElementsByTagNameNS('*', 'trk')[0]?.getElementsByTagNameNS('*', 'name')[0]?.textContent?.slice(0, 120) || 'Your paddle');
}
function contentKey(xml) {
  let h = 2166136261;
  for (let i = 0; i < xml.length; i++) h = Math.imul(h ^ xml.charCodeAt(i), 16777619);
  return (h >>> 0).toString(16) + '-' + xml.length;
}
async function loadTrack(xml, bundled = false, generation = importGeneration) {
  const track = parseGPX(xml);
  track.key = contentKey(xml);
  if (generation !== importGeneration) return;
  setPlaying(false);
  state.track = track;
  state.regional = haversine(track.points[0], { lat: 35.058752, lon: -85.307859 }) < 30000;
  state.timeZone = state.regional ? 'America/New_York' : Intl.DateTimeFormat().resolvedOptions().timeZone;
  restore();
  state.time = state.start; state.selection = null; state.loop = false; state.selectMode = false;
  $('loop').setAttribute('aria-pressed', 'false'); $('select-section').setAttribute('aria-pressed', 'false');
  $('units').value = state.unit; $('rate').value = String(state.rate);
  $('race-title').textContent = bundled ? 'Chattajack 2026' : track.name;
  const date = new Intl.DateTimeFormat('en-US', { timeZone: state.timeZone, month: 'long', day: 'numeric', year: 'numeric' }).format(new Date(track.epoch));
  $('race-subtitle').textContent = (bundled ? 'Men’s team · Tennessee River Gorge · ' : state.regional ? 'Tennessee River region · ' : 'Your GPX recording · ') + date;
  $('map-title').textContent = state.regional ? 'Tennessee River Gorge' : track.name;
  $('load-error').hidden = true; $('play').disabled = false;
  if (!map) initializeMap();
  updateWindow();
  $('loading').hidden = true;
}
function initializeMap() {
  if (!window.L) { $('map-notice').textContent = 'The map library could not load. Timeline replay remains available.'; $('map-notice').hidden = false; return; }
  map = L.map('map', { zoomControl: false, preferCanvas: true, zoomSnap: .25, scrollWheelZoom: true });
  L.control.zoom({ position: 'bottomleft' }).addTo(map);
  let tileErrors = 0;
  const tiles = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors', crossOrigin: true }).addTo(map);
  tiles.on('tileerror', () => { if (++tileErrors >= 3) { $('map-notice').textContent = 'The basemap is unavailable. Your GPS route and replay still work; reconnect to see map detail.'; $('map-notice').hidden = false; } });
  tiles.on('tileload', () => { tileErrors = 0; $('map-notice').hidden = true; });
  progressLine = L.polyline([], { color: '#173e73', weight: 10, opacity: .16, interactive: false }).addTo(map);
  routeLayer = L.layerGroup().addTo(map); selectionLayer = L.layerGroup().addTo(map); boundaryLayer = L.layerGroup().addTo(map);
  const icon = L.divIcon({ className: 'palmetto-marker', iconSize: [40, 40], iconAnchor: [20, 20], html: '<div class="palmetto-shape"><svg viewBox="0 0 40 40" aria-hidden="true"><circle cx="20" cy="20" r="19" fill="white" stroke="#173e73" stroke-width="1.5"/><g fill="#173e73"><path d="M19 16h3l1 17h-7c3-5 4-11 3-17Z"/><path d="M20 17C14 8 8 10 6 15c5-2 9-1 14 2ZM20 17C14 5 8 5 7 10c5 0 8 3 13 7ZM20 17C18 5 13 3 11 7c4 2 6 5 9 10ZM20 17C17 8 17 3 20 3c3 4 2 9 0 14ZM20 17C22 5 27 3 29 7c-4 2-6 5-9 10ZM20 17C26 5 32 5 33 10c-5 0-8 3-13 7ZM20 17C26 8 32 10 34 15c-5-2-9-1-14 2ZM20 17C12 13 7 17 8 21c4-4 7-4 12-4ZM20 17C28 13 33 17 32 21c-4-4-7-4-12-4Z"/></g><path d="m19 23 3 1m-4 4 4 1" stroke="white" stroke-width="1"/></svg></div>' });
  canoe = L.marker([0, 0], { icon, keyboard: false, zIndexOffset: 1000, title: 'Palmetto tree at replay position' }).addTo(map);
  map.on('dragstart', () => { state.follow = false; $('follow').checked = false; });
  map.on('click', event => {
    if (!state.track) return;
    let best = null, min = Infinity;
    for (let i = 0; i < state.track.points.length; i += 3) {
      const p = state.track.points[i]; if (p.t < state.start || p.t > state.end) continue;
      const q = map.latLngToContainerPoint([p.lat, p.lon]), d = q.distanceTo(event.containerPoint);
      if (d < min) { best = p; min = d; }
    }
    if (best && min < 35) seek(best.t);
  });
}
function drawRoute() {
  if (!map) return;
  routeLayer.clearLayers();
  const points = state.track.points;
  const speeds = [];
  for (let t = state.start; t <= state.end; t += 60) { const v = speedAt(state.track, t); if (v !== null) speeds.push(v); }
  speeds.sort((a, b) => a - b);
  const slowThreshold = speeds[Math.floor(speeds.length / 3)] ?? 3.05;
  const fastThreshold = speeds[Math.floor(speeds.length * 2 / 3)] ?? 3.3;
  // Short chunks preserve speed color without creating thousands of interactive objects.
  for (let i = 0; i < points.length - 1;) {
    let end = Math.min(i + 30, points.length - 1);
    for (let j = i + 1; j <= end; j++) if (points[j].segment !== points[j - 1].segment || points[j].t - points[j - 1].t > 30) { end = j - 1; break; }
    if (end <= i) { i++; continue; }
    const mid = (points[i].t + points[end].t) / 2;
    const active = mid >= state.start && mid <= state.end;
    const speed = speedAt(state.track, mid);
    const color = !active ? '#b0bfd1' : speed === null ? '#94a6bf' : speed < slowThreshold ? '#73b1df' : speed < fastThreshold ? '#368dcc' : '#15528b';
    L.polyline(points.slice(i, end + 1).map(p => [p.lat, p.lon]), { color, weight: active ? 4 : 3, opacity: active ? .95 : .55, interactive: false, lineCap: 'round' }).addTo(routeLayer);
    i = end;
  }
  $('legend-label').textContent = 'Slower';
}
function fitMap() {
  if (!map || !state.track) return;
  const points = state.track.points.filter(p => p.t >= state.start && p.t <= state.end);
  const ends = [sample(state.track, state.start), sample(state.track, state.end)];
  map.invalidateSize(); map.fitBounds(L.latLngBounds([...points, ...ends].map(p => [p.lat, p.lon])), { paddingTopLeft: [32, 88], paddingBottomRight: [32, 62], animate: false, maxZoom: 16 });
}
function updateBoundaries() {
  if (!map) return;
  boundaryLayer.clearLayers();
  for (const [t, text, color] of [[state.start, state.confirmed ? 'Race start' : 'Recording start', '#173f7b'], [state.end, state.confirmed ? 'Race finish' : 'Recording end', '#258bcb']]) {
    const p = sample(state.track, t);
    L.circleMarker([p.lat, p.lon], { radius: 6, color: '#fff', weight: 2, fillColor: color, fillOpacity: 1 }).bindTooltip(text, { permanent: true, direction: 'top', offset: [0, -6] }).addTo(boundaryLayer);
  }
}
function updateWindow() {
  if (!state.track) return;
  const stat = selectedStats();
  $('total-distance').textContent = distanceValue(stat.distance, state.unit).toFixed(2); $('total-distance-unit').textContent = state.unit;
  $('total-duration').textContent = formatDuration(stat.duration); $('avg-speed').textContent = speedValue(stat.speed, state.unit).toFixed(2);
  document.querySelectorAll('.speed-unit').forEach(el => { el.textContent = speedUnit(); });
  $('window-state').textContent = state.confirmed ? 'Race window set' : 'Full recording';
  $('duration-label').textContent = state.confirmed ? 'SELECTED RACE TIME' : 'RECORDING TIME';
  $('window-detail').textContent = state.confirmed ? localClock(state.start) + ' – ' + localClock(state.end) : 'Set boundaries to exclude extra paddling';
  $('window-button').innerHTML = '<span aria-hidden="true">↔</span> ' + (state.confirmed ? 'Edit race window' : 'Set race window');
  $('seek').min = state.start; $('seek').max = state.end;
  $('remaining-label').textContent = formatDuration(stat.duration);
  const q = state.track.quality;
  $('quality-details').textContent = state.track.points.length.toLocaleString() + ' usable timestamped points. ' + q.duplicates + ' simultaneous fixes merged; ' + q.invalid + ' invalid fixes and ' + q.outOfOrder + ' out-of-order fixes skipped. ' + state.track.gaps.length + ' gaps/segment boundaries flagged. No stroke-rate or effort measurements are inferred.';
  drawRoute(); renderSplits(); renderChart(); updateBoundaries(); fitMap(); updateSelection(); updatePlayhead(true);
}
function setPlaying(playing) {
  state.playing = playing;
  $('play-symbol').textContent = playing ? 'Ⅱ' : '▶'; $('play-label').textContent = playing ? 'Pause' : 'Play'; $('play').setAttribute('aria-label', playing ? 'Pause replay' : 'Play replay');
  cancelAnimationFrame(clockFrame); lastFrame = 0;
  if (playing) clockFrame = requestAnimationFrame(tick);
  else if (state.track) updatePlayhead(true);
}
function tick(timestamp) {
  if (!state.playing) return;
  if (lastFrame) {
    const max = state.loop && state.selection ? state.selection.end : state.end;
    const min = state.loop && state.selection ? state.selection.start : state.start;
    state.time += Math.min((timestamp - lastFrame) / 1000, .2) * state.rate;
    if (state.time >= max) {
      if (state.loop) state.time = min + (state.time - min) % (max - min);
      else { state.time = max; updatePlayhead(true); setPlaying(false); return; }
    }
  }
  lastFrame = timestamp;
  if (timestamp - lastDraw > 85) { updatePlayhead(); lastDraw = timestamp; }
  clockFrame = requestAnimationFrame(tick);
}
function seek(t) {
  if (!state.track) return;
  state.time = clamp(Number(t), state.start, state.end); lastFrame = 0; updatePlayhead(true);
}
function updatePlayhead(force = false) {
  if (!state.track) return;
  const point = sample(state.track, state.time), origin = sample(state.track, state.start).d;
  const speed = speedAt(state.track, state.time, 30, state.start, state.end);
  $('current-speed').textContent = speed == null ? '—' : speedValue(speed, state.unit).toFixed(1);
  $('map-live-speed').textContent = (speed == null ? 'Speed unavailable' : speedValue(speed, state.unit).toFixed(1) + ' ' + speedUnit()) + ' · ' + formatDuration(state.time - state.start) + ' elapsed';
  $('current-distance').textContent = dist(point.d - origin); $('current-elapsed').textContent = formatDuration(state.time - state.start);
  $('elapsed-label').textContent = formatDuration(state.time - state.start); $('seek').value = state.time;
  $('seek').setAttribute('aria-valuetext', formatDuration(state.time - state.start) + ' elapsed, ' + localClock(state.time));
  $('clock').textContent = localClock(state.time); $('gps-gap').hidden = !point.gap;
  $('speed-caption').textContent = speed == null ? 'speed unavailable near GPS gap' : 'ground speed · smoothed';
  $('distance-progress-fill').style.width = (100 * (point.d - origin) / (selectedStats().distance || 1)) + '%';
  if (canoe) {
    canoe.setLatLng([point.lat, point.lon]);
    const trail = state.track.points.filter((p, i) => i % 12 === 0 && p.t >= state.start && p.t <= state.time);
    // Separate polyline arrays at missing segments so replay never draws across a disconnected jump.
    const segments = []; let line = [], prior = null;
    for (const p of trail) { if (prior && (p.segment !== prior.segment || p.t - prior.t > 45)) { segments.push(line); line = []; } line.push([p.lat, p.lon]); prior = p; }
    if (line.length) { if (!point.gap) line.push([point.lat, point.lon]); segments.push(line); }
    progressLine.setLatLngs(segments);
    if (state.follow && (force || !map.getBounds().pad(-.25).contains([point.lat, point.lon]))) map.panTo([point.lat, point.lon], { animate: false });
  }
  if (chartGeometry) {
    const x = chartGeometry.x(state.time), guide = $('chart-playhead');
    if (guide) { guide.setAttribute('x1', x); guide.setAttribute('x2', x); }
    const dot = $('chart-playhead-dot'); if (dot) { dot.setAttribute('cx', x); dot.setAttribute('cy', chartGeometry.y(speed || 0)); dot.style.display = speed == null ? 'none' : ''; }
  }
  updateActiveSplit();
}
function renderChart() {
  if (!state.track) return;
  const svg = $('speed-chart'), width = Math.max(230, svg.getBoundingClientRect().width), height = parseFloat(getComputedStyle(svg).height), left = 25, right = 9, top = 14, bottom = 25;
  const allSpeeds = []; chartSamples.length = 0;
  const step = Math.max(10, (state.end - state.start) / 500);
  for (let t = state.start; t < state.end; t += step) { const v = speedAt(state.track, t, 30, state.start, state.end); chartSamples.push({ t, v }); if (v !== null) allSpeeds.push(v); }
  chartSamples.push({ t: state.end, v: speedAt(state.track, state.end, 30, state.start, state.end) });
  const ceiling = Math.max(2, Math.ceil(Math.max(...allSpeeds, 0) * (state.unit === 'mi' ? 2.236936292 : 3.6) / 2) * 2);
  const x = t => left + (t - state.start) / (state.end - state.start) * (width - left - right);
  const y = v => top + (1 - speedValue(v, state.unit) / ceiling) * (height - top - bottom);
  chartGeometry = { x, y, width, height, left, right, top, bottom };
  let grid = '', path = '', area = '', section = '';
  for (let i = 0; i <= 2; i++) { const val = ceiling * i / 2, yy = y(val / (state.unit === 'mi' ? 2.236936292 : 3.6)); grid += '<line x1="' + left + '" x2="' + (width - right) + '" y1="' + yy + '" y2="' + yy + '" stroke="#e2eaf4"/><text x="' + (left - 7) + '" y="' + (yy + 3) + '" text-anchor="end" fill="#74849a" font-size="9">' + val + '</text>'; }
  let chunk = [];
  const flush = () => { if (!chunk.length) return; const line = chunk.map((p, i) => (i ? 'L' : 'M') + x(p.t).toFixed(2) + ',' + y(p.v).toFixed(2)).join(' '); path += line + ' '; area += line + ' L' + x(chunk.at(-1).t) + ',' + y(0) + ' L' + x(chunk[0].t) + ',' + y(0) + ' Z '; chunk = []; };
  for (const p of chartSamples) { if (p.v === null) flush(); else chunk.push(p); } flush();
  const ticks = width < 400 ? 3 : 5;
  for (let i = 0; i < ticks; i++) { const t = state.start + (state.end - state.start) * i / (ticks - 1); grid += '<text x="' + x(t) + '" y="' + (height - 5) + '" text-anchor="' + (i === 0 ? 'start' : i === ticks - 1 ? 'end' : 'middle') + '" fill="#74849a" font-size="9">' + formatDuration(t - state.start) + '</text>'; }
  if (state.selection) section = selectionRect(state.selection.start, state.selection.end);
  svg.setAttribute('viewBox', '0 0 ' + width + ' ' + height);
  svg.innerHTML = '<title>GPS speed over elapsed time in ' + speedUnit() + '</title><defs><linearGradient id="speed-fill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#3897cf" stop-opacity=".25"/><stop offset="100%" stop-color="#3897cf" stop-opacity=".02"/></linearGradient></defs>' + grid + '<path d="' + area + '" fill="url(#speed-fill)"/><path d="' + path + '" fill="none" stroke="#0066a5" stroke-width="1.7" stroke-linejoin="round"/><g id="chart-selection">' + section + '</g><line id="chart-playhead" x1="' + x(state.time) + '" x2="' + x(state.time) + '" y1="' + top + '" y2="' + y(0) + '" stroke="#193c72" stroke-width="1.4"/><circle id="chart-playhead-dot" r="3.5" fill="#193c72" stroke="#fff" stroke-width="1.5"/>';
  $('chart-speed-unit').textContent = 'GROUND SPEED · ' + speedUnit().toUpperCase();
  updatePlayhead();
}
function selectionRect(start, end) {
  if (!chartGeometry) return '';
  const g = chartGeometry;
  return '<rect x="' + g.x(start) + '" y="' + g.top + '" width="' + Math.max(1, g.x(end) - g.x(start)) + '" height="' + (g.height - g.top - g.bottom) + '" fill="#4e73de" opacity=".18"/>';
}
function chartTime(event) {
  const rect = $('speed-chart').getBoundingClientRect(), g = chartGeometry;
  return state.start + clamp((event.clientX - rect.left - g.left) / (g.width - g.left - g.right), 0, 1) * (state.end - state.start);
}
function updateSelection() {
  $('selection-summary').hidden = !state.selection;
  if (selectionLayer) selectionLayer.clearLayers();
  const chartSel = $('chart-selection'); if (chartSel) chartSel.innerHTML = state.selection ? selectionRect(state.selection.start, state.selection.end) : '';
  if (!state.selection) return;
  const { start, end, label } = state.selection, stat = segmentStats(state.track, start, end);
  $('selection-title').textContent = label || 'Selected section';
  $('selection-detail').textContent = formatDuration(start - state.start) + ' – ' + formatDuration(end - state.start) + ' elapsed · ' + dist(stat.distance) + ' · ' + velocity(stat.speed) + ' average';
  if (map) {
    const pts = [sample(state.track, start), ...state.track.points.filter((p, i) => i % 5 === 0 && p.t > start && p.t < end), sample(state.track, end)];
    const lines = []; let line = [], prev = null;
    for (const p of pts) { if (prev && state.track.gaps.some(g => g.disconnected && g.start < p.t && g.end > prev.t)) { lines.push(line); line = []; } line.push([p.lat, p.lon]); prev = p; } if (line.length) lines.push(line);
    L.polyline(lines, { color: '#4e73de', weight: 9, opacity: .6, interactive: false }).addTo(selectionLayer);
  }
}
function chooseSection(start, end, label = 'Selected section', play = false) {
  state.selection = { start: clamp(start, state.start, state.end), end: clamp(end, state.start, state.end), label };
  updateSelection(); seek(start);
  if (map && state.selection.end > state.selection.start) {
    const pts = state.track.points.filter(p => p.t >= start && p.t <= end); if (pts.length) map.fitBounds(L.latLngBounds(pts.map(p => [p.lat, p.lon])), { padding: [55, 70], animate: false, maxZoom: 15 });
  }
  if (play) { state.loop = true; $('loop').setAttribute('aria-pressed', 'true'); setPlaying(true); }
}
function renderSplits() {
  splitRows = splits(state.track, state.start, state.end, state.unit === 'mi' ? MILE : 1000);
  activeSplit = -1;
  $('split-speed-unit').textContent = speedUnit();
  $('splits-body').innerHTML = splitRows.map((split, index) => {
    const label = split.partial ? 'Final ' + dist(split.distance) : (state.unit === 'mi' ? 'Mile ' : 'Km ') + split.n;
    return '<tr data-split-row="' + index + '"><th scope="row"><button class="split-replay" data-split="' + index + '" aria-label="Replay ' + label.toLowerCase() + '"><span>' + label + '</span><span class="split-current-label" hidden>Current</span></button></th><td>' + formatDuration(split.duration) + '</td><td>' + speedValue(split.speed, state.unit).toFixed(2) + '</td></tr>';
  }).join('');
  $('splits-body').querySelectorAll('[data-split]').forEach(button => button.addEventListener('click', () => {
    const split = splitRows[Number(button.dataset.split)];
    chooseSection(split.start, split.end, (state.unit === 'mi' ? 'Mile ' : 'Kilometer ') + split.n + (split.partial ? ' · partial' : ''), true);
  }));
  $('splits-scroll').scrollTop = 0;
  updateActiveSplit();
}
function updateActiveSplit() {
  const index = activeSplitIndex(splitRows, state.time);
  if (index === activeSplit) return;
  const previous = $('splits-body').querySelector('[data-split-row="' + activeSplit + '"]');
  if (previous) {
    previous.classList.remove('is-current'); previous.removeAttribute('aria-current');
    previous.querySelector('.split-current-label').hidden = true;
  }
  activeSplit = index;
  const row = $('splits-body').querySelector('[data-split-row="' + index + '"]');
  if (!row) { $('split-position').textContent = ''; return; }
  row.classList.add('is-current'); row.setAttribute('aria-current', 'step');
  row.querySelector('.split-current-label').hidden = false;
  const split = splitRows[index];
  $('split-position').textContent = (split.partial ? 'Final partial split' : (state.unit === 'mi' ? 'Mile ' : 'Kilometer ') + split.n) + ' · ' + (index + 1) + ' of ' + splitRows.length;
  // Scroll only the split list, never move the page away from the map/timeline.
  const container = $('splits-scroll');
  if (container.scrollHeight > container.clientHeight) {
    const bounds = container.getBoundingClientRect(), rect = row.getBoundingClientRect();
    const headerHeight = container.querySelector('thead').getBoundingClientRect().height;
    if (rect.top < bounds.top + headerHeight) container.scrollTop -= bounds.top + headerHeight - rect.top;
    else if (rect.bottom > bounds.bottom) container.scrollTop += rect.bottom - bounds.bottom;
  }
}

function openWindow() {
  if (!state.track) return;
  setPlaying(false);
  $('trim-start').max = state.track.duration; $('trim-end').max = state.track.duration;
  $('trim-start').value = state.start; $('trim-end').value = state.end;
  $('trim-error').hidden = true; updateTrimLabels(); $('window-dialog').showModal();
}
function updateTrimLabels() {
  for (const kind of ['start', 'end']) {
    const t = Number($('trim-' + kind).value);
    $('trim-' + kind + '-label').textContent = localClock(t, true) + ' · +' + formatDuration(t);
    $('trim-' + kind).setAttribute('aria-valuetext', localClock(t, true) + ', ' + formatDuration(t) + ' into recording');
  }
}
function openHelp() { setPlaying(false); $('help-dialog').showModal(); }

$('play').addEventListener('click', () => {
  if (!state.track) return;
  if (!state.playing) {
    const lo = state.loop && state.selection ? state.selection.start : state.start;
    const hi = state.loop && state.selection ? state.selection.end : state.end;
    if (state.time >= hi || state.time < lo) seek(lo);
  }
  setPlaying(!state.playing);
});
$('back').addEventListener('click', () => seek(state.time - 10));
$('forward').addEventListener('click', () => seek(state.time + 10));
$('seek').addEventListener('input', event => seek(event.target.value));
$('rate').addEventListener('change', event => { state.rate = Number(event.target.value); persist(); });
$('units').addEventListener('change', event => { state.unit = event.target.value; persist(); updateWindow(); });
$('fit-map').addEventListener('click', () => { state.follow = false; $('follow').checked = false; fitMap(); });
$('follow').addEventListener('change', event => { state.follow = event.target.checked; updatePlayhead(true); });
$('loop').addEventListener('click', () => { state.loop = !state.loop; $('loop').setAttribute('aria-pressed', String(state.loop)); if (state.loop && state.selection && (state.time < state.selection.start || state.time >= state.selection.end)) seek(state.selection.start); toast(state.loop ? 'Looping ' + (state.selection ? 'the selected section.' : 'the selected race window.') : 'Loop off.'); });
$('select-section').addEventListener('click', () => { state.selectMode = !state.selectMode; $('select-section').setAttribute('aria-pressed', String(state.selectMode)); $('chart-hint').textContent = state.selectMode ? 'Drag across the chart to select' : 'Tap to seek · drag to explore'; });
$('clear-selection').addEventListener('click', () => { state.selection = null; updateSelection(); });
$('window-button').addEventListener('click', openWindow);
for (const kind of ['start', 'end']) {
  $('trim-' + kind).addEventListener('input', updateTrimLabels);
  $(kind + '-at-playhead').addEventListener('click', () => { $('trim-' + kind).value = state.time; updateTrimLabels(); });
}
$('window-form').addEventListener('submit', event => {
  event.preventDefault(); const start = Number($('trim-start').value), end = Number($('trim-end').value);
  if (end - start < 5) { $('trim-error').textContent = 'Choose a finish at least five seconds after the start.'; $('trim-error').hidden = false; return; }
  state.start = start; state.end = end; state.confirmed = true; state.time = clamp(state.time, start, end); state.selection = null;
  persist(); updateWindow(); $('window-dialog').close(); toast('Race window updated. Splits recalculated.');
});
$('reset-window').addEventListener('click', () => { state.start = 0; state.end = state.track.duration; state.confirmed = false; state.selection = null; persist(); updateWindow(); $('window-dialog').close(); toast('Showing the full recording.'); });
document.querySelectorAll('[data-close]').forEach(button => button.addEventListener('click', () => $(button.dataset.close).close()));
for (const id of ['help-button', 'footer-help', 'quality-button']) $(id).addEventListener('click', openHelp);
const chart = $('speed-chart');
chart.addEventListener('pointerdown', event => {
  if (!state.track || !chartGeometry || event.button !== 0) return;
  setPlaying(false); const t = chartTime(event); drag = { start: t, end: t, id: event.pointerId };
  chart.setPointerCapture(event.pointerId); if (!state.selectMode) seek(t);
});
chart.addEventListener('pointermove', event => {
  if (!state.track || !chartGeometry) return;
  const t = chartTime(event);
  if (drag && drag.id === event.pointerId) {
    drag.end = t;
    if (state.selectMode) $('chart-selection').innerHTML = selectionRect(Math.min(drag.start, t), Math.max(drag.start, t));
    else seek(t);
  } else if (event.pointerType !== 'touch') {
    const v = speedAt(state.track, t, 30, state.start, state.end), x = event.clientX - chart.getBoundingClientRect().left;
    $('chart-hover').hidden = false; $('chart-hover').textContent = formatDuration(t - state.start) + ' · ' + velocity(v);
    $('chart-hover').style.left = clamp(x - 45, 0, Math.max(0, chartGeometry.width - 120)) + 'px';
  }
});
chart.addEventListener('pointerup', event => {
  if (!drag || event.pointerId !== drag.id) return;
  if (state.selectMode) {
    const start = Math.min(drag.start, drag.end), end = Math.max(drag.start, drag.end);
    if (end - start >= 5) { chooseSection(start, end); state.selectMode = false; $('select-section').setAttribute('aria-pressed', 'false'); $('chart-hint').textContent = 'Tap to seek · drag to explore'; }
    else { updateSelection(); toast('Drag to select at least five seconds.'); }
  }
  drag = null; $('chart-hover').hidden = true;
});
chart.addEventListener('pointercancel', () => { drag = null; updateSelection(); });
chart.addEventListener('pointerleave', () => { $('chart-hover').hidden = true; });
document.addEventListener('keydown', event => {
  if (!state.track || event.altKey || event.metaKey || event.ctrlKey || document.querySelector('dialog[open]') || event.target.closest('input,textarea,select,button,[role="tab"]') || event.target.isContentEditable) return;
  if (event.code === 'Space') { event.preventDefault(); $('play').click(); }
  if (event.key === 'ArrowLeft') { event.preventDefault(); seek(state.time - 10); }
  if (event.key === 'ArrowRight') { event.preventDefault(); seek(state.time + 10); }
  if (event.key === 'Home') { event.preventDefault(); seek(state.start); }
  if (event.key === 'End') { event.preventDefault(); seek(state.end); }
});
document.addEventListener('visibilitychange', () => { if (document.hidden) setPlaying(false); });
new ResizeObserver(() => { if (state.track) { map?.invalidateSize(); renderChart(); } }).observe($('chart-wrap'));
$('gpx-file').addEventListener('change', async event => {
  const file = event.target.files[0]; if (!file) return;
  const generation = ++importGeneration;
  try {
    if (file.size > 25 * 1024 * 1024) throw new Error('Choose a GPX file smaller than 25 MB.');
    await loadTrack(await file.text(), false, generation); toast('Recording loaded. Your GPX stays in this browser.');
  } catch (error) { $('load-error').textContent = error.message; $('load-error').hidden = false; toast('Could not load that recording. The previous recording is unchanged.', true); }
  finally { event.target.value = ''; }
});

async function boot() {
  try {
    // build.mjs embeds this data in the classic browser script, avoiding file:// CORS.
    if (typeof embeddedRace !== 'undefined') {
      await loadTrack(embeddedRace.gpx, true, importGeneration);
    } else {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 12000);
      try {
        const response = await fetch('./assets/pl-2026-10-24.gpx', { signal: controller.signal });
        if (!response.ok) throw new Error('Race file could not be loaded.');
        await loadTrack(await response.text(), true, importGeneration);
      } finally { clearTimeout(timer); }
    }
    window.CPCStartup?.ready();
  } catch (error) {
    const message = error.message + ' Use Load GPX to open a recording, or re-extract the complete application download and try again.';
    window.CPCStartup?.fail(message);
    $('loading').hidden = true; $('load-error').textContent = message; $('load-error').hidden = false;
  }
}
boot();
