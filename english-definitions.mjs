let bundled = null,
  pending = null;
const norm = (s) =>
  String(s || '')
    .trim()
    .toLowerCase();
export function cleanDefinitions(items) {
  const out = [];
  for (const item of items || []) {
    const definition = String(item?.definition || '').trim(),
      pos = String(item?.pos || '').trim();
    if (definition && !out.some((x) => x.pos === pos && x.definition === definition))
      out.push({ pos, definition, ...(item.lemma ? { lemma: item.lemma } : {}) });
  }
  return out;
}
export function definitionsFromLookup(raw, word) {
  const senses = [];
  let source = 'Free Dictionary API';
  for (const d of raw?.dictionary || []) {
    if (d.word && norm(d.word) !== norm(word)) continue;
    for (const m of d.meanings || [])
      for (const v of m.definitions || [])
        if (v.definition) senses.push({ pos: m.partOfSpeech || '', definition: v.definition });
  }
  return { senses: cleanDefinitions(senses), source };
}
export function englishFor(word, supplement = {}, data = bundled) {
  const local = data?.entries?.[norm(word)];
  if (local) return local;
  const senses = cleanDefinitions(supplement?.englishDefinitions);
  return { senses, source: supplement?.englishDefinitionSource || '' };
}
export function filterDefinitionPOS(value, pos) {
  if (!pos) return value;
  const matches = value.senses
    .filter((s) => s.pos === pos)
    .sort((a, b) => Number(!!b.lemma) - Number(!!a.lemma));
  return matches.length ? { ...value, senses: matches } : value;
}
export async function loadEnglishDefinitions() {
  if (bundled) return bundled;
  if (pending) return pending;
  pending = fetch('/wordbooks/english-definitions.json?v=20261028-1')
    .then(async (r) => {
      if (!r.ok) throw Error('英文释义暂时无法加载');
      const data = await r.json();
      if (!data.entries) throw Error('英文释义数据不完整');
      bundled = data;
      return data;
    })
    .finally(() => {
      pending = null;
    });
  return pending;
}
