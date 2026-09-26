import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calculateSpokePaths } from '../src/utils/spokePath.ts';
import { calculateWheelBuild, type WheelBuildInputs } from '../src/utils/physicsCalculator.ts';
import { createLacingGuide, guideKey, guideSnapshot, initialGuideState, reconcileGuide, transitionGuide, spokeOrientation } from '../src/utils/lacingGuide.ts';
import { defaultHub, hubs } from '../src/data/hubs.ts';
import { defaultRim } from '../src/data/rims.ts';
import { lacingSetupDiagram } from '../src/utils/lacingSetupDiagram.ts';
import * as THREE from 'three';

const inputs = (front = false) => ({ ...defaultRim, ...(front ? hubs.find(h => h.id === 'hope-pro5-front-100-6b')! : defaultHub),
  spokeCount: 32, spokeDiameter: 2, hubOffset: 0, rimFlip: 'Auto' as const, crossesLeft: 2, crossesRight: 2,
  interlaced: false, isRear: !front });
const buildGuide = (overrides = {}) => { const i = { ...inputs(), ...overrides }; return createLacingGuide(i, calculateSpokePaths(i)); };

test('setup and tab re-entry preserve step zero and use the actual first spoke', () => {
  const g = buildGuide(); assert.equal(g.valid, true);
  let state = reconcileGuide(initialGuideState(), g);
  assert.equal(state.step, 0);
  const setup = guideSnapshot(state, g);
  assert.equal(setup.activeSpoke, null);
  assert.equal(setup.targetSpoke, g.spokes[0]);
  state = reconcileGuide(state, g); assert.equal(state.step, 0);
  state = transitionGuide(state, g, 'next');
  assert.equal(guideSnapshot(state, g).activeSpoke, setup.targetSpoke);
  state = reconcileGuide(state, g); assert.equal(state.step, 1);
  state = transitionGuide(state, g, 'reset');
  assert.equal(reconcileGuide(state, g).step, 0);
});

test('step and group navigation use real starts and stop at boundaries', () => {
  const g = buildGuide(); let state = reconcileGuide(initialGuideState(), g);
  assert.deepEqual(g.groupStarts, [1, 9, 17, 25]);
  state = transitionGuide(state, g, 'previous'); assert.equal(state.step, 0);
  state = transitionGuide(state, g, 'next-group'); assert.equal(state.step, 1);
  state = transitionGuide(state, g, 'next-group'); assert.equal(state.step, 9);
  state = transitionGuide(state, g, 'next'); assert.equal(state.step, 10);
  state = transitionGuide(state, g, 'previous-group'); assert.equal(state.step, 9);
  state = transitionGuide(state, g, 'previous-group'); assert.equal(state.step, 1);
  state = transitionGuide(state, g, 'previous-group'); assert.equal(state.step, 0);
  for (let i = 0; i < 40; i++) state = transitionGuide(state, g, 'next');
  assert.equal(state.step, 32); assert.equal(guideSnapshot(state, g).canNext, false);
  assert.equal(guideSnapshot(state, g).canNextGroup, false);
  assert.equal(transitionGuide(state, g, 'next-group').step, 32);
});

test('preview preserves the step, blocks navigation and returns or resets cleanly', () => {
  const g = buildGuide(); let state = reconcileGuide(initialGuideState(), g);
  state = transitionGuide(state, g, 'next-group');
  state = transitionGuide(state, g, 'preview');
  assert.equal(state.step, 1); assert.equal(state.preview, true);
  assert.equal(guideSnapshot(state, g).percent, 3);
  for (const action of ['next', 'previous', 'next-group', 'previous-group'] as const) assert.equal(transitionGuide(state, g, action).step, 1);
  state = transitionGuide(state, g, 'return'); assert.equal(state.step, 1); assert.equal(state.preview, false);
  state = transitionGuide(transitionGuide(state, g, 'preview'), g, 'reset');
  assert.equal(state.step, 0); assert.equal(state.preview, false);
});

