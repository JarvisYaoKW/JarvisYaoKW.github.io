import { splitMeanings } from './pronunciation-view.mjs';
import { familyForEntry } from './family-data.mjs';
import inflections from './verb-inflections.mjs';

const key = (value) =>
  String(value || '')
    .trim()
    .toLowerCase();
const inflectionLabels = ['第三人称单数', '现在分词', '过去式', '过去分词'];
const formLabels = new Set(['原形', '动词原形', '现在时', ...inflectionLabels]);
const inflectionIndex = new Map(
  inflections.split('\n').map((line) => {
    const [base, ...forms] = line.split('|');
    return [base, forms];
  }),
);
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

function storedAndBundledForms(entry, meanings) {
  const saved = entry.supplement?.forms || [];
  const base = key(entry.english);
  const paradigm = inflectionIndex.get(base);
  if (!paradigm) return saved;
  const modalHomograph = base === 'can' || base === 'will';
  if (modalHomograph && !(entry.meanings || []).some((text) => /\b(?:v|vt|vi)\./i.test(text)))
    return saved;

  const lying =
    base === 'lie' && meanings.some((meaning) => /说谎|撒谎|谎骗|谎称|讲假话/u.test(meaning));
  const reclining =
    base === 'lie' && meanings.some((meaning) => /[躺卧]|位于|坐落|在于|存在|停泊/u.test(meaning));
  const slots = lying
    ? [...paradigm.slice(0, 2), reclining ? 'lay,lied' : 'lied', reclining ? 'lain,lied' : 'lied']
    : paradigm;
  const bundled = slots.flatMap((slot, i) =>
    slot
      .split(',')
      .filter(Boolean)
      .map((word) => ({
        word,
        label: base === 'be' && ['am', 'are'].includes(word) ? '现在时' : inflectionLabels[i],
      })),
  );
  const unrelatedLemma = entry.supplement?.lemma && key(entry.supplement.lemma) !== base;
  const stored = entry.supplement?.manual
    ? saved
    : unrelatedLemma || lying
      ? []
      : base === 'can'
        ? saved.filter((form) => key(form.word) !== 'could')
        : saved;
  return [{ word: base, label: '原形' }, ...stored, ...bundled];
}

export function selectVerbForms(entry, candidates) {
  const meanings = verbMeanings(entry);
  if (!meanings.length) return [];
  const selected = [];
  for (const form of candidates ?? storedAndBundledForms(entry, meanings)) {
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

export function extensionItems(entry, familyData) {
  return [
    ...selectVerbForms(entry).map((form) => ({ ...form, type: 'form' })),
    ...familyForEntry(entry, familyData).map((item) => ({
      ...item,
      type: 'family',
      label: item.meaning || item.label || '常用派生词',
    })),
  ];
}

export function hasCompleteVerbForms(forms) {
  const labels = new Set(forms.flatMap((form) => form.label.split(' / ')));
  return inflectionLabels.every((label) => labels.has(label));
}
