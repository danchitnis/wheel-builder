import test from 'node:test';
import assert from 'node:assert/strict';
import { Box3, Group, LatheGeometry, Mesh, Vector3 } from 'three';
import { createWheelModel, createWorkshopWheelModel } from '../src/components/WheelModel.ts';
import { configurationDefaults } from '../src/utils/buildConfiguration.ts';
import { buildAssembly, workshopDefaults } from '../src/utils/workshop.ts';
import { calculateSpokePaths } from '../src/utils/spokePath.ts';

function assembly(overrides = {}) {
  const config = { ...configurationDefaults(), ...overrides };
  return buildAssembly(config, { ...workshopDefaults(config), axle: 'qr10', seatLeft: 10, seatRight: 10, projection: 5 });
}

function close(actual: number, expected: number, tolerance = 1e-4) {
  assert.ok(Math.abs(actual - expected) < tolerance, `${actual} should equal ${expected}`);
}

test('shared wheel retains the open rim channel, cavity, eyelets and physical spoke endpoints', () => {
  for (const rimProfile of ['standard', 'shallow-double-wall'] as const) {
    const a = assembly({ rimProfile, rimEyelets: true });
    const model = createWheelModel(a.wheel.inputs);
    const rims = model.group.children.filter((m): m is Mesh<LatheGeometry> => m instanceof Mesh && m.geometry instanceof LatheGeometry);
    assert.equal(rims.length, rimProfile === 'standard' ? 1 : 2);
    const bounds = new Box3().setFromObject(rims[0]);
    close(bounds.max.x, a.wheel.diameter / 2);
    close(bounds.getSize(new Vector3()).z, a.wheel.width);
    const points = rims[0].geometry.parameters.points;
    assert.ok(points.some(p => p.x > a.wheel.inputs.erd / 2 && p.x < a.wheel.diameter / 2));
    const paths = calculateSpokePaths(a.wheel.inputs);
    assert.equal(model.spokeMeshes.length, a.wheel.spokes);
    for (const mesh of model.spokeMeshes) {
      const path = paths.spokes.find(p => p.side === mesh.userData.side && p.index === mesh.userData.index)!;
      close(mesh.userData.start.distanceTo(new Vector3(path.start.x, path.start.y, path.start.z)), 0);
      close(mesh.userData.end.distanceTo(new Vector3(path.end.x, path.end.y, path.end.z)), 0);
      close(mesh.userData.actualCurveLength, path.pathLength);
    }
    let eyelets = 0;
    model.group.traverse(o => { if (o instanceof Mesh && o.geometry.type === 'TorusGeometry') eyelets++; });
    assert.equal(eyelets, a.wheel.spokes);
  }
});

test('Workshop preserves custom wheel geometry and places the rim and hub on fixture datums', () => {
  for (const rimFlip of ['Auto', 'Left', 'Right'] as const) {
    const a = assembly({ osb: 3, hubOffset: 5, rimFlip, drillingOffsetLeft: 1, drillingOffsetRight: 2,
      crossesLeft: 3, crossesRight: 2, interlaced: true, spokeDiameter: 1.8 });
    const inputs = a.wheel.inputs;
    assert.equal(inputs.osb, 3);
    assert.equal(inputs.drillingOffsetLeft, 1);
    assert.equal(inputs.drillingOffsetRight, 2);
    assert.equal(inputs.crossesLeft, 3);
    assert.equal(inputs.crossesRight, 2);
    assert.equal(inputs.interlaced, true);
    assert.equal(inputs.spokeDiameter, 1.8);
    const model = createWorkshopWheelModel(inputs, a.wheel.hubWidth);
    model.group.updateMatrixWorld(true);
    const hubCenter = model.group.localToWorld(new Vector3(0, 0, inputs.hubOffset));
    close(hubCenter.length(), 0);
    const rim = model.group.children.find((m): m is Mesh => m instanceof Mesh && m.geometry instanceof LatheGeometry)!;
    close(rim.getWorldPosition(new Vector3()).x, a.wheel.offset);
    const bounds = new Box3().setFromObject(rim);
    close(bounds.getSize(new Vector3()).x, a.wheel.width);
    close(bounds.getSize(new Vector3()).y, a.wheel.diameter);
  }
});

test('measured Workshop diameter changes the shared rim radius without stretching its cross section', () => {
  const config = configurationDefaults();
  const a = buildAssembly(config, { ...workshopDefaults(config), rimDiameter: 430, hubWidth: 142 });
  assert.equal(a.wheel.inputs.erd, 430 - 2 * config.rimDepth!);
  const model = createWorkshopWheelModel(a.wheel.inputs, a.wheel.hubWidth);
  model.group.updateMatrixWorld(true);
  const rim = model.group.children[0];
  const bounds = new Box3().setFromObject(rim);
  close(bounds.getSize(new Vector3()).y, 430);
  close(bounds.getSize(new Vector3()).x, config.rimWidthOuter!);
  const hub = model.group.children.find(g => g instanceof Group && g.children.some(o => o instanceof Mesh && o.geometry.type === 'ExtrudeGeometry'))!;
  const hubBounds = new Box3().setFromObject(hub);
  close(hubBounds.min.x, -71);
  close(hubBounds.max.x, 71);
});

test('shared model keeps Builder lacing placement, preview and exploded spoke display', () => {
  const inputs = assembly().wheel.inputs;
  const pair = createWheelModel(inputs, { lacingMode: true, lacingPlacedCount: 2 });
  assert.equal(pair.spokeMeshes.length, 2);
  const preview = createWheelModel(inputs, { lacingMode: true, preview: true });
  assert.equal(preview.spokeMeshes.length, inputs.spokeCount);
  const exploded = createWheelModel(inputs, { explodedValue: 1, showRightSpokes: false });
  assert.equal(exploded.spokeMeshes.length, inputs.spokeCount / 2);
  const paths = calculateSpokePaths(inputs);
  for (const mesh of exploded.spokeMeshes) {
    const path = paths.spokes.find(p => p.side === 'Left' && p.index === mesh.userData.index)!;
    close(mesh.userData.end.z, path.end.z - 60);
  }
});
