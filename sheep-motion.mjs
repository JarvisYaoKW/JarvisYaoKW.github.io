/**
 * 咩词 / Mieci — reusable, dependency-free sheep rig and motion controller.
 * Skin, word-value size and looping action are independent dimensions.
 * Artwork is made of articulated SVG parts: legs, body, head, ears and tail.
 */

export const WORD_SIZES = Object.freeze({ 1: 38, 10: 52, 50: 70, 100: 94, 500: 126 });

export const ACTIONS = Object.freeze({
  idle: { label: '停留 / Idle', duration: 2.8 },
  walk: { label: '行走 / Walk', duration: 0.84 },
  graze: { label: '吃草 / Graze', duration: 4.2 },
  stretch: { label: '伸展 / Stretch', duration: 2.8 },
  hop: { label: '轻跳 / Hop', duration: 1.25 },
  tailWag: { label: '摇尾 / Tail wag', duration: 1.4 },
});

export const SKINS = {
  original: {
    label: '原味糯米',
    wool: '#F8E7C9',
    shade: '#EBCDA6',
    face: '#F1BD98',
    ear: '#B98B77',
    hoof: '#6D5144',
    outline: '#75513C',
    tuft: 'round',
    earKind: 'long',
  },
  sesame: {
    label: '黑芝麻',
    wool: '#F7EACF',
    shade: '#E9D4B2',
    face: '#554644',
    ear: '#6B5957',
    hoof: '#574442',
    outline: '#6E4C3D',
    tuft: 'curl',
    earKind: 'short',
    darkFace: true,
  },
  caramel: {
    label: '焦糖',
    wool: '#EFC27E',
    shade: '#DBA35E',
    face: '#CD845A',
    ear: '#A66F58',
    hoof: '#79503F',
    outline: '#80523A',
    tuft: 'wavy',
    earKind: 'short',
  },
  ash: {
    label: '云灰',
    wool: '#C9C7CE',
    shade: '#ABA9B3',
    face: '#A98998',
    ear: '#A48696',
    hoof: '#66545C',
    outline: '#76565B',
    tuft: 'fluffy',
    earKind: 'doubleLong',
    tuftColor: '#F8E8D2',
  },
  ram: {
    label: '卷角',
    wool: '#F6E5C5',
    shade: '#E7CFA4',
    face: '#EFB48E',
    ear: '#B98975',
    hoof: '#765343',
    outline: '#76503B',
    tuft: 'round',
    earKind: 'short',
    horn: '#CEAA79',
  },
  patches: {
    label: '花斑',
    wool: '#F8EBCF',
    shade: '#EAD5B1',
    face: '#EFB790',
    ear: '#9B6A56',
    hoof: '#6C4D42',
    outline: '#74503D',
    tuft: 'fluffy',
    earKind: 'long',
    facePatch: '#9D6A50',
    coatPatches: '#A67557',
  },
  // Colorway collection / 彩色扩展系列 — only pigment and simple tuft/ear styling
  // change; every sheep still has the exact same articulated anatomy and actions.
  strawberry: {
    collection: 'color',
    label: '草莓奶昔',
    wool: '#F8CAD8',
    shade: '#EAA9BD',
    face: '#F0BDA1',
    ear: '#B97C8E',
    hoof: '#795764',
    outline: '#916475',
    tuft: 'fluffy',
    earKind: 'long',
  },
  mint: {
    collection: 'color',
    label: '薄荷云',
    wool: '#BCE7D5',
    shade: '#95CCB8',
    face: '#E9BA9C',
    ear: '#A4877D',
    hoof: '#5F7063',
    outline: '#5D8B79',
    tuft: 'round',
    earKind: 'short',
  },
  sky: {
    collection: 'color',
    label: '晴空蓝',
    wool: '#C2E1F4',
    shade: '#95C7E5',
    face: '#EDBEA0',
    ear: '#A68A82',
    hoof: '#637484',
    outline: '#6488A1',
    tuft: 'wavy',
    earKind: 'long',
  },
  lavender: {
    collection: 'color',
    label: '薰衣草',
    wool: '#DCD3F4',
    shade: '#BBADE0',
    face: '#DFB49F',
    ear: '#AB8FAD',
    hoof: '#736481',
    outline: '#82739B',
    tuft: 'fluffy',
    earKind: 'short',
  },
  lemon: {
    collection: 'color',
    label: '奶油柠檬',
    wool: '#F9ECB3',
    shade: '#E6D58B',
    face: '#EDBF9B',
    ear: '#B49A77',
    hoof: '#837457',
    outline: '#988150',
    tuft: 'round',
    earKind: 'long',
  },
  peach: {
    collection: 'color',
    label: '蜜桃乌龙',
    wool: '#FFD2B9',
    shade: '#EFAC92',
    face: '#E7AF98',
    ear: '#B68075',
    hoof: '#896556',
    outline: '#A17465',
    tuft: 'wavy',
    earKind: 'short',
  },
  cherry: {
    collection: 'color',
    label: '樱桃布丁',
    wool: '#E994A0',
    shade: '#CE6D80',
    face: '#F1BDA5',
    ear: '#A76D7B',
    hoof: '#76515E',
    outline: '#94586A',
    tuft: 'fluffy',
    earKind: 'long',
  },
  midnight: {
    collection: 'color',
    label: '午夜蓝',
    wool: '#697A9B',
    shade: '#4B5F80',
    face: '#D3B1A8',
    ear: '#A089A7',
    hoof: '#3D4B63',
    outline: '#4A5A79',
    tuft: 'round',
    earKind: 'short',
    tuftColor: '#96A7C5',
  },
};