test('changing a completed 32-spoke build to 28 resets progress instead of showing 114%', () => {
  const g = buildGuide(); let state = { ...reconcileGuide(initialGuideState(), g), step: 32, preview: true };
  const changed = buildGuide({ spokeCount: 28 }); assert.equal(changed.valid, true);
  state = reconcileGuide(state, changed);
  assert.equal(state.step, 0); assert.equal(state.preview, false);
  assert.match(state.notice, /Build changed/);
  assert.equal(guideSnapshot(state, changed).percent, 0);
  assert.equal(reconcileGuide({ ...state, step: 999 }, changed).step, 28);
});

test('geometry and pattern changes reset the guide; display and provenance do not', () => {
  const i = inputs(), g = buildGuide(); const state = { ...reconcileGuide(initialGuideState(), g), step: 12 };
  for (const change of [{ erd: 390 }, { crossesLeft: 1 }, { crossesRight: 3 }, { interlaced: true }, { isRear: false }, { flangeThicknessLeft: 3.8 }]) {
    const next = { ...i, ...change };
    assert.equal(reconcileGuide(state, createLacingGuide(next, calculateSpokePaths(next))).step, 0);
  }
  const displayOnly = { ...i, geometryProvenance: 'Changed description', colorMode: 'side', explodedValue: .5, showRuler: false };
  assert.equal(guideKey(displayOnly), g.key);
  assert.equal(reconcileGuide(state, createLacingGuide(displayOnly, calculateSpokePaths(displayOnly))).step, 12);
  assert.equal(initialGuideState().cameraTracking, false);
  const tracked = transitionGuide(state, g, 'track'); assert.equal(tracked.cameraTracking, true); assert.equal(tracked.step, 12);
  assert.equal(reconcileGuide(tracked, buildGuide({ spokeCount: 28 })).cameraTracking, true);
  assert.equal(transitionGuide(tracked, g, 'fixed').cameraTracking, false);
});

test('missing, invalid and partial path results cannot navigate or preview', () => {
  const i = inputs(); const validPaths = calculateSpokePaths(i);
  for (const paths of [calculateSpokePaths({ ...i, flangeOuterDiameterLeft: undefined }),
    { ...validPaths, spokes: validPaths.spokes.slice(1) },
    { ...validPaths, spokes: validPaths.spokes.map((p, index) => index === 0 ? { ...p, valid: false } : p) },
    { ...validPaths, errors: ['Unsatisfied crossing constraint'] }]) {
    const g = createLacingGuide(i, paths); assert.equal(g.valid, false);
    let state = reconcileGuide({ ...initialGuideState(), step: 32, preview: true }, g);
    for (const action of ['next', 'next-group', 'preview'] as const) state = transitionGuide(state, g, action);
    const snapshot = guideSnapshot(state, g);
    assert.equal(state.step, 0); assert.equal(state.preview, false); assert.equal(snapshot.percent, null);
    assert.equal(snapshot.targetSpoke, null); assert.equal(snapshot.canNext, false); assert.ok(snapshot.errors.length);
  }
  const catalogHub = hubs.find(h => h.id === 'dt-350-classic-rear')!;
  assert.equal(buildGuide({ ...catalogHub, flangeOuterDiameterLeft: undefined, flangeOuterDiameterRight: undefined }).valid, false);
});

