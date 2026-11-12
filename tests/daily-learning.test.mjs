import test from 'node:test';
import assert from 'node:assert/strict';
import { initialState, mergeEntries, nextQuestion, submit, previousQuestion } from '../engine.mjs';
import {
  createDailyTask,
  rebuildDailyTask,
  nextDailyQuestion,
  submitDaily,
  skipDaily,
  dailySummary,
  ensureDaily,
  dailyConfig,
  dailyQuestionMode,
  dailyCandidates,
  localDay,
  addDays,
  practiceState,
  validDailyState,
  observeNormalAnswer,
} from '../daily-learning.mjs';
import { validLocalState, retainLocalDraft, recoverQuestionDraft } from '../browser-storage.mjs';
import { herdSummary } from '../herd.mjs';
import { dailyControls, dailyIdle, dailyFeedback } from '../daily-view.mjs';
import { practiceControls } from '../practice-layout.mjs';
const DAY = '2026-11-11';
function state(n = 8) {
  const s = initialState();
  mergeEntries(
    s,
    Array.from({ length: n }, (_, i) => ({ english: 'word' + i, meanings: ['n. 测试词 ' + i] })),
    '测试',
  );
  s.settings.learningPlan = 'daily';
  ensureDaily(s, DAY).config = dailyConfig({ target: 2, ratio: 0.5 });
  return s;
}
function advance(s, day = DAY) {
  s.daily.task.current = null;
  return nextDailyQuestion(s, day);
}
function answer(s, day = DAY) {
  return submitDaily(s, s.entries[s.daily.task.current.key].english, day);
}
function finishTask(s, day = DAY) {
  let q = nextDailyQuestion(s, day),
    guard = 100;
  while (q && guard--) {
    answer(s, day);
    q = advance(s, day);
  }
  assert.ok(guard > 0);
}
test('daily selection is fixed, capped, prioritizes overdue mistakes, and seeds legacy dates honestly', () => {
  const s = state();
  s.entries.word0.stats.typing.correct = 1;
  s.entries.word1.stats.typing.wrong = 4;
  ensureDaily(s, DAY);
  assert.equal(s.daily.records.word0.learnedOn, null);
  assert.equal(s.daily.records.word0.legacy, true);
  const task = createDailyTask(s, DAY, () => 0.4);
  assert.equal(task.items.length, 4);
  assert.equal(task.items[0].key, 'word1');
  assert.equal(task.items[0].kind, 'review');
  assert.equal(dailyCandidates(s, DAY).due.length, 2);
  const before = JSON.stringify(task);
  mergeEntries(s, [{ english: 'newimport', meanings: ['新导入'] }]);
  s.daily.config.target = 100;
  assert.equal(createDailyTask(s, DAY), task);
  assert.equal(JSON.stringify(task), before);
  assert.equal(createDailyTask(s, addDays(DAY, 1)), task);
});
test('new copy then spaced recall: copying changes no score, coins, dates or sheep', () => {
  const s = state(),
    before = JSON.stringify(s.rounds);
  createDailyTask(s, DAY);
  const q = nextDailyQuestion(s, DAY),
    key = q.key;
  assert.equal(q.stage, 'copy');
  answer(s);
  assert.equal(s.pastureWallet.balance, 0);
  assert.equal(s.entries[key].stats.typing.correct, 0);
  assert.equal(s.daily.records[key], undefined);
  assert.equal(dailySummary(s).newDone, 0);
  assert.equal(herdSummary(s).caught.length, 0);
  assert.notEqual(advance(s).key, key);
  answer(s);
  assert.equal(advance(s).key, key);
  assert.equal(s.daily.task.current.stage, 'recall');
  answer(s);
  assert.equal(dailySummary(s).newDone, 1);
  assert.equal(herdSummary(s).caught.length, 1);
  assert.equal(s.pastureWallet.balance, 1);
  assert.equal(s.daily.records[key].due, addDays(DAY, 1));
  assert.equal(JSON.stringify(s.rounds), before);
  assert.equal(submitDaily(s, 'again'), 'ignored');
  assert.equal(s.pastureWallet.balance, 1);
});
test('daily mode switches preserve the current question and mixed-mode history', () => {
  const s = state(1);
  const task = createDailyTask(s, DAY);
  const copy = nextDailyQuestion(s, DAY);
  copy.input = 'wo';
  s.daily.config.mode = 'blank';
  assert.equal(nextDailyQuestion(s, DAY), copy);
  assert.equal(copy.input, 'wo');
  assert.equal(dailyQuestionMode(copy), 'hint');
  answer(s);

  const recall = advance(s);
  assert.equal(recall.stage, 'recall');
  assert.equal(dailyQuestionMode(recall), 'blank');
  assert.equal(submitDaily(s, 'bad', DAY), 'retry');
  assert.equal(submitDaily(s, 'bad', DAY), 'wrong');
  s.daily.config.mode = 'choice';

  const choice = advance(s);
  assert.equal(dailyQuestionMode(choice), 'choice');
  assert.equal(previousQuestion(practiceState(s)).question.mode, 'blank');
  assert.equal(submitDaily(s, 'wrong-choice', DAY), 'retry');
  assert.equal(submitDaily(s, choice.key, DAY), 'correct');
  assert.equal(s.entries[choice.key].stats.choice.correct, 1);
  assert.equal(s.entries[choice.key].stats.typing.wrong, 1);
  assert.equal(s.pastureWallet.balance, 1);
  assert.equal(s.daily.records[choice.key].due, addDays(DAY, 1));
  assert.equal(dailySummary(s).newDone, 1);
  assert.equal(s.daily.task, task);
  assert.equal(validLocalState(JSON.parse(JSON.stringify(s))), true);
});
test('new words can start directly in choice mode and recognition-only entries never require typing', () => {
  const s = state(2);
  s.entries.word0.recognitionOnly = true;
  s.daily.config.mode = 'choice';
  const task = createDailyTask(s, DAY, () => 0.9);
  assert.equal(task.items.length, 2);
  const first = nextDailyQuestion(s, DAY);
  assert.equal(first.stage, 'recall');
  assert.equal(dailyQuestionMode(first), 'choice');
  assert.match(dailyFeedback(first, s), /数字键/);

  const only = state(1);
  only.entries.word0.recognitionOnly = true;
  only.daily.config.mode = 'choice';
  createDailyTask(only, DAY);
  only.daily.config.mode = 'blank';
  const q = nextDailyQuestion(only, DAY);
  assert.equal(dailyQuestionMode(q), 'choice');
  assert.equal(submitDaily(only, q.key, DAY), 'correct');
  assert.equal(herdSummary(only).caught.length, 1);
  assert.equal(dailySummary(only).complete, true);
  assert.doesNotMatch(dailyControls(only), /daily-reviewHint/);
});
test('two wrong attempts count once, repeat later, and subsequent success schedules an early review', () => {
  const s = state(1);
  createDailyTask(s, DAY);
  nextDailyQuestion(s, DAY);
  answer(s);
  advance(s);
  const key = s.daily.task.current.key;
  assert.equal(submitDaily(s, 'bad', DAY), 'retry');
  assert.equal(s.entries[key].stats.typing.wrong, 0);
  assert.equal(submitDaily(s, 'bad', DAY), 'wrong');
  assert.equal(s.entries[key].stats.typing.wrong, 1);
  assert.equal(dailySummary(s).complete, false);
  assert.equal(dailySummary(s).newDone, 0);
  advance(s);
  answer(s);
  assert.equal(dailySummary(s).complete, true);
  assert.equal(dailySummary(s).newDone, 1);
  assert.equal(s.daily.records[key].due, addDays(DAY, 1));
  assert.equal(s.pastureWallet.balance, 1);
});
test('copy errors never enter wrong book and repeat exposure before recall', () => {
  const s = state(1);
  createDailyTask(s, DAY);
  nextDailyQuestion(s, DAY);
  submitDaily(s, 'bad', DAY);
  submitDaily(s, 'bad', DAY);
  assert.equal(s.entries.word0.stats.typing.wrong, 0);
  assert.equal(advance(s).stage, 'copy');
});
test('successive due reviews follow 1,3,7,14,30 day intervals; same-day failures reset the interval', () => {
  const s = state(1);
  s.daily.config.ratio = 1;
  createDailyTask(s, DAY);
  finishTask(s);
  let next = addDays(DAY, 1);
  for (const days of [3, 7, 14, 30, 30]) {
    createDailyTask(s, next);
    nextDailyQuestion(s, next);
    assert.equal(s.daily.task.current.kind, 'daily-review');
    answer(s, next);
    advance(s, next);
    assert.equal(s.daily.records.word0.due, addDays(next, days));
    next = addDays(next, days);
  }
  createDailyTask(s, next);
  nextDailyQuestion(s, next);
  submitDaily(s, 'bad', next);
  submitDaily(s, 'bad', next);
  advance(s, next);
  answer(s, next);
  assert.equal(s.daily.records.word0.due, addDays(next, 1));
  assert.equal(s.daily.records.word0.step, 0);
});
test('completed daily task cannot regenerate today; a later day archives and draws only new/due entries', () => {
  const s = state();
  createDailyTask(s, DAY);
  finishTask(s);
  const task = s.daily.task;
  assert.equal(createDailyTask(s, DAY), task);
  createDailyTask(s, addDays(DAY, 1));
  assert.notEqual(s.daily.task, task);
  assert.equal(s.daily.archive.length, 1);
  assert.equal(s.daily.archive[0].newDone, 2);
  assert.equal(s.daily.task.items.filter((i) => i.kind === 'review').length, 2);
  assert.equal(s.daily.task.items.filter((i) => i.kind === 'new').length, 2);
});
test('skipping defers without counting mastery or earning coins, and due reviews remain eligible tomorrow', () => {
  const s = state(1);
  s.entries.word0.stats.typing.correct = 1;
  s.daily.config.ratio = 1;
  createDailyTask(s, DAY);
  nextDailyQuestion(s, DAY);
  skipDaily(s, DAY);
  assert.equal(dailySummary(s).deferred, 1);
  assert.equal(dailySummary(s).reviewDone, 0);
  assert.equal(s.pastureWallet.balance, 0);
  assert.equal(s.daily.records.word0.due, addDays(DAY, 1));
  assert.equal(advance(s), null);
});
test('round/daily switches preserve both questions, settings, answer history and wallet', () => {
  const s = state(1);
  s.settings.mode = 'choice';
  s.settings.learningPlan = 'round';
  nextQuestion(s);
  s.rounds.choice.current.input = 'saved';
  const round = JSON.stringify(s.rounds);
  s.settings.learningPlan = 'daily';
  createDailyTask(s, DAY);
  finishTask(s);
  assert.equal(JSON.stringify(s.rounds), round);
  assert.equal(s.settings.mode, 'choice');
  const history = previousQuestion(practiceState(s));
  assert.ok(history.question.finished);
  const balance = s.pastureWallet.balance;
  previousQuestion(practiceState(s));
  assert.equal(s.pastureWallet.balance, balance);
});
test('daily task, input and hint mask survive serialization and local draft recovery', async () => {
  let s = state();
  s.revision = 3;
  createDailyTask(s, DAY);
  nextDailyQuestion(s, DAY);
  s.daily.task.current.input = 'typed';
  s.daily.task.current.hints = { amount: 0.5, mask: 'w ＿' };
  const backup = JSON.parse(JSON.stringify(s));
  assert.equal(validLocalState(backup), true);
  assert.equal(validDailyState(backup.daily), true);
  const memory = new Map();
  globalThis.localStorage = { getItem: (k) => memory.get(k), setItem: (k, v) => memory.set(k, v) };
  await retainLocalDraft(s);
  backup.daily.task.current.input = '';
  recoverQuestionDraft(backup);
  assert.equal(backup.daily.task.current.input, 'typed');
  assert.deepEqual(backup.daily.task.current.hints, s.daily.task.current.hints);
  delete globalThis.localStorage;
});
test('normal practice after launch updates the review ledger without creating a daily task', () => {
  const s = state(1);
  s.settings.learningPlan = 'round';
  nextQuestion(s);
  submit(s, 'word0');
  observeNormalAnswer(s, DAY);
  assert.equal(s.daily.records.word0.due, addDays(DAY, 1));
  assert.equal(s.daily.task, null);
  const due = s.daily.records.word0.due;
  observeNormalAnswer(s, DAY);
  assert.equal(s.daily.records.word0.due, due);
});
test('filters, recognition-only words, deleted entries, and hostile property names do not corrupt tasks', () => {
  const s = state(3);
  s.entries.word0.recognitionOnly = true;
  s.daily.config.group = '不存在';
  createDailyTask(s, DAY);
  assert.equal(s.daily.task, null);
  const a = state(1);
  createDailyTask(a, DAY);
  delete a.entries.word0;
  assert.equal(nextDailyQuestion(a, DAY), null);
  assert.equal(dailySummary(a).complete, true);
  const b = state(0);
  mergeEntries(b, [{ english: '__proto__', meanings: ['特殊词'] }]);
  createDailyTask(b, DAY);
  finishTask(b);
  assert.ok(Object.hasOwn(b.daily.records, '__proto__'));
  assert.equal({}.due, undefined);
});
test('daily UI exposes controls, honest counts, empty/complete states and no-copy-score feedback', () => {
  const s = state(1);
  assert.match(practiceControls(s), /每日学习/);
  assert.match(dailyControls(s), /daily-reviewHint/);
  assert.match(dailyIdle(s), /生成并开始任务/);
  createDailyTask(s, localDay());
  finishTask(s, localDay());
  assert.match(dailyIdle(s), /今日任务已完成/);
  assert.match(dailyFeedback({ stage: 'copy', finished: true, outcome: 'correct' }), /不计分/);
});
test('configuration clamps limits and calendar days are timezone/DST independent', () => {
  assert.equal(dailyConfig({ target: -3, newHint: 5, ratio: 99 }).target, 0);
  assert.equal(dailyConfig({ target: Infinity }).target, 150);
  assert.equal(dailyConfig({ newHint: 5 }).newHint, 1);
  assert.equal(addDays('2026-03-08', 1), '2026-03-09');
  assert.equal(addDays('2026-12-31', 1), '2027-01-01');
  assert.equal(localDay(new Date(2026, 0, 2, 23, 59)), '2026-01-02');
});
test('invalid restored daily queues are rejected before overwriting stored progress', () => {
  const s = state();
  createDailyTask(s, DAY);
  s.daily.task.queue.push(99999);
  assert.equal(validLocalState(s), false);
  assert.equal(validDailyState({ version: 1 }), false);
});

