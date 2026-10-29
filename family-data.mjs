import { splitMeanings } from './pronunciation-view.mjs';
import { validFamilyMeaning } from './family-selection.mjs';

let bundled = null;
let pending = null;
const key = (value) =>
  String(value || '')
    .trim()
    .toLowerCase();

export async function loadFamilyData() {
  if (bundled) return bundled;
  if (pending) return pending;
  pending = (async () => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10000);
    try {
      const response = await fetch('/wordbooks/families.json?v=20261029-1', {
        signal: controller.signal,
      });
      if (!response.ok) throw Error('预置词族资料暂时无法加载');
      const value = await response.json();
      if (value.schema !== 1 || !value.entries || !value.members) throw Error('词族资料不完整');
      bundled = value;
      return bundled;
    } finally {
      clearTimeout(timer);
      pending = null;
    }
  })();
  return pending;
}

// Read-only overlay: existing imports and dictionary caches gain the new data
// without changing the user's vocabulary, settings, counters or practice queue.
export function familyForEntry(entry, data = bundled) {
  const rootPOS = new Set(splitMeanings(entry.meanings || []).map((sense) => sense.pos));
  const edges =
    data?.entries && Object.hasOwn(data.entries, key(entry.english))
      ? data.entries[key(entry.english)]
      : [];
  const preset = edges
    .filter((edge) => rootPOS.has(edge.rootPos))
    .flatMap((edge) => {
      const member = data.members[edge.member];
      if (!member || !validFamilyMeaning(member.meaning)) return [];
      return [
        {
          ...member,
          origin: 'wordnet',
          relation: edge.relation,
          relationSource: 'Princeton WordNet 3.0',
          meaningSource: 'ECDICT · MIT',
          englishDefinitionSource: 'WordNet 3.0',
          evidence: edge.evidence,
          phonetics: member.phonetic
            ? [
                {
                  text: '/' + member.phonetic.replace(/^[/\[]|[/\]]$/g, '') + '/',
                  accent: member.phoneticAccent || '',
                },
              ]
            : [],
        },
      ];
    });
  const manual = !!entry.supplement?.manual;
  const cached = (entry.supplement?.family || []).filter((item) =>
    validFamilyMeaning(item.meaning, manual),
  );
  const candidates = manual ? [...cached, ...preset] : [...preset, ...cached];
  const seen = new Set();
  return candidates
    .filter((item) => {
      const word = key(item.word);
      if (!word || word === key(entry.english) || seen.has(word)) return false;
      seen.add(word);
      return true;
    })
    .slice(0, 12)
    .map((item) => ({ ...item, pos: item.pos || splitMeanings([item.meaning])[0]?.pos || '' }));
}
