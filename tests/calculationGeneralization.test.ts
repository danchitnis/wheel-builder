import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateWheelBuild, resolveRimShift, wheelGeometryValid, type WheelBuildInputs } from '../src/utils/physicsCalculator.ts';
import { calculateInputSensitivity } from '../src/utils/inputSensitivity.ts';
import { calculateSpokePaths } from '../src/utils/spokePath.ts';
import { wheelSideLabel } from '../src/utils/wheelSide.ts';

const base: WheelBuildInputs = {
  erd: 550, osb: 3, hubOffset: 2, drillingOffsetLeft: .75, drillingOffsetRight: 1.25,
  spokeCount: 32, spokeHoleDiameter: 2.6, rimFlip: 'Auto',
  flangePcdLeft: 58, flangePcdRight: 46, centerToLeft: 25, centerToRight: 36,
  crossesLeft: 2, crossesRight: 1,
  flangeOuterDiameterLeft: 64, flangeOuterDiameterRight: 54,
  flangeThicknessLeft: 3, flangeThicknessRight: 3, spokeDiameter: 2,
};
function close(a: number, b: number, tolerance = 1e-9) {
  assert.ok(Math.abs(a-b) < tolerance, `${a} != ${b}`);
}

// Independent physical endpoints. Do not use the production rim-shift helper here.
function endpoints(input: WheelBuildInputs, left: boolean) {
  const shift = input.rimFlip === 'Left' ? input.osb : input.rimFlip === 'Right' ? -input.osb :
    input.centerToLeft-input.hubOffset > input.centerToRight+input.hubOffset ? input.osb : -input.osb;
  const r = input.erd/2, rf = (left ? input.flangePcdLeft : input.flangePcdRight)/2;
  const theta = (left ? input.crossesLeft : input.crossesRight)*2*Math.PI/(input.spokeCount/2);
  const hubZ = (left ? -input.centerToLeft : input.centerToRight)+input.hubOffset;
  const rimZ = -shift+(left ? -input.drillingOffsetLeft : input.drillingOffsetRight);
  const raw = Math.hypot(r*Math.cos(theta)-rf, r*Math.sin(theta), rimZ-hubZ);
  return {raw, hubZ, rimZ, length: raw-input.spokeHoleDiameter/2, sinBracing: Math.abs(hubZ-rimZ)/raw};
}

test('generic lengths and tension balance match independent endpoints across sizes, offsets and mixed patterns', () => {
  for (const erd of [350,550,620]) for (const spokeCount of [24,28,32,36]) {
    for (const [crossesLeft,crossesRight] of [[0,0],[1,2],[2,1],[3,3],[0,3],[4,2]]) {
      if (Math.max(crossesLeft,crossesRight) > spokeCount/8) continue;
      for (const rimFlip of ['Auto','Left','Right'] as const) for (const hubOffset of [-2,2]) {
        const input = {...base, erd, spokeCount, crossesLeft, crossesRight, rimFlip, hubOffset};
        const result = calculateWheelBuild(input);
        const l = endpoints(input,true), r = endpoints(input,false);
        close(result.left.calculatedSpokeLength,l.length);
        close(result.right.calculatedSpokeLength,r.length);
        assert.equal(result.tensionRatioValid,true);
        close(Math.max(result.tensionRatioLeft,result.tensionRatioRight),100);
        close(result.tensionRatioLeft*l.sinBracing,result.tensionRatioRight*r.sinBracing);
      }
    }
  }
});

test('modeled hub holes and ERD endpoints use the same references with offset rims and unequal lacing', () => {
  for (const rimFlip of ['Auto','Left','Right'] as const) for (const hubOffset of [-2,2]) {
    const input = {...base, rimFlip, hubOffset};
    const paths = calculateSpokePaths(input), result = calculateWheelBuild(input);
    assert.equal(paths.spokes.length,input.spokeCount);
    for (const path of paths.spokes) {
      const left = path.side === 'Left', expected = endpoints(input,left);
      close(path.hole.z,expected.hubZ); close(path.end.z,expected.rimZ);
      close(Math.hypot(path.end.x,path.end.y),input.erd/2);
      close(path.traditionalLength,left ? result.left.calculatedSpokeLength : result.right.calculatedSpokeLength);
    }
  }
});

