import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { MILE, haversine, prepareTrack, sample, speedAt, timeAtDistance, segmentStats, splits, buildInsights, formatDuration } from '../model.js';

const epoch = Date.parse('2026-10-24T12:00:00Z');
const point = (t, lon = t / 100000, segment = 0) => ({ lat: 35, lon, time: epoch + t * 1000, segment });
const uniformTrack = () => prepareTrack(Array.from({ length: 601 }, (_, i) => point(i, i / 50000)));
test('simultaneous fixes merge; invalid and out-of-order fixes cannot produce infinite speed', () => {
  const track = prepareTrack([point(0), point(1), point(1, .00002), point(.5), { ...point(2), lat: NaN }, point(10), point(20)]);
  assert.equal(track.quality.duplicates, 1);
  assert.equal(track.quality.outOfOrder, 1);
  assert.equal(track.quality.invalid, 1);
  assert.ok(track.points.every((p, i, a) => i === 0 || p.t > a[i - 1].t));
  assert.ok(Math.abs(track.points[1].lon - .000015) < 1e-12);
});
test('missing timestamps and insufficient recordings fail clearly', () => {
  assert.throws(() => prepareTrack([point(0), { ...point(2), time: NaN }]), /three valid/);
  assert.throws(() => prepareTrack([point(0), point(1), point(2)]), /too short/);
});
test('time and distance interpolation agree and trimmed totals exclude the edges', () => {
  const track = uniformTrack(), stat = segmentStats(track, 60, 540);
  assert.equal(stat.duration, 480);
  assert.ok(Math.abs(stat.distance / track.distance - .8) < 1e-6);
  assert.ok(Math.abs(timeAtDistance(track, sample(track, 123.4).d) - 123.4) < 1e-7);
  assert.equal(sample(track, -100).t, 0);
  assert.equal(sample(track, 9999).t, 600);
  assert.ok(Number.isFinite(speedAt(track, 0)));
});
test('a GPS gap holds the last position and has no reported speed', () => {
  const track = prepareTrack([point(0), point(1), point(2), point(20), point(21), point(30), point(40)]);
  const atGap = sample(track, 10);
  assert.equal(atGap.gap, true);
  assert.equal(atGap.lon, track.points[2].lon);
  assert.equal(speedAt(track, 10), null);
});
test('separate segments do not add a fictitious jump to distance', () => {
  const track = prepareTrack([point(0, 0), point(10, .0001), point(20, 10, 1), point(30, 10.0001, 1)]);
  const expected = haversine(track.points[0], track.points[1]) + haversine(track.points[2], track.points[3]);
  assert.ok(Math.abs(track.distance - expected) < 1e-6);
  assert.equal(speedAt(track, 20), null);
});
test('splits are rebased to the chosen race start, include a final partial, and sum to the selected duration', () => {
  const track = uniformTrack(), rows = splits(track, 30, 570, 100);
  assert.equal(rows[0].start, 30);
  assert.equal(rows.at(-1).end, 570);
  assert.equal(rows.at(-1).partial, true);
  assert.ok(Math.abs(rows.reduce((a, s) => a + s.duration, 0) - 540) < 1e-6);
  assert.ok(Math.abs(rows.reduce((a, s) => a + s.distance, 0) - segmentStats(track, 30, 570).distance) < 1e-6);
});
test('coaching uses the selected boundaries and does not fabricate a fatigue diagnosis', () => {
  const track = uniformTrack(), insights = buildInsights(track, 30, 570);
  assert.ok(insights.length > 0);
  assert.ok(Math.abs(insights[0].change) < .01);
  for (const insight of insights) for (const s of insight.sections) { assert.ok(s.start >= 30); assert.ok(s.end <= 570); }
  assert.match(insights[0].caveat, /does not establish fatigue/);
  assert.deepEqual(buildInsights(track, 0, 60), []);
});
test('bundled Chattajack regression: point counts, duration, distance, and staging-aware splits', () => {
  const xml = readFileSync(new URL('../assets/pl-2026-10-24.gpx', import.meta.url), 'utf8');
  const raw = [...xml.matchAll(/<trkpt lat="([^"]+)" lon="([^"]+)"><ele>[^<]+<\/ele><time>([^<]+)<\/time><\/trkpt>/g)].map(m => ({ lat: Number(m[1]), lon: Number(m[2]), time: Date.parse(m[3]), segment: 0 }));
  const track = prepareTrack(raw);
  assert.equal(raw.length, 15983);
  assert.equal(track.quality.duplicates, 11);
  assert.equal(track.duration, 16081.001);
  assert.ok(Math.abs(track.distance / 1000 - 51.4723) < .02);
  const rows = splits(track, 180, track.duration - 180, MILE);
  assert.equal(rows[0].start, 180);
  const insights = buildInsights(track, 180, track.duration - 180);
  assert.ok(insights[0].change < 0);
  assert.ok(insights.every(i => i.sections.every(s => s.start >= 180 && s.end <= track.duration - 180)));
});
test('duration labels round across minute boundaries', () => {
  assert.equal(formatDuration(59.9), '1:00');
  assert.equal(formatDuration(3600), '1:00:00');
});
test('coaching withholds pacing comparisons that cross missing GPS coverage', () => {
  const track = uniformTrack();
  const early = { start: 100, end: 200, disconnected: false };
  track.gaps.push(early);
  const insights = buildInsights(track, 0, 600);
  assert.ok(!insights.some(i => i.id === 'pace'));
  for (const insight of insights) for (const s of insight.sections) assert.ok(!(s.start < early.end && s.end > early.start));
});
