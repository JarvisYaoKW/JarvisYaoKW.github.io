import test from 'node:test';
import assert from 'node:assert/strict';
import { parseBin } from '../bin-parser.mjs';

// Synthetic fixture follows the supported length-prefixed UTF-16LE export shape.
// No private vocabulary export is included in this repository.
function string(value) {
  const text = Buffer.from(value, 'utf16le');
  const length = Buffer.alloc(4);
  length.writeUInt32LE(value.length);
  return Buffer.concat([length, text, Buffer.alloc(4 - (text.length % 4))]);
}

function fixture() {
  return Buffer.concat([
    Buffer.alloc(12),
    string('apply'),
    string('/əˈplaɪ/'),
    string('v. 申请；应用'),
    string('写作'),
    Buffer.alloc(12),
    string('en'),
    string('zh-CHS'),
  ]);
}

test('supported BIN shape retains English, Chinese, phonetic and group', () => {
  const rows = parseBin(fixture());
  assert.equal(rows.length, 1);
  assert.equal(rows[0].english, 'apply');
  assert.deepEqual(rows[0].meanings, ['v. 申请；应用']);
  assert.equal(rows[0].phonetic, '/əˈplaɪ/');
  assert.deepEqual(rows[0].groups, ['写作']);
});

test('truncated and invalid-length inputs are rejected', () => {
  const bytes = fixture();
  assert.throws(() => parseBin(bytes.subarray(0, bytes.length - 5)));
  const invalid = Buffer.from(bytes);
  invalid.writeUInt32LE(0x7fffffff, 12);
  assert.throws(() => parseBin(invalid));
  assert.throws(() => parseBin(new Uint8Array(3)));
});
