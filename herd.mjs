import { activeRound, isDaily } from './daily-learning.mjs';
import { category, pool } from './engine.mjs';

export const SHEEP_SIZES = Object.freeze([
  { value: 500, label: '巨大羊', size: 'giant' },
  { value: 100, label: '大羊', size: 'large' },
  { value: 50, label: '中羊', size: 'medium' },
  { value: 10, label: '小羊', size: 'small' },
  { value: 1, label: '小小羊', size: 'tiny' },
]);

// A read-only count representation: regrouping sheep never changes real word progress.
export function sheepBundles(count) {
  let remaining = Number.isSafeInteger(count) && count > 0 ? count : 0;
  const bundles = [];
  let offset = 0;
  for (const unit of SHEEP_SIZES) {
    while (remaining >= unit.value) {
      bundles.push({ ...unit, offset });
      remaining -= unit.value;
      offset += unit.value;
    }
  }
  return bundles;
}

// Read-only projection of the normal practice round. No question queue or score lives here.
export function sheepStatus(s, key) {
  const r = activeRound(s),
    q = r.current;
  const result = Object.hasOwn(r.outcomes || {}, key) ? r.outcomes[key] : null;
  if (result === 'correct') return 'caught';
  if (result === 'escaped') return 'escaped';
  if (result === 'wrong') return 'waiting';
  if (result === 'skipped' || r.skipped?.includes(key)) return 'skipped';
  if (isDaily(s)) return 'free';
  // Old saves may predate the per-round ledger; only the current result is certain.
  if (q?.key === key && q.finished)
    return q.outcome === 'correct' ? 'caught' : q.outcome === 'wrong' ? 'waiting' : 'skipped';
  return r.done.includes(key) ? 'unconfirmed' : 'free';
}
export function herdSummary(s) {
  const r = activeRound(s),
    entries = isDaily(s)
      ? (s.daily?.task?.items || []).map((i) => s.entries[i.key]).filter(Boolean)
      : pool(s),
    keys = new Set(entries.map((e) => e.key));
  const caught = entries.filter((e) => sheepStatus(s, e.key) === 'caught');
  return {
    round: r.number,
    entries,
    caught,
    outside: entries.filter((e) => sheepStatus(s, e.key) !== 'caught'),
    escaped: entries.filter((e) => sheepStatus(s, e.key) === 'escaped'),
    skipped: entries.filter((e) => sheepStatus(s, e.key) === 'skipped'),
    unknown: entries.filter((e) => sheepStatus(s, e.key) === 'unconfirmed'),
    done: r.done.filter((k) => keys.has(k)).length,
    extra: Object.entries(r.extra)
      .filter(([k]) => keys.has(k))
      .reduce((n, [, v]) => n + v, 0),
    event: r.lastEvent && keys.has(r.lastEvent.key) ? r.lastEvent : null,
  };
}
