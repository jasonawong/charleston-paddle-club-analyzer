// Pure track calculations shared by the interface and the tests. Distances are meters.
export const MILE = 1609.344;
export const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
export function haversine(a, b) {
  const rad = Math.PI / 180;
  const h = Math.sin((b.lat - a.lat) * rad / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin((b.lon - a.lon) * rad / 2) ** 2;
  return 6371008.8 * 2 * Math.asin(Math.min(1, Math.sqrt(h)));
}
export function lowerBound(points, value, key = 't') {
  let lo = 0, hi = points.length;
  while (lo < hi) { const mid = (lo + hi) >>> 1; if (points[mid][key] < value) lo = mid + 1; else hi = mid; }
  return lo;
}
export function prepareTrack(raw, name = 'Your paddle', { gapThreshold = 5 } = {}) {
  let invalid = 0, duplicates = 0, outOfOrder = 0;
  const points = [];
  for (const p of raw) {
    if (![p.lat, p.lon, p.time].every(Number.isFinite) || Math.abs(p.lat) > 90 || Math.abs(p.lon) > 180) { invalid++; continue; }
    const previous = points.at(-1);
    if (previous && p.time < previous.time) { outOfOrder++; continue; }
    if (previous && p.time === previous.time) {
      // Merge simultaneous fixes: never divide by zero or invent extra elapsed time.
      const n = previous.count || 1;
      previous.lat = (previous.lat * n + p.lat) / (n + 1);
      previous.lon = (previous.lon * n + p.lon) / (n + 1);
      previous.count = n + 1; duplicates++; continue;
    }
    points.push({ ...p });
  }
  if (points.length < 3) throw new Error('This GPX needs at least three valid, timed track points.');
  const epoch = points[0].time;
  let distance = 0;
  const gaps = [];
  points.forEach((p, i) => {
    p.t = (p.time - epoch) / 1000;
    if (i) {
      const prev = points[i - 1], dt = p.t - prev.t;
      const disconnected = p.segment !== prev.segment || dt > 30;
      if (!disconnected) distance += haversine(prev, p);
      if (dt > gapThreshold || disconnected) gaps.push({ start: prev.t, end: p.t, disconnected });
    }
    p.d = distance;
  });
  const duration = points.at(-1).t;
  if (duration < 5 || distance < 10) throw new Error('This recording is too short to analyze (at least 5 seconds and 10 meters required).');
  return { name, points, epoch, duration, distance, gaps, gapThreshold, quality: { invalid, duplicates, outOfOrder } };
}
export function sample(track, t) {
  t = clamp(t, 0, track.duration);
  const i = Math.min(track.points.length - 1, lowerBound(track.points, t));
  const b = track.points[i], a = track.points[Math.max(0, i - 1)];
  const gap = b.t - a.t > (track.gapThreshold ?? 5) || b.segment !== a.segment;
  const f = b.t === a.t ? 0 : (t - a.t) / (b.t - a.t);
  // During missing GPS observations, hold the last fix rather than animate an invented path.
  const posF = gap && t < b.t ? 0 : f;
  return { t, d: a.d + (b.d - a.d) * f, lat: a.lat + (b.lat - a.lat) * posF, lon: a.lon + (b.lon - a.lon) * posF, gap: gap && t > a.t && t < b.t };
}
export function speedAt(track, t, seconds = 30, start = 0, end = track.duration) {
  const a = Math.max(start, t - seconds / 2), b = Math.min(end, t + seconds / 2);
  if (b - a < 2 || track.gaps.some(g => g.start < b && g.end > a)) return null;
  return Math.max(0, (sample(track, b).d - sample(track, a).d) / (b - a));
}
export function timeAtDistance(track, d) {
  d = clamp(d, 0, track.distance);
  const i = Math.min(track.points.length - 1, lowerBound(track.points, d, 'd'));
  const b = track.points[i], a = track.points[Math.max(0, i - 1)];
  return b.d === a.d ? a.t : a.t + (b.t - a.t) * (d - a.d) / (b.d - a.d);
}
export function segmentStats(track, start, end) {
  const distance = sample(track, end).d - sample(track, start).d;
  return { start, end, distance, duration: end - start, speed: end > start ? distance / (end - start) : 0 };
}
export function splits(track, start, end, size = MILE) {
  const origin = sample(track, start).d, total = sample(track, end).d - origin, result = [];
  for (let d = 0, n = 1; d < total - 0.01; d += size, n++) {
    const finish = Math.min(d + size, total);
    const a = d === 0 ? start : timeAtDistance(track, origin + d);
    const b = finish === total ? end : timeAtDistance(track, origin + finish);
    result.push({ ...segmentStats(track, a, b), n, partial: finish - d < size - 1 });
  }
  return result;
}
// Split intervals are half-open: an exact boundary belongs to the next split.
// At the recording finish, keep the final (possibly partial) split highlighted.
export function activeSplitIndex(rows, time) {
  if (!rows.length || !Number.isFinite(time) || time < rows[0].start || time > rows.at(-1).end) return -1;
  let lo = 0, hi = rows.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (time >= rows[mid].end) lo = mid + 1;
    else hi = mid;
  }
  return Math.min(lo, rows.length - 1);
}
export function formatDuration(seconds) {
  seconds = Math.max(0, Math.round(seconds));
  const h = Math.floor(seconds / 3600), m = Math.floor(seconds % 3600 / 60), s = seconds % 60;
  return (h ? h + ':' + String(m).padStart(2, '0') : String(m)) + ':' + String(s).padStart(2, '0');
}
export function distanceValue(meters, unit) { return meters / (unit === 'mi' ? MILE : 1000); }
export function speedValue(mps, unit) { return mps * (unit === 'mi' ? 2.236936292 : 3.6); }