test('instructions match front/rear, radial, mixed, crossed and interlacing settings', () => {
  for (const front of [false, true]) for (const crosses of [0, 1, 2, 3]) for (const interlaced of [false, true]) {
    const i = { ...inputs(front), crossesLeft: crosses, crossesRight: crosses, interlaced };
    const g = createLacingGuide(i, calculateSpokePaths(i)); assert.equal(g.valid, true);
    for (const s of g.spokes) {
      assert.doesNotMatch(s.instruction, /#\d|hole \d/);
      assert.deepEqual(s.instructionSteps.flat(), s.instructionParts);
      assert.equal(s.instructionParts.filter(p => p.target === 'flange').length, 1);
      assert.equal(s.instructionParts.filter(p => p.target === 'rim').length, 1);
      if (front) assert.doesNotMatch(s.sideLabel, /drive/); else assert.match(s.sideLabel, /drive/);
      if (crosses === 0) { assert.doesNotMatch(s.groupName, /leading|trailing/); assert.match(s.instruction, /no spoke crossings or weaving/); }
      else if (!interlaced) assert.match(s.instruction, /do not weave/);
      else assert.match(s.instruction, /interlaced/);
    }
  }
  const mixed = buildGuide({ crossesLeft: 0, crossesRight: 2 }); assert.equal(mixed.valid, true);
  assert.match(mixed.groupNames[1], /radial/); assert.match(mixed.groupNames[0], /trailing/);
  assert.equal(buildGuide({ isRear: false, discType: 'None' }).spokes[0].sideLabel, 'Right / front');
});

test('all supported spoke counts have unique hole mappings and stable landmarks', () => {
  for (let spokeCount = 16; spokeCount <= 40; spokeCount += 4) {
    const g = buildGuide({ spokeCount }); assert.equal(g.valid, true);
    assert.equal(new Set(g.spokes.map(s => s.rimHoleIndex)).size, spokeCount);
    assert.equal(new Set(g.spokes.map(s => `${s.side}:${s.flangeHoleIndex}`)).size, spokeCount);
    for (const s of g.spokes) {
      const angle = (s.rimHoleIndex - 1) * Math.PI * 2 / spokeCount;
      assert.ok(Math.abs(Math.cos(angle) - s.path.end.x / (defaultRim.erd / 2)) < 1e-8);
      assert.ok(Math.abs(Math.sin(angle) - s.path.end.y / (defaultRim.erd / 2)) < 1e-8);
    }
    assert.equal(g.valveAngle, buildGuide({ spokeCount }).valveAngle);
  }
});


test('successive spokes use the previous connections as relative counting references', () => {
  const g = buildGuide();
  const first = g.spokes[0], second = g.spokes[1];
  assert.equal(first.referenceFlange, undefined);
  assert.equal(first.referenceRim, undefined);
  assert.ok(first.instructionParts.some(p => p.target === 'valve'));
  assert.match(first.instruction, /count one spoke hole counterclockwise/);
  assert.equal(second.referenceFlange, first.path);
  assert.equal(second.referenceRim, first.path);
  assert.match(second.instructionSteps[0].map(p => p.text).join(''), /skip one hole counterclockwise/);
  assert.match(second.instructionSteps[1].map(p => p.text).join(''), /skip three holes counterclockwise/);
  assert.deepEqual(second.instructionParts.filter(p => p.target).map(p => p.target), ['reference-flange', 'flange', 'reference-rim', 'rim']);
});

test('group changes anchor to an already used hole and never require absolute hole numbers', () => {
  for (let spokeCount = 16; spokeCount <= 40; spokeCount += 4) {
    for (const crosses of [0, 1, 2]) {
      const g = buildGuide({ spokeCount, crossesLeft: crosses, crossesRight: crosses });
      assert.equal(g.valid, true);
      for (const [index, spoke] of g.spokes.entries()) {
        const earlier = g.spokes.slice(0, index);
        if (spoke.referenceFlange) {
          assert.ok(earlier.some(s => s.path === spoke.referenceFlange));
          if (spoke.groupStart?.referenceAcrossHub) {
            assert.notEqual(spoke.side, spoke.referenceFlange.side);
            assert.match(spoke.instruction, /first staggered hole/);
          } else {
            assert.equal(spoke.side, spoke.referenceFlange.side);
            const distance = (spoke.path.index - spoke.referenceFlange.index + spokeCount / 2) % (spokeCount / 2);
            assert.ok(distance === 1 || distance === 2);
            assert.match(spoke.instructionSteps[0].map(p => p.text).join(''), distance === 1 ? /very next hole/ : /skip one hole/);
          }
        }
        if (spoke.referenceRim) assert.ok(earlier.some(s => s.path === spoke.referenceRim));
        else assert.equal(index, 0);
        assert.doesNotMatch(spoke.instruction, /#\d|hole \d|empty hole/);
      }
    }
  }
});

test('group 2 stays anchored to group 1 when the loose hub rotates relative to the valve', () => {
  for (const front of [false, true]) for (const spokeCount of [24, 28, 32, 36]) {
    for (const [crossesLeft, crossesRight] of [[0, 0], [1, 2], [2, 2], [3, 1]]) {
      const i = { ...inputs(front), spokeCount, crossesLeft, crossesRight };
      const paths = calculateSpokePaths(i);
      const baseline = createLacingGuide(i, paths).spokes[spokeCount / 4];
      for (const degrees of [0, 11.25, 22.5, 47, 90, 180]) {
        const angle = degrees * Math.PI / 180;
        // Only the hub rotates: the rim, valve and installed rim holes stay put.
        const rotated = { ...paths, spokes: paths.spokes.map(p => ({ ...p, hole: {
          x: p.hole.x * Math.cos(angle) - p.hole.y * Math.sin(angle),
          y: p.hole.x * Math.sin(angle) + p.hole.y * Math.cos(angle), z: p.hole.z,
        } })) };
        const guide = createLacingGuide(i, rotated);
        const second = guide.spokes[spokeCount / 4], setup = second.groupStart!;
        assert.equal(setup.referenceAcrossHub, true);
        assert.equal(setup.referenceStep, baseline.groupStart!.referenceStep);
        assert.equal(setup.reference.index, baseline.referenceFlange!.index);
        assert.equal(second.path.index, baseline.path.index);
        assert.equal(second.rimHoleIndex, baseline.rimHoleIndex);
        assert.ok(Math.abs(setup.holeSteps - .5) < 1e-9);
        assert.equal(setup.direction, 'counterclockwise'); // outside left view
        assert.doesNotMatch(second.instruction, /valve|logo/);
        // Execute the flange instruction independently: next staggered left hole
        // counterclockwise when viewed from the left means decreasing world angle.
        const reference = Math.atan2(setup.reference.hole.y, setup.reference.hole.x);
        const next = rotated.spokes.filter(p => p.side === 'Left').sort((a, b) => {
          const gap = (p: typeof a) => (reference - Math.atan2(p.hole.y, p.hole.x) + 2 * Math.PI) % (2 * Math.PI);
          return gap(a) - gap(b);
        })[0];
        assert.equal(next.index, second.path.index);
      }
    }
  }
});

test('default Hope group 2 references both ends of the spoke installed at step 2', () => {
  for (const front of [false, true]) {
    const i = inputs(front), guide = createLacingGuide(i, calculateSpokePaths(i));
    const second = guide.spokes[8], reference = guide.spokes[1];
    assert.equal(second.referenceFlange, reference.path);
    assert.equal(second.referenceRim, reference.path);
    assert.match(second.instruction, /step 2 on the opposite right flange/);
    assert.match(second.instruction, /first staggered hole counterclockwise/);
    assert.match(second.instruction, /rim hole of the spoke installed at step 2, use the very next hole counterclockwise/);
    const difference = (a: {x:number;y:number}, b: {x:number;y:number}) =>
      Math.atan2(a.x*b.y-a.y*b.x, a.x*b.x+a.y*b.y);
    const flange = difference(reference.path.hole, second.path.hole);
    const rim = difference(reference.path.end, second.path.end);
    assert.ok(Math.abs(flange + Math.PI / 16) < 1e-9);
    assert.ok(Math.abs(rim - flange) < 1e-9);
    assert.match(lacingSetupDiagram(second.groupStart!), /opposite right flange/);
  }
});

test('setup references the valve gap and counts clockwise to the actual first spoke across patterns', () => {
  const tau = Math.PI * 2;
  for (const spokeCount of [16, 20, 24, 28, 32, 36, 40]) for (const crossesRight of [0, 1, 2, 3]) {
    const guide = buildGuide({ spokeCount, crossesRight, crossesLeft: 0 });
    if (!guide.valid) { assert.equal(guide.setup, null); continue; }
    const setup = guide.setup!;
    assert.equal(setup.first, guide.spokes[0].path);
    assert.equal(setup.flangeHoles.length, spokeCount / 2);
    assert.equal(setup.crossed, crossesRight > 0);
    const refAngle = Math.atan2(setup.reference.hole.y, setup.reference.hole.x);
    const fromValve = (refAngle - guide.valveAngle + tau * 2) % tau;
    assert.ok(fromValve > 0 && fromValve < tau / (spokeCount / 2));
    const targetAngle = refAngle - setup.holeSteps * tau / (spokeCount / 2);
    const firstAngle = Math.atan2(setup.first.hole.y, setup.first.hole.x);
    assert.ok(Math.abs(Math.sin(targetAngle) - Math.sin(firstAngle)) < 1e-8);
    assert.ok(Math.abs(Math.cos(targetAngle) - Math.cos(firstAngle)) < 1e-8);
    assert.ok(guide.spokes[0].instructionParts.some(part => part.target === 'setup-reference'));
    if (crossesRight === 0) assert.equal(setup.holeSteps, 0);
    const state = reconcileGuide(initialGuideState(), guide);
    assert.equal(guideSnapshot(state, guide).setup, setup);
    assert.equal(guideSnapshot({ ...state, step: 1 }, guide).setup, setup);
    assert.equal(guideSnapshot({ ...state, step: 2 }, guide).setup, null);
    assert.equal(guideSnapshot({ ...state, preview: true }, guide).setup, null);
  }
  const invalid = buildGuide({ flangeOuterDiameterRight: undefined });
  assert.equal(invalid.setup, null);
  assert.equal(guideSnapshot(reconcileGuide(initialGuideState(), invalid), invalid).setup, null);
});

test('each flange group starts with its own diagram matching the instruction reference and direction', () => {
  for (const front of [false, true]) for (const crossesLeft of [0, 2, 3]) for (const crossesRight of [0, 2, 3]) {
    const i = { ...inputs(front), crossesLeft, crossesRight };
    const guide = createLacingGuide(i, calculateSpokePaths(i));
    assert.equal(guide.valid, true);
    let state = reconcileGuide(initialGuideState(), guide);
    for (const [group, step] of guide.groupStarts.entries()) {
      state = transitionGuide(state, guide, 'next-group');
      assert.equal(state.step, step);
      const snapshot = guideSnapshot(state, guide);
      const diagram = snapshot.setup!;
      const spoke = snapshot.activeSpoke!;
      assert.equal(diagram.first, spoke.path);
      assert.equal(diagram.first.side, group % 2 ? 'Left' : 'Right');
      assert.ok(diagram.flangeHoles.every(p => p.side === spoke.side));
      assert.equal(diagram.reference.side, group === 1 ? 'Right' : spoke.side);
      assert.ok(spoke.instructionParts.some(p => p.target === diagram.referenceTarget));
      if (group >= 1) {
        assert.equal(diagram.reference, spoke.referenceFlange);
        assert.equal(diagram.referenceTarget, 'reference-flange');
        assert.equal(diagram.direction, group === 1 || spoke.side === 'Right' ? 'counterclockwise' : 'clockwise');
      } else assert.equal(diagram.referenceTarget, 'setup-reference');
      const n = i.spokeCount / 2;
      const turn = (diagram.direction === 'clockwise' ? -1 : 1) * (spoke.side === 'Right' ? 1 : -1);
      const refAngle = Math.atan2(diagram.reference.hole.y, diagram.reference.hole.x);
      const targetAngle = Math.atan2(diagram.first.hole.y, diagram.first.hole.x);
      const predicted = refAngle + turn * diagram.holeSteps * 2 * Math.PI / n;
      assert.ok(Math.abs(Math.sin(predicted) - Math.sin(targetAngle)) < 1e-9);
      assert.ok(Math.abs(Math.cos(predicted) - Math.cos(targetAngle)) < 1e-9);
      assert.ok(diagram.holeSteps <= n / 2);
      if (diagram.holeSteps) assert.ok(spoke.instructionSteps[0].map(p => p.text).join('').includes(diagram.direction));
      assert.equal(guideSnapshot(transitionGuide(state, guide, 'next'), guide).setup, null);
      const preview = transitionGuide(state, guide, 'preview');
      assert.equal(guideSnapshot(preview, guide).setup, null);
      assert.equal(guideSnapshot(transitionGuide(preview, guide, 'return'), guide).setup, diagram);
      assert.equal(guideSnapshot(reconcileGuide(state, guide), guide).setup, diagram);
    }
  }
});

test('left-side instructions mirror counting directions without changing the physical connections', () => {
  for (const front of [false, true]) for (const crossesLeft of [0, 2, 3]) for (const interlaced of [false, true]) {
    const i = { ...inputs(front), crossesLeft, interlaced };
    const guide = createLacingGuide(i, calculateSpokePaths(i));
    assert.equal(guide.valid, true);
    for (const spoke of guide.spokes) {
      const direction = spoke.side === 'Left' ? 'clockwise' : 'counterclockwise';
      if (spoke.referenceFlange) assert.ok(spoke.instructionSteps[0].some(p => p.text.includes(`hole ${spoke.groupStart?.referenceAcrossHub ? 'counterclockwise' : direction}`)));
      if (spoke.referenceRim && !spoke.groupStart?.referenceAcrossHub) assert.ok(spoke.instructionSteps[1].some(p => new RegExp(`holes? ${direction}`).test(p.text)));
      if (spoke.side === 'Left') {
        assert.match(spoke.viewingLabel, /left · six-bolt disc/);
        assert.equal(spoke.viewingLabel.includes('non-drive'), !front);
      }
    }
    assert.match(guide.spokes[8].instruction, /opposite right flange/);
    assert.doesNotMatch(guide.spokes[8].instruction, /valve line/);
  }
  assert.match(buildGuide({ discType: 'Centerlock' }).spokes[8].viewingLabel, /Centerlock disc/);
  assert.equal(buildGuide({ isRear: false, discType: 'None' }).spokes[8].viewingLabel, 'left · front');
});

test('each diagram projects its target and counting arc from the active side with the valve at the top', () => {
  for (const crossesLeft of [0, 2, 3]) {
    const guide = buildGuide({ crossesLeft });
    for (const step of guide.groupStarts) {
      const setup = guide.spokes[step - 1].groupStart!;
      const svg = lacingSetupDiagram(setup);
      assert.ok(svg.includes(`viewed from the ${setup.viewingLabel} side`));
      const camera = new THREE.OrthographicCamera(-160, 160, 140, -130, .1, 2000);
      camera.up.set(Math.cos(setup.valveAngle), Math.sin(setup.valveAngle), 0);
      camera.position.set(0, 0, setup.first.side === 'Left' ? -500 : 500);
      camera.lookAt(0, 0, 0); camera.updateMatrixWorld();
      const project = (angle: number, radius: number) => {
        const p = new THREE.Vector3(Math.cos(angle) * radius, Math.sin(angle) * radius, 0).project(camera);
        return { x: (p.x + 1) * 160, y: (1 - p.y) * 135 };
      };
      const valve = project(setup.valveAngle, 108);
      assert.ok(Math.abs(valve.x - 160) < 1e-8 && Math.abs(valve.y - 32) < 1e-8);
      const target = project(Math.atan2(setup.first.hole.y, setup.first.hole.x), 58);
      const marker = svg.match(/<circle cx="([^"]+)" cy="([^"]+)"[^>]+data-lacing-target="flange"/)!;
      assert.ok(Math.abs(Number(marker[1]) - target.x) < 1e-8);
      assert.ok(Math.abs(Number(marker[2]) - target.y) < 1e-8);
      const rim = project(Math.atan2(setup.first.end.y, setup.first.end.x), 108);
      const rimMarker = svg.match(/<circle cx="([^"]+)" cy="([^"]+)"[^>]+data-lacing-target="rim"/)!;
      assert.ok(Math.abs(Number(rimMarker[1]) - rim.x) < 1e-8);
      assert.ok(Math.abs(Number(rimMarker[2]) - rim.y) < 1e-8);
      const connection = svg.match(/<line x1="([^"]+)" y1="([^"]+)" x2="([^"]+)" y2="([^"]+)"/)!;
      for (const [index, expected] of [target.x, target.y, rim.x, rim.y].entries()) {
        assert.ok(Math.abs(Number(connection[index + 1]) - expected) < 1e-8);
      }
      assert.match(svg, /Intended assembled hub position/);
      assert.ok(svg.includes(guide.spokes[step - 1].orientationText));
      if (setup.holeSteps) {
        const arc = svg.match(/<polyline points="([^"]+)"/)![1].split(' ').map(pair => pair.split(',').map(Number));
        const end = project(Math.atan2(setup.first.hole.y, setup.first.hole.x), 82);
        assert.ok(Math.abs(arc.at(-1)![0] - end.x) < 1e-8);
        assert.ok(Math.abs(arc.at(-1)![1] - end.y) < 1e-8);
        const [a, b] = arc;
        const screenTurn = (a[0] - 160) * (b[1] - 140) - (a[1] - 140) * (b[0] - 160);
        assert.equal(screenTurn > 0, setup.direction === 'clockwise');
      }
    }
  }
});

test('spoke direction agrees with projected endpoints on both Hope hubs and every group', () => {
  for (const front of [false, true]) for (const crosses of [0, 1, 2, 3, 4]) {
    const i = { ...inputs(front), crossesLeft: crosses, crossesRight: crosses };
    const guide = createLacingGuide(i, calculateSpokePaths(i));
    assert.equal(guide.valid, true);
    for (const spoke of guide.spokes) {
      const camera = new THREE.OrthographicCamera(-200, 200, 200, -200, .1, 2000);
      camera.up.set(Math.cos(guide.valveAngle), Math.sin(guide.valveAngle), 0);
      camera.position.set(0, 0, spoke.side === 'Left' ? -500 : 500);
      camera.lookAt(0, 0, 0); camera.updateMatrixWorld();
      const project = (p: { x: number; y: number; z: number }) => new THREE.Vector3(p.x, p.y, p.z).project(camera);
      const hole = project(spoke.path.hole), rim = project(spoke.path.end);
      // NDC Y points up, so positive signed area means counterclockwise.
      const area = hole.x * rim.y - hole.y * rim.x;
      const expected = Math.abs(area) < 1e-9 ? null : area > 0 ? 'counterclockwise' : 'clockwise';
      assert.equal(spokeOrientation(spoke.path).direction, expected);
      assert.ok(spoke.orientationText.includes(expected ?? 'radially'));
      assert.ok(spoke.orientationText.includes(`Viewed from the ${spoke.viewingLabel} side, trace this spoke from hub to rim`));
      if (crosses) assert.notEqual(spokeOrientation(spoke.path, 'Left').direction, spokeOrientation(spoke.path, 'Right').direction);
    }
    assert.equal(spokeOrientation(guide.spokes[0].path).direction, crosses ? 'counterclockwise' : null);
    assert.equal(spokeOrientation(guide.spokes[8].path).direction, crosses ? 'clockwise' : null);
  }
});

test('halfway alternative preserves lengths but reverses the first two groups in a two-cross build', () => {
  for (const front of [false, true]) {
    const i = inputs(front);
    const guide = createLacingGuide(i, calculateSpokePaths(i));
    for (const spoke of guide.spokes.slice(0, 16)) {
      const { hole, end } = spoke.path;
      const rotated = { ...spoke.path, hole: { x: -hole.y, y: hole.x, z: hole.z } };
      const length = Math.hypot(end.x - rotated.hole.x, end.y - rotated.hole.y, end.z - rotated.hole.z) - i.spokeHoleDiameter / 2;
      assert.ok(Math.abs(length - spoke.length) < 1e-9);
      assert.notEqual(spokeOrientation(rotated).direction, spokeOrientation(spoke.path).direction);
    }
    let state = reconcileGuide(initialGuideState(), guide);
    for (let step = 0; step <= 32; step++) {
      const checkpoint = guideSnapshot({ ...state, step }, guide).orientationCheckpoint;
      assert.equal(checkpoint !== null, step === 16);
      if (checkpoint) {
        assert.match(checkpoint, /right .*counterclockwise/);
        assert.match(checkpoint, /left .*clockwise/);
        assert.match(checkpoint, /opposite-slope hub position/);
      }
    }
    state = { ...state, step: 16 };
    const preview = transitionGuide(state, guide, 'preview');
    assert.equal(guideSnapshot(preview, guide).orientationCheckpoint, null);
    assert.ok(guideSnapshot(transitionGuide(preview, guide, 'return'), guide).orientationCheckpoint);
    const changed = buildGuide({ erd: 400 });
    assert.equal(guideSnapshot(reconcileGuide(state, changed), changed).orientationCheckpoint, null);
    const invalid = buildGuide({ flangeOuterDiameterLeft: undefined });
    assert.equal(guideSnapshot(reconcileGuide(state, invalid), invalid).orientationCheckpoint, null);
  }
});

test('halfway checks distinguish radial and mixed patterns from equal-cross ambiguity', () => {
  for (const [crossesLeft, crossesRight] of [[0, 0], [0, 2], [2, 3]]) {
    const guide = buildGuide({ crossesLeft, crossesRight });
    assert.equal(guide.valid, true);
    const checkpoint = guideSnapshot({ ...reconcileGuide(initialGuideState(), guide), step: 16 }, guide).orientationCheckpoint!;
    assert.ok(checkpoint);
    assert.doesNotMatch(checkpoint, /opposite-slope hub position/);
    if (crossesLeft === 0) assert.match(checkpoint, /radially/);
  }
});

test('every lacing step matches the main calculator side length regardless of head orientation or interlacing', () => {
  const variations: Partial<WheelBuildInputs>[] = [
    {}, { crossesLeft: 3, crossesRight: 1 }, { crossesLeft: 0, crossesRight: 2 },
    ...(['Auto', 'Left', 'Right'] as const).map(rimFlip => ({
      rimFlip, osb: 2, hubOffset: 1, drillingOffsetLeft: .5, drillingOffsetRight: .8,
    })),
  ];
  for (const front of [false, true]) for (const interlaced of [false, true]) for (const changes of variations) {
    const i = { ...inputs(front), interlaced, ...changes };
    const calculated = calculateWheelBuild(i);
    const paths = calculateSpokePaths(i);
    const guide = createLacingGuide(i, paths);
    assert.equal(guide.valid, true);
    const state = reconcileGuide(initialGuideState(), guide);
    for (let step = 0; step <= guide.total; step++) {
      const snapshot = guideSnapshot({ ...state, step }, guide);
      const spoke = snapshot.targetSpoke!;
      const source = paths.spokes.find(p => p.side === spoke.side && p.index === spoke.path.index)!;
      const selection = snapshot.spokeSelection!;
      assert.equal(selection.estimatedLength, source.estimatedLength);
      const expected = calculated[spoke.side === 'Left' ? 'left' : 'right'].calculatedSpokeLength;
      assert.equal(selection.traditionalLength, expected);
      assert.equal(selection.roundedLength, Math.round(expected));
      assert.equal(selection.label, spoke.sideLabel);
      if (!front && Object.keys(changes).length === 0) {
        assert.equal(selection.roundedLength, spoke.side === 'Left' ? 174 : 171);
      }
    }
    const selections = guide.groupStarts.map(step => guideSnapshot({ ...state, step }, guide).spokeSelection!);
    assert.equal(new Set(selections.map(s => s.label)).size, 2);
    assert.equal(selections[0].roundedLength, selections[2].roundedLength);
    assert.equal(selections[1].roundedLength, selections[3].roundedLength);
    assert.equal(guideSnapshot({ ...state, step: 9, preview: true }, guide).spokeSelection, null);
  }
  const i = inputs();
  const paths = calculateSpokePaths(i);
  paths.spokes[0].estimatedLength = NaN;
  const invalid = createLacingGuide(i, paths);
  assert.equal(invalid.valid, false);
  assert.equal(guideSnapshot(reconcileGuide(initialGuideState(), invalid), invalid).spokeSelection, null);
});

test('length selection follows group navigation, preview return and changed geometry', () => {
  const guide = buildGuide({ interlaced: true });
  let state = reconcileGuide(initialGuideState(), guide);
  for (const expected of [171, 174, 171, 174]) {
    state = transitionGuide(state, guide, 'next-group');
    const selection = guideSnapshot(state, guide).spokeSelection;
    assert.equal(selection?.roundedLength, expected);
    state = transitionGuide(state, guide, 'preview');
    assert.equal(guideSnapshot(state, guide).spokeSelection, null);
    state = transitionGuide(state, guide, 'return');
    assert.deepEqual(guideSnapshot(state, guide).spokeSelection, selection);
  }
  state = transitionGuide(state, guide, 'previous-group');
  assert.equal(guideSnapshot(state, guide).spokeSelection?.roundedLength, 171);
  const changedInputs = { ...inputs(), erd: 400, crossesRight: 3 };
  const changed = createLacingGuide(changedInputs, calculateSpokePaths(changedInputs));
  assert.equal(changed.valid, true);
  state = reconcileGuide(state, changed);
  assert.equal(state.step, 0);
  assert.equal(guideSnapshot(state, changed).spokeSelection?.roundedLength,
    Math.round(calculateWheelBuild(changedInputs).right.calculatedSpokeLength));
  const invalid = buildGuide({ flangeOuterDiameterLeft: undefined });
  assert.equal(guideSnapshot(reconcileGuide(state, invalid), invalid).spokeSelection, null);
});
