import { getLocal, setLocal, saveLocalState, recoverQuestionDraft } from './browser-storage.mjs';
import { parseBin } from './bin-parser.mjs';
import { loadCatalog, loadBook } from './wordbooks.mjs';
import { withPronunciations } from './pronunciation-data.mjs';
import { storageMode } from './runtime-config.mjs';
export { storageMode };
const inFlight = new Map();
async function requestJSON(url, timeout = 7000) {
  const controller = new AbortController(),
    timer = setTimeout(() => controller.abort(), timeout);
  try {
    const r = await fetch(url, { signal: controller.signal });
    if (!r.ok) throw Error('资料服务暂不可用');
    return await r.json();
  } finally {
    clearTimeout(timer);
  }
}
export async function lookupWord(word, force = false) {
  const key = String(word).trim().toLowerCase();
  if (key.length > 200) throw Error('此内容过长，可在编辑词条中补充资料。');
  if (!force) {
    const old = await getLocal('dictionary:' + key);
    if (old && Date.now() - old.fetchedAt < 7 * 86400000) return old;
  }
  if (inFlight.has(key)) return inFlight.get(key);
  const task = (async () => {
    const previous = await getLocal('dictionary:' + key),
      results = await Promise.allSettled([
        requestJSON('https://api.dictionaryapi.dev/api/v2/entries/en/' + encodeURIComponent(key)),
        requestJSON(
          'https://en.wiktionary.org/w/api.php?action=parse&page=' +
            encodeURIComponent(key) +
            '&prop=text&format=json&redirects=1&origin=*',
        ),
      ]);
    const dictionary =
        results[0].status === 'fulfilled' && Array.isArray(results[0].value)
          ? results[0].value
          : previous?.dictionary || [],
      wiki =
        results[1].status === 'fulfilled'
          ? results[1].value.parse?.text?.['*'] || previous?.wiki || ''
          : previous?.wiki || '';
    const raw = withPronunciations({
      word: key,
      dictionary,
      wiki,
      youdao: null,
      source: 'https://en.wiktionary.org/wiki/' + encodeURIComponent(key),
      fetchedAt: Date.now(),
      offline: !dictionary.length && !wiki,
    });
    if (!raw.offline) await setLocal('dictionary:' + key, raw);
    return raw;
  })();
  inFlight.set(key, task);
  try {
    return await task;
  } finally {
    inFlight.delete(key);
  }
}
export async function apiRequest(url, opts = {}) {
  if (storageMode === 'legacy') {
    const r = await fetch(url, opts),
      json = await r.json();
    if (!r.ok) throw Error(json.error || '请求失败');
    return json;
  }
  const u = new URL(url, location.origin);
  if (u.pathname === '/api/state') {
    if (!opts.method || opts.method === 'GET') {
      const state = await getLocal('state');
      return { state: state ? recoverQuestionDraft(state) : null };
    }
    const payload = JSON.parse(opts.body);
    return saveLocalState(payload.state, payload.expectedRevision, { restore: !!payload.restore });
  }
  if (u.pathname === '/api/import-bin') return { rows: parseBin(opts.body) };
  if (u.pathname === '/api/seed') {
    const catalog = await loadCatalog();
    return loadBook(catalog.defaultBook);
  }
  if (u.pathname === '/api/lookup')
    return lookupWord(u.searchParams.get('word'), u.searchParams.has('refresh'));
  if (u.pathname === '/api/translate') return { text: '' };
  throw Error('当前网页版不支持此请求。');
}
export async function audioSource(entry, accent, pos, strict) {
  if (storageMode === 'legacy') {
    const r = await fetch(
      '/api/audio?word=' +
        encodeURIComponent(entry.english) +
        '&accent=' +
        accent +
        '&pos=' +
        encodeURIComponent(pos) +
        (strict ? '&bypos=1' : ''),
    );
    if (!r.ok) throw Error('录音暂不可用');
    const url = URL.createObjectURL(await r.blob());
    return { url, revoke: () => URL.revokeObjectURL(url), label: '词典录音' };
  }
  let groups = entry.supplement?.pronunciationGroups || [];
  if (strict && !groups.some((r) => r.pos === pos && r.accent === accent && r.audio)) {
    const raw = await lookupWord(entry.english);
    groups = raw.pronunciationGroups || groups;
  }
  const exact = groups.find((r) => r.pos === pos && r.accent === accent && r.audio);
  if (strict && !exact) throw Error('缺少此词性和口音的已核实录音');
  const source =
    exact?.audio ||
    'https://dict.youdao.com/dictvoice?audio=' +
      encodeURIComponent(entry.english) +
      '&type=' +
      (accent === 'us' ? '2' : '1');
  const url = new URL(source);
  if (
    url.protocol !== 'https:' ||
    !['dict.youdao.com', 'upload.wikimedia.org', 'api.dictionaryapi.dev'].includes(url.hostname)
  )
    throw Error('录音来源不在允许列表');
  return { url: url.href, label: exact ? '对应词性录音' : '词典录音' };
}
