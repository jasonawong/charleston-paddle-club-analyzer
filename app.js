import { MILE, clamp, haversine, prepareTrack, sample, speedAt, timeAtDistance, segmentStats, splits, buildInsights, formatDuration, distanceValue, speedValue } from './model.js';

const $ = id => document.getElementById(id);
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const state = { track: null, conditions: null, time: 0, start: 0, end: 1, confirmed: false, playing: false, rate: 60, unit: 'mi', follow: false, loop: false, selection: null, selectMode: false, tab: 'coaching', notes: [], timeZone: 'America/New_York', regional: false };
let map, routeLayer, progressLine, canoe, boundaryLayer, noteLayer, selectionLayer, stationLayer;
let clockFrame = 0, lastFrame = 0, lastDraw = 0, toastTimer, chartGeometry, drag = null, noteTime = 0, importGeneration = 0;
let insights = [];
const chartSamples = [];
const speedUnit = () => state.unit === 'mi' ? 'mph' : 'km/h';
const dist = (d, digits = 2) => distanceValue(d, state.unit).toFixed(digits) + ' ' + state.unit;
const velocity = v => v == null ? '—' : speedValue(v, state.unit).toFixed(2) + ' ' + speedUnit();
const localClock = (t, seconds = false) => new Intl.DateTimeFormat('en-US', { timeZone: state.timeZone, hour: 'numeric', minute: '2-digit', ...(seconds ? { second: '2-digit' } : {}), timeZoneName: 'short' }).format(new Date(state.track.epoch + t * 1000));
const dateAt = (epoch, zone = 'America/New_York') => new Intl.DateTimeFormat('en-CA', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(epoch));
const selectedStats = () => segmentStats(state.track, state.start, state.end);

