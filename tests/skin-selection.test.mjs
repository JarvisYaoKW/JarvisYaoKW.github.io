import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createWallet,
  selectSkin,
  toggleSkin,
  selectedSkin,
  validWallet,
  skinSelection,
} from '../pasture-economy.mjs';
test('selected subset survives restore and excludes unselected or unowned skins', () => {
  const s = { pastureWallet: createWallet(123) };
  selectSkin(s, 'S001');
  toggleSkin(s, 'S003');
  assert.deepEqual(skinSelection(s), ['S001', 'S003']);
  assert.deepEqual(
    new Set(Array.from({ length: 20 }, (_, i) => selectedSkin(s, i).id)),
    new Set(['S001', 'S003']),
  );
  assert.equal(toggleSkin(s, 'S007'), false);
  assert.equal(toggleSkin(s, 'S001'), true);
  assert.equal(selectedSkin(s, 13).id, 'S003');
  assert.equal(toggleSkin(s, 'S003'), false);
  assert.ok(validWallet(JSON.parse(JSON.stringify(s.pastureWallet))));
  assert.equal(s.pastureWallet.balance, 123);
  selectSkin(s, 'mixed');
  assert.equal(skinSelection(s).length, 6);
});