test('budget prioritizes due words, permits pure review and empty scope never locks a day', () => {
  const s = state(5);
  s.daily.config = dailyConfig({ target: 3, budget: 2 });
  s.entries.word0.stats.typing.correct = 1;
  s.entries.word1.stats.typing.correct = 1;
  const t = createDailyTask(s, DAY);
  assert.equal(t.items.length, 2);
  assert.ok(t.items.every((x) => x.kind === 'review'));
  const a = state(2);
  a.daily.config = dailyConfig({ scope: 'favorite' });
  assert.equal(createDailyTask(a, DAY), null);
  a.daily.config.scope = 'all';
  assert.equal(createDailyTask(a, DAY).items.length, 2);
  const b = state(2);
  b.entries.word0.stats.typing.correct = 1;
  b.daily.config = dailyConfig({ target: 0, budget: 20 });
  assert.equal(createDailyTask(b, DAY).items.length, 1);
  assert.equal(b.daily.task.items[0].kind, 'review');
});

test('adjusting an active task retains earned progress and budget across serialization', () => {
  const s = state(4);
  createDailyTask(s, DAY);
  nextDailyQuestion(s, DAY);
  answer(s);
  advance(s);
  answer(s);
  const coins = s.pastureWallet.balance;
  const records = JSON.stringify(s.daily.records);
  s.daily.config = dailyConfig({ target: 0, budget: 5 });
  rebuildDailyTask(s, DAY);
  assert.equal(s.pastureWallet.balance, coins);
  assert.equal(JSON.stringify(s.daily.records), records);
  assert.equal(s.daily.task, null);
  assert.equal(validLocalState(JSON.parse(JSON.stringify(s))), true);
});