export function registerSkin(id, skin) {
  if (!/^[a-z][a-z0-9_-]*$/.test(id)) throw new Error('Invalid skin id');
  if (SKINS[id]) throw new Error(`Skin already exists: ${id}`);
  for (const field of ['label', 'wool', 'shade', 'face', 'ear', 'hoof', 'outline']) {
    if (typeof skin[field] !== 'string' || !skin[field])
      throw new Error(`Missing skin field: ${field}`);
  }
  SKINS[id] = { tuft: 'round', earKind: 'long', ...skin };
}

const TAU = Math.PI * 2;
const clamp01 = (x) => Math.max(0, Math.min(1, x));
const smoothstep = (x) => {
  const t = clamp01(x);
  return t * t * (3 - 2 * t);
};

/** Pure deterministic animation function; seconds may be fractional or negative. */
export function poseAt(action = 'idle', seconds = 0, reducedMotion = false) {
  if (!ACTIONS[action]) throw new Error(`Unknown action: ${action}`);
  const base = {
    bodyY: 0,
    breath: 1,
    bodyAngle: 0,
    headAngle: 0,
    headX: 0,
    headY: 0,
    tailAngle: 0,
    frontNear: 0,
    frontFar: 0,
    hindNear: 0,
    hindFar: 0,
    eyesClosed: false,
    happyMouth: false,
  };
  if (reducedMotion) return base;
  const duration = ACTIONS[action].duration;
  const t = ((seconds % duration) + duration) % duration;
  const phase = (t / duration) * TAU;

  if (action === 'idle') {
    base.breath = 1 + 0.014 * Math.sin(phase);
    base.bodyY = 0.7 * Math.sin(phase);
    base.headAngle = 1.1 * Math.sin(phase + 0.3);
    base.tailAngle = 5 * Math.sin(phase);
    base.eyesClosed = ((seconds % 4.9) + 4.9) % 4.9 > 4.76;
  } else if (action === 'walk') {
    const s = Math.sin(phase);
    base.bodyY = -2.2 * Math.abs(s);
    base.headAngle = 2 * Math.sin(phase + 0.8);
    base.frontNear = 23 * s;
    base.hindFar = 20 * s;
    base.frontFar = -23 * s;
    base.hindNear = -20 * s;
    base.tailAngle = 8 * Math.sin(phase + 1.4);
  } else if (action === 'graze') {
    const down = smoothstep(t / 0.8);
    const up = 1 - smoothstep((t - 3.25) / 0.75);
    const amount = Math.min(down, up);
    // Move the head forward AND down along an arc outside the front legs.
    // Rotating alone around the neck drove the face into the torso/hooves.
    base.headX = -30 * amount;
    base.headAngle = -22 * amount;
    base.headY = 13 * amount;
    base.bodyY = 0.5 * amount;
    const chewing = smoothstep((t - 0.75) / 0.22) * (1 - smoothstep((t - 3.0) / 0.25));
    base.headY += 0.7 * chewing * Math.sin(t * 10);
    base.headAngle += 0.7 * chewing * Math.sin(t * 10);
    base.eyesClosed = t > 1.15 && t < 1.28;
  } else if (action === 'stretch') {
    const extend = smoothstep(t / 0.75) * (1 - smoothstep((t - 1.9) / 0.7));
    base.bodyY = 4.5 * extend;
    base.bodyAngle = -2.5 * extend;
    base.headAngle = -10 * extend;
    base.frontNear = -27 * extend;
    base.frontFar = -22 * extend;
    base.hindNear = 8 * extend;
    base.eyesClosed = extend > 0.25;
  } else if (action === 'hop') {
    const launch = Math.max(0, Math.sin(phase));
    base.bodyY = -14 * launch * launch;
    base.bodyAngle = -4 * launch;
    base.headAngle = -5 * launch;
    base.frontNear = 15 * launch;
    base.frontFar = 10 * launch;
    base.hindNear = -19 * launch;
    base.hindFar = -13 * launch;
    base.happyMouth = launch > 0.18;
  } else if (action === 'tailWag') {
    base.breath = 1 + 0.008 * Math.sin(phase);
    base.headAngle = 1.4 * Math.sin(phase / 2);
    base.tailAngle = 28 * Math.sin(phase);
  }
  return base;
}

