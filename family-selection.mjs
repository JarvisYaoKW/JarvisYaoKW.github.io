const preferred = {
  apply: ['application', 'applicable', 'applicant'],
  vulnerable: ['vulnerability', 'invulnerable', 'vulnerably'],
  retrieve: ['retrieval', 'retriever'],
  implement: ['implementation'],
  execute: ['execution', 'executive'],
  attribute: ['attribution', 'attributable', 'attributive'],
};
export function validFamilyMeaning(value, manual = false) {
  const s = String(value || '').trim();
  return (
    !!s &&
    !/暂无释义|资料暂不可用|请先使用|正在准备|待补充/.test(s) &&
    (manual || /[\u3400-\u9fff]/.test(s))
  );
}
export function selectFamily(root, wiki = [], youdao = [], manual = []) {
  const key = (s) =>
      String(s || '')
        .trim()
        .toLowerCase(),
    prior = preferred[key(root)] || [],
    wikiKeys = new Set(wiki.map((f) => key(f.word))),
    candidates = [];
  for (const f of [...youdao, ...wiki, ...manual]) {
    const k = key(f.word);
    if (!k || k === key(root) || !/[a-z]/i.test(k)) continue;
    const old = candidates.find((x) => key(x.word) === k);
    if (old) {
      if (!validFamilyMeaning(old.meaning) && validFamilyMeaning(f.meaning))
        old.meaning = f.meaning;
      if (manual.includes(f)) old.manual = true;
    } else candidates.push({ ...f, manual: manual.includes(f) });
  }
  const known = (f) =>
    f.manual || f.origin === 'related' || wikiKeys.has(key(f.word)) || prior.includes(key(f.word));
  candidates.sort((a, b) => {
    const ai = prior.indexOf(key(a.word)),
      bi = prior.indexOf(key(b.word));
    return (ai < 0 ? 99 : ai) - (bi < 0 ? 99 : bi);
  });
  const ready = candidates
    .filter((f) => known(f) && validFamilyMeaning(f.meaning, f.manual))
    .slice(0, 6);
  const selected = new Set(ready.map((f) => key(f.word))),
    pending = candidates
      .filter((f) => known(f) && !selected.has(key(f.word)))
      .slice(0, 20)
      .map((f) => ({
        ...f,
        reason: validFamilyMeaning(f.meaning, f.manual) ? '待确认练习优先级' : '释义待补充',
      }));
  return { family: ready, pendingFamily: pending, familyVersion: 2 };
}
