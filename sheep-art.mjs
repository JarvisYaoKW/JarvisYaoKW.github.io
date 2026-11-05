import { renderSheepSVG, poseAt, getPartTransforms } from './sheep-motion.mjs';

// Stable S001–S006 slots, with the user-supplied artwork in its original order.
export const SHEEP_ART_IDS = Object.freeze([
  'original',
  'sesame',
  'caramel',
  'ash',
  'ram',
  'patches',
]);
let drawingId = 0;
export function renderSkinSheep(variant = 0) {
  const index = Number.isInteger(variant) ? ((variant % 6) + 6) % 6 : 0;
  return renderSheepSVG(SHEEP_ART_IDS[index], `pasture-sheep-${++drawingId}`).replace(
    '<svg ',
    `<svg class="sheep-svg variant-${index}" data-art="${SHEEP_ART_IDS[index]}" focusable="false" `,
  );
}

// The pasture owns the only animation loop; the incoming rig supplies joint poses.
export function bindSheepMotion(svg) {
  const parts = Object.fromEntries(
    [
      'bodyBob',
      'headLayer',
      'head',
      'tail',
      'frontNear',
      'frontFar',
      'hindNear',
      'hindFar',
      'openEyes',
      'closedEyes',
      'smile',
      'happyMouth',
    ].map((name) => [name, svg.querySelector(`[data-part="${name}"]`)]),
  );
  return (action, seconds, reducedMotion = false) => {
    const pose = poseAt(action, seconds, reducedMotion);
    for (const [name, transform] of Object.entries(getPartTransforms(pose))) {
      parts[name].setAttribute('transform', transform);
    }
    parts.openEyes.style.display = pose.eyesClosed ? 'none' : '';
    parts.closedEyes.style.display = pose.eyesClosed ? '' : 'none';
    parts.smile.style.display = pose.happyMouth ? 'none' : '';
    parts.happyMouth.style.display = pose.happyMouth ? '' : 'none';
  };
}
