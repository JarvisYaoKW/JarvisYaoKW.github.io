import { blankRound, pool, submit, skipQuestion, totalWrong, compare } from './engine.mjs';

export const REVIEW_DAYS = [1, 3, 7, 14, 30];
export const isDaily = (s) => s.settings.learningPlan === 'daily';
export function localDay(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}
export function addDays(day, days) {
  const d = new Date(day + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
const own = (o, k) => (Object.hasOwn(o, k) ? o[k] : null);
const put = (o, k, value) =>
  Object.defineProperty(o, k, { value, enumerable: true, writable: true, configurable: true });
const clamp = (v, fallback, min, max) =>
  Number.isFinite(Number(v)) ? Math.min(max, Math.max(min, Number(v))) : fallback;
export function dailyConfig(value = {}) {
  return {
    target: Math.round(clamp(value.target, 150, 1, 1000)),
    ratio: clamp(value.ratio, 0.3, 0, 1),
    newHint: clamp(value.newHint, 0.35, 0, 1),
    reviewHint: clamp(value.reviewHint, 0.2, 0, 1),
    group: typeof value.group === 'string' ? value.group : '',
    scope: ['all', 'wrong', 'favorite'].includes(value.scope) ? value.scope : 'all',
  };
}
export function ensureDaily(s, today = localDay()) {
  s.daily ||= { version: 1, config: dailyConfig(), records: {}, task: null, archive: [] };
  const d = s.daily;
  for (const e of Object.values(s.entries)) {
    if (own(d.records, e.key)) continue;
    const attempts = ['typing', 'choice'].reduce(
      (n, cat) => n + (e.stats[cat]?.correct || 0) + (e.stats[cat]?.wrong || 0),
      0,
    );
    if (attempts)
      put(d.records, e.key, {
        step: 0,
        due: today,
        learnedOn: null,
        legacy: true,
        lapses: totalWrong(e),
      });
  }
  return d;
}
export function dailyPool(s, config = s.daily?.config || dailyConfig()) {
  return pool({ ...s, settings: { ...s.settings, ...config, mode: 'hint' } });
}
export function dailyCandidates(s, today = localDay()) {
  const d = ensureDaily(s, today),
    list = dailyPool(s);
  return {
    fresh: list.filter((e) => !own(d.records, e.key)),
    due: list
      .filter((e) => own(d.records, e.key)?.due <= today)
      .sort((a, b) => {
        const x = d.records[a.key],
          y = d.records[b.key];
        return (
          x.due.localeCompare(y.due) ||
          (y.lapses || 0) - (x.lapses || 0) ||
          totalWrong(b) - totalWrong(a) ||
          a.key.localeCompare(b.key)
        );
      }),
  };
}
export function createDailyTask(s, today = localDay(), rng = Math.random) {
  const d = ensureDaily(s, today),
    old = d.task;
  if (old && (!dailySummary(s).complete || old.day === today)) return old;
  const { fresh, due } = dailyCandidates(s, today),
    config = dailyConfig(d.config);
  // Fisher-Yates once, then persist this exact queue across reloads and midnight.
  for (let i = fresh.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [fresh[i], fresh[j]] = [fresh[j], fresh[i]];
  }
  if (old) {
    d.archive.push({ day: old.day, completedOn: today, ...dailySummary(s) });
    d.archive = d.archive.slice(-365);
  }
  const items = [
    ...due
      .slice(0, Math.floor(config.target * config.ratio))
      .map((e) => ({ key: e.key, kind: 'review', copied: true })),
    ...fresh.slice(0, config.target).map((e) => ({ key: e.key, kind: 'new', copied: false })),
  ];
  d.task = {
    ...blankRound('daily:' + today),
    day: today,
    config,
    items,
    queue: items.map((_, i) => i),
    completedOn: null,
  };
  return d.task;
}
export function dailySummary(s) {
  const t = s.daily?.task,
    items = t?.items || [],
    valid = items.filter(
      (i) => Object.hasOwn(s.entries, i.key) && !s.entries[i.key].recognitionOnly,
    );
  const count = (kind, done = false) =>
    valid.filter((i) => i.kind === kind && (!done || i.done)).length;
  const taskKeys = new Set(items.map((i) => i.key));
  const backlog = s.daily
    ? dailyPool(s, t?.config || s.daily.config).filter(
        (e) => own(s.daily.records, e.key)?.due <= localDay() && !taskKeys.has(e.key),
      ).length
    : 0;
  return {
    newTotal: count('new'),
    newDone: count('new', true),
    reviewTotal: count('review'),
    reviewDone: count('review', true),
    deferred: valid.filter((i) => i.deferred).length,
    attempts: (t?.history || []).filter(
      (q) => q.stage === 'recall' && ['correct', 'wrong'].includes(q.outcome),
    ).length,
    backlog,
    complete: !!t && valid.every((i) => i.done || i.deferred),
  };
}
export const activeRound = (s) =>
  isDaily(s)
    ? s.daily?.task || blankRound('daily')
    : s.rounds[s.settings.mode === 'choice' ? 'choice' : 'typing'];
export function practiceState(s) {
  return isDaily(s)
    ? {
        ...s,
        settings: { ...s.settings, mode: 'hint' },
        rounds: { ...s.rounds, typing: activeRound(s) },
      }
    : s;
}
export function nextDailyQuestion(s, today = localDay()) {
  const t = s.daily?.task || createDailyTask(s, today);
  if (
    t.current &&
    !t.current.finished &&
    s.entries[t.current.key] &&
    !s.entries[t.current.key].recognitionOnly
  )
    return t.current;
  t.current = null;
  while (t.queue.length) {
    const index = t.queue.shift(),
      item = t.items[index],
      e = s.entries[item?.key];
    if (!e || e.recognitionOnly || item.done || item.deferred) continue;
    t.current = {
      key: item.key,
      itemIndex: index,
      kind: 'daily-' + item.kind,
      stage: item.copied ? 'recall' : 'copy',
      tries: 0,
      input: '',
      finished: false,
      outcome: null,
      ms: 0,
      hints: null,
    };
    return t.current;
  }
  if (dailySummary(s).complete) t.completedOn ||= today;
  return null;
}
function updateRecord(s, key, correct, today) {
  const d = s.daily,
    old = own(d.records, key);
  if (!correct) {
    put(d.records, key, {
      ...old,
      step: 0,
      due: today,
      learnedOn: old?.learnedOn || today,
      lapses: (old?.lapses || 0) + 1,
      failedOn: today,
      lastReviewed: today,
    });
    return;
  }
  const step =
    !old || old.legacy || old.failedOn === today
      ? 0
      : old.lastReviewed === today
        ? old.step
        : Math.min(REVIEW_DAYS.length - 1, (old.step || 0) + 1);
  put(d.records, key, {
    ...old,
    step,
    due: addDays(today, REVIEW_DAYS[step]),
    learnedOn: old?.learnedOn || today,
    legacy: false,
    lastReviewed: today,
  });
}
export function submitDaily(s, input, today = localDay()) {
  const t = s.daily?.task,
    q = t?.current;
  if (!q || q.finished) return 'ignored';
  const item = t.items[q.itemIndex];
  let result;
  if (q.stage === 'copy') {
    q.input = input;
    const e = s.entries[q.key];
    // Copying is exposure only: no formal score, coin or review date.
    const ok = compare(input, e.english, e.type, s.settings);
    if (!ok && ++q.tries < 2) return 'retry';
    q.finished = true;
    q.outcome = ok ? 'correct' : 'wrong';
    if (ok) item.copied = true;
    result = q.outcome;
    q.historyIndex = t.history.length;
    t.history.push(structuredClone(q));
  } else {
    result = submit(practiceState(s), input);
    if (!q.finished) return result;
    updateRecord(s, q.key, result === 'correct', today);
    // Normal-round extra queues are deliberately unused by this fixed daily task.
    t.due = [];
    if (result === 'correct') {
      item.done = true;
      t.done.push(q.key);
    }
  }
  if (!item.done) {
    if (q.stage === 'copy' && result === 'correct') t.queue.unshift(q.itemIndex);
    else t.queue.push(q.itemIndex);
  }
  if (dailySummary(s).complete) t.completedOn ||= today;
  return result;
}
export function skipDaily(s, today = localDay()) {
  const t = s.daily?.task,
    q = t?.current;
  if (!q || q.finished) return false;
  skipQuestion(practiceState(s));
  t.items[q.itemIndex].deferred = true;
  const record = own(s.daily.records, q.key);
  if (record) record.due = addDays(today, 1);
  return true;
}
export function observeNormalAnswer(s, today = localDay()) {
  if (!s.daily || isDaily(s)) return;
  const q = activeRound(s).current;
  if (q?.finished && ['correct', 'wrong'].includes(q.outcome))
    updateRecord(s, q.key, q.outcome === 'correct', today);
}
export function dailyHint(s, q) {
  return q.stage === 'copy'
    ? 1
    : q.kind === 'daily-new'
      ? s.daily.task.config.newHint
      : s.daily.task.config.reviewHint;
}
export function validDailyState(d) {
  if (d == null) return true;
  const object = (o) => o && typeof o === 'object' && !Array.isArray(o);
  const day = (v) =>
    typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v));
  const config = (c) =>
    object(c) &&
    Number.isInteger(c.target) &&
    c.target >= 1 &&
    c.target <= 1000 &&
    ['ratio', 'newHint', 'reviewHint'].every(
      (k) => Number.isFinite(c[k]) && c[k] >= 0 && c[k] <= 1,
    ) &&
    typeof c.group === 'string' &&
    ['all', 'wrong', 'favorite'].includes(c.scope);
  if (
    d.version !== 1 ||
    !config(d.config) ||
    !object(d.records) ||
    Object.keys(d.records).length > 100000 ||
    !Array.isArray(d.archive)
  )
    return false;
  if (
    !Object.values(d.records).every(
      (r) =>
        object(r) &&
        Number.isInteger(r.step) &&
        r.step >= 0 &&
        r.step < REVIEW_DAYS.length &&
        day(r.due),
    )
  )
    return false;
  const t = d.task;
  if (t == null) return true;
  return (
    object(t) &&
    day(t.day) &&
    t.number === 'daily:' + t.day &&
    config(t.config) &&
    Array.isArray(t.items) &&
    t.items.length <= 2000 &&
    t.items.every(
      (i) =>
        object(i) &&
        typeof i.key === 'string' &&
        ['new', 'review'].includes(i.kind) &&
        typeof i.copied === 'boolean',
    ) &&
    new Set(t.items.map((i) => i.key)).size === t.items.length &&
    Array.isArray(t.queue) &&
    t.queue.every((i) => Number.isInteger(i) && i >= 0 && i < t.items.length) &&
    Array.isArray(t.done) &&
    Array.isArray(t.skipped) &&
    Array.isArray(t.history) &&
    Array.isArray(t.due) &&
    object(t.extra) &&
    object(t.outcomes) &&
    Number.isSafeInteger(t.steps) &&
    t.steps >= 0 &&
    (!t.current ||
      (Number.isInteger(t.current.itemIndex) &&
        t.items[t.current.itemIndex]?.key === t.current.key &&
        ['copy', 'recall'].includes(t.current.stage) &&
        typeof t.current.input === 'string'))
  );
}
