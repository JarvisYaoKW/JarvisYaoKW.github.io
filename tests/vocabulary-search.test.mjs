import test from 'node:test';
import assert from 'node:assert/strict';
import { matchesVocabulary, bindVocabularySearch } from '../vocabulary-search.mjs';

test('Chinese terms match merged meanings, separated keywords and imported punctuation', () => {
  const entry = { english: 'planning', meanings: ['n. 计划的制订；策划、设计', '规划'] };
  for (const query of [
    '计划',
    ' 制订 ',
    '计划 制订',
    'ＰＬＡＮＮＩＮＧ',
    '策划，设计',
    '规\u200b划',
  ]) {
    assert.ok(matchesVocabulary(entry, query), query);
  }
  assert.equal(matchesVocabulary(entry, '计划 生物'), false);
  assert.equal(matchesVocabulary(entry, '安排'), false); // Do not invent synonym matches.
  assert.ok(matchesVocabulary({ english: 'income', meanings: ['n. 收 入'] }, '收入'));
  assert.ok(matchesVocabulary(entry, ''));
});

test('search waits for Chinese IME commit and keeps complete text and selection', () => {
  const field = new EventTarget(),
    updates = [];
  Object.assign(field, { value: '', selectionStart: 0, selectionEnd: 0 });
  bindVocabularySearch(field, (...args) => updates.push(args));
  field.dispatchEvent(new Event('compositionstart'));
  field.value = 'gui hua';
  field.dispatchEvent(new Event('input'));
  assert.equal(updates.length, 0);
  Object.assign(field, { value: '规划', selectionStart: 2, selectionEnd: 2 });
  field.dispatchEvent(new Event('compositionend'));
  assert.deepEqual(updates, [['规划', 2, 2]]);
  field.value = '计划';
  field.dispatchEvent(new Event('input'));
  assert.equal(updates.at(-1)[0], '计划');
});
