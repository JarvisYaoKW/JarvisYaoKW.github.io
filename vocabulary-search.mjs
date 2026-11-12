// Search normalization is separate from spelling checks; do not alter saved words.
export const searchText = (value) =>
  String(value ?? '')
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[\u200b-\u200d\ufeff]/g, '')
    .replace(/[\p{P}\p{S}\s]+/gu, ' ')
    .trim();

export function matchesVocabulary(entry, query) {
  const terms = searchText(query).split(' ').filter(Boolean);
  const text = searchText([entry.english, ...(entry.meanings || [])].join(' '));
  const compact = text.replaceAll(' ', '');
  return terms.every((term) => text.includes(term) || compact.includes(term));
}

// A composing input must remain mounted until the IME commits its chosen characters.
export function bindVocabularySearch(field, update) {
  let composing = false;
  field.addEventListener('compositionstart', () => {
    composing = true;
  });
  field.addEventListener('compositionend', () => {
    composing = false;
    update(field.value, field.selectionStart, field.selectionEnd);
  });
  field.addEventListener('input', (event) => {
    if (!composing && !event.isComposing)
      update(field.value, field.selectionStart, field.selectionEnd);
  });
}
