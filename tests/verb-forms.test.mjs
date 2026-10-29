import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { verbMeanings, selectVerbForms, extensionItems } from '../verb-forms.mjs';
import { englishForPOS } from '../english-definitions.mjs';

const forms = [
  { word: 'attribute', label: '原形' },
  { word: 'attributed', label: '过去式' },
  { word: 'attributed', label: '过去分词' },
  { word: 'attributes', label: '第三人称单数' },
];
const mixed = () => ({
  english: 'attribute',
  meanings: ['n. 属性；标志', 'vt. 把……归因于'],
  supplement: { forms },
});

test('noun-only cached entries cannot get verb drills from form lists or English notes', () => {
  const entry = {
    english: 'character',
    meanings: ['n. 个性，字符，人物'],
    supplement: {
      forms: [{ word: 'charactered', label: '过去式 / 过去分词' }],
      checked: true,
      complete: true,
      familyVersion: 2,
      englishDefinitions: [{ pos: 'verb', definition: 'Past tense of character.' }],
    },
  };
  const before = JSON.stringify(entry);
  assert.deepEqual(selectVerbForms(entry), []);
  assert.deepEqual(extensionItems(entry), []);
  assert.equal(JSON.stringify(entry), before);
});

test('adjective-only and untagged senses do not silently acquire tenses', () => {
  for (const meanings of [['a. 易受伤害的'], ['adj. 适用的'], ['个性，人物']]) {
    assert.deepEqual(selectVerbForms({ meanings, supplement: { forms, manual: true } }), []);
  }
});

test('a verb after the noun is recognised and drills show only its verb meaning', () => {
  const items = selectVerbForms(mixed());
  assert.equal(items.length, 3);
  for (const item of items) {
    assert.equal(item.meaning, 'v. 把……归因于');
    assert.equal(item.pos, 'verb');
    assert.doesNotMatch(item.meaning, /属性|标志/);
  }
});

test('legacy a. adjective markers cannot leak into verb drill definitions', () => {
  const entry = { meanings: ['vt. 记录 a. 创纪录的 n. 唱片 vi. 录音'], supplement: { forms } };
  assert.deepEqual(verbMeanings(entry), ['记录', '录音']);
  assert.equal(selectVerbForms(entry)[0].meaning, 'v. 记录；录音');
});

test('explicit obsolete or rare senses are excluded from default verb drills', () => {
  for (const meaning of [
    'v. （古）刻写',
    'v. [obsolete] to engrave',
    'v. archaic: describe',
    'v. 古语：描绘',
  ]) {
    assert.deepEqual(selectVerbForms({ meanings: [meaning], supplement: { forms } }), []);
  }
  assert.deepEqual(verbMeanings({ meanings: ['vt. 使过时'] }), ['使过时']);
});

test('the same spelling merges past and past participle labels without repeated drilling', () => {
  const items = selectVerbForms(mixed());
  assert.equal(items.filter((item) => item.word === 'attributed').length, 1);
  assert.equal(items.find((item) => item.word === 'attributed').label, '过去式 / 过去分词');
});

test('noun plurals and explicitly restricted or non-verb form records are excluded', () => {
  const candidates = [
    { word: 'attributes', label: '复数' },
    { word: 'old-form', label: '过去式', tags: 'obsolete' },
    { word: 'other-form', label: '现在分词', pos: 'noun' },
    { word: 'attributed', label: '过去式' },
  ];
  assert.deepEqual(
    selectVerbForms(mixed(), candidates).map((item) => item.word),
    ['attributed'],
  );
});

test('a noun still keeps independently defined family words', () => {
  const entry = {
    english: 'application',
    meanings: ['n. 应用，申请'],
    supplement: {
      forms,
      family: [{ word: 'applicable', meaning: 'adj. 适用的' }],
    },
  };
  const items = extensionItems(entry);
  assert.equal(items.length, 1);
  assert.equal(items[0].type, 'family');
  assert.equal(items[0].word, 'applicable');
});

test('manual non-verb entries cannot bypass the POS guard', () => {
  assert.deepEqual(
    extensionItems({ meanings: ['n. 人物'], supplement: { manual: true, forms } }),
    [],
  );
});

test('verb drills do not fall back to a bundled noun definition', () => {
  const data = {
    entries: {
      attribute: {
        senses: [{ pos: 'noun', definition: 'a quality or characteristic' }],
        source: 'bundled',
      },
    },
  };
  assert.deepEqual(englishForPOS('attribute', {}, 'verb', data).senses, []);
  const found = englishForPOS(
    'attribute',
    {
      englishDefinitions: [
        { pos: 'noun', definition: 'a quality' },
        { pos: 'verb', definition: 'to regard something as caused by something else' },
      ],
      englishDefinitionSource: 'lookup',
    },
    'verb',
    data,
  );
  assert.equal(found.source, 'lookup');
  assert.deepEqual(
    found.senses.map((item) => item.pos),
    ['verb'],
  );
  assert.equal(englishForPOS('attribute', {}, '', data).senses[0].pos, 'noun');
});

test('all five preset books exclude drills with no current verb meaning', () => {
  const catalog = JSON.parse(readFileSync(new URL('../wordbooks/catalog.json', import.meta.url)));
  let rejected = 0;
  for (const book of catalog.books) {
    const rows = JSON.parse(readFileSync(new URL('..' + book.file, import.meta.url))).rows;
    for (const row of rows) {
      const ready = selectVerbForms(row);
      if (!verbMeanings(row).length) {
        assert.equal(ready.length, 0, row.english);
        if (row.supplement?.forms?.length) rejected++;
      }
      for (const item of ready) {
        assert.ok(item.meaning.startsWith('v. '), row.english);
        assert.equal(item.pos, 'verb');
      }
    }
  }
  assert.ok(rejected > 0);
});
