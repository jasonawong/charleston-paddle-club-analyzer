import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const read = name => readFileSync(new URL('../' + name, import.meta.url), 'utf8');
const html = read('index.html');
const bundle = read('app.bundle.js');
const guard = html.match(/<script id="startup-guard">([\s\S]*?)<\/script>/)[1];

function guardHarness(elementsExist = true) {
  const elements = { loading: { hidden: false }, 'load-error': { hidden: true, textContent: '' } };
  const events = {}, documentEvents = {};
  let timeout, cleared = false, available = elementsExist;
  const window = { addEventListener: (name, fn) => { events[name] = fn; } };
  const document = { getElementById: name => available ? elements[name] : null, addEventListener: (name, fn) => { documentEvents[name] = fn; } };
  vm.runInNewContext(guard, { window, document, String, setTimeout: fn => { timeout = fn; return 1; }, clearTimeout: () => { cleared = true; } });
  return { window, elements, events, documentEvents, timeout: () => timeout(), cleared: () => cleared, makeDOMAvailable: () => { available = true; } };
}
test('browser entry is a classic script, not a file-origin-blocked module', () => {
  assert.ok(!html.includes('type="module"'));
  assert.match(html, /src="\.\/app\.bundle\.js(?:\?v=[\d.]+)?" defer/);
  assert.doesNotThrow(() => new vm.Script(bundle));
  assert.ok(!/^import\s|^export\s/m.test(bundle));
});
test('the browser bundle contains the complete race, requiring no GPX fetch', () => {
  const marker = 'const embeddedRace = ';
  const start = bundle.indexOf(marker) + marker.length;
  const payload = JSON.parse(bundle.slice(start, bundle.indexOf(';\n', start)));
  assert.equal(payload.gpx, read('assets/pl-2026-10-24.gpx'));
  assert.match(bundle, /loadTrack\(embeddedRace\.gpx/);
});
test('stalled startup dismisses the loading screen with a recovery message', () => {
  const h = guardHarness(); h.timeout();
  assert.equal(h.elements.loading.hidden, true);
  assert.equal(h.elements['load-error'].hidden, false);
  assert.match(h.elements['load-error'].textContent, /Re-extract/);
});
test('a script startup error is visible even if it precedes DOM parsing', () => {
  const h = guardHarness(false);
  h.events.error({ message: 'Unexpected token' });
  h.makeDOMAvailable(); h.documentEvents.DOMContentLoaded();
  assert.equal(h.elements.loading.hidden, true);
  assert.match(h.elements['load-error'].textContent, /Unexpected token/);
});
test('successful startup clears the watchdog and does not show a later startup failure', () => {
  const h = guardHarness(); h.window.CPCStartup.ready(); h.timeout();
  assert.equal(h.cleared(), true);
  assert.equal(h.elements['load-error'].hidden, true);
});