/** One transform map is shared by the live browser rig and offline preview renderer. */
export function getPartTransforms(p) {
  const bodyTransform = `translate(0 ${p.bodyY.toFixed(2)}) rotate(${p.bodyAngle.toFixed(2)} 150 110) translate(0 105) scale(1 ${p.breath.toFixed(4)}) translate(0 -105)`;
  return {
    bodyBob: bodyTransform,
    headLayer: bodyTransform,
    head: `translate(${p.headX.toFixed(2)} ${p.headY.toFixed(2)}) rotate(${p.headAngle.toFixed(2)} 103 85)`,
    tail: `rotate(${p.tailAngle.toFixed(2)} 240 88)`,
    frontNear: `translate(91 125) rotate(${p.frontNear.toFixed(2)})`,
    frontFar: `translate(114 126) rotate(${p.frontFar.toFixed(2)})`,
    hindNear: `translate(194 125) rotate(${p.hindNear.toFixed(2)})`,
    hindFar: `translate(215 124) rotate(${p.hindFar.toFixed(2)})`,
  };
}

// The shared silhouette is intentionally tall and scalloped: large wool puffs
// remain readable at the smallest 38px size, unlike fine fleece texture.
const BODY_PATH =
  'M94 67 C82 59 86 45 98 39 C98 26 114 20 126 30 C136 12 153 11 164 25 C178 12 194 22 199 34 C217 27 230 43 231 57 C245 62 252 76 243 89 C252 102 247 116 236 119 C235 132 220 138 208 132 C202 145 185 145 175 134 C162 145 147 142 138 133 C127 144 111 141 105 130 C89 135 78 126 79 113 C65 110 65 95 73 85 C68 74 78 64 94 67 Z';

const tuftPaths = {
  round:
    'M44 77 C34 68 39 56 52 54 C54 42 70 40 80 48 C91 40 105 49 104 60 C118 63 117 77 105 81 C84 85 61 84 44 77 Z',
  curl: 'M43 76 C31 64 40 49 54 52 C58 35 78 36 85 49 C104 42 117 52 113 68 C109 80 84 86 63 83 C46 81 50 71 58 67 C67 61 73 68 69 74',
  wavy: 'M38 77 C39 65 47 60 55 62 C52 48 67 42 78 48 C91 39 106 49 103 60 C117 61 118 75 105 82 C84 85 60 87 38 77 Z',
  fluffy:
    'M39 78 C27 70 35 55 48 55 C46 43 61 39 72 46 C81 34 97 41 100 52 C115 50 122 65 114 75 C105 88 58 88 39 78 Z',
};

