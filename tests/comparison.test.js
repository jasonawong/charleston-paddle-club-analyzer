import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { prepareTrack, sample, speedAt, splits, activeSplitIndex } from '../model.js';
import { CLOCK_TOLERANCE, comparisonDomain, comparisonCoordinate, comparisonSnapshot, comparisonSplits } from '../comparison-model.js';
const read = f => readFileSync(new URL('../' + f, import.meta.url), 'utf8');
function uniform(epoch, duration = 100, increment = .00002) {
  return prepareTrack(Array.from({ length: duration + 1 }, (_, t) => ({ lat: 35, lon: -85 + t * increment, time: epoch + t * 1000, segment: 0 })));
}
const epoch = Date.parse('2026-10-24T12:36:00Z');
const entries = () => [
  { track: uniform(epoch), start: 10, end: 90 },
  { track: uniform(epoch + 31000, 120), start: 20, end: 120 }
];
test('the shared clock domain keeps trimmed recording boundaries at their original UTC times', () => {
  const e = entries();
  assert.deepEqual(comparisonDomain(e), { start: epoch / 1000 + 10, end: epoch / 1000 + 151 });
  const betweenFinishes = epoch / 1000 + 95;
  assert.equal(comparisonSnapshot(e[0], betweenFinishes).status, 'complete');
  assert.equal(comparisonSnapshot(e[0], betweenFinishes).time, 90);
  assert.equal(comparisonSnapshot(e[0], betweenFinishes).speed, null);
  assert.equal(comparisonSnapshot(e[1], betweenFinishes).status, 'active');
  assert.equal(comparisonCoordinate(e[1], 45), epoch / 1000 + 76);
});
test('clock comparison preserves UTC timestamps, waits before the second start, and holds the final position', () => {
  const e = entries(), start = epoch / 1000 + 10;
  assert.deepEqual(comparisonDomain(e), { start, end: epoch / 1000 + 151 });
  const waiting = comparisonSnapshot(e[1], start);
  assert.equal(waiting.status, 'waiting'); assert.equal(waiting.distance, 0); assert.equal(waiting.speed, null);
  const t = comparisonCoordinate(e[1], 20);
  assert.equal(t - start, 41);
  assert.equal(comparisonSnapshot(e[1], t).time, 20);
  assert.equal(comparisonSnapshot(e[0], t).time, 51);
  const done = comparisonSnapshot(e[0], epoch / 1000 + 151);
  assert.equal(done.time, 90); assert.equal(done.point.lon, sample(e[0].track, 90).lon);
});
test('distance is rebased to each selected window without resetting the comparison clock', () => {
  for (const e of entries()) {
    const start = comparisonCoordinate(e, e.start);
    assert.equal(comparisonSnapshot(e, start).distance, 0);
    const x = comparisonCoordinate(e, e.start + 30);
    assert.ok(Math.abs(comparisonSnapshot(e, x).distance - (sample(e.track, e.start + 30).d - sample(e.track, e.start).d)) < 1e-9);
  }
});
test('matched full splits have comparable durations but unequal partial distances do not', () => {
  const e = entries(), rows = comparisonSplits(e, 50);
  assert.equal(rows[0].comparable, true); assert.ok(Math.abs(rows[0].delta) < 1e-5);
  const unequal = rows.find(r => r.men?.partial && r.women && !r.women.partial);
  assert.ok(unequal); assert.equal(unequal.delta, null);
  assert.ok(rows.some(r => !r.men && r.women));
});
test('smart recording intervals produce speed while genuine gaps and segment breaks do not', () => {
  const raw = [0, 7, 14, 21, 28, 35, 60, 67, 74].map(t => ({ lat: 35, lon: -85 + t / 100000, time: epoch + t * 1000, segment: 0 }));
  const smart = prepareTrack(raw, 'Smart recording', { gapThreshold: 15 });
  assert.equal(smart.gaps.length, 1);
  assert.ok(speedAt(smart, 15) > 0); assert.equal(sample(smart, 10).gap, false);
  assert.equal(speedAt(smart, 48), null); assert.equal(sample(smart, 48).gap, true);
  assert.equal(sample(smart, 48).lon, raw[5].lon);
  assert.equal(speedAt(prepareTrack(raw), 15), null); // Existing single-track policy stays intact.
});
test('the women’s bundled recording retains replay coordinates and times with no health extensions', () => {
  const xml = read('assets/cpc-women-chattajack-2026.gpx');
  const raw = [...xml.matchAll(/<trkpt lat="([^"]+)" lon="([^"]+)"><time>([^<]+)<\/time><\/trkpt>/g)].map(m => ({ lat: +m[1], lon: +m[2], time: Date.parse(m[3]), segment: 0 }));
  const track = prepareTrack(raw, 'Women', { gapThreshold: 15 });
  assert.equal(raw.length, 3647); assert.equal(track.duration, 16181);
  assert.ok(Math.abs(track.distance / 1609.344 - 32.17151) < .001);
  assert.equal(track.gaps.length, 0); assert.ok(speedAt(track, 3600) > 0);
  assert.ok(!xml.includes('TrackPointExtension')); assert.ok(!xml.includes('<hr>'));
});
test('the comparison home page is a relative classic-script entry with both complete recordings embedded', () => {
  const html = read('index.html'), bundle = read('head-to-head.bundle.js');
  assert.match(html, /head-to-head\.bundle\.js\?v=[\d.]+" defer/); assert.ok(!html.includes('type="module"'));
  assert.doesNotThrow(() => new vm.Script(bundle)); assert.ok(!/^import |^export /m.test(bundle));
  const marker = 'const embeddedComparison = ', start = bundle.indexOf(marker) + marker.length;
  const payload = JSON.parse(bundle.slice(start, bundle.indexOf(';\n', start)));
  assert.equal(payload.men, read('assets/pl-2026-10-24.gpx'));
  assert.equal(payload.women, read('assets/cpc-women-chattajack-2026.gpx'));
  assert.match(read('index.html'), /href="\.\/race-replay\.html\?v=1\.2\.0"/);
  assert.match(read('race-replay.html'), /href="\.\/index\.html\?v=1\.2\.0"/);
  const workflow = read('.github/workflows/pages.yml');
  assert.match(workflow, /cp .*head-to-head\.html .*head-to-head\.bundle\.js/);
});

test('the comparison page offers only actual clock time and ignores old alignment preferences', () => {
  const html = read('index.html'), source = read('head-to-head.js');
  assert.ok(!html.includes('id="sync-mode"'));
  assert.ok(!html.includes('Elapsed time'));
  assert.ok(!source.includes('cpc:comparison-mode'));
  assert.match(html, /Actual clock time/);
  assert.match(source, /playhead-time/);
});

test('UTC round trips keep the selected split and finish stable with fractional GPS timestamps', () => {
  const entry = { track: uniform(epoch + 56), start: 0, end: 100 };
  const rows = splits(entry.track, entry.start, entry.end, 50);
  rows.forEach((row, index) => {
    const current = comparisonSnapshot(entry, comparisonCoordinate(entry, row.start));
    assert.equal(activeSplitIndex(rows, current.time, CLOCK_TOLERANCE), index);
  });
  const finish = comparisonSnapshot(entry, comparisonCoordinate(entry, entry.end));
  assert.equal(finish.status, 'complete'); assert.equal(finish.time, entry.end);
});
