import test from 'node:test';
import assert from 'node:assert/strict';
import { initialState, mergeEntries, nextQuestion, submit, skipQuestion } from '../engine.mjs';
import {
  createWallet,
  ensureWallet,
  validWallet,
  redeemSkin,
  selectSkin,
  SHEEP_SKINS,
} from '../pasture-economy.mjs';

function state() {
  const s = initialState();
  mergeEntries(s, [{ english: 'apply', meaning: 'v. 申请', favorite: true }]);
  return s;
}

test('formal correct answer earns exactly one coin even after repeated submit', () => {
  const s = state();
  nextQuestion(s);
  submit(s, 'apply');
  submit(s, 'apply');
  assert.equal(s.pastureWallet.balance, 1);
  assert.equal(s.pastureWallet.recent.length, 1);
});

test('corrected retry and extra practice both earn coins', () => {
  const s = state();
  nextQuestion(s);
  submit(s, 'bad');
  assert.equal(s.pastureWallet.balance, 0);
  submit(s, 'apply');
  s.rounds.typing.current = null;
  assert.equal(nextQuestion(s).kind, 'extra');
  submit(s, 'apply');
  assert.equal(s.pastureWallet.balance, 2);
});

test('wrong answers and skipping never earn catch coins', () => {
  for (const skip of [true, false]) {
    const s = state();
    nextQuestion(s);
    submit(s, 'bad');
    if (skip) skipQuestion(s);
    else submit(s, 'bad');
    assert.equal(s.pastureWallet.balance, 0);
  }
});

test('legacy correct counts migrate once without changing progress', () => {
  const s = state();
  delete s.pastureWallet;
  s.entries.apply.stats.typing.correct = 3;
  s.entries.apply.stats.choice.correct = 2;
  const before = JSON.stringify(s.rounds);
  assert.equal(ensureWallet(s).balance, 5);
  assert.equal(ensureWallet(s).balance, 5);
  assert.equal(JSON.stringify(s.rounds), before);
});

test('all starter skins remain available without spending', () => {
  const s = state();
  assert.equal(SHEEP_SKINS.length, 6);
  for (const skin of SHEEP_SKINS) {
    assert.ok(s.pastureWallet.owned.includes(skin.id));
    assert.equal(selectSkin(s, skin.id), true);
  }
  assert.equal(s.pastureWallet.balance, 0);
});

test('future redemption requires balance and cannot charge twice', () => {
  const s = state();
  const catalog = [...SHEEP_SKINS, { id: 'S007', name: 'Test skin', cost: 3, variant: 0 }];
  assert.equal(redeemSkin(s, 'S007', catalog).reason, 'insufficient');
  s.pastureWallet = createWallet(5);
  assert.equal(redeemSkin(s, 'S007', catalog).ok, true);
  assert.equal(redeemSkin(s, 'S007', catalog).reason, 'owned');
  assert.equal(s.pastureWallet.balance, 2);
  assert.equal(s.pastureWallet.spent, 3);
  assert.ok(validWallet(s.pastureWallet));
  assert.equal(validWallet({ ...s.pastureWallet, balance: 100 }), false);
});