function legMarkup(part, x, y, far, skin) {
  const color = far ? skin.ear : skin.face;
  return `<g data-part="${part}" transform="translate(${x} ${y})">
    <rect x="-9" y="-3" width="18" height="37" rx="7" fill="${color}" stroke="${skin.outline}" stroke-width="4" />
    <path d="M-9 23 Q0 20 9 23 L9 29 Q9 35 3 35 L-3 35 Q-9 35 -9 29 Z" fill="${skin.hoof}" />
  </g>`;
}

function earMarkup(skin) {
  if (skin.earKind === 'short') {
    return `<path d="M94 81 C110 72 124 79 123 92 C122 106 108 105 96 94 Z" fill="${skin.ear}" stroke="${skin.outline}" stroke-width="4.5" />`;
  }
  if (skin.earKind === 'doubleLong') {
    return `<path d="M48 79 C25 73 18 89 27 107 C39 117 55 100 55 86 Z" fill="${skin.ear}" stroke="${skin.outline}" stroke-width="4.5" />
    <path d="M95 78 C116 75 139 92 132 110 C125 125 105 113 92 94 Z" fill="${skin.ear}" stroke="${skin.outline}" stroke-width="4.5" />`;
  }
  return `<path d="M95 80 C118 76 138 91 131 108 C124 121 106 111 94 94 Z" fill="${skin.ear}" stroke="${skin.outline}" stroke-width="4.5" />`;
}

function markings(skin) {
  if (!skin.coatPatches) return '';
  return `<path d="M165 41 C176 35 202 42 220 59 C222 73 205 81 187 79 C172 77 156 69 165 41 Z" fill="${skin.coatPatches}" opacity=".92"/>
    <path d="M191 107 C201 92 223 89 244 99 L245 120 Q226 138 201 132 C189 129 181 120 191 107 Z" fill="${skin.coatPatches}" opacity=".89"/>`;
}

function hornMarkup(skin) {
  if (!skin.horn) return '';
  // A compact horn rooted beside the ear: one soft C-shaped curl, not a large
  // decorative spiral that looks like a snail shell at small sizes.
  const curl = 'M105 80 C100 73 102 61 111 57 C121 53 129 62 127 71 C126 77 121 79 116 76';
  return `<g data-part="horn">
    <path d="${curl}" fill="none" stroke="${skin.outline}" stroke-width="11" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="${curl}" fill="none" stroke="${skin.horn}" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/>
  </g>`;
}

