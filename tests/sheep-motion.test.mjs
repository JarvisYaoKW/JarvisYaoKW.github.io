import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ACTIONS,
  SKINS,
  WORD_SIZES,
  poseAt,
  getPartTransforms,
  renderSheepSVG,
  registerSkin,
  createSheep,
} from '../sheep-motion.mjs';

const skinIds = Object.keys(SKINS);
const baseIds = skinIds.filter((id) => SKINS[id].collection !== 'color');
const colorIds = skinIds.filter((id) => SKINS[id].collection === 'color');
const actions = Object.keys(ACTIONS);

test('six base skins, eight colorways and six reusable actions are registered', () => {
  assert.equal(baseIds.length, 6);
  assert.equal(colorIds.length, 8);
  assert.equal(skinIds.length, 14);
  assert.deepEqual(actions, ['idle', 'walk', 'graze', 'stretch', 'hop', 'tailWag']);
  assert.deepEqual(WORD_SIZES, { 1: 38, 10: 52, 50: 70, 100: 94, 500: 126 });
});

test('colorways are distinct and inherit the same five size tiers and six motions', () => {
  const coats = colorIds.map((id) => SKINS[id].wool);
  assert.equal(new Set(coats).size, 8);
  for (const id of colorIds) {
    const svg = renderSheepSVG(id, `color-${id}`);
    assert.match(svg, /data-part="headLayer"/);
    assert.match(svg, /data-part="frontNear"/);
    for (const value of Object.keys(WORD_SIZES)) assert.ok(WORD_SIZES[value] > 0);
    for (const action of actions) assert.ok(poseAt(action, 0.5));
  }
});

test('every skin renders the same articulated rig for all actions', () => {
  for (const skinId of skinIds) {
    const svg = renderSheepSVG(skinId, `test-${skinId}`);
    for (const name of [
      'bodyBob',
      'headLayer',
      'head',
      'tail',
      'frontNear',
      'frontFar',
      'hindNear',
      'hindFar',
    ]) {
      assert.match(svg, new RegExp(`data-part="${name}"`), `${skinId} missing ${name}`);
    }
    for (const action of actions)
      assert.ok(poseAt(action, 0.35), `${skinId} cannot play ${action}`);
    assert.doesNotMatch(svg, /<text\b/);
  }
});

test('head is painted after all legs, preventing the foreground hoof from crossing the face', () => {
  for (const skinId of skinIds) {
    const svg = renderSheepSVG(skinId, `order-${skinId}`);
    assert.ok(svg.indexOf('data-part="headLayer"') > svg.indexOf('data-part="frontNear"'));
    assert.equal(
      getPartTransforms(poseAt('graze', 2)).headLayer,
      getPartTransforms(poseAt('graze', 2)).bodyBob,
    );
  }
});

test('ram has a compact curved horn and all other skins remain horn-free', () => {
  const ram = renderSheepSVG('ram', 'ram-horn');
  assert.match(ram, /data-part="horn"/);
  assert.doesNotMatch(ram, /M105 58 C110 36 142 40/);
  for (const id of skinIds.filter((id) => id !== 'ram')) {
    assert.doesNotMatch(renderSheepSVG(id, `nohorn-${id}`), /data-part="horn"/);
  }
});

test('walk uses alternating diagonal legs', () => {
  const p = poseAt('walk', 0.11);
  assert.ok(p.frontNear * p.frontFar < 0);
  assert.ok(p.hindNear * p.hindFar < 0);
  assert.ok(Math.sign(p.frontNear) === Math.sign(p.hindFar));
});

