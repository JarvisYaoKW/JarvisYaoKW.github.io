import test from 'node:test';
import assert from 'node:assert/strict';
import { SHEEP_ART_IDS, renderSkinSheep } from '../sheep-art.mjs';
import { SHEEP_SKINS, selectSkin, ensureWallet } from '../pasture-economy.mjs';
import { initialState } from '../engine.mjs';

test('six existing inventory IDs select the supplied six skins without charging or resetting state', () => {
  const s = initialState();
  ensureWallet(s);
  const round = JSON.stringify(s.rounds),
    balance = s.pastureWallet.balance;
  assert.deepEqual(
    SHEEP_SKINS.filter((s) => s.starter).map((skin) => skin.id),
    ['S001', 'S002', 'S003', 'S004', 'S005', 'S006'],
  );
  assert.deepEqual(
    SHEEP_SKINS.filter((s) => s.starter).map((skin) => skin.name),
    ['原味糯米', '黑芝麻', '焦糖', '云灰', '卷角', '花斑'],
  );
  for (const skin of SHEEP_SKINS.filter((s) => s.starter)) {
    assert.equal(selectSkin(s, skin.id), true);
    const svg = renderSkinSheep(skin.variant);
    assert.ok(svg.includes(`data-art="${SHEEP_ART_IDS[skin.variant]}"`));
    assert.match(svg, /viewBox="0 0 280 180"/);
    assert.doesNotMatch(svg, /<text\b|<script\b|<foreignObject\b/);
  }
  assert.equal(JSON.stringify(s.rounds), round);
  assert.equal(s.pastureWallet.balance, balance);
});

test('drawings have unique gradient and clip IDs across pasture, shop and legend', () => {
  const ids = Array.from({ length: 36 }, (_, i) =>
    renderSkinSheep(i % SHEEP_ART_IDS.length),
  ).flatMap((svg) => [...svg.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1]));
  assert.equal(new Set(ids).size, ids.length);
});
