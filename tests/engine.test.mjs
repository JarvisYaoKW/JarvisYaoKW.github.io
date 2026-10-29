import test from 'node:test';
import assert from 'node:assert/strict';

import {
  initialState,
  mergeEntries,
  nextQuestion,
  submit,
  category,
  choices,
  blankRound,
  pool,
  compare,
  skipQuestion,
} from '../engine.mjs';

function state() {
  const s = initialState();
  mergeEntries(s, [
    { english: 'apply', meanings: ['v. 申请；应用'] },
    { english: 'retrieve', meanings: ['v. 找回'] },
    { english: 'schema', meanings: ['n. 模式'] },
    { english: 'creek', meanings: ['n. 小溪'] },
  ]);
  return s;
}
test('two failed attempts count as exactly one wrong question', () => {
  const s = state(),
    q = nextQuestion(s, () => 0);
  assert.equal(submit(s, 'bad'), 'retry');
  assert.equal(s.entries[q.key].stats.typing.wrong, 0);
  assert.equal(submit(s, 'bad'), 'wrong');
  assert.equal(s.entries[q.key].stats.typing.wrong, 1);
  assert.equal(submit(s, 'bad'), 'ignored');
  assert.equal(s.entries[q.key].stats.typing.wrong, 1);
  assert.deepEqual(s.rounds.typing.done, [q.key]);
});
test('second attempt correct does not count as a formal error', () => {
  const s = state(),
    q = nextQuestion(s, () => 0);
  submit(s, 'bad');
  submit(s, ' APPLY ');
  assert.equal(s.entries[q.key].stats.typing.correct, 1);
  assert.equal(s.entries[q.key].stats.typing.wrong, 0);
  assert.equal(s.entries[q.key].stats.typing.first, 0);
});
test('merge means and groups without resetting round or statistics', () => {
  const s = state();
  nextQuestion(s, () => 0);
  submit(s, 'apply');
  const r = mergeEntries(
    s,
    [{ english: ' Apply ', meanings: ['n. 演示义项', 'v. 申请；应用'] }],
    '写作',
  );
  assert.equal(r.updated, 1);
  assert.equal(Object.keys(s.entries).length, 4);
  assert.equal(s.entries.apply.meanings.length, 2);
  assert.equal(s.entries.apply.stats.typing.correct, 1);
  assert.deepEqual(s.rounds.typing.done, ['apply']);
  assert.ok(s.entries.apply.groups.includes('写作'));
});
test('new imports join current round, extra is capped, round never resets implicitly', () => {
  const s = state();
  for (let n = 0; n < 4; n++) {
    const q = nextQuestion(s, () => 0);
    submit(s, s.entries[q.key].english);
    s.rounds.typing.current = null;
  }
  assert.equal(nextQuestion(s), null);
  mergeEntries(s, [{ english: 'new word', meaning: '新词' }]);
  assert.equal(nextQuestion(s).key, 'new word');
  submit(s, 'new word');
  s.rounds.typing.current = null;
  assert.equal(nextQuestion(s), null);
  assert.equal(s.rounds.typing.number, 1);
});
test('favorite reviews are bounded and do not double queue with wrong', () => {
  const s = initialState();
  mergeEntries(s, [{ english: 'apply', meaning: '申请', favorite: true }]);
  nextQuestion(s);
  submit(s, 'bad');
  submit(s, 'bad');
  assert.equal(s.rounds.typing.due.length, 1);
  for (let n = 0; n < 2; n++) {
    s.rounds.typing.current = null;
    const q = nextQuestion(s);
    assert.equal(q.kind, 'extra');
    submit(s, 'apply');
  }
  s.rounds.typing.current = null;
  assert.equal(nextQuestion(s), null);
  assert.equal(s.rounds.typing.extra.apply, 2);
});
test('canceling favorite removes favorite-only pending reviews', () => {
  const s = state();
  s.entries.apply.favorite = true;
  nextQuestion(s, () => 0);
  submit(s, 'apply');
  s.entries.apply.favorite = false;
  s.rounds.typing.current = null;
  for (let n = 0; n < 3; n++) {
    const q = nextQuestion(s, () => 0);
    submit(s, s.entries[q.key].english);
    s.rounds.typing.current = null;
  }
  assert.equal(nextQuestion(s), null);
});
test('spelling hints share a round, choice has an independent round', () => {
  const s = state();
  nextQuestion(s, () => 0);
  submit(s, 'apply');
  s.settings.mode = 'hint';
  assert.equal(category(s), 'typing');
  assert.ok(s.rounds.typing.done.includes('apply'));
  s.settings.mode = 'choice';
  const q = nextQuestion(s, () => 0);
  assert.equal(q.key, 'apply');
  assert.equal(s.rounds.choice.done.length, 0);
});
test('group filtering shares completion across groups', () => {
  const s = state();
  s.entries.apply.groups = ['阅读', '写作'];
  s.settings.group = '阅读';
  nextQuestion(s);
  submit(s, 'apply');
  s.rounds.typing.current = null;
  s.settings.group = '写作';
  assert.equal(pool(s).length, 1);
  assert.equal(nextQuestion(s), null);
  assert.equal(s.rounds.typing.done.length, 1);
});
test('pending retry and choice order survive serialized resume', () => {
  let s = state();
  s.settings.mode = 'choice';
  const q = nextQuestion(s, () => 0);
  choices(s, q, () => 0.5);
  submit(s, 'wrong-key');
  const order = q.options.map((o) => o.key);
  s = JSON.parse(JSON.stringify(s));
  assert.equal(nextQuestion(s).tries, 1);
  assert.deepEqual(
    choices(s, nextQuestion(s)).map((o) => o.key),
    order,
  );
});
test('sentence strictness does not change word space rules', () => {
  const s = initialState().settings;
  assert.ok(compare(' APPLY ', 'apply', 'word', s));
  assert.ok(!compare('on  the fence', 'on the fence', 'phrase', s));
  assert.ok(compare('hello world', 'Hello, world!', 'sentence', s));
  assert.ok(
    !compare('hello world', 'Hello, world!', 'sentence', { ...s, strictPunctuation: true }),
  );
});
test('dictionary keys can be ordinary words matching object properties', () => {
  const s = initialState();
  mergeEntries(s, [
    { english: 'constructor', meaning: '构造器' },
    { english: '__proto__', meaning: '测试键' },
  ]);
  assert.equal(Object.keys(s.entries).length, 2);
  assert.equal(s.entries.constructor.english, 'constructor');
  assert.equal({}.meanings, undefined);
});
test('skip after a retry finishes the round item without correct/wrong or repeat', () => {
  const s = state(),
    q = nextQuestion(s, () => 0);
  s.entries[q.key].favorite = true;
  submit(s, 'bad');
  assert.equal(skipQuestion(s), true);
  assert.equal(s.entries[q.key].stats.typing.correct, 0);
  assert.equal(s.entries[q.key].stats.typing.wrong, 0);
  assert.ok(s.rounds.typing.done.includes(q.key));
  assert.equal(
    s.rounds.typing.due.some((d) => d.key === q.key),
    false,
  );
  assert.equal(skipQuestion(s), false);
});
test('recognition-only words stay in choice and are excluded from both spelling modes', () => {
  const s = state();
  s.entries.apply.recognitionOnly = true;
  assert.equal(
    pool(s).some((e) => e.key === 'apply'),
    false,
  );
  s.settings.mode = 'hint';
  assert.equal(
    pool(s).some((e) => e.key === 'apply'),
    false,
  );
  s.settings.mode = 'choice';
  assert.equal(
    pool(s).some((e) => e.key === 'apply'),
    true,
  );
});
