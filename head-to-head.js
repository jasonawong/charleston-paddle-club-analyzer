import { MILE, clamp, haversine, sample, speedAt, segmentStats, splits, activeSplitIndex, formatDuration, distanceValue, speedValue } from './model.js';
import { parseGPX } from './gpx.js';
import { palmettoMarkup, MARKER_SIZE } from './palmetto.js';
import { CLOCK_TOLERANCE, comparisonDomain, comparisonCoordinate, comparisonSnapshot, comparisonSplits } from './comparison-model.js';

const $ = id => document.getElementById(id);
const teams = [
  { name: 'Men’s team', color: '#173e73', track: null, start: 0, end: 0, generation: 0 },
  { name: 'Women’s team', color: '#c73745', track: null, start: 0, end: 0, generation: 0 }
];
const state = { unit: 'mi', rate: 60, playing: false, loop: false, follow: false, time: 0, domain: { start: 0, end: 1 } };
let map, routes, markers = [], frame = 0, lastFrame = 0, lastDraw = 0, windowTeam = 0;
let rows = [], teamSplits = [[], []], currentSplits = [-1, -1], chartGeometry = {}, chartDrag = null;
const unitSpeed = () => state.unit === 'mi' ? 'mph' : 'km/h';
const distanceText = (meters, digits = 2) => distanceValue(meters, state.unit).toFixed(digits) + ' ' + state.unit;
const speedText = speed => speed == null ? '—' : speedValue(speed, state.unit).toFixed(2) + ' ' + unitSpeed();
const snapshot = e => comparisonSnapshot(e, state.time);
const axisTime = t => new Intl.DateTimeFormat('en-US', { timeZone: timeZone(teams[0]), hour: 'numeric', minute: '2-digit', ...(state.domain.end - state.domain.start > 86400 ? { month: 'short', day: 'numeric' } : {}) }).format(new Date(t * 1000));
function timeZone(entry) {
  return haversine(entry.track.points[0], { lat: 35.058752, lon: -85.307859 }) < 30000 ? 'America/New_York' : Intl.DateTimeFormat().resolvedOptions().timeZone;
}
function clockText(entry, t, date = false) {
  return new Intl.DateTimeFormat('en-US', { timeZone: timeZone(entry), ...(date ? { month: 'short', day: 'numeric' } : {}), hour: 'numeric', minute: '2-digit', second: '2-digit', timeZoneName: 'short' }).format(new Date(entry.track.epoch + t * 1000));
}
function report(message) { $('load-error').textContent = message; $('load-error').hidden = false; }
function keyFor(xml) {
  let hash = 2166136261;
  for (let i = 0; i < xml.length; i++) hash = Math.imul(hash ^ xml.charCodeAt(i), 16777619);
  return 'cpc:comparison:' + (hash >>> 0).toString(16) + '-' + xml.length;
}
function save(entry) {
  try {
    if (entry) localStorage.setItem(entry.key, JSON.stringify({ start: entry.start, end: entry.end, name: entry.name }));
    localStorage.setItem('cpc:preferences', JSON.stringify({ unit: state.unit, rate: state.rate }));
  } catch { /* A disabled browser store must not interrupt replay. */ }
}
function loadEntry(xml, index, filename, bundled = false) {
  // Garmin smart recording regularly samples at 6–11 seconds; those are not missing observations.
  const track = parseGPX(xml, { gapThreshold: 15 });
  const key = keyFor(xml), entry = teams[index];
  let start = 0, end = track.duration, name = entry.name;
  try {
    const saved = JSON.parse(localStorage.getItem(key) || '{}');
    if (Number.isFinite(saved.start) && Number.isFinite(saved.end) && saved.start >= 0 && saved.end <= end && saved.end - saved.start >= 5) { start = saved.start; end = saved.end; }
    if (typeof saved.name === 'string' && saved.name.trim()) name = saved.name.slice(0, 60);
  } catch {}
  Object.assign(entry, { track, start, end, name, key, filename, bundled });
}
function refresh() {
  setPlaying(false);
  state.domain = comparisonDomain(teams); state.time = state.domain.start;
  $('comparison-subtitle').textContent = teams.every(e => e.bundled) ? 'Chattajack 2026 · Charleston Paddle Club · October 24, 2026' : 'Compare two GPX recordings · adjust each team’s race window';
  $('units').value = state.unit; $('rate').value = String(state.rate);
  $('sync-explanation').textContent = 'Both tracks follow their original GPS timestamps. Times are shown in ' + timeZone(teams[0]) + '.';
  $('difference-note').textContent = 'At the same clock time · along each team’s own track';
  $('seek').min = state.domain.start; $('seek').max = state.domain.end;
  $('remaining-label').textContent = axisTime(state.domain.end);
  teams.forEach((entry, i) => {
    const stats = segmentStats(entry.track, entry.start, entry.end);
    $('team-name-' + i).value = entry.name;
    $('team-distance-' + i).textContent = distanceText(stats.distance);
    $('team-duration-' + i).textContent = formatDuration(stats.duration);
    $('team-average-' + i).textContent = speedText(stats.speed);
    $('file-info-' + i).textContent = entry.filename + ' · ' + entry.track.points.length.toLocaleString() + ' fixes · ' + clockText(entry, 0, true);
    const trimmed = entry.start > 0 || entry.end < entry.track.duration;
    $('window-label-' + i).textContent = trimmed ? clockText(entry, entry.start) + ' – ' + clockText(entry, entry.end) : 'Full recording · includes extra paddling';
    $('window-button-' + i).textContent = trimmed ? 'Edit race window' : 'Set race window';
    $('live-name-' + i).textContent = entry.name;
    $(i ? 'legend-women' : 'legend-men').textContent = entry.name;
    $(i ? 'women-column' : 'men-column').textContent = entry.name;
  });
  $('speed-caption').textContent = 'Both teams · ' + unitSpeed() + ' · 30-second smoothing · blue solid / red dashed';
  drawRoutes(); renderSplits(); renderCharts(); updatePlayhead(); fitMap();
}
function initializeMap() {
  if (!window.L) { $('map-notice').hidden = false; $('map-notice').textContent = 'The map library is unavailable. Charts and splits still work.'; return; }
  map = L.map('map', { zoomControl: false, preferCanvas: true, scrollWheelZoom: true, zoomSnap: .25 });
  L.control.zoom({ position: 'bottomleft' }).addTo(map);
  let tileErrors = 0;
  const tiles = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors', crossOrigin: true }).addTo(map);
  tiles.on('tileerror', () => { if (++tileErrors >= 3) { $('map-notice').hidden = false; $('map-notice').textContent = 'The basemap is unavailable. Both GPS routes, charts, and replay still work.'; } });
  tiles.on('tileload', () => { tileErrors = 0; $('map-notice').hidden = true; });
  routes = L.layerGroup().addTo(map);
  markers = teams.map(entry => L.marker([0, 0], { icon: L.divIcon({ className: 'palmetto-marker', iconSize: [MARKER_SIZE, MARKER_SIZE], iconAnchor: [MARKER_SIZE / 2, MARKER_SIZE / 2], html: '<span class="marker-tether" aria-hidden="true"></span>' + palmettoMarkup(entry.color) }), keyboard: false, zIndexOffset: 1000 }).addTo(map));
  map.on('zoomend', separateMarkers);
  map.on('dragstart', () => { state.follow = false; $('follow').checked = false; });
}
function routeSegments(entry) {
  const points = [sample(entry.track, entry.start), ...entry.track.points.filter(p => p.t > entry.start && p.t < entry.end), sample(entry.track, entry.end)];
  const segments = []; let line = [], previous = null;
  for (const point of points) {
    // Original segment identities are looked up for interpolated endpoints too.
    const disconnected = previous && (point.t - previous.t > 30 || entry.track.gaps.some(g => g.disconnected && g.start < point.t && g.end > previous.t));
    if (disconnected) { if (line.length) segments.push(line); line = []; }
    line.push([point.lat, point.lon]); previous = point;
  }
  if (line.length) segments.push(line);
  return segments;
}
function drawRoutes() {
  if (!map) return;
  routes.clearLayers();
  teams.forEach((entry, i) => {
    L.polyline(routeSegments(entry), { color: entry.color, weight: i ? 4 : 5, opacity: .83, dashArray: i ? '8 6' : null, lineCap: 'round' }).on('click', event => {
      let best = null, nearest = Infinity;
      for (const point of entry.track.points) {
        if (point.t < entry.start || point.t > entry.end) continue;
        const d = haversine(point, { lat: event.latlng.lat, lon: event.latlng.lng });
        if (d < nearest) { nearest = d; best = point; }
      }
      if (best) { setPlaying(false); seek(comparisonCoordinate(entry, best.t)); }
      L.DomEvent.stopPropagation(event);
    }).addTo(routes);
    const end = sample(entry.track, entry.end);
    L.circleMarker([end.lat, end.lon], { radius: 4, color: '#fff', weight: 1.5, fillColor: entry.color, fillOpacity: 1, interactive: false }).addTo(routes);
    markers[i].options.title = entry.name + ' · palmetto replay position';
    const element = markers[i].getElement(); if (element) element.title = markers[i].options.title;
  });
}
function fitMap() {
  if (!map) return;
  const points = teams.flatMap(entry => routeSegments(entry).flat());
  if (points.length) { map.invalidateSize(); map.fitBounds(L.latLngBounds(points), { paddingTopLeft: [30, 110], paddingBottomRight: [30, 65], maxZoom: 15, animate: false }); }
}
function separateMarkers() {
  if (!map || markers.length !== 2 || !markers.every(m => m.getElement())) return;
  const points = markers.map(m => map.latLngToLayerPoint(m.getLatLng()));
  const close = points[0].distanceTo(points[1]) < MARKER_SIZE + 4;
  markers.forEach((marker, i) => {
    const offset = close ? (i ? 17 : -17) : 0;
    const element = marker.getElement(), shape = element.querySelector('.palmetto-shape'), tether = element.querySelector('.marker-tether');
    shape.style.transform = 'translateX(' + offset + 'px)';
    tether.style.display = close ? 'block' : 'none'; tether.style.width = Math.abs(offset) + 'px';
    tether.style.left = (MARKER_SIZE / 2 + Math.min(0, offset)) + 'px'; tether.style.background = teams[i].color;
  });
}
function setPlaying(playing) {
  state.playing = playing; cancelAnimationFrame(frame); lastFrame = 0;
  $('play-symbol').textContent = playing ? 'Ⅱ' : '▶'; $('play-label').textContent = playing ? 'Pause' : 'Play';
  $('play').setAttribute('aria-label', playing ? 'Pause comparison' : 'Play comparison');
  if (playing) frame = requestAnimationFrame(tick);
}
function tick(timestamp) {
  if (!state.playing) return;
  if (lastFrame) {
    state.time += Math.min((timestamp - lastFrame) / 1000, .2) * state.rate;
    if (state.time >= state.domain.end) {
      if (state.loop) state.time = state.domain.start + (state.time - state.domain.start) % (state.domain.end - state.domain.start);
      else { state.time = state.domain.end; updatePlayhead(); setPlaying(false); return; }
    }
  }
  lastFrame = timestamp;
  if (timestamp - lastDraw > 85) { updatePlayhead(); lastDraw = timestamp; }
  frame = requestAnimationFrame(tick);
}
function seek(value) { state.time = clamp(Number(value), state.domain.start, state.domain.end); lastFrame = 0; updatePlayhead(); }
function updatePlayhead() {
  if (!teams.every(entry => entry.track)) return;
  const snapshots = teams.map(snapshot);
  const shared = clockText(teams[0], state.time - teams[0].track.epoch / 1000, true);
  $('playhead-time').textContent = clockText(teams[0], state.time - teams[0].track.epoch / 1000); $('shared-time').textContent = shared;
  $('seek').value = state.time; $('seek').setAttribute('aria-valuetext', shared);
  snapshots.forEach((current, i) => {
    $('live-speed-' + i).textContent = speedText(current.speed);
    $('live-distance-' + i).textContent = distanceText(current.distance);
    $('live-status-' + i).textContent = current.status === 'waiting' ? 'Waiting for selected start' : current.status === 'complete' ? 'Selected window complete' : current.point.gap ? 'GPS gap · last position held' : 'Replaying';
    markers[i]?.setLatLng([current.point.lat, current.point.lon]);
    const active = current.status === 'waiting' ? -1 : activeSplitIndex(teamSplits[i], current.time, CLOCK_TOLERANCE);
    if (active !== currentSplits[i]) {
      const old = document.querySelector('[data-team="' + i + '"][data-row="' + currentSplits[i] + '"]');
      if (old) { old.classList.remove(i ? 'current-women' : 'current-men'); old.querySelector('button')?.removeAttribute('aria-current'); old.querySelector('.current-label')?.remove(); }
      const cell = document.querySelector('[data-team="' + i + '"][data-row="' + active + '"]');
      if (cell) {
        cell.classList.add(i ? 'current-women' : 'current-men'); cell.querySelector('button').setAttribute('aria-current', 'step');
        const label = document.createElement('span'); label.className = 'current-label'; label.textContent = 'Current'; cell.prepend(label);
        if (i === 0 && matchMedia('(min-width:901px)').matches) {
          const scroller = document.querySelector('.comparison-table-scroll'), a = cell.getBoundingClientRect(), b = scroller.getBoundingClientRect();
          if (a.top < b.top + 42) scroller.scrollTop -= b.top + 42 - a.top;
          else if (a.bottom > b.bottom) scroller.scrollTop += a.bottom - b.bottom;
        }
      }
      currentSplits[i] = active;
    }
  });
  separateMarkers();
  const diff = snapshots[1].distance - snapshots[0].distance;
  $('distance-difference').textContent = snapshots.some(s => s.status === 'waiting') ? 'Waiting for both starts' : Math.abs(diff) < 1 ? 'Even distance' : (diff > 0 ? teams[1].name : teams[0].name) + ' + ' + distanceText(Math.abs(diff));
  if (map && state.follow) {
    const points = snapshots.map(s => [s.point.lat, s.point.lon]);
    if (points.some(p => !map.getBounds().pad(-.2).contains(p))) map.fitBounds(L.latLngBounds(points), { paddingTopLeft: [45, 120], paddingBottomRight: [45, 65], maxZoom: 14, animate: false });
  }
  for (const kind of ['speed', 'distance']) {
    const geometry = chartGeometry[kind]; if (!geometry) continue;
    const x = geometry.x(state.time), playhead = $(kind + '-playhead');
    playhead.setAttribute('x1', x); playhead.setAttribute('x2', x);
    snapshots.forEach((s, i) => {
      const dot = $(kind + '-dot-' + i), value = kind === 'speed' ? (s.speed == null ? null : speedValue(s.speed, state.unit)) : distanceValue(s.distance, state.unit);
      dot.style.display = s.status === 'waiting' || value == null || (kind === 'speed' && s.status === 'complete') ? 'none' : '';
      if (value != null) { dot.setAttribute('cx', x); dot.setAttribute('cy', geometry.y(value)); }
    });
  }
}
function renderSplits() {
  const size = state.unit === 'mi' ? MILE : 1000;
  teamSplits = teams.map(e => splits(e.track, e.start, e.end, size));
  rows = comparisonSplits(teams, size); currentSplits = [-1, -1];
  const body = $('comparison-splits-body'); body.replaceChildren();
  rows.forEach((row, index) => {
    const tr = document.createElement('tr'), title = document.createElement('th'); title.scope = 'row';
    title.textContent = (state.unit === 'mi' ? 'Mile ' : 'Km ') + row.n; tr.append(title);
    [row.men, row.women].forEach((part, i) => {
      const td = document.createElement('td'); td.dataset.team = i; td.dataset.row = index;
      if (part) {
        const button = document.createElement('button'); button.textContent = formatDuration(part.duration);
        button.setAttribute('aria-label', 'Seek ' + teams[i].name + ' ' + (state.unit === 'mi' ? 'mile ' : 'kilometer ') + row.n);
        button.addEventListener('click', () => { setPlaying(false); seek(comparisonCoordinate(teams[i], part.start)); });
        const avg = document.createElement('small'); avg.textContent = speedText(part.speed); td.append(button, avg);
        if (part.partial) { const label = document.createElement('span'); label.className = 'partial-label'; label.textContent = distanceText(part.distance) + ' partial'; td.append(label); }
      } else td.textContent = '—';
      tr.append(td);
    });
    const delta = document.createElement('td'); delta.textContent = row.delta == null ? '—' : Math.abs(row.delta) < .5 ? '0:00' : (row.delta > 0 ? '+' : '−') + formatDuration(Math.abs(row.delta));
    tr.append(delta); body.append(tr);
  });
}
function renderCharts() {
  if (!teams.every(e => e.track)) return;
  for (const kind of ['speed', 'distance']) {
    const svg = $('compare-' + kind + '-chart'), width = Math.max(260, svg.getBoundingClientRect().width), height = 185;
    const left = 40, right = 14, top = 12, bottom = 30;
    const series = teams.map(e => {
      const values = [], step = Math.max(15, (e.end - e.start) / 650);
      for (let t = e.start; t < e.end; t += step) values.push(chartPoint(e, t, kind));
      values.push(chartPoint(e, e.end, kind)); return values;
    });
    const max = Math.max(kind === 'speed' ? 1 : .1, ...series.flat().map(p => p.value ?? 0)) * 1.1;
    const x = t => left + (t - state.domain.start) / (state.domain.end - state.domain.start) * (width - left - right);
    const y = value => height - bottom - value / max * (height - top - bottom);
    chartGeometry[kind] = { x, y, width, left, right };
    let markup = '<title>' + (kind === 'speed' ? 'Smoothed ground speed in ' + unitSpeed() : 'Distance in ' + state.unit) + ' for both teams. Use the shared slider to explore.</title>';
    for (let i = 0; i <= 3; i++) {
      const v = max * i / 3, yy = y(v);
      markup += '<line x1="' + left + '" x2="' + (width - right) + '" y1="' + yy + '" y2="' + yy + '" stroke="#e2eaf4"/><text x="' + (left - 7) + '" y="' + (yy + 3) + '" text-anchor="end" fill="#73839a" font-size="9">' + v.toFixed(kind === 'speed' ? 1 : 0) + '</text>';
    }
    for (let i = 0; i <= 2; i++) {
      const t = state.domain.start + (state.domain.end - state.domain.start) * i / 2;
      markup += '<text x="' + x(t) + '" y="' + (height - 8) + '" text-anchor="' + (i === 0 ? 'start' : i === 2 ? 'end' : 'middle') + '" fill="#73839a" font-size="9">' + axisTime(t) + '</text>';
    }
    series.forEach((values, i) => {
      let path = '', drawing = false, previous = null;
      for (const p of values) {
        if (p.value == null) { drawing = false; previous = p; continue; }
        if (kind === 'speed' && previous && teams[i].track.gaps.some(g => comparisonCoordinate(teams[i], g.start) < p.time && comparisonCoordinate(teams[i], g.end) > previous.time)) drawing = false;
        path += (drawing ? 'L' : 'M') + x(p.time).toFixed(2) + ',' + y(p.value).toFixed(2); drawing = true; previous = p;
      }
      markup += '<path d="' + path + '" fill="none" stroke="' + teams[i].color + '" stroke-width="2.4"' + (i ? ' stroke-dasharray="7 4"' : '') + ' stroke-linejoin="round"/>';
    });
    markup += '<line id="' + kind + '-playhead" x1="' + left + '" x2="' + left + '" y1="' + top + '" y2="' + (height - bottom) + '" stroke="#6e8199" stroke-dasharray="3 3"/>';
    teams.forEach((e, i) => { markup += '<circle id="' + kind + '-dot-' + i + '" r="4" fill="' + e.color + '" stroke="white" stroke-width="1.5"/>'; });
    svg.setAttribute('viewBox', '0 0 ' + width + ' ' + height); svg.innerHTML = markup;
  }
}
function chartPoint(entry, t, kind) {
  const value = kind === 'speed' ? speedAt(entry.track, t, 30, entry.start, entry.end) : sample(entry.track, t).d - sample(entry.track, entry.start).d;
  return { time: comparisonCoordinate(entry, t), value: value == null ? null : kind === 'speed' ? speedValue(value, state.unit) : distanceValue(value, state.unit) };
}
function chartSeek(event, kind) {
  const svg = $('compare-' + kind + '-chart'), rect = svg.getBoundingClientRect(), g = chartGeometry[kind];
  const fraction = clamp(((event.clientX - rect.left) / rect.width * g.width - g.left) / (g.width - g.left - g.right), 0, 1);
  seek(state.domain.start + fraction * (state.domain.end - state.domain.start));
}
function openWindow(index) {
  setPlaying(false); windowTeam = index; const entry = teams[index];
  $('window-team-name').textContent = entry.name;
  for (const kind of ['start', 'end']) { $('trim-' + kind).max = entry.track.duration; $('trim-' + kind).value = entry[kind]; }
  $('trim-error').hidden = true; updateTrimLabels(); $('window-dialog').showModal();
}
function updateTrimLabels() {
  const entry = teams[windowTeam];
  for (const kind of ['start', 'end']) { const value = Number($('trim-' + kind).value); $('trim-' + kind + '-label').textContent = clockText(entry, value); $('trim-' + kind).setAttribute('aria-valuetext', clockText(entry, value)); }
}
$('play').addEventListener('click', () => { if (state.time >= state.domain.end) seek(state.domain.start); setPlaying(!state.playing); });
$('back').addEventListener('click', () => seek(state.time - 10)); $('forward').addEventListener('click', () => seek(state.time + 10));
$('seek').addEventListener('input', event => seek(event.target.value));
$('rate').addEventListener('change', event => { state.rate = Number(event.target.value); save(); });
$('units').addEventListener('change', event => { const time = state.time; state.unit = event.target.value; save(); refresh(); seek(time); });
$('loop').addEventListener('click', () => { state.loop = !state.loop; $('loop').setAttribute('aria-pressed', String(state.loop)); });
$('fit-map').addEventListener('click', () => { state.follow = false; $('follow').checked = false; fitMap(); });
$('follow').addEventListener('change', event => { state.follow = event.target.checked; updatePlayhead(); });
for (let i = 0; i < 2; i++) {
  $('window-button-' + i).addEventListener('click', () => openWindow(i));
  $('team-name-' + i).addEventListener('change', event => { teams[i].name = event.target.value.trim().slice(0, 60) || (i ? 'Women’s team' : 'Men’s team'); save(teams[i]); const time = state.time; refresh(); seek(time); });
  $('file-' + i).addEventListener('change', async event => {
    const file = event.target.files[0]; if (!file) return;
    const generation = ++teams[i].generation; setPlaying(false);
    try {
      if (file.size > 25 * 1024 * 1024) throw new Error('Choose a GPX smaller than 25 MB.');
      const xml = await file.text(); if (generation !== teams[i].generation) return;
      loadEntry(xml, i, file.name); $('load-error').hidden = true; refresh();
    } catch (error) { report(error.message + ' The previous tracks are unchanged.'); }
    finally { event.target.value = ''; }
  });
}
for (const kind of ['start', 'end']) {
  $('trim-' + kind).addEventListener('input', updateTrimLabels);
  $(kind + '-at-playhead').addEventListener('click', () => { $('trim-' + kind).value = snapshot(teams[windowTeam]).time; updateTrimLabels(); });
}
$('window-form').addEventListener('submit', event => {
  event.preventDefault(); const start = Number($('trim-start').value), end = Number($('trim-end').value), entry = teams[windowTeam];
  if (end - start < 5 || start < 0 || end > entry.track.duration) { $('trim-error').textContent = 'Choose a finish at least five seconds after the start.'; $('trim-error').hidden = false; return; }
  entry.start = start; entry.end = end; save(entry); refresh(); $('window-dialog').close();
});
$('reset-window').addEventListener('click', () => { const entry = teams[windowTeam]; entry.start = 0; entry.end = entry.track.duration; save(entry); refresh(); $('window-dialog').close(); });
document.querySelectorAll('[data-close]').forEach(button => button.addEventListener('click', () => $(button.dataset.close).close()));
for (const id of ['help-button', 'footer-help']) $(id).addEventListener('click', () => { setPlaying(false); $('help-dialog').showModal(); });
for (const kind of ['speed', 'distance']) {
  const svg = $('compare-' + kind + '-chart');
  svg.addEventListener('pointerdown', event => { if (event.button !== 0 || !chartGeometry[kind]) return; setPlaying(false); chartDrag = { id: event.pointerId, kind }; svg.setPointerCapture(event.pointerId); chartSeek(event, kind); });
  svg.addEventListener('pointermove', event => { if (chartDrag?.id === event.pointerId && chartDrag.kind === kind) chartSeek(event, kind); });
  for (const event of ['pointerup', 'pointercancel']) svg.addEventListener(event, () => { chartDrag = null; });
}
document.addEventListener('keydown', event => {
  if (!teams.every(e => e.track) || event.ctrlKey || event.altKey || event.metaKey || event.target.closest('input,select,button,a,textarea') || event.target.isContentEditable || document.querySelector('dialog[open]')) return;
  if (event.code === 'Space') { event.preventDefault(); $('play').click(); }
  if (event.key === 'ArrowLeft') { event.preventDefault(); seek(state.time - 10); }
  if (event.key === 'ArrowRight') { event.preventDefault(); seek(state.time + 10); }
  if (event.key === 'Home') { event.preventDefault(); seek(state.domain.start); }
  if (event.key === 'End') { event.preventDefault(); seek(state.domain.end); }
});
document.addEventListener('visibilitychange', () => { if (document.hidden) setPlaying(false); });
new ResizeObserver(() => { if (teams.every(e => e.track)) { map?.invalidateSize(); renderCharts(); updatePlayhead(); } }).observe($('compare-speed-chart'));
function bootComparison() {
  try {
    const prefs = JSON.parse(localStorage.getItem('cpc:preferences') || '{}');
    if (['mi', 'km'].includes(prefs.unit)) state.unit = prefs.unit;
    if ([1, 10, 30, 60, 120, 300].includes(prefs.rate)) state.rate = prefs.rate;
  } catch {}
  try {
    loadEntry(embeddedComparison.men, 0, 'Paddle Logger · Chattajack 2026', true);
    loadEntry(embeddedComparison.women, 1, 'Garmin · Chattajack 2026', true);
    initializeMap(); refresh(); $('play').disabled = false; $('loading').hidden = true; window.CPCStartup?.ready();
  } catch (error) { $('loading').hidden = true; report('Could not load the comparison: ' + error.message); window.CPCStartup?.fail(error.message); }
}
bootComparison();
