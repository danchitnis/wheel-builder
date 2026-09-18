import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calculateSpokePaths, distance, polylineLength, segmentDistance } from '../src/utils/spokePath.ts';
import { calculateWheelBuild } from '../src/utils/physicsCalculator.ts';
import { hubs, defaultHub } from '../src/data/hubs.ts';
import { defaultRim } from '../src/data/rims.ts';

const build = (front=false, crosses=2) => ({
  ...defaultRim, ...hubs.find(h=>h.id===(front?'hope-pro5-front-100-6b':'hope-pro5-rear-135-6b'))!,
  spokeCount:32,spokeDiameter:2,hubOffset:0,rimFlip:'Auto' as const,crossesLeft:crosses,crossesRight:crosses,interlaced:true,
});
const near=(a:number,b:number,tolerance=1e-6)=>assert.ok(Math.abs(a-b)<tolerance, `${a} != ${b}`);

test('Hope published dimensions, measured geometry and primary catalogue order',()=>{
  assert.equal(defaultHub.id,'hope-pro5-rear-135-6b');
  assert.deepEqual(hubs.slice(0,2).map(h=>h.spokeCount),[32,32]);
  for(const front of [false,true]) {
    const i=build(front);
    assert.deepEqual([i.flangePcdLeft,i.flangePcdRight,i.centerToLeft,i.centerToRight],front?[58,52,20,34]:[57,59,32,19.6]);
    assert.equal(i.spokeHoleDiameter,2.6);
    assert.equal(i.flangeOuterDiameterLeft,front?62:67);assert.equal(i.flangeOuterDiameterRight,front?62:67);
    assert.equal(i.flangeThicknessLeft,4);assert.equal(i.flangeThicknessRight,4);
  }
  assert.ok(hubs.filter(h=>h.brand==='Hope').slice(2).every(h=>h.extraOption));
});
test('traditional three-cross reference lengths are unchanged',()=>{
  for(const front of [false,true]) {
    const result=calculateWheelBuild(build(front,3));
    const expected=front?[181.83007969855186,184.62075117903726]:[183.6460084146034,181.6668990618286];
    near(result.left.calculatedSpokeLength,expected[0]);near(result.right.calculatedSpokeLength,expected[1]);
  }
});
test('traditional lengths agree with independent coordinates for radial, two- and three-cross builds',()=>{
  for(const front of [false,true]) for(const crosses of [0,1,2,3]){
    const i=build(front,crosses),traditional=calculateWheelBuild(i),p=calculateSpokePaths(i);
    assert.deepEqual(p.errors,[]);assert.equal(p.spokes.length,32);
    for(const s of p.spokes)near(s.traditionalLength,traditional[s.side==='Left'?'left':'right'].calculatedSpokeLength);
  }
});
test('all Brompton holes are in one centreline plane',()=>{
  assert.deepEqual([defaultRim.osb,defaultRim.drillingOffsetLeft,defaultRim.drillingOffsetRight],[0,0,0]);
  for(const front of [false,true]) for(const s of calculateSpokePaths(build(front)).spokes)near(s.end.z,0);
});
test('unobstructed heads-out shafts are straight without interlacing',()=>{
  const result=calculateSpokePaths({...build(),interlaced:false});assert.deepEqual(result.errors,[]);
  for(const s of result.spokes.filter(s=>s.headsOut)){near(s.bendAllowance,0);assert.equal(s.points.length,2);}
  for(const s of result.spokes.filter(s=>!s.headsOut)){assert.ok(s.bendAllowance>0);assert.equal(s.flangeContacts.length,2);}
});
test('matching endpoints, nonnegative allowances and heads-in/out geometry',()=>{
  for(const front of [false,true])for(const s of calculateSpokePaths(build(front)).spokes){
    near(distance(s.start,s.end),s.chordLength);assert.deepEqual(s.points[0],s.start);assert.deepEqual(s.points.at(-1),s.end);
    assert.ok(s.bendAllowance>=0);near(s.pathLength-s.chordLength,s.bendAllowance);near(s.estimatedLength,s.traditionalLength+s.bendAllowance);
    assert.ok(s.crossingContact);near(polylineLength(s.points),s.pathLength,0.001);
  }
});
test('integrated arc length and display path converge within 0.01 mm',()=>{
  const coarse=calculateSpokePaths(build(),0.02),fine=calculateSpokePaths(build(),0.005);
  assert.deepEqual(fine.errors,[]);
  for(let i=0;i<32;i++){near(coarse.spokes[i].pathLength,fine.spokes[i].pathLength,0.01);near(polylineLength(coarse.spokes[i].points),polylineLength(fine.spokes[i].points),0.01);}
});
test('centreline clears the finite flange by the physical wire radius',()=>{
  for(const front of [false,true]) {
    const i=build(front);
    for(const s of calculateSpokePaths(i).spokes) {
      const outer=(s.side==='Left'?i.flangeOuterDiameterLeft!:i.flangeOuterDiameterRight!)/2;
      // Signed-distance exterior of a solid finite cylinder (hole is irrelevant after shaft exit).
      const samples = s.points.flatMap((p,k)=>k===0?[p]:Array.from({length:64},(_,n)=>{
        const a=s.points[k-1],t=(n+1)/64;return {x:a.x+(p.x-a.x)*t,y:a.y+(p.y-a.y)*t,z:a.z+(p.z-a.z)*t};
      }));
      for(const p of samples) {
        const radial=Math.hypot(p.x,p.y)-outer, axial=Math.abs(p.z-s.hole.z)-2;
        const gap=Math.hypot(Math.max(0,radial),Math.max(0,axial));
        assert.ok(gap>=1-1e-4,`flange gap ${gap}`);
      }
    }
  }
});
test('every pair of shaft segments has wire diameter clearance',()=>{
  for(const front of [false,true]) {
    const p=calculateSpokePaths(build(front)).spokes;
    for(let a=0;a<p.length;a++)for(let b=a+1;b<p.length;b++){
      for(let j=1;j<p[a].points.length;j++)for(let k=1;k<p[b].points.length;k++){
        const gap=segmentDistance(p[a].points[j-1],p[a].points[j],p[b].points[k-1],p[b].points[k]);
        assert.ok(gap>=2-1e-4,`${front?'front':'rear'} ${a}/${b}: ${gap}`);
      }
    }
  }
});
test('asymmetric rims and frame offsets agree with traditional geometry',()=>{
  for(const rimFlip of ['Auto','Left','Right'] as const){
    const i={...build(),osb:2,hubOffset:1,drillingOffsetLeft:0.5,drillingOffsetRight:0.8,rimFlip};
    const p=calculateSpokePaths(i),traditional=calculateWheelBuild(i);assert.deepEqual(p.errors,[]);
    for(const s of p.spokes)near(s.traditionalLength,traditional[s.side==='Left'?'left':'right'].calculatedSpokeLength);
  }
});
test('impossible and missing physical inputs have no numeric path recommendation',()=>{
  for(const changes of [{spokeDiameter:3},{flangeOuterDiameterLeft:55},{flangeThicknessRight:100},{erd:0},{spokeCount:0},{flangeOuterDiameterLeft:undefined},{spokeDiameter:NaN}]){
    const result=calculateSpokePaths({...build(),...changes});assert.ok(result.errors.length>0);
    assert.ok(result.spokes.filter(s=>!s.valid).every(s=>Number.isNaN(s.estimatedLength)));
  }
});
test('render-only state and legacy common thickness cannot alter geometry',()=>{
  const input=build(),base=calculateSpokePaths(input);
  assert.deepEqual(calculateSpokePaths({...input,...{explodedValue:1,spokeThickness:8,showLeftSpokes:false,meshSegments:4}}),base);
  assert.deepEqual(calculateSpokePaths({...input,flangeThicknessLeft:undefined,flangeThicknessRight:undefined,flangeThickness:4}),base);
});

test('omitted interlacing defaults to off; explicit on changes only path allowance',()=>{
  const input=build();
  const off=calculateSpokePaths({...input,interlaced:false});
  assert.deepEqual(calculateSpokePaths({...input,interlaced:undefined}),off);
  const on=calculateSpokePaths({...input,interlaced:true});
  for(let i=0;i<off.spokes.length;i++){
    assert.equal(off.spokes[i].crossingContact,undefined);
    assert.ok(on.spokes[i].crossingContact);
    near(off.spokes[i].traditionalLength,on.spokes[i].traditionalLength);
  }
  assert.ok(on.spokes.some((s,i)=>s.bendAllowance>off.spokes[i].bendAllowance));
});
