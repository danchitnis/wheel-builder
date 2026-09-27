import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hubs } from '../src/data/hubs.ts';
import { defaultRim } from '../src/data/rims.ts';
import { configurationDefaults, numericFields } from '../src/utils/buildConfiguration.ts';
import { calculateWheelBuild, type WheelBuildInputs } from '../src/utils/physicsCalculator.ts';
import { calculateSpokePaths } from '../src/utils/spokePath.ts';
import { createLacingGuide, guideSnapshot, initialGuideState, reconcileGuide } from '../src/utils/lacingGuide.ts';

// Independently transcribed from Hope's current J-bend chart, checked 2026-09-26:
// https://www.hopetech.com/_repository/1/documents/Pro5_PCD_J_Bend_2025.pdf
// Values: left/right PCD, left/right centre-to-flange, spoke-hole diameter (mm).
const official = [
  ['hope-pro5-front-100-6b', 58, 52, 20, 34, 2.6],
  ['hope-pro5-front-110-6b', 58, 52, 25, 34, 2.6],
  ['hope-pro5-front-100-cl', 43, 43, 22, 33, 2.6],
  ['hope-pro5-front-110-cl', 43, 43, 27, 35, 2.6],
  ['hope-pro5-rear-135-6b', 57, 59, 32, 19.6, 2.6],
  ['hope-pro5-rear-148-6b', 57, 59, 35, 22.6, 2.6],
  ['hope-pro5-rear-135-cl', 51, 59, 32, 19.6, 2.6],
  ['hope-pro5-rear-148-cl', 51, 59, 35, 22.6, 2.6],
  ['hope-pro5-rear-157-sb', 57, 59, 39.6, 27, 2.6],
  ['hope-pro5-rear-148-dh', 60, 64, 28.5, 28.5, 2.6],
] as const;

test('every Hope preset matches the official J-bend dimension chart', () => {
  assert.equal(hubs.filter(h => h.brand === 'Hope').length, official.length);
  for (const [id, ...dimensions] of official) {
    const hub = hubs.find(h => h.id === id)!;
    assert.ok(hub, id);
    assert.deepEqual([hub.flangePcdLeft, hub.flangePcdRight, hub.centerToLeft,
      hub.centerToRight, hub.spokeHoleDiameter], dimensions, id);
  }
});

test('Hope lengths agree with independent Cartesian endpoints across spoke counts and patterns', () => {
  for (const [id, leftPcd, rightPcd, leftOffset, rightOffset, hole] of official) {
    const hub = hubs.find(h => h.id === id)!;
    for (const spokeCount of [24, 28, 32, 36]) for (const crosses of [0, 1, 2, 3, 4]) {
      if (crosses > spokeCount / 8) continue;
      const result = calculateWheelBuild({ ...defaultRim, ...hub, erd: 382.3,
        osb: 0, drillingOffsetLeft: 0, drillingOffsetRight: 0,
        spokeCount, crossesLeft: crosses, crossesRight: crosses, hubOffset: 0, rimFlip: 'Auto' });
      // Put the flange hole on +X and move the rim endpoint by the crossing angle.
      const angle = crosses * 2 * Math.PI / (spokeCount / 2);
      for (const [side, pcd, offset] of [['left', leftPcd, leftOffset], ['right', rightPcd, rightOffset]] as const) {
        const expected = Math.hypot(191.15 * Math.cos(angle) - pcd / 2,
          191.15 * Math.sin(angle), offset) - hole / 2;
        assert.ok(Math.abs(result[side].calculatedSpokeLength - expected) < 1e-9,
          `${id}, ${spokeCount} spokes, ${crosses} crosses, ${side}`);
      }
    }
  }
});

test('primary Hope front and rear presets retain verified two-cross lengths throughout lacing', () => {
  const references = [
    { id: 'hope-pro5-front-100-6b', left: 171.73133169752552, right: 175.7362180921236,
      rounded: [172, 176], labels: ['Left / disc', 'Right / non-disc'], isRear: false },
    { id: 'hope-pro5-rear-135-6b', left: 173.8292528683969, right: 171.379148387393,
      rounded: [174, 171], labels: ['Left / non-drive', 'Right / drive'], isRear: true },
  ];
  for (const reference of references) for (const interlaced of [false, true]) {
    // Exercise the same preset restoration used by shared links and the UI.
    const config = configurationDefaults(defaultRim.id, reference.id);
    assert.equal(config.isRear, reference.isRear);
    for (const key of Object.keys(numericFields) as (keyof typeof numericFields)[]) {
      assert.equal(typeof config[key], 'number', `${reference.id}: ${key}`);
      assert.ok(Number.isFinite(config[key]), `${reference.id}: ${key}`);
    }
    const input = { ...config, interlaced } as WheelBuildInputs;
    const result = calculateWheelBuild(input);
    assert.ok(Math.abs(result.left.calculatedSpokeLength - reference.left) < 1e-9);
    assert.ok(Math.abs(result.right.calculatedSpokeLength - reference.right) < 1e-9);
    const guide = createLacingGuide(input, calculateSpokePaths(input));
    assert.equal(guide.valid, true);
    const state = reconcileGuide(initialGuideState(), guide);
    for (let step = 0; step <= guide.pairs.length; step++) {
      const snapshot = guideSnapshot({ ...state, step }, guide);
      const side = snapshot.targetSpoke!.side === 'Left' ? 0 : 1;
      assert.equal(snapshot.spokeSelection!.roundedLength, reference.rounded[side]);
      assert.equal(snapshot.spokeSelection!.label, reference.labels[side]);
    }
  }
});
