import { validWallet } from './pasture-economy.mjs';
import { isDaily, activeRound, validDailyState } from './daily-learning.mjs';
const DB_NAME = 'cijian-typing-v1';
let database;
export function openDatabase() {
  if (database) return database;
  database = new Promise((resolve, reject) => {
    if (!globalThis.indexedDB) {
      reject(Error('当前浏览器不支持本地保存，请换用新版浏览器。'));
      return;
    }
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore('kv');
    request.onsuccess = () => {
      request.result.onversionchange = () => request.result.close();
      resolve(request.result);
    };
    request.onerror = () => reject(Error('无法打开浏览器本地存储，请检查隐私模式或站点存储权限。'));
  });
  return database;
}
export async function getLocal(key) {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('kv', 'readonly'),
      r = tx.objectStore('kv').get(key);
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}
export async function setLocal(key, value) {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('kv', 'readwrite');
    tx.objectStore('kv').put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || Error('本地保存中断。'));
  });
}
export function validLocalState(s) {
  return !!(
    s &&
    s.version === 1 &&
    validDailyState(s.daily) &&
    (s.pastureWallet == null || validWallet(s.pastureWallet)) &&
    s.entries &&
    typeof s.entries === 'object' &&
    !Array.isArray(s.entries) &&
    Object.keys(s.entries).length <= 100000 &&
    Array.isArray(s.groups) &&
    s.settings &&
    ['typing', 'choice'].every((c) => {
      const r = s.rounds?.[c];
      return (
        r &&
        Array.isArray(r.done) &&
        Array.isArray(r.due) &&
        r.extra &&
        Number.isFinite(r.steps) &&
        (!r.current || Object.hasOwn(s.entries, r.current.key))
      );
    }) &&
    Object.entries(s.entries).every(
      ([k, e]) =>
        e?.key === k &&
        typeof e.english === 'string' &&
        Array.isArray(e.meanings) &&
        e.meanings.length &&
        e.meanings.every((m) => typeof m === 'string') &&
        Array.isArray(e.groups) &&
        e.stats &&
        ['typing', 'choice'].every((c) =>
          ['correct', 'wrong', 'first', 'streak', 'ms', 'chars'].every(
            (v) => Number.isFinite(e.stats[c]?.[v]) && e.stats[c][v] >= 0,
          ),
        ),
    )
  );
}
export async function saveLocalState(state, expectedRevision, { restore = false } = {}) {
  if (!validLocalState(state)) throw Error('数据结构不完整，未覆盖当前本地进度。');
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('kv', 'readwrite'),
      store = tx.objectStore('kv'),
      request = store.get('state');
    let failure, revision;
    request.onsuccess = () => {
      const current = request.result;
      if ((current?.revision || 0) !== expectedRevision) {
        failure = Error('另一标签页已更新进度。请导出当前备份，再刷新此页，避免相互覆盖。');
        tx.abort();
        return;
      }
      revision = (current?.revision || 0) + 1;
      if (current) {
        const dailyKey = 'snapshot:' + new Date().toLocaleDateString('en-CA');
        const check = store.get(dailyKey);
        check.onsuccess = () => {
          if (!check.result) store.put({ ...current, snapshotAt: Date.now() }, dailyKey);
        };
        if (restore) store.put({ ...current, snapshotAt: Date.now() }, 'backup:' + Date.now());
        const keys = store.getAllKeys();
        keys.onsuccess = () => {
          const records = keys.result.filter(
            (k) => String(k).startsWith('backup:') || String(k).startsWith('snapshot:'),
          );
          const reads = records.map(
            (k) =>
              new Promise((resolve) => {
                const r = store.get(k);
                r.onsuccess = () => resolve({ key: k, at: r.result?.snapshotAt || 0 });
              }),
          );
          Promise.all(reads).then((rows) =>
            rows
              .sort((a, b) => b.at - a.at)
              .slice(restore ? 8 : 9)
              .forEach((x) => store.delete(x.key)),
          );
        };
      }
      store.put({ ...state, revision }, 'state');
    };
    tx.oncomplete = () => resolve({ revision });
    tx.onerror = () => reject(failure || tx.error || Error('本地保存失败，请检查存储空间。'));
    tx.onabort = () => reject(failure || tx.error || Error('本地保存中断。'));
  });
}
export async function retainLocalDraft(state) {
  try {
    const q = activeRound(state)?.current;
    localStorage.setItem(
      'cijian-last-question',
      JSON.stringify({
        revision: state.revision,
        dailyTask: isDaily(state) ? state.daily?.task?.day : null,
        category: state.settings.mode === 'choice' ? 'choice' : 'typing',
        round: state.rounds[state.settings.mode === 'choice' ? 'choice' : 'typing'].number,
        q: q
          ? {
              key: q.key,
              kind: q.kind,
              input: q.input,
              tries: q.tries,
              finished: q.finished,
              outcome: q.outcome,
              ms: q.ms,
              hints: q.hints,
              stage: q.stage,
              options: q.options,
            }
          : null,
        at: Date.now(),
      }),
    );
  } catch {}
}
export function recoverQuestionDraft(state) {
  try {
    const draft = JSON.parse(localStorage.getItem('cijian-last-question') || 'null');
    if (!draft || !draft.q || draft.q.finished || draft.revision !== state.revision) return state;
    if (draft.dailyTask) {
      const task = state.daily?.task;
      if (
        isDaily(state) &&
        task?.day === draft.dailyTask &&
        task.current?.key === draft.q.key &&
        task.current.stage === draft.q.stage &&
        task.current.kind === draft.q.kind &&
        !task.current.finished
      ) {
        task.current = { ...task.current, ...draft.q };
      }
      return state;
    }
    if (isDaily(state)) return state;
    const round = state.rounds[draft.category],
      current = round?.current;
    if (
      round?.number === draft.round &&
      current?.key === draft.q.key &&
      current.kind === draft.q.kind &&
      !current.finished
    ) {
      round.current = { ...current, ...draft.q };
    }
  } catch {}
  return state;
}

export async function listSnapshots() {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('kv', 'readonly'),
      store = tx.objectStore('kv'),
      r = store.openCursor(),
      rows = [];
    r.onsuccess = () => {
      const c = r.result;
      if (!c) return;
      if (String(c.key).startsWith('backup:') || String(c.key).startsWith('snapshot:'))
        rows.push({
          key: c.key,
          at: c.value.snapshotAt || Number(String(c.key).split(':')[1]) || 0,
          count: Object.keys(c.value.entries || {}).length,
        });
      c.continue();
    };
    tx.oncomplete = () => resolve(rows.sort((a, b) => b.at - a.at));
    tx.onerror = () => reject(tx.error);
  });
}
