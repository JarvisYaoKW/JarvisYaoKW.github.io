import test from 'node:test';
import assert from 'node:assert/strict';
import {
  SHEEP_SKINS,
  createWallet,
  validWallet,
  redeemSkin,
  selectedSkin,
  selectSkin,
} from '../pasture-economy.mjs';
import { renderSkinSheep } from '../sheep-art.mjs';

test('old six-skin wallets stay valid and new colorways require an affordable single purchase', () => {
  const s = { pastureWallet: createWallet(150) };
  assert.equal(s.pastureWallet.owned.length, 6);
  assert.ok(validWallet(s.pastureWallet));
  const colors = SHEEP_SKINS.filter((skin) => !skin.starter);
  assert.equal(colors.length, 8);
  for (const skin of colors) {
    assert.equal(skin.cost, 100);
    assert.equal(selectSkin(s, skin.id), false);
    assert.match(renderSkinSheep(skin.variant), /data-art=/);
  }
  for (let seed = 0; seed < 50; seed++) assert.ok(selectedSkin(s, seed).starter);
  assert.equal(redeemSkin(s, 'S007').ok, true);
  assert.equal(s.pastureWallet.balance, 50);
  assert.equal(redeemSkin(s, 'S007').reason, 'owned');
  assert.equal(redeemSkin(s, 'S008').reason, 'insufficient');
  assert.equal(selectSkin(s, 'S007'), true);
  assert.equal(selectedSkin(s).name, '草莓奶昔');
  assert.ok(validWallet(JSON.parse(JSON.stringify(s.pastureWallet))));
});
