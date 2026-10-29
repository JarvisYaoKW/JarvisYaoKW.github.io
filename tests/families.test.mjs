import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { familyForEntry } from '../family-data.mjs';
import { extensionItems, selectVerbForms } from '../verb-forms.mjs';
import { englishForPOS } from '../english-definitions.mjs';
import { splitMeanings } from '../pronunciation-view.mjs';

const bytes = readFileSync(new URL('../wordbooks/families.json', import.meta.url));
const data = JSON.parse(bytes);
const lock = JSON.parse(readFileSync(new URL('../wordbooks/families-lock.json', import.meta.url)));

test('adjective families include a real adverb with its own Chinese, English and IPA', () => {
  const entry = {
    english: 'clear',
    meanings: ['adj. 清楚的'],
    supplement: { familyVersion: 2, checked: true, complete: true },
  };
  const before = JSON.stringify(entry);
  const family = familyForEntry(entry, data);
  const adverb = family.find((item) => item.word === 'clearly');
  assert.equal(adverb.pos, 'adverb');
  assert.match(adverb.meaning, /^adv\. /);
  assert.ok(adverb.phonetic);
  assert.ok(adverb.englishDefinitions.every((sense) => sense.pos === 'adverb'));
  assert.equal(adverb.origin, 'wordnet');
  assert.equal(JSON.stringify(entry), before);
  assert.ok(
    extensionItems(entry, data).some((item) => item.word === 'clearly' && item.type === 'family'),
  );
  assert.deepEqual(selectVerbForms(entry), []);
});

test('family links require the root POS currently imported, even in old caches', () => {
  const noun = familyForEntry({ english: 'clear', meanings: ['n. 空地'] }, data);
  assert.equal(
    noun.some((item) => item.word === 'clearly'),
    false,
  );
  const verb = familyForEntry({ english: 'clear', meanings: ['vt. 清除'] }, data);
  assert.ok(verb.some((item) => item.word === 'clearance'));
  assert.equal(
    verb.some((item) => item.word === 'clearly'),
    false,
  );
});

test('adding a verb family member never turns a noun root into a tense exercise', () => {
  const items = extensionItems(
    {
      english: 'character',
      meanings: ['n. 人物，性格，字符'],
      supplement: { forms: [{ word: 'charactered', label: '过去式 / 过去分词' }] },
    },
    data,
  );
  assert.ok(items.some((item) => item.word === 'characterize' && item.pos === 'verb'));
  assert.ok(items.every((item) => item.type === 'family'));
  assert.equal(
    items.some((item) => item.word === 'charactered'),
    false,
  );
});

test('manual definitions take precedence and family words are deduplicated', () => {
  const entry = {
    english: 'clear',
    meanings: ['a. 清楚的'],
    supplement: { manual: true, family: [{ word: 'clearly', meaning: 'adv. 清晰地（自定义）' }] },
  };
  const family = familyForEntry(entry, data);
  assert.equal(family.filter((item) => item.word === 'clearly').length, 1);
  assert.equal(family[0].meaning, 'adv. 清晰地（自定义）');
});

test('source-based families do not invent an -ly word or use a synonym edge', () => {
  const family = familyForEntry({ english: 'friendly', meanings: ['a. 友好的'] }, data);
  assert.equal(
    family.some((item) => item.word === 'friendlyly'),
    false,
  );
  assert.ok(family.some((item) => item.word === 'friendliness'));
  assert.ok(family.every((item) => item.evidence?.length));
  assert.deepEqual(
    familyForEntry(
      { english: 'constructor', meanings: ['n. 建造者'] },
      { entries: {}, members: {} },
    ),
    [],
  );
});

test('family English uses the verified target POS rather than a bundled other sense', () => {
  const adverb = familyForEntry({ english: 'clear', meanings: ['a. 清楚的'] }, data).find(
    (item) => item.word === 'clearly',
  );
  const result = englishForPOS('clearly', adverb, adverb.pos, {
    entries: {
      clearly: { senses: [{ pos: 'noun', definition: 'wrong POS fixture' }], source: 'fixture' },
    },
  });
  assert.equal(result.source, 'WordNet 3.0');
  assert.ok(result.senses.length);
  assert.ok(result.senses.every((sense) => sense.pos === 'adverb'));
});

test('published word-family data matches its audit and has complete, licensed evidence', () => {
  assert.equal(createHash('sha256').update(bytes).digest('hex'), lock.outputSHA256);
  assert.equal(Object.keys(data.entries).length, lock.coveredRoots);
  assert.equal(Object.keys(data.members).length, lock.members);
  assert.equal(Object.values(data.entries).flat().length, lock.relationCount);
  assert.ok(
    readFileSync(new URL('../wordbooks/WordNet-LICENSE.txt', import.meta.url), 'utf8').includes(
      'Princeton University',
    ),
  );
  for (const [word, edges] of Object.entries(data.entries)) {
    assert.ok(edges.length <= 12, word);
    for (const edge of edges) {
      assert.ok(['adverb-adjective', 'derivation'].includes(edge.relation), word);
      assert.ok(edge.evidence.length, word);
      const member = data.members[edge.member];
      assert.ok(member, word);
      assert.notEqual(member.word, word);
      assert.ok(
        splitMeanings([member.meaning]).some((sense) => sense.pos === member.pos),
        word,
      );
      assert.ok(member.englishDefinitions.length, word);
      assert.ok(
        member.englishDefinitions.every((sense) => sense.pos === member.pos),
        word,
      );
      assert.match(member.meaning, /[\u3400-\u9fff]/u);
    }
  }
});
