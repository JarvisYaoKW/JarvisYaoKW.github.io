import { splitMeanings } from './pronunciation-view.mjs';
import { validFamilyMeaning } from './family-selection.mjs';

const key = (value) =>
  String(value || '')
    .trim()
    .toLowerCase();
const formLabels = new Set(['原形', '动词原形', '第三人称单数', '现在分词', '过去式', '过去分词']);
const restricted = /\b(?:archaic|obsolete|dated|rare)\b|古语|古义|古用|旧用|废语|废用|罕用|罕见/iu;
const restrictedMeaning =
  /^\s*(?:[（(\[【〈<][^）)\]】〉>]*(?:archaic|obsolete|dated|rare|古|旧|废|罕|过时)[^）)\]】〉>]*[）)\]】〉>]|(?:archaic|obsolete|dated|rare)\b|(?:古语|古义|古用|旧用|废语|废用|罕用|罕见)(?=\s|[:：,，;；]|$))/iu;
const values = (value) => (Array.isArray(value) ? value : value ? [value] : []);

// The learner's current senses are the authority for which POS is being practised.
// A dictionary's inflection list (or an English "past tense of" note) is not POS evidence.
export function verbMeanings(entry) {
  return splitMeanings(entry.meanings || [])
    .filter((sense) => sense.pos === 'verb')
    .flatMap((sense) => sense.meanings)
    .map((meaning) => meaning.trim())
    .filter((meaning) => /[\p{L}]/u.test(meaning) && !restrictedMeaning.test(meaning));
}

export function selectVerbForms(entry, candidates = entry.supplement?.forms || []) {
  const meanings = verbMeanings(entry);
  if (!meanings.length) return [];
  const selected = [];
  for (const form of candidates) {
    const word = String(form.word || '').trim();
    const labels = String(form.label || '')
      .split(/\s*[/／、]\s*/)
      .filter(Boolean);
    const usage = [
      form.register,
      form.usage,
      ...values(form.tags),
      ...values(form.qualifiers),
    ].join(' ');
    if (!word || word.length > 80 || !/[a-z]/i.test(word) || !labels.length) continue;
    if (!labels.every((label) => formLabels.has(label))) continue;
    if (
      (form.pos && form.pos !== 'verb') ||
      form.obsolete ||
      form.archaic ||
      restricted.test(usage)
    )
      continue;
    const old = selected.find((item) => key(item.word) === key(word));
    if (old) {
      old.label = [...new Set([...old.label.split(' / '), ...labels])].join(' / ');
    } else {
      selected.push({
        ...form,
        word,
        label: [...new Set(labels)].join(' / '),
        pos: 'verb',
        meaning: 'v. ' + meanings.join('；'),
      });
    }
  }
  return selected;
}

export function extensionItems(entry) {
  const supplement = entry.supplement || {};
  return [
    ...selectVerbForms(entry).map((form) => ({ ...form, type: 'form' })),
    ...(supplement.family || [])
      .filter((item) => validFamilyMeaning(item.meaning, !!supplement.manual))
      .map((item) => ({
        ...item,
        type: 'family',
        label: item.meaning || item.label || '常用派生词',
      })),
  ];
}