function toast(message, error = false) {
  $('toast').textContent = message; $('toast').classList.toggle('error', error); $('toast').hidden = false;
  clearTimeout(toastTimer); toastTimer = setTimeout(() => { $('toast').hidden = true; }, 4200);
}
function persist() {
  if (!state.track) return;
  try { localStorage.setItem('cpc:' + state.track.key, JSON.stringify({ start: state.start, end: state.end, confirmed: state.confirmed, notes: state.notes })); localStorage.setItem('cpc:preferences', JSON.stringify({ unit: state.unit, rate: state.rate })); }
  catch { toast('Browser storage is unavailable. Export notes to keep them.', true); }
}
function restore() {
  state.start = 0; state.end = state.track.duration; state.confirmed = false; state.notes = [];
  try {
    const prefs = JSON.parse(localStorage.getItem('cpc:preferences') || '{}');
    if (['mi', 'km'].includes(prefs.unit)) state.unit = prefs.unit;
    if ([1, 10, 30, 60, 120, 300].includes(prefs.rate)) state.rate = prefs.rate;
    const saved = JSON.parse(localStorage.getItem('cpc:' + state.track.key) || '{}');
    if (Number.isFinite(saved.start) && Number.isFinite(saved.end) && saved.end - saved.start >= 5 && saved.start >= 0 && saved.end <= state.track.duration) {
      state.start = saved.start; state.end = saved.end; state.confirmed = saved.confirmed === true;
    }
    if (Array.isArray(saved.notes)) state.notes = saved.notes.filter(n => n && typeof n.id === 'string' && Number.isFinite(n.t) && n.t >= 0 && n.t <= state.track.duration && typeof n.title === 'string').slice(0, 500).map(n => ({ id: n.id.slice(0, 80), t: n.t, title: n.title.slice(0, 80), body: String(n.body || '').slice(0, 2000), type: String(n.type || 'Crew moment').slice(0, 50) }));
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
  state.isChattajack = state.regional && dateAt(track.epoch) === '2026-10-24';
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
  routeLayer = L.layerGroup().addTo(map); selectionLayer = L.layerGroup().addTo(map); boundaryLayer = L.layerGroup().addTo(map); noteLayer = L.layerGroup().addTo(map); stationLayer = L.layerGroup().addTo(map);
  const icon = L.divIcon({ className: 'canoe-marker', iconSize: [34, 34], iconAnchor: [17, 17], html: '<div class="canoe-shape"><svg viewBox="0 0 34 34" aria-hidden="true"><circle cx="17" cy="17" r="16" fill="white"/><path d="M17 3C10 12 10 22 17 30C24 22 24 12 17 3Z" fill="#17244f"/><path d="M17 9V23" stroke="#dcefff" stroke-width="2"/><path d="m8 23 18-12" stroke="#43a2d5" stroke-width="2.5" stroke-linecap="round"/></svg></div>' });
  canoe = L.marker([0, 0], { icon, keyboard: false, zIndexOffset: 1000, title: 'Canoe at replay position' }).addTo(map);
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
  routeLayer.clearLayers(); stationLayer.clearLayers();
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
  drawNotesOnMap();
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
  insights = buildInsights(state.track, state.start, state.end);
  drawRoute(); renderInsights(); renderSplits(); renderNotes(); renderChart(); updateBoundaries(); fitMap(); updateSelection(); updatePlayhead(true);
}
function setPlaying(playing) {
  state.playing = playing;
  $('play-symbol').textContent = playing ? 'Ⅱ' : '▶'; $('play').setAttribute('aria-label', playing ? 'Pause replay' : 'Play replay');
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
let lastConditionsBucket = '';
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
    const next = sample(state.track, Math.min(state.time + 10, state.end)), prev = sample(state.track, Math.max(state.time - 10, state.start));
    const heading = Math.atan2((next.lon - prev.lon) * Math.cos(point.lat * Math.PI / 180), next.lat - prev.lat) * 180 / Math.PI;
    const shape = canoe.getElement()?.querySelector('.canoe-shape'); if (shape) shape.style.transform = 'rotate(' + heading + 'deg)';
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
  const bucket = Math.floor(state.time / 30) + ':' + state.unit;
  if (force || bucket !== lastConditionsBucket) { renderConditions(); lastConditionsBucket = bucket; }
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
function renderInsights() {
  const container = $('coaching-insights');
  let html = !state.confirmed ? '<div class="window-reminder">These insights include the full recording. <button class="inline-button" id="coach-set-window">Set your race window</button> to exclude staging and post-finish paddling.</div>' : '';
  if (!insights.length) html += '<p class="empty-analysis">Coaching needs at least three minutes, 500 meters, and enough continuous GPS coverage. Expand the selected window or inspect track details.</p>';
  insights.forEach((insight, i) => {
    const sections = insight.sections;
    const evidence = sections.length === 2 ? velocity(sections[0].speed) + ' → ' + velocity(sections[1].speed) + ' · ' + Math.abs(insight.change).toFixed(1) + '% ' + (insight.change < 0 ? 'lower' : 'higher') : velocity(sections[0].speed) + ' · ' + localClock(sections[0].start);
    html += '<article class="insight"><div class="insight-type"><span class="insight-number">' + String(i + 1).padStart(2, '0') + '</span>' + insight.type + '</div><h4>' + insight.title + '</h4><p class="evidence">' + evidence + '</p><p>' + insight.tip + '</p><details><summary>How to read this</summary><p>' + insight.observation + '</p><p>' + insight.caveat + '</p></details><button class="button replay-insight" data-insight="' + i + '">▶ ' + (sections.length > 1 ? 'Compare sections' : 'Replay this minute') + '</button></article>';
  });
  container.innerHTML = html;
  $('coach-set-window')?.addEventListener('click', openWindow);
  container.querySelectorAll('[data-insight]').forEach(button => button.addEventListener('click', () => {
    const insight = insights[Number(button.dataset.insight)];
    let index = Number(button.dataset.section || 0), part = insight.sections[index];
    chooseSection(part.start, part.end, insight.title + (insight.sections.length > 1 ? ' · section ' + (index + 1) + ' of 2' : ''), true);
    if (insight.sections.length > 1) { button.dataset.section = String(1 - index); button.textContent = '▶ Replay ' + (index === 0 ? 'later / next' : 'earlier / previous') + ' section'; }
  }));
}
function renderSplits() {
  const rows = splits(state.track, state.start, state.end, state.unit === 'mi' ? MILE : 1000);
  $('splits-body').innerHTML = rows.map((s, i) => '<tr><td>' + (s.partial ? 'Final ' + dist(s.distance) : (state.unit === 'mi' ? 'Mile ' : 'Kilometer ') + s.n) + '</td><td>' + formatDuration(s.duration) + '</td><td>' + velocity(s.speed) + '</td><td><button data-split="' + i + '" aria-label="Replay split ' + s.n + '">Replay ↗</button></td></tr>').join('');
  $('splits-body').querySelectorAll('[data-split]').forEach(button => button.addEventListener('click', () => { const s = rows[Number(button.dataset.split)]; chooseSection(s.start, s.end, 'Split ' + s.n, true); }));
}

function renderConditions() {
  if (!state.track) return;
  const context = state.conditions;
  const matching = state.isChattajack && context && dateAt(state.track.epoch + state.time * 1000) === context.verifiedDate;
  if (!matching) {
    $('conditions-content').innerHTML = '<section class="condition-card"><div class="condition-heading"><h4>Conditions for this recording</h4><span class="status-badge unavailable">Unavailable</span></div><p>No verified weather or river observations are bundled for this date and location. The Chattajack snapshot is not applied to other recordings.</p><button class="text-button" id="add-condition-note">＋ Add the crew’s observations</button></section>';
    $('add-condition-note').addEventListener('click', () => openNote('Water / river condition'));
    return;
  }
  const now = state.track.epoch + state.time * 1000;
  const observed = context.observations.filter(o => Date.parse(o.time) <= now).at(-1);
  const age = observed ? (now - Date.parse(observed.time)) / 60000 : Infinity;
  const fresh = observed && age <= 65;
  const current = sample(state.track, state.time);
  const stationDistance = haversine(current, context.station);
  const observationClock = observed ? new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hour: 'numeric', minute: '2-digit', timeZoneName: 'short' }).format(new Date(observed.time)) : '';
  const temperature = observed ? (state.unit === 'mi' ? observed.tempF.toFixed(1) + '°' : ((observed.tempF - 32) * 5 / 9).toFixed(1) + '°') : '';
  let html = '<section class="condition-card"><div class="condition-heading"><h4>Weather nearby</h4><span class="status-badge ' + (fresh ? '' : 'unavailable') + '">' + (fresh ? 'Observed · station' : 'No recent reading') + '</span></div>';
  if (fresh) html += '<div class="weather-main">' + temperature + '<span>' + (state.unit === 'mi' ? 'F' : 'C') + '</span></div><div class="condition-subtitle">' + esc(observed.weather) + '</div><div class="condition-grid"><div><span>Wind at station</span><strong>' + (observed.windMph === 0 ? 'Calm' : observed.windMph + ' mph') + '</strong></div><div><span>Visibility</span><strong>' + (state.unit === 'mi' ? observed.visibilityMi + ' mi' : (observed.visibilityMi * 1.609344).toFixed(1) + ' km') + '</strong></div><div><span>Humidity</span><strong>' + observed.humidity + '%</strong></div><div><span>Observation age</span><strong>' + Math.floor(age) + ' min earlier</strong></div></div>';
  else html += '<p class="no-reading">No verified reading near this replay time.</p><p>' + (observed ? 'The latest bundled observation is from ' + observationClock + ', ' + Math.floor(age) + ' minutes earlier. It is not carried forward as current weather.' : 'There is no observation before this replay time in the bundled snapshot.') + '</p>';
  html += '<div class="condition-source">KCHA · ' + dist(stationDistance, 1) + ' from canoe' + (fresh ? '<br>Observed ' + observationClock : '') + '<br><a href="' + context.source + '" target="_blank" rel="noopener">National Weather Service ↗</a></div><button id="show-station" class="context-button">Locate weather station on map</button><p>Airport observations provide regional context. Wind and fog can differ along the gorge. Snapshot captured October 24, 2026.</p></section>';
  html += '<section class="condition-card"><div class="condition-heading"><h4>Water temperature</h4><span class="status-badge unavailable">Not measured</span></div><p class="no-reading">No verified measurement</p><p><span class="status-badge forecast">Organizer forecast</span></p><p>' + esc(context.water.forecast) + '</p><a class="condition-source" href="' + context.water.source + '" target="_blank" rel="noopener">Read organizer’s forecast ↗</a></section>';
  html += '<section class="condition-card"><div class="condition-heading"><h4>River flow & level</h4><span class="status-badge unavailable">Unavailable</span></div><p>No verified race-hour discharge or river level is bundled. Chickamauga releases are relevant context, but discharge does not tell us current speed at this canoe.</p><a class="condition-source" href="' + context.river.source + '" target="_blank" rel="noopener">TVA levels & releases ↗</a><p>Release changes also take time to travel downstream. We do not infer a local current or time advantage.</p></section><button class="text-button" id="add-condition-note">＋ Add a water / weather observation</button>';
  $('conditions-content').innerHTML = html;
  $('show-station').addEventListener('click', () => {
    if (!map) return toast('The map is unavailable.', true);
    stationLayer.clearLayers();
    L.circleMarker([context.station.lat, context.station.lon], { radius: 7, color: '#fff', weight: 2, fillColor: '#6772ac', fillOpacity: 1 }).bindTooltip('KCHA · regional weather station', { permanent: true }).addTo(stationLayer);
    map.fitBounds([[current.lat, current.lon], [context.station.lat, context.station.lon]], { padding: [70, 90], animate: false });
    state.follow = false; $('follow').checked = false;
    if (window.innerWidth < 800) $('map').scrollIntoView({ block: 'center', behavior: 'auto' });
  });
  $('add-condition-note').addEventListener('click', () => openNote('Water / river condition'));
}
function switchTab(tab, focus = false) {
  state.tab = tab;
  document.querySelectorAll('[data-tab]').forEach(button => {
    const active = button.dataset.tab === tab;
    button.setAttribute('aria-selected', String(active)); button.tabIndex = active ? 0 : -1;
    $('panel-' + button.dataset.tab).hidden = !active;
    if (focus && active) button.focus();
  });
  if (tab === 'conditions') renderConditions();
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
function openNote(type = 'Crew moment') {
  if (!state.track) return;
  if (state.notes.length >= 500) return toast('This recording has 500 moments. Export or remove some before adding another.', true);
  setPlaying(false); noteTime = state.time;
  $('note-form').reset(); $('note-type').value = type;
  $('note-location').textContent = localClock(noteTime, true) + ' · ' + formatDuration(noteTime - state.start) + ' into selected window · ' + dist(sample(state.track, noteTime).d - sample(state.track, state.start).d);
  $('note-dialog').showModal(); $('note-title').focus();
}
function renderNotes() {
  $('note-count').textContent = state.notes.length; $('export-notes').hidden = state.notes.length === 0;
  if (!state.notes.length) { $('notes-list').innerHTML = '<div class="notes-empty"><strong>The best context is yours.</strong><p>Pause the replay and capture a crew call,<br>a tough stretch, or something to repeat.</p></div>'; drawNotesOnMap(); return; }
  $('notes-list').innerHTML = [...state.notes].sort((a, b) => a.t - b.t).map(note => {
    const outside = note.t < state.start || note.t > state.end;
    return '<article class="moment-card"><div class="moment-type">' + esc(note.type) + '</div><h4>' + esc(note.title) + '</h4><p>' + esc(note.body) + '</p>' + (outside ? '<span class="moment-outside">Outside selected race window · ' + localClock(note.t) + '</span>' : '') + '<div class="moment-actions"><button data-note-seek="' + esc(note.id) + '">' + localClock(note.t) + ' ↗</button><button class="delete-note" data-note-delete="' + esc(note.id) + '">Remove</button></div></article>';
  }).join('');
  $('notes-list').querySelectorAll('[data-note-seek]').forEach(button => button.addEventListener('click', () => {
    const note = state.notes.find(n => n.id === button.dataset.noteSeek);
    if (note.t < state.start || note.t > state.end) { toast('This moment is outside the selected window. Expand the race window to replay it.'); return; }
    seek(note.t);
    if (map) { const p = sample(state.track, note.t); map.panTo([p.lat, p.lon], { animate: false }); }
  }));
  $('notes-list').querySelectorAll('[data-note-delete]').forEach(button => button.addEventListener('click', () => {
    const note = state.notes.find(n => n.id === button.dataset.noteDelete);
    if (!confirm('Remove “' + note.title + '” from this browser?')) return;
    state.notes = state.notes.filter(n => n.id !== note.id); persist(); renderNotes(); toast('Moment removed.');
  }));
  drawNotesOnMap();
}
function drawNotesOnMap() {
  if (!noteLayer || !state.track) return;
  noteLayer.clearLayers();
  for (const note of state.notes) {
    const p = sample(state.track, note.t), label = document.createElement('span'); label.textContent = note.title;
    L.circleMarker([p.lat, p.lon], { radius: 4, color: '#fff', weight: 1.5, fillColor: '#6772ac', fillOpacity: 1 }).bindTooltip(label).on('click', event => {
      L.DomEvent.stopPropagation(event);
      if (note.t < state.start || note.t > state.end) return toast('This moment is outside the selected race window.');
      seek(note.t); switchTab('moments');
    }).addTo(noteLayer);
  }
}
function exportNotes() {
  const payload = { application: 'Charleston Paddle Club Analyzer', version: 1, recording: state.track.name, startUTC: new Date(state.track.epoch).toISOString(), raceWindow: { startOffsetSeconds: state.start, finishOffsetSeconds: state.end, userSelected: state.confirmed }, notes: state.notes.map(n => ({ ...n, timeUTC: new Date(state.track.epoch + n.t * 1000).toISOString(), position: sample(state.track, n.t) })) };
  const url = URL.createObjectURL(new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }));
  const a = document.createElement('a'); a.href = url; a.download = 'charleston-paddle-club-debrief.json'; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  toast('Debrief notes exported.');
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
$('bookmark').addEventListener('click', () => openNote()); $('add-note').addEventListener('click', () => openNote());
$('export-notes').addEventListener('click', exportNotes);
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
  persist(); updateWindow(); $('window-dialog').close(); toast('Race window updated. Splits and coaching recalculated.');
});
$('reset-window').addEventListener('click', () => { state.start = 0; state.end = state.track.duration; state.confirmed = false; state.selection = null; persist(); updateWindow(); $('window-dialog').close(); toast('Showing the full recording.'); });
$('note-form').addEventListener('submit', event => {
  event.preventDefault(); const title = $('note-title').value.trim(); if (!title) { $('note-title').focus(); return; }
  state.notes.push({ id: String(Date.now()) + '-' + Math.random().toString(36).slice(2, 8), t: noteTime, title, type: $('note-type').value, body: $('note-body').value.trim() });
  persist(); renderNotes(); $('note-dialog').close(); switchTab('moments'); toast('Moment saved to this browser.');
});
document.querySelectorAll('[data-close]').forEach(button => button.addEventListener('click', () => $(button.dataset.close).close()));
for (const id of ['help-button', 'footer-help', 'quality-button']) $(id).addEventListener('click', openHelp);
document.querySelectorAll('[data-tab]').forEach(button => {
  button.addEventListener('click', () => switchTab(button.dataset.tab));
  button.addEventListener('keydown', event => {
    const tabs = ['coaching', 'conditions', 'moments'], index = tabs.indexOf(state.tab);
    if (['ArrowRight', 'ArrowLeft', 'Home', 'End'].includes(event.key)) { event.preventDefault(); const next = event.key === 'Home' ? 0 : event.key === 'End' ? 2 : (index + (event.key === 'ArrowRight' ? 1 : 2)) % 3; switchTab(tabs[next], true); }
  });
});
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
      state.conditions = embeddedRace.conditions;
      await loadTrack(embeddedRace.gpx, true, importGeneration);
    } else {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 12000);
      try {
        const [gpxResult, conditionsResult] = await Promise.allSettled([fetch('./assets/pl-2026-10-24.gpx', { signal: controller.signal }).then(r => { if (!r.ok) throw new Error('Race file could not be loaded.'); return r.text(); }), fetch('./assets/conditions.json', { signal: controller.signal }).then(r => { if (!r.ok) throw new Error('Conditions unavailable'); return r.json(); })]);
        if (conditionsResult.status === 'fulfilled') state.conditions = conditionsResult.value;
        if (gpxResult.status === 'rejected') throw gpxResult.reason;
        await loadTrack(gpxResult.value, true, importGeneration);
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
