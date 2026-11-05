import test from 'node:test';
import assert from 'node:assert/strict';
import { sheepBundles } from '../herd.mjs';
import { pasturePage } from '../herd-view.mjs';
import { initialState, mergeEntries } from '../engine.mjs';

test('count-sized sheep preserve every word across denomination boundaries', () => {
  for (let total = 0; total <= 12000; total++) {
    const bundles = sheepBundles(total);
    assert.equal(
      bundles.reduce((sum, b) => sum + b.value, 0),
      total,
    );
    let offset = 0;
    for (const b of bundles) {
      assert.equal(b.offset, offset);
      offset += b.value;
    }
    assert.ok(bundles.filter((b) => b.value === 1).length < 10);
  }
  assert.deepEqual(
    sheepBundles(3632).map((b) => b.value),
    [500, 500, 500, 500, 500, 500, 500, 100, 10, 10, 10, 1, 1],
  );
  assert.deepEqual(sheepBundles(-1), []);
});

test('both pastures show exact weighted counts without paging or modifying progress', () => {
  const s = initialState();
  mergeEntries(
    s,
    Array.from({ length: 1000 }, (_, i) => ({ english: `word${i}`, meaning: '测试' })),
  );
  s.rounds.typing.outcomes = Object.fromEntries(
    Object.keys(s.entries)
      .slice(0, 632)
      .map((k) => [k, 'correct']),
  );
  const before = JSON.stringify(s),
    html = pasturePage(s, '');
  assert.match(html, /待记草场/);
  assert.doesNotMatch(html, /出发草场|pasture-page|下一页羊群|sheep-value|field-footer/);
  const sides = [...html.matchAll(/<div class="sheep-roam">(.*?)<\/div>/g)].map((m) => m[1]);
  const values = sides.map((side) =>
    [...side.matchAll(/data-value="(\d+)"/g)].reduce((sum, m) => sum + Number(m[1]), 0),
  );
  assert.deepEqual(values, [368, 632]);
  assert.equal(JSON.stringify(s), before);
});
