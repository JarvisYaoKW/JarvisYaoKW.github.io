import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

function data(file) {
  return JSON.parse(readFileSync(new URL('../wordbooks/' + file, import.meta.url), 'utf8'));
}

const catalog = data('catalog.json');
const definitions = data('english-definitions.json');

for (const book of catalog.books) {
  test(`${book.id}: published count, unique keys and English definitions`, () => {
    const rows = data(book.file.split('/').at(-1)).rows;
    assert.equal(rows.length, book.count);
    const keys = new Set();
    for (const row of rows) {
      const key = row.english.trim().toLowerCase();
      assert.ok(key);
      assert.equal(keys.has(key), false, `Duplicate: ${key}`);
      keys.add(key);
      assert.ok(
        row.meanings.some((meaning) => meaning.trim()),
        `Chinese: ${key}`,
      );
      const senses = definitions.entries[key]?.senses;
      assert.ok(
        senses?.some((sense) => sense.definition?.trim()),
        `English: ${key}`,
      );
    }
  });
}
