import { clamp, sample, speedAt, splits } from './model.js';

// UTC seconds lose sub-microsecond precision when converted back to track-relative time.
export const CLOCK_TOLERANCE = 1e-6;

// All comparison coordinates are absolute UTC seconds from the GPX timestamps.
export function comparisonDomain(entries) {
  return {
    start: Math.min(...entries.map(e => e.track.epoch / 1000 + e.start)),
    end: Math.max(...entries.map(e => e.track.epoch / 1000 + e.end))
  };
}
export function comparisonCoordinate(entry, trackTime) {
  return entry.track.epoch / 1000 + trackTime;
}
export function comparisonSnapshot(entry, coordinate) {
  const rawTime = coordinate - entry.track.epoch / 1000;
  const status = rawTime < entry.start - CLOCK_TOLERANCE ? 'waiting' : rawTime >= entry.end - CLOCK_TOLERANCE ? 'complete' : 'active';
  const time = status === 'complete' ? entry.end : clamp(rawTime, entry.start, entry.end);
  const point = sample(entry.track, time);
  return { point, time, distance: point.d - sample(entry.track, entry.start).d, status,
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
