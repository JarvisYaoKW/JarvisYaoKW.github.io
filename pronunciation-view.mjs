const LABELS = {
  verb: 'v. 动词',
  noun: 'n. 名词',
  adjective: 'adj. 形容词',
  adverb: 'adv. 副词',
  pronoun: 'pron. 代词',
  preposition: 'prep. 介词',
  conjunction: 'conj. 连词',
  interjection: 'interj. 感叹词',
  determiner: 'det. 限定词',
  numeral: 'num. 数词',
  '': '词义',
};
const ABBR = {
  v: 'verb',
  vt: 'verb',
  vi: 'verb',
  aux: 'verb',
  n: 'noun',
  adj: 'adjective',
  adv: 'adverb',
  pron: 'pronoun',
  prep: 'preposition',
  conj: 'conjunction',
  interj: 'interjection',
  det: 'determiner',
  art: 'determiner',
  num: 'numeral',
};
export function splitPronunciations(value) {
  let t = String(value || '').trim();
  if (!t) return [];
  const square = t.startsWith('[') && t.endsWith(']');
  t = t.replace(/^[/\[]|[/\]]$/g, '');
  return t
    .split(/[;；]/)
    .map((x) => x.trim())
    .filter(Boolean)
    .map((x) => (square ? '[' + x + ']' : '/' + x + '/'));
}
export function splitMeanings(meanings) {
  const groups = [];
  const add = (pos, meaning) => {
    meaning = meaning.replace(/^[;；\s]+|[;；\s]+$/g, '');
    if (!meaning) return;
    let g = groups.find((g) => g.pos === pos);
    if (!g) {
      g = { pos, label: LABELS[pos] || pos, meanings: [] };
      groups.push(g);
    }
    if (!g.meanings.includes(meaning)) g.meanings.push(meaning);
  };
  for (const raw of meanings || []) {
    const matches = [
      ...String(raw).matchAll(/\b(adj|adv|vt|vi|aux|prep|pron|conj|interj|det|art|num|n|v)\.\s*/gi),
    ];
    if (!matches.length) {
      add('', raw);
      continue;
    }
    if (matches[0].index > 0) add('', raw.slice(0, matches[0].index));
    for (let i = 0; i < matches.length; i++)
      add(
        ABBR[matches[i][1].toLowerCase()] || '',
        raw.slice(matches[i].index + matches[i][0].length, matches[i + 1]?.index ?? raw.length),
      );
  }
  return groups;
}
export function senseModel(entry, accent) {
  const supplement = entry.supplement || {},
    groups = splitMeanings(entry.meanings),
    all = supplement.pronunciationGroups || [];
  const preferred =
    supplement.phonetics?.find((p) => p.accent === accent) ||
    supplement.phonetics?.find((p) => !p.accent);
  const generic = splitPronunciations(preferred?.text || entry.phonetic);
  const mapped = all.filter((p) => p.accent === accent && groups.some((g) => g.pos === p.pos));
  const normalize = (p) =>
    p
      .replace(/[\/\[\].\s()]/g, '')
      .replaceAll('ɹ', 'r')
      .replaceAll('ɡ', 'g');
  const byPOS = [...new Set(mapped.map((p) => p.pos))].map(
    (pos) => new Set(mapped.filter((p) => p.pos === pos).map((p) => normalize(p.ipa))),
  );
  const differentPOSReadings = byPOS.some((set, i) =>
    byPOS.some((other, j) => i !== j && ![...set].some((ipa) => other.has(ipa))),
  );
  const completeMapping = groups.every((g) => g.pos && mapped.some((p) => p.pos === g.pos));
  const ambiguous =
    groups.length > 1 &&
    (differentPOSReadings || (!completeMapping && new Set(generic.map(normalize)).size > 1));
  for (const g of groups) {
    g.readings = all
      .filter((p) => p.pos === g.pos && p.accent === accent && p.verified)
      .filter((p, i, a) => a.findIndex((x) => x.ipa === p.ipa) === i);
    if (!g.readings.length && groups.length === 1 && generic.length === 1)
      g.readings = [{ ipa: generic[0], accent, verified: false }];
    g.unresolved = !g.readings.length;
  }
  const unmapped = groups.some((g) => g.unresolved)
    ? generic.filter((p) => !mapped.some((m) => normalize(m.ipa) === normalize(p)))
    : [];
  const commonReadings = generic.length ? generic : [...new Set(mapped.map((p) => p.ipa))];
  return { groups, ambiguous, unmapped, commonReadings };
}
