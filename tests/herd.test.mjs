import test from 'node:test';
import assert from 'node:assert/strict';
import {
  initialState,
  mergeEntries,
  nextQuestion,
  submit,
  skipQuestion,
  blankRound,
} from '../engine.mjs';
import { herdSummary, sheepStatus } from '../herd.mjs';
import { pasturePage, sheepSVG, sheepSeed } from '../herd-view.mjs';
const state = () => {
  const s = initialState();
  mergeEntries(s, [
    { english: 'apply', meaning: 'v. 申请', favorite: true },
    { english: 'ramble', meaning: 'v. 漫步' },
  ]);
  return s;
};
test('visualization is read-only and never creates a separate round or queue', () => {
  const s = state(),
    before = JSON.stringify(s);
  herdSummary(s);
  pasturePage(s, '');
  assert.equal(JSON.stringify(s), before);
  assert.equal(s.pastures, undefined);
  assert.equal(nextQuestion(s, () => 0).key, 'apply');
  const q = s.rounds.typing.current;
  pasturePage(s, '');
  assert.equal(s.rounds.typing.current, q);
});
test('normal answers move sheep only after final outcome, retry then correct counts as caught', () => {
  const s = state();
  nextQuestion(s, () => 0);
  submit(s, 'bad');
  assert.equal(sheepStatus(s, 'apply'), 'free');
  submit(s, 'apply');
  assert.equal(sheepStatus(s, 'apply'), 'caught');
  assert.equal(herdSummary(s).caught.length, 1);
  assert.equal(s.entries.apply.stats.typing.correct, 1);
});
test('two mistakes leave sheep outside and record only one real error', () => {
  const s = state();
  nextQuestion(s, () => 0);
  submit(s, 'bad');
  submit(s, 'bad');
  assert.equal(sheepStatus(s, 'apply'), 'waiting');
  assert.equal(herdSummary(s).caught.length, 0);
  assert.equal(s.entries.apply.stats.typing.wrong, 1);
});
test('the real extra question makes captured sheep escape; completing it brings it back', () => {
  const s = state();
  nextQuestion(s, () => 0);
  submit(s, 'apply');
  s.rounds.typing.current = null;
  nextQuestion(s, () => 0);
  submit(s, 'ramble');
  s.rounds.typing.current = null;
  const q = nextQuestion(s, () => 0);
  assert.equal(q.key, 'apply');
  assert.equal(q.kind, 'extra');
  assert.equal(sheepStatus(s, 'apply'), 'escaped');
  assert.equal(herdSummary(s).caught.length, 1);
  const restored = JSON.parse(JSON.stringify(s));
  assert.equal(sheepStatus(restored, 'apply'), 'escaped');
  submit(restored, 'apply');
  assert.equal(sheepStatus(restored, 'apply'), 'caught');
  assert.equal(restored.rounds.typing.extra.apply, 1);
  assert.equal(restored.entries.apply.stats.typing.correct, 2);
});
test('skip, importing, groups, recognitionOnly and round reset follow the real engine', () => {
  const s = state();
  nextQuestion(s, () => 0);
  skipQuestion(s);
  assert.equal(sheepStatus(s, 'apply'), 'skipped');
  assert.equal(s.entries.apply.stats.typing.wrong, 0);
  s.settings.mode = 'hint';
  assert.equal(herdSummary(s).done, 1);
  s.entries.ramble.recognitionOnly = true;
  assert.equal(herdSummary(s).entries.length, 1);
  s.settings.mode = 'choice';
  assert.equal(herdSummary(s).done, 0);
  assert.equal(herdSummary(s).entries.length, 2);
  s.settings.mode = 'blank';
  mergeEntries(s, [{ english: 'new', meaning: '新', groups: ['新组'] }]);
  assert.equal(herdSummary(s).entries.length, 2);
  s.settings.group = '新组';
  assert.equal(herdSummary(s).entries.length, 1);
  s.settings.group = '';
  s.rounds.typing = blankRound(2);
  assert.equal(herdSummary(s).caught.length, 0);
  assert.equal(herdSummary(s).round, 2);
});
test('legacy independent pasture data does not affect the normal round', () => {
  const s = state();
  s.pastures = { typing: { caught: ['apply', 'ramble'], round: 55 } };
  assert.equal(herdSummary(s).caught.length, 0);
  assert.equal(herdSummary(s).round, 1);
  s.rounds.typing.done = ['apply'];
  assert.equal(sheepStatus(s, 'apply'), 'unconfirmed');
});
test('ordinary object-property word keys are safe in the per-round ledger', () => {
  const s = initialState();
  mergeEntries(s, [
    { english: '__proto__', meaning: '测试' },
    { english: 'constructor', meaning: '构造' },
  ]);
  for (let i = 0; i < 2; i++) {
    const q = nextQuestion(s, () => 0);
    submit(s, q.key);
    s.rounds.typing.current = null;
  }
  assert.equal(herdSummary(s).caught.length, 2);
  assert.equal({}.type, undefined);
});
test('multiple distinct sheep forms are deterministic', () => {
  assert.equal(new Set(Array.from({ length: 6 }, (_, i) => sheepSVG(i))).size, 6);
  assert.equal(sheepSeed('apply'), sheepSeed('apply'));
  assert.match(pasturePage(state(), ''), /sheep-roam/);
  assert.doesNotMatch(pasturePage(state(), ''), /herd-start|herd-reset|herd-mode|answer-input/);
});