test('graze carries the face forward and downward, clear of the front hoof', () => {
  const p = poseAt('graze', 2.0);
  assert.ok(p.headAngle < -18);
  assert.ok(p.headX < -27, 'face should extend in front of the torso');
  assert.ok(p.headY > 11, 'head should reach grazing height');
  // Face's rear-most edge at x=106, y=100 rotates about (103,85).
  // Keep that point to the left of the near foreleg's edge at x=82.
  const radians = (p.headAngle * Math.PI) / 180;
  const rearFaceX =
    103 + (106 - 103) * Math.cos(radians) - (100 - 85) * Math.sin(radians) + p.headX;
  assert.ok(rearFaceX < 82, `face intersects front leg: x=${rearFaceX}`);
  assert.match(getPartTransforms(p).head, /translate\(-30\./);
  for (const part of ['frontNear', 'frontFar', 'hindNear', 'hindFar']) assert.equal(p[part], 0);
});

test('grazing transition and chewing stay smooth across their boundaries', () => {
  for (const t of [0.75, 0.8, 0.97, 3.0, 3.25, 4.0, 4.2]) {
    const a = poseAt('graze', t - 0.001);
    const b = poseAt('graze', t + 0.001);
    for (const key of ['headX', 'headY', 'headAngle']) {
      assert.ok(Math.abs(a[key] - b[key]) < 0.12, `jump at ${t}s in ${key}`);
    }
  }
});

test('idle, walk, graze, stretch, hop and wag all loop continuously', () => {
  for (const [action, { duration }] of Object.entries(ACTIONS)) {
    const a = poseAt(action, 0);
    const b = poseAt(action, duration);
    for (const key of [
      'bodyY',
      'headAngle',
      'tailAngle',
      'frontNear',
      'frontFar',
      'hindNear',
      'hindFar',
    ]) {
      assert.ok(Math.abs(a[key] - b[key]) < 0.001, `${action} discontinuity in ${key}`);
    }
  }
});

test('reduced motion returns stable neutral pose', () => {
  const p = poseAt('hop', 0.4, true);
  assert.equal(p.bodyY, 0);
  assert.equal(p.frontNear, 0);
  assert.equal(p.headAngle, 0);
});

test('future skins register without modifying the action engine', () => {
  registerSkin('test_future', { ...SKINS.original, label: '新羊' });
  assert.match(renderSheepSVG('test_future', 'new'), /data-part="head"/);
  assert.equal(actions.length, Object.keys(ACTIONS).length);
  delete SKINS.test_future;
});

test('a mounted sheep can switch skins, all actions and sizes without rebuilding the animation contract', () => {
  const oldDocument = globalThis.document;
  const oldWindow = globalThis.window;
  const oldRAF = globalThis.requestAnimationFrame;
  const partMap = new Map();
  const fakeSvg = {
    style: {},
    querySelector(selector) {
      const name = selector.match(/data-part="([^"]+)"/)?.[1];
      if (!partMap.has(name))
        partMap.set(name, {
          style: {},
          attributes: {},
          setAttribute(key, val) {
            this.attributes[key] = val;
          },
        });
      return partMap.get(name);
    },
  };
  const el = {
    style: {},
    attributes: {},
    innerHTML: '',
    setAttribute(k, v) {
      this.attributes[k] = v;
    },
    querySelector: () => fakeSvg,
    remove() {},
  };
  globalThis.document = { createElement: () => el };
  globalThis.window = { matchMedia: () => ({ matches: false }) };
  globalThis.requestAnimationFrame = () => 1;
  try {
    const sheep = createSheep({ skinId: 'original', wordValue: 50, action: 'walk' });
    const before = sheep.element.style.width;
    sheep.setSkin('ram');
    assert.equal(sheep.element.style.width, before);
    for (const skinId of colorIds) {
      sheep.setSkin(skinId);
      assert.equal(sheep.getState().action, 'walk');
      assert.equal(sheep.getState().wordValue, 50);
    }
    for (const action of actions) sheep.setAction(action);
    sheep.setAction('graze');
    sheep._frame(performance.now() + 1500);
    assert.match(partMap.get('head').attributes.transform, /rotate\(-/);
    sheep.setWordValue(500).setDirection('right');
    assert.equal(sheep.element.style.width, '126px');
    assert.equal(sheep.element.style.transform, 'scaleX(-1)');
    sheep.pause();
    sheep.play();
    sheep.destroy();
  } finally {
    globalThis.document = oldDocument;
    globalThis.window = oldWindow;
    globalThis.requestAnimationFrame = oldRAF;
  }
});
