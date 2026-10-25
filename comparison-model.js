import { clamp, sample, speedAt, splits } from './model.js';

// The clock axis uses UTC seconds; the elapsed axis starts at each selected window.
export function comparisonDomain(entries, mode = 'elapsed') {
  if (mode === 'clock') return {
    start: Math.min(...entries.map(e => e.track.epoch / 1000 + e.start)),
    end: Math.max(...entries.map(e => e.track.epoch / 1000 + e.end))
  };
  return { start: 0, end: Math.max(...entries.map(e => e.end - e.start)) };
}
export function comparisonCoordinate(entry, trackTime, mode = 'elapsed') {
  return mode === 'clock' ? entry.track.epoch / 1000 + trackTime : trackTime - entry.start;
}
export function comparisonSnapshot(entry, coordinate, mode = 'elapsed') {
  const rawTime = mode === 'clock' ? coordinate - entry.track.epoch / 1000 : entry.start + coordinate;
  const time = clamp(rawTime, entry.start, entry.end);
  const point = sample(entry.track, time);
  const status = rawTime < entry.start ? 'waiting' : rawTime >= entry.end ? 'complete' : 'active';
  return { point, time, elapsed: time - entry.start, distance: point.d - sample(entry.track, entry.start).d, status,
    speed: status === 'active' ? speedAt(entry.track, time, 30, entry.start, entry.end) : null };
}
export function comparisonSplits(entries, size) {
  const all = entries.map(e => splits(e.track, e.start, e.end, size));
  return Array.from({ length: Math.max(...all.map(a => a.length)) }, (_, index) => {
    const men = all[0][index] || null, women = all[1][index] || null;
    // Never compare a partial mile with a full mile, or unequal final partials.
    const comparable = !!(men && women && Math.abs(men.distance - women.distance) < 1);
    return { n: index + 1, men, women, comparable, delta: comparable ? women.duration - men.duration : null };
  });
}
