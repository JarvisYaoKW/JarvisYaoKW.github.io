import test from 'node:test';
import assert from 'node:assert/strict';
import { practiceShortcut as resolve } from '../shortcuts.mjs';
const key = (value, extra = {}) => ({ key: value, ...extra });
test('Enter submits, then advances only after the answer is finished', () => {
  assert.equal(resolve(key('Enter')), 'submit');
  assert.equal(resolve(key('Enter'), { finished: true }), 'next');
  assert.equal(resolve(key('Enter'), { choice: true }), null);
  assert.equal(resolve(key('Enter'), { auxiliary: 'repeat' }), 'aux-next');
});
test('adding and skipping have separate commands in family input', () => {
  assert.equal(resolve(key('Enter', { ctrlKey: true }), { auxiliary: 'extend' }), 'add');
  assert.equal(resolve(key('Enter', { ctrlKey: true })), null);
  assert.equal(resolve(key('Enter', { shiftKey: true }), { auxiliary: 'extend' }), 'skip');
  assert.equal(resolve(key('Enter', { shiftKey: true })), 'skip');
  assert.equal(resolve(key('Enter', { shiftKey: true }), { finished: true }), null);
  assert.equal(resolve(key('Enter', { shiftKey: true }), { auxiliary: 'repeat' }), null);
});
test('answer-only letter commands never intercept spelling or auxiliary typing', () => {
  for (const [letter, action] of Object.entries({
    r: 'repeat',
    e: 'extend-family',
    f: 'favorite',
    p: 'audio',
  })) {
    assert.equal(resolve(key(letter)), null);
    assert.equal(resolve(key(letter), { finished: true }), action);
    assert.equal(resolve(key(letter), { auxiliary: 'extend', finished: true }), null);
  }
  assert.equal(resolve(key('E', { shiftKey: true }), { finished: true }), 'extend-all');
  assert.equal(resolve(key(' ')), null);
  assert.equal(resolve(key(' '), { finished: true }), 'next');
  assert.equal(resolve(key('PageUp')), 'previous');
  assert.equal(resolve(key('1'), { choice: true }), 'choose-1');
});
test('held keys, IME and browser modifier chords do not dispatch commands', () => {
  for (const modifier of ['repeat', 'isComposing', 'altKey', 'metaKey', 'ctrlKey']) {
    assert.equal(resolve(key('Enter', { [modifier]: true }), { finished: true }), null);
  }
});