test('mirroring exchanges side results, while equal geometry gives equal lengths and tensions', () => {
  for (const rimFlip of ['Auto','Left','Right'] as const) {
    const original = {...base,rimFlip};
    const mirror = {...original,
      flangePcdLeft: original.flangePcdRight, flangePcdRight: original.flangePcdLeft,
      centerToLeft: original.centerToRight, centerToRight: original.centerToLeft,
      drillingOffsetLeft: original.drillingOffsetRight, drillingOffsetRight: original.drillingOffsetLeft,
      crossesLeft: original.crossesRight, crossesRight: original.crossesLeft,
      hubOffset: -original.hubOffset,
      rimFlip: rimFlip === 'Left' ? 'Right' : rimFlip === 'Right' ? 'Left' : 'Auto',
    } as WheelBuildInputs;
    const a = calculateWheelBuild(original), b = calculateWheelBuild(mirror);
    close(resolveRimShift(original),-resolveRimShift(mirror));
    close(a.left.calculatedSpokeLength,b.right.calculatedSpokeLength);
    close(a.right.calculatedSpokeLength,b.left.calculatedSpokeLength);
    close(a.tensionRatioLeft,b.tensionRatioRight); close(a.tensionRatioRight,b.tensionRatioLeft);
  }
  const symmetric = calculateWheelBuild({...base, osb:0,hubOffset:0,drillingOffsetLeft:0,drillingOffsetRight:0,
    flangePcdRight:58,centerToLeft:30,centerToRight:30,crossesRight:2});
  close(symmetric.left.calculatedSpokeLength,symmetric.right.calculatedSpokeLength);
  close(symmetric.tensionRatioLeft,100);close(symmetric.tensionRatioRight,100);
  // Equal flange offsets alone do not guarantee equal bracing with unequal PCDs.
  const unequal = calculateWheelBuild({...base,osb:0,hubOffset:0,drillingOffsetLeft:0,drillingOffsetRight:0,centerToLeft:30,centerToRight:30});
  assert.notEqual(unequal.tensionRatioLeft,unequal.tensionRatioRight);
});

test('invalid geometry cannot produce a usable tension ratio or sensitivity', () => {
  for (const change of [{erd:0},{erd:NaN},{spokeCount:0},{spokeCount:31},{crossesRight:5},
    {flangePcdLeft:600},{spokeHoleDiameter:-1},{hubOffset:100},{drillingOffsetRight:Infinity}]) {
    const input = {...base,...change}, result = calculateWheelBuild(input);
    assert.equal(wheelGeometryValid(input,result),false);
    assert.equal(result.tensionRatioValid,false);
    assert.ok(Number.isNaN(result.tensionRatioLeft) && Number.isNaN(result.tensionRatioRight));
    assert.ok(calculateInputSensitivity(input).every(row=>row.left===null && row.right===null));
  }
});

test('input sensitivity recalculates +1 mm independently, including coupled Auto orientation changes', () => {
  for (const input of [base,{...base,centerToLeft:30,centerToRight:30.5,hubOffset:0,osb:4}]) {
    const before = structuredClone(input);
    for (const row of calculateInputSensitivity(input)) {
      const changed = {...input,[row.key]:input[row.key]+1};
      close(row.left!,endpoints(changed,true).length-endpoints(input,true).length);
      close(row.right!,endpoints(changed,false).length-endpoints(input,false).length);
    }
    assert.deepEqual(input,before);
  }
  const flip = calculateInputSensitivity({...base,centerToLeft:30,centerToRight:30.5,hubOffset:0,osb:4})
    .find(row=>row.key==='centerToLeft')!;
  assert.ok(Math.abs(flip.right!)>.1,'Auto orientation can change the other side too');
  const boundary = calculateInputSensitivity({...base,erd:64,flangePcdLeft:60,flangePcdRight:60,spokeHoleDiameter:3.5});
  assert.equal(boundary.find(row=>row.key==='spokeHoleDiameter')!.left,null);
  assert.equal(boundary.find(row=>row.key==='erd')!.left===null,false);
});

test('side labels describe front disc, front rim-brake and rear builds', () => {
  assert.equal(wheelSideLabel({isRear:false,discType:'6-Bolt'},'Left'),'Left / disc');
  assert.equal(wheelSideLabel({isRear:false,discType:'Centerlock'},'Right'),'Right / non-disc');
  assert.equal(wheelSideLabel({isRear:false,discType:'None'},'Left'),'Left / front');
  assert.equal(wheelSideLabel({isRear:true},'Right'),'Right / drive');
});