export function renderSheepSVG(skinId = 'original', uniqueId = 'sheep-0') {
  const skin = SKINS[skinId];
  if (!skin) throw new Error(`Unknown skin: ${skinId}`);
  const id = uniqueId.replace(/[^a-zA-Z0-9_-]/g, '');
  const grad = `${id}-wool`;
  const clip = `${id}-body`;
  const tuftColor = skin.tuftColor ?? skin.wool;
  const eyeBase = skin.darkFace ? '#FFF8E8' : '#563D35';
  const pupil = skin.darkFace ? '#312A2A' : '#563D35';
  const eyelid = skin.darkFace ? '#EEDBCB' : skin.outline;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 280 180" fill="none" aria-hidden="true">
    <defs>
      <linearGradient id="${grad}" x1="0" y1="0" x2="0.85" y2="1"><stop stop-color="${skin.wool}"/><stop offset="1" stop-color="${skin.shade}"/></linearGradient>
      <clipPath id="${clip}"><path d="${BODY_PATH}"/></clipPath>
    </defs>
    ${legMarkup('hindFar', 215, 124, true, skin)}
    ${legMarkup('frontFar', 114, 126, true, skin)}
    <g data-part="bodyBob">
      <g data-part="tail" transform="rotate(0 240 88)">
        <path d="M238 80 C251 67 264 73 266 88 C266 103 249 109 239 94 Z" fill="${skin.wool}" stroke="${skin.outline}" stroke-width="4.5" />
      </g>
      <path d="${BODY_PATH}" fill="url(#${grad})" stroke="${skin.outline}" stroke-width="5" stroke-linejoin="round" />
      <g clip-path="url(#${clip})">
        <path d="M93 49 C118 30 141 38 153 47 C177 27 205 43 213 59 C226 54 244 69 243 86 C215 72 199 92 178 91 C151 81 130 99 108 91 C94 84 84 65 93 49 Z" fill="${skin.wool}" opacity=".32" />
        <path d="M77 112 C107 106 126 123 147 112 C165 108 174 118 193 113 C215 102 232 114 252 117 L255 158 L74 150 Z" fill="${skin.shade}" opacity=".28" />
        <path d="M110 44 Q122 36 135 43 M154 32 Q168 26 180 35 M203 48 Q219 47 225 60" stroke="${skin.wool}" stroke-width="8" stroke-linecap="round" opacity=".46" />
        ${markings(skin)}
      </g>
    </g>
    ${legMarkup('hindNear', 194, 125, false, skin)}
    ${legMarkup('frontNear', 91, 125, false, skin)}
    <!-- Head is the foremost layer, so forelegs never paint across the face. -->
    <g data-part="headLayer">
      <g data-part="head" transform="rotate(0 103 85)">
        ${earMarkup(skin)}
        <path d="M68 67 C47 62 31 80 31 99 C29 123 46 133 68 133 C91 133 107 116 106 95 C105 78 90 68 68 67 Z" fill="${skin.face}" stroke="${skin.outline}" stroke-width="4.5"/>
        ${skin.facePatch ? `<ellipse cx="54" cy="94" rx="17" ry="17" fill="${skin.facePatch}" opacity=".95"/>` : ''}
        <g data-part="openEyes">
          <ellipse cx="52" cy="95" rx="6.5" ry="8.2" fill="${eyeBase}"/>
          <ellipse cx="80" cy="96" rx="6.5" ry="8.2" fill="${eyeBase}"/>
          ${skin.darkFace ? `<ellipse cx="52" cy="96" rx="3.5" ry="6" fill="${pupil}"/><ellipse cx="80" cy="97" rx="3.5" ry="6" fill="${pupil}"/>` : ''}
          <circle cx="50" cy="92" r="2.2" fill="#FFFFFF"/><circle cx="78" cy="93" r="2.2" fill="#FFFFFF"/>
        </g>
        <g data-part="closedEyes" style="display:none">
          <path d="M45 96 Q52 87 59 96 M73 96 Q80 87 87 96" stroke="${eyelid}" stroke-width="4" stroke-linecap="round"/>
        </g>
        <path d="M57 108 Q63 104 68 109 Q63 116 57 108 Z" fill="${skin.hoof}" />
        <path data-part="smile" d="M64 119 Q73 127 82 117" stroke="${skin.outline}" stroke-width="3.5" stroke-linecap="round" />
        <g data-part="happyMouth" style="display:none"><ellipse cx="74" cy="121" rx="7" ry="9" fill="${skin.hoof}"/><path d="M69 124 Q74 120 79 124" stroke="#EAA48D" stroke-width="3" stroke-linecap="round"/></g>
        <path d="${tuftPaths[skin.tuft] ?? tuftPaths.round}" fill="${tuftColor}" stroke="${skin.outline}" stroke-width="4.5" stroke-linejoin="round" />
        ${hornMarkup(skin)}
      </g>
    </g>
  </svg>`;
}

let nextId = 0;
const activeInstances = new Set();
let rafId = null;

function frame(now) {
  rafId = null;
  for (const instance of activeInstances) instance._frame(now);
  if (activeInstances.size) rafId = requestAnimationFrame(frame);
}
function schedule() {
  if (rafId === null && activeInstances.size) rafId = requestAnimationFrame(frame);
}

function checkSize(value) {
  if (!(value in WORD_SIZES)) throw new Error(`Unsupported word value: ${value}`);
  return Number(value);
}

/** Create a sheep controller with a mountable `element`, then call `.destroy()`. */
export function createSheep({
  skinId = 'original',
  wordValue = 100,
  action = 'idle',
  direction = 'left',
  speed = 1,
  playing = true,
  reducedMotion = undefined,
} = {}) {
  if (!SKINS[skinId]) throw new Error(`Unknown skin: ${skinId}`);
  if (!ACTIONS[action]) throw new Error(`Unknown action: ${action}`);
  checkSize(wordValue);
  if (typeof document === 'undefined') throw new Error('createSheep requires a browser DOM');

  const id = `mieci-${++nextId}`;
  const element = document.createElement('span');
  element.className = 'mieci-sheep';
  element.style.cssText =
    'display:inline-block;line-height:0;vertical-align:bottom;transform-origin:center bottom;contain:layout style;';
  element.setAttribute('role', 'img');
  let state = {
    skinId,
    wordValue: checkSize(wordValue),
    action,
    direction,
    speed,
    playing,
    reducedMotion:
      reducedMotion ?? window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false,
  };
  let start = performance.now();
  let pausedAt = 0;
  let parts;
  let dead = false;
  const build = () => {
    element.innerHTML = renderSheepSVG(state.skinId, id);
    const svg = element.querySelector('svg');
    svg.style.cssText = 'display:block;width:100%;height:auto;overflow:visible;';
    parts = Object.fromEntries(
      [
        'bodyBob',
        'headLayer',
        'head',
        'tail',
        'openEyes',
        'closedEyes',
        'smile',
        'happyMouth',
        'frontNear',
        'frontFar',
        'hindNear',
        'hindFar',
      ].map((key) => [key, svg.querySelector(`[data-part="${key}"]`)]),
    );
    element.setAttribute(
      'aria-label',
      `${SKINS[state.skinId].label}，${ACTIONS[state.action].label}`,
    );
  };
  const layout = () => {
    element.style.width = `${WORD_SIZES[state.wordValue]}px`;
    element.style.transform = state.direction === 'right' ? 'scaleX(-1)' : 'none';
  };

  const controller = {
    element,
    getState: () => ({ ...state }),
    setSkin(value) {
      if (!SKINS[value]) throw new Error(`Unknown skin: ${value}`);
      state.skinId = value;
      build();
      controller._frame(performance.now());
      return controller;
    },
    setAction(value) {
      if (!ACTIONS[value]) throw new Error(`Unknown action: ${value}`);
      state.action = value;
      start = performance.now();
      pausedAt = state.playing ? 0 : start;
      element.setAttribute('aria-label', `${SKINS[state.skinId].label}，${ACTIONS[value].label}`);
      controller._frame(start);
      return controller;
    },
    setWordValue(value) {
      state.wordValue = checkSize(value);
      layout();
      return controller;
    },
    setDirection(value) {
      if (!['left', 'right'].includes(value)) throw new Error('Direction must be left or right');
      state.direction = value;
      layout();
      return controller;
    },
    setSpeed(value) {
      if (!Number.isFinite(value) || value <= 0) throw new Error('Speed must be positive');
      const elapsed = (performance.now() - start) * state.speed;
      state.speed = value;
      start = performance.now() - elapsed / state.speed;
      return controller;
    },
    pause() {
      if (!state.playing) return controller;
      pausedAt = performance.now();
      state.playing = false;
      activeInstances.delete(controller);
      return controller;
    },
    play() {
      if (state.playing) return controller;
      start += performance.now() - pausedAt;
      state.playing = true;
      if (!state.reducedMotion) activeInstances.add(controller);
      schedule();
      return controller;
    },
    setReducedMotion(value) {
      state.reducedMotion = Boolean(value);
      if (state.reducedMotion) activeInstances.delete(controller);
      else if (state.playing) {
        activeInstances.add(controller);
        schedule();
      }
      controller._frame(performance.now());
      return controller;
    },
    destroy() {
      activeInstances.delete(controller);
      element.remove();
      dead = true;
    },
    _frame(now) {
      if (dead || !parts) return;
      const seconds = (((state.playing ? now : pausedAt) - start) * state.speed) / 1000;
      const p = poseAt(state.action, seconds, state.reducedMotion);
      for (const [name, transform] of Object.entries(getPartTransforms(p))) {
        parts[name].setAttribute('transform', transform);
      }
      parts.openEyes.style.display = p.eyesClosed ? 'none' : '';
      parts.closedEyes.style.display = p.eyesClosed ? '' : 'none';
      parts.smile.style.display = p.happyMouth ? 'none' : '';
      parts.happyMouth.style.display = p.happyMouth ? '' : 'none';
    },
  };
  build();
  layout();
  controller._frame(start);
  if (state.playing && !state.reducedMotion) {
    activeInstances.add(controller);
    schedule();
  }
  return controller;
}

export function mountSheep(container, options) {
  const controller = createSheep(options);
  container.appendChild(controller.element);
  return controller;
}

export function getActiveAnimatorCount() {
  return activeInstances.size;
}
